/**
 * In-process politeness pacer for arXiv (≈1 req / 3s). CAVEAT: multiple
 * processes may run this code (api + agent), so this only paces requests
 * *within one process*; a Redis token-bucket for cross-process pacing is a
 * follow-up (plan §7). The Redis result cache already absorbs repeat queries,
 * so this is best-effort.
 */
export class Pacer {
  private nextAvailable = 0;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly minGapMs: number,
    private readonly maxWaitMs: number,
  ) {}

  reserve(): Promise<void> {
    const run = this.queue.then(() => this.waitForSlot());
    // Keep the chain alive even if a waiter rejects (it won't — waitForSlot
    // only resolves), so subsequent reserves still serialize.
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async waitForSlot(): Promise<void> {
    const now = Date.now();
    const wait = Math.min(Math.max(this.nextAvailable - now, 0), this.maxWaitMs);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    this.nextAvailable = Date.now() + this.minGapMs;
  }
}

/** Shared arXiv pacer for this process. */
export const arxivPacer = new Pacer(3_000, 6_000);
