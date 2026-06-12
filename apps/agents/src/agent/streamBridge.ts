import type { RunResultSummary, RunUsage } from "@aqsha/agent-contracts";
import type { AgentStore } from "../store/types";

// Stream bridge (plan §4.3): consumes the SDK message stream and writes
// batched updates into the store — assistant text flushed in-place on the
// streaming message every ~250ms / N chars, and the final result message
// mapped to a RunResultSummary.
//
// Message shapes are structural (a subset of SDKMessage) so tests can feed
// plain objects and the bridge stays decoupled from SDK type churn.

type ContentBlock = {
  type: string;
  text?: string;
  name?: string;
  id?: string;
  input?: unknown;
};

export type BridgeMessage = {
  type: string;
  subtype?: string;
  session_id?: string;
  parent_tool_use_id?: string | null;
  message?: { content?: ContentBlock[] };
  event?: { type?: string; delta?: { type?: string; text?: string } };
  total_cost_usd?: number;
  num_turns?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  result?: string;
};

export type StreamBridgeResult = {
  sessionId?: string;
  finalText: string;
  resultSubtype?: string;
  summary: Omit<RunResultSummary, "status"> & { resultText?: string };
};

export class StreamBridge {
  private committedText = "";
  private pendingDelta = "";
  private lastFlushedText = "";
  private lastFlushAt = 0;
  private sessionId: string | undefined;
  private resultSubtype: string | undefined;
  private resultSummary: StreamBridgeResult["summary"] = {};
  // Write pipeline: at most ONE store mutation in flight; further flushes
  // coalesce into a trailing write. Store round-trips must never block the
  // SDK stream loop (found live: a ~300ms Convex RTT per awaited flush
  // throttled token consumption to a crawl).
  private inflight: Promise<void> | null = null;
  private trailingQueued = false;

  constructor(
    private readonly store: AgentStore,
    private readonly opts: {
      runId: string;
      threadId: string;
      messageId: string;
      flushMs: number;
      flushChars: number;
      now?: () => number;
      /**
       * Capture-only mode: text and result summary are accumulated but never
       * written to the message. Used by non-write deep-research phases whose
       * output is phase state, not chat text (plan §5.5).
       */
      silent?: boolean;
    },
  ) {}

  private now(): number {
    return this.opts.now?.() ?? Date.now();
  }

  get currentText(): string {
    const joiner = this.committedText && this.pendingDelta ? "" : "";
    return `${this.committedText}${joiner}${this.pendingDelta}`;
  }

  get capturedSessionId(): string | undefined {
    return this.sessionId;
  }

  async handle(message: BridgeMessage): Promise<void> {
    if (message.type === "system" && message.subtype === "init") {
      this.sessionId = message.session_id ?? this.sessionId;
      return;
    }

    if (message.type === "stream_event") {
      const delta = message.event?.delta;
      if (delta?.type === "text_delta" && delta.text) {
        this.pendingDelta += delta.text;
        this.maybeScheduleFlush();
      }
      return;
    }

    if (message.type === "assistant") {
      // Ignore subagent-internal messages; only main-thread text is chat text.
      if (message.parent_tool_use_id) {
        return;
      }
      const text = (message.message?.content ?? [])
        .filter((block) => block.type === "text" && block.text)
        .map((block) => block.text)
        .join("\n\n");
      if (text) {
        this.committedText = this.committedText
          ? `${this.committedText}\n\n${text}`
          : text;
      }
      // The full message supersedes any partial deltas for this block.
      this.pendingDelta = "";
      this.maybeScheduleFlush(true);
      return;
    }

    if (message.type === "result") {
      this.sessionId = message.session_id ?? this.sessionId;
      this.resultSubtype = message.subtype;
      this.resultSummary = {
        sdkSessionId: this.sessionId,
        costUsd: message.total_cost_usd,
        numTurns: message.num_turns,
        usage: toRunUsage(message.usage),
        resultText: message.result,
      };
      await this.flush();
    }
  }

  private maybeScheduleFlush(force = false): void {
    const text = this.currentText;
    if (text === this.lastFlushedText) {
      return;
    }
    const due =
      force ||
      this.now() - this.lastFlushAt >= this.opts.flushMs ||
      text.length - this.lastFlushedText.length >= this.opts.flushChars;
    if (due) {
      this.scheduleFlush();
    }
  }

  /** Non-blocking write: one mutation in flight, latest text wins. */
  private scheduleFlush(): void {
    if (this.opts.silent) {
      return;
    }
    if (this.inflight) {
      this.trailingQueued = true;
      return;
    }
    const text = this.currentText;
    if (text === this.lastFlushedText) {
      return;
    }
    this.lastFlushedText = text;
    this.lastFlushAt = this.now();
    this.inflight = this.store
      .updateMessageText(this.opts.messageId, text)
      .catch((error) => {
        // Transient store failures are tolerable mid-stream: the next flush
        // (and the final drain) re-writes the full text.
        console.error("streamBridge flush failed", error);
        this.lastFlushedText = "";
      })
      .finally(() => {
        this.inflight = null;
        if (this.trailingQueued) {
          this.trailingQueued = false;
          this.scheduleFlush();
        }
      });
  }

  /** Blocking drain: awaits in-flight writes and persists the latest text. */
  async flush(): Promise<void> {
    if (this.opts.silent) {
      return;
    }
    while (this.inflight) {
      await this.inflight;
    }
    const text = this.currentText;
    if (text === this.lastFlushedText) {
      return;
    }
    this.lastFlushedText = text;
    this.lastFlushAt = this.now();
    await this.store.updateMessageText(this.opts.messageId, text);
  }

  /** Final state after the stream ends (or is interrupted). */
  result(): StreamBridgeResult {
    return {
      sessionId: this.sessionId,
      finalText: this.currentText,
      resultSubtype: this.resultSubtype,
      summary: this.resultSummary,
    };
  }
}

function toRunUsage(usage: BridgeMessage["usage"]): RunUsage | undefined {
  if (!usage) {
    return undefined;
  }
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadInputTokens: usage.cache_read_input_tokens,
    cacheCreationInputTokens: usage.cache_creation_input_tokens,
  };
}
