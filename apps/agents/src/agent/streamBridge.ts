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

  constructor(
    private readonly store: AgentStore,
    private readonly opts: {
      runId: string;
      threadId: string;
      messageId: string;
      flushMs: number;
      flushChars: number;
      now?: () => number;
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
        await this.maybeFlush();
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
      await this.maybeFlush(true);
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

  private async maybeFlush(force = false): Promise<void> {
    const text = this.currentText;
    if (text === this.lastFlushedText) {
      return;
    }
    const due =
      force ||
      this.now() - this.lastFlushAt >= this.opts.flushMs ||
      text.length - this.lastFlushedText.length >= this.opts.flushChars;
    if (due) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
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
