// Segment ordering coordinator (answer-stream redesign Fase 1).
//
// The Claude Agent SDK produces messages EAGERLY: its `PreToolUse` hook fires
// (and can persist a `tool_start` event) the instant the hook frame is read off
// the subprocess stdout — BEFORE the consumer (`StreamBridge`) has pulled and
// processed the assistant message that announced that tool_use. So the natural
// interleaving of the `for await` loop and the hook callback does NOT guarantee
// that the text/reasoning segment which preceded a tool gets a lower `seq` than
// the tool itself (verified by tracing sdk.mjs 0.3.175).
//
// This coordinator imposes the order explicitly with a per-`tool_use_id`
// barrier: the bridge CLOSES the preceding segment (awaits its upsert, so its
// seq is committed) and then RELEASES the tool's barrier; the `PreToolUse` hook
// AWAITS that barrier before it emits `tool_start`. Result: `seq(segment) <
// seq(tool_start)` deterministically, regardless of which wire frame the SDK
// read first. A timeout fallback keeps a tool from hanging if the bridge never
// observes its announcing message (it never does for sub-agent tools, which the
// bridge skips — those callers pass no coordinator / skip the await).

type Barrier = {
  promise: Promise<void>;
  resolve: () => void;
  released: boolean;
};

export class SegmentCoordinator {
  private readonly barriers = new Map<string, Barrier>();

  private ensure(toolUseId: string): Barrier {
    let barrier = this.barriers.get(toolUseId);
    if (!barrier) {
      let resolve!: () => void;
      const promise = new Promise<void>((r) => {
        resolve = r;
      });
      barrier = { promise, resolve, released: false };
      this.barriers.set(toolUseId, barrier);
    }
    return barrier;
  }

  /**
   * Hook side: block until the bridge has closed the segment that precedes this
   * tool (or `timeoutMs` elapses — the safety net so a tool the bridge never
   * sees, or a dropped message, can never deadlock the run). A missing
   * `toolUseId` cannot be correlated, so it never waits. An aborted `signal`
   * (the SDK fires it on cancel) resolves immediately, so a cancelled run never
   * sits out the timeout and never appends a late tool_start.
   */
  async awaitSegmentClosed(
    toolUseId: string | undefined,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!toolUseId) return;
    const barrier = this.ensure(toolUseId);
    if (barrier.released || signal?.aborted) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, timeoutMs);
    });
    const aborted = signal
      ? new Promise<void>((resolve) => {
          onAbort = () => resolve();
          signal.addEventListener("abort", onAbort, { once: true });
        })
      : undefined;
    try {
      await Promise.race(aborted ? [barrier.promise, timeout, aborted] : [barrier.promise, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
      if (signal && onAbort) signal.removeEventListener("abort", onAbort);
    }
  }

  /**
   * Bridge side: the segment preceding `toolUseId` is closed (its upsert has
   * been awaited). Wake any hook waiting on it. Idempotent; a release that
   * arrives before the hook registers resolves the barrier the hook later finds.
   */
  release(toolUseId: string): void {
    const barrier = this.ensure(toolUseId);
    if (!barrier.released) {
      barrier.released = true;
      barrier.resolve();
    }
  }
}
