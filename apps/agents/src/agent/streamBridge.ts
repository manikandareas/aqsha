import type { RunResultSummary, RunUsage } from "@aqsha/agent-contracts";
import type { AgentStore } from "../store/types";
import type { SegmentCoordinator } from "./segmentCoordinator";

// A leading line break on a freshly-opened segment is the bridge's own "\n\n"
// join artifact between two assistant messages (committedText separator), not
// model-intended — strip it so a segment never starts with a blank line.
const LEADING_BREAKS = /^[\n\r\u0085\u2028\u2029]+/;

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
  // Extended-thinking payload. Anthropic emits `thinking` on `thinking` blocks;
  // `reasoning` is the field some Anthropic-compatible gateways (the OpenRouter
  // reasoning models this service runs behind) surface instead — accept both so
  // reasoning is captured regardless of which the gateway normalizes to.
  thinking?: string;
  reasoning?: string;
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
  event?: {
    type?: string;
    delta?: { type?: string; text?: string; thinking?: string; reasoning?: string };
  };
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
  finalReasoning: string;
  resultSubtype?: string;
  summary: Omit<RunResultSummary, "status"> & { resultText?: string };
};

export class StreamBridge {
  private committedText = "";
  private pendingDelta = "";
  // Extended-thinking stream, captured in parallel to chat text. Deltas
  // accumulate in `pendingReasoning`; a full `thinking` block in an assistant
  // message supersedes the partials for that turn (same shape as text).
  private committedReasoning = "";
  private pendingReasoning = "";
  private lastFlushedText = "";
  private lastFlushedReasoning = "";
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

  // ── ordered answer segments (answer-stream redesign Fase 1) ────────────────
  // The contiguous text/reasoning between two tool boundaries is one segment.
  // Each is upserted as ONE `agentRunEvents` row keyed by `segmentId` (coalesced,
  // keeps its seq), so interleaving segments with the tool nodes by seq yields
  // the precise reasoning↔tool↔answer order. `segmentTextOffset` /
  // `segmentReasoningOffset` mark where the current segment starts within the
  // full streamed text/reasoning.
  private segmentIndex = 0;
  private segmentTextOffset = 0;
  private segmentReasoningOffset = 0;
  private segmentInflight: Promise<void> | null = null;
  private segmentTrailingQueued = false;
  private lastWrittenSegmentText = "";
  private lastWrittenSegmentReasoning = "";

  constructor(
    private readonly store: AgentStore,
    private readonly opts: {
      runId: string;
      threadId: string;
      messageId: string;
      flushMs: number;
      flushChars: number;
      /**
       * Unique per executeTurn / deep-phase dispatch so a resume's segments get
       * fresh `segmentId`s (never colliding with the original turn's, which
       * would patch instead of append). Combined with the segment kind + index.
       */
      turnKey: string;
      /**
       * Imposes reasoning↔tool ordering despite the SDK's eager message
       * production: the bridge releases a tool's barrier once the preceding
       * segment is closed, and the PreToolUse hook waits on it before emitting
       * tool_start. Optional (dev/tests without ordering needs omit it).
       */
      coordinator?: SegmentCoordinator;
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
    return `${this.committedText}${this.pendingDelta}`;
  }

  get currentReasoning(): string {
    return `${this.committedReasoning}${this.pendingReasoning}`;
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
      } else if (delta?.type === "thinking_delta" || delta?.type === "reasoning_delta") {
        const chunk = delta.thinking ?? delta.reasoning;
        if (chunk) {
          this.pendingReasoning += chunk;
          this.maybeScheduleFlush();
        }
      }
      return;
    }

    if (message.type === "assistant") {
      // Ignore subagent-internal messages; only main-thread text is chat text.
      if (message.parent_tool_use_id) {
        return;
      }
      const blocks = message.message?.content ?? [];
      const text = blocks
        .filter((block) => block.type === "text" && block.text)
        .map((block) => block.text)
        .join("\n\n");
      // `redacted_thinking` blocks carry encrypted `data`, not readable text —
      // intentionally excluded here (nothing to display).
      const reasoning = blocks
        .filter((block) => block.type === "thinking" || block.type === "reasoning")
        .map((block) => block.thinking ?? block.reasoning)
        .filter((value): value is string => Boolean(value))
        .join("\n\n");
      if (text) {
        this.committedText = this.committedText
          ? `${this.committedText}\n\n${text}`
          : text;
      }
      if (reasoning) {
        this.committedReasoning = this.committedReasoning
          ? `${this.committedReasoning}\n\n${reasoning}`
          : reasoning;
      }
      // The full message supersedes any partial deltas for this block.
      this.pendingDelta = "";
      this.pendingReasoning = "";
      this.maybeScheduleFlush(true);
      // A main-thread tool_use in this message ends the current answer segment:
      // close it (so its seq lands before the tool's) and open the next one. The
      // close also releases each tool's ordering barrier (see SegmentCoordinator).
      const toolUseIds = blocks
        .filter((block) => block.type === "tool_use" && typeof block.id === "string")
        .map((block) => block.id as string);
      if (toolUseIds.length > 0) {
        await this.closeSegmentAtToolBoundary(toolUseIds);
      }
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

  /** Either the chat text or the reasoning stream has unflushed content. */
  private isDirty(): boolean {
    return (
      this.currentText !== this.lastFlushedText ||
      this.currentReasoning !== this.lastFlushedReasoning
    );
  }

  /** New characters accumulated across both streams since the last flush. */
  private pendingChars(): number {
    return (
      this.currentText.length -
      this.lastFlushedText.length +
      (this.currentReasoning.length - this.lastFlushedReasoning.length)
    );
  }

  private maybeScheduleFlush(force = false): void {
    if (!this.isDirty()) {
      return;
    }
    const due =
      force ||
      this.now() - this.lastFlushAt >= this.opts.flushMs ||
      this.pendingChars() >= this.opts.flushChars;
    if (due) {
      this.scheduleFlush();
      this.scheduleSegmentFlush();
    }
  }

  /** Non-blocking write: one mutation in flight, latest snapshot wins. */
  private scheduleFlush(): void {
    if (this.opts.silent) {
      return;
    }
    if (this.inflight) {
      this.trailingQueued = true;
      return;
    }
    if (!this.isDirty()) {
      return;
    }
    const text = this.currentText;
    const reasoning = this.currentReasoning;
    this.lastFlushedText = text;
    this.lastFlushedReasoning = reasoning;
    this.lastFlushAt = this.now();
    this.inflight = this.store
      .updateMessageText(this.opts.messageId, text, reasoning || undefined)
      .catch((error) => {
        // Transient store failures are tolerable mid-stream: the next flush
        // (and the final drain) re-writes the full text + reasoning.
        console.error("streamBridge flush failed", error);
        this.lastFlushedText = "";
        this.lastFlushedReasoning = "";
      })
      .finally(() => {
        this.inflight = null;
        if (this.trailingQueued) {
          this.trailingQueued = false;
          this.scheduleFlush();
        }
      });
  }

  // ── answer-segment writes (Fase 1) ─────────────────────────────────────────

  private segmentId(kind: "text" | "reasoning"): string {
    return `${this.opts.runId}:${this.opts.turnKey}:${kind}:${this.segmentIndex}`;
  }

  /** The current segment's text/reasoning (full stream minus the prior segments),
   *  with the inter-message join artifact stripped from the front. */
  private currentSegmentText(): string {
    return this.currentText.slice(this.segmentTextOffset).replace(LEADING_BREAKS, "");
  }

  private currentSegmentReasoning(): string {
    return this.currentReasoning
      .slice(this.segmentReasoningOffset)
      .replace(LEADING_BREAKS, "");
  }

  /** Upsert the current text/reasoning segment rows (skip empties + no-ops). */
  private async writeSegments(): Promise<void> {
    // Reasoning BEFORE text, sequentially: a step's reasoning thus takes a lower
    // seq than its text on first insert (the model thinks, then writes), and the
    // two never race for nextRunEventSeq.
    const reasoning = this.currentSegmentReasoning();
    if (reasoning && reasoning !== this.lastWrittenSegmentReasoning) {
      this.lastWrittenSegmentReasoning = reasoning;
      await this.store.upsertRunEventBySegmentId({
        runId: this.opts.runId,
        segmentId: this.segmentId("reasoning"),
        type: "reasoning_segment",
        payload: { text: reasoning, index: this.segmentIndex },
      });
    }
    const text = this.currentSegmentText();
    if (text && text !== this.lastWrittenSegmentText) {
      this.lastWrittenSegmentText = text;
      await this.store.upsertRunEventBySegmentId({
        runId: this.opts.runId,
        segmentId: this.segmentId("text"),
        type: "text_segment",
        payload: { text, index: this.segmentIndex },
      });
    }
  }

  /** Non-blocking segment write: one upsert in flight, latest snapshot wins
   *  (mirrors scheduleFlush so the stream loop is never blocked on the store). */
  private scheduleSegmentFlush(): void {
    if (this.opts.silent) {
      return;
    }
    if (this.segmentInflight) {
      this.segmentTrailingQueued = true;
      return;
    }
    this.segmentInflight = this.writeSegments()
      .catch((error) => {
        console.error("streamBridge segment flush failed", error);
        // Allow the next flush to re-send the (unchanged) snapshot.
        this.lastWrittenSegmentText = "";
        this.lastWrittenSegmentReasoning = "";
      })
      .finally(() => {
        this.segmentInflight = null;
        if (this.segmentTrailingQueued) {
          this.segmentTrailingQueued = false;
          this.scheduleSegmentFlush();
        }
      });
  }

  /** Blocking drain of the segment pipeline + a final upsert of the snapshot. */
  private async flushSegments(): Promise<void> {
    if (this.opts.silent) {
      return;
    }
    while (this.segmentInflight) {
      await this.segmentInflight;
    }
    await this.writeSegments();
  }

  /**
   * A main-thread tool ends the current segment. Flush it (so its seq is
   * committed BEFORE the tool_start the PreToolUse hook is waiting to write),
   * release each tool's ordering barrier, then open the next segment. Barriers
   * release even in silent mode (the hooks still wait); only the writes are
   * skipped.
   */
  private async closeSegmentAtToolBoundary(toolUseIds: string[]): Promise<void> {
    await this.flushSegments();
    if (this.opts.coordinator) {
      for (const toolUseId of toolUseIds) {
        this.opts.coordinator.release(toolUseId);
      }
    }
    this.segmentIndex += 1;
    this.segmentTextOffset = this.currentText.length;
    this.segmentReasoningOffset = this.currentReasoning.length;
    this.lastWrittenSegmentText = "";
    this.lastWrittenSegmentReasoning = "";
  }

  /** Blocking drain: awaits in-flight writes and persists the latest snapshot. */
  async flush(): Promise<void> {
    if (this.opts.silent) {
      return;
    }
    while (this.inflight) {
      await this.inflight;
    }
    if (this.isDirty()) {
      const text = this.currentText;
      const reasoning = this.currentReasoning;
      this.lastFlushedText = text;
      this.lastFlushedReasoning = reasoning;
      this.lastFlushAt = this.now();
      await this.store.updateMessageText(this.opts.messageId, text, reasoning || undefined);
    }
    // Always close out the final answer segment (it may have grown since the
    // last scheduled flush, or never been written if it was a no-tool turn).
    await this.flushSegments();
  }

  /** Final state after the stream ends (or is interrupted). */
  result(): StreamBridgeResult {
    return {
      sessionId: this.sessionId,
      finalText: this.currentText,
      finalReasoning: this.currentReasoning,
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
