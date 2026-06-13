// In-process TTL cache replacing the Convex externalLookupCache table for the
// agent service (the table stays authoritative for Convex-side features). Same
// TTL-by-status semantics as agent/providers/externalProviders.ts.

export type CacheStatus = "ready" | "empty" | "failed";

export const CACHE_TTL_BY_STATUS: Record<CacheStatus, number> = {
  ready: 1000 * 60 * 60 * 24, // 24h
  empty: 1000 * 60 * 90, // 1.5h
  failed: 1000 * 60 * 12, // 12m
};

type CacheEntry = {
  status: CacheStatus;
  valueJson: string;
  failureReason?: string;
  expiresAt: number;
};

export class ProviderCache {
  private entries = new Map<string, CacheEntry>();

  constructor(private readonly now: () => number = Date.now) {}

  private key(provider: string, cacheKey: string): string {
    return `${provider}:${cacheKey}`;
  }

  get<T>(provider: string, cacheKey: string): T | null {
    const entry = this.entries.get(this.key(provider, cacheKey));
    if (!entry || entry.expiresAt < this.now()) {
      return null;
    }
    try {
      return JSON.parse(entry.valueJson) as T;
    } catch {
      return null;
    }
  }

  put(
    provider: string,
    cacheKey: string,
    value: unknown,
    status: CacheStatus,
    failureReason?: string,
  ): void {
    this.entries.set(this.key(provider, cacheKey), {
      status,
      valueJson: JSON.stringify(value),
      failureReason,
      expiresAt: this.now() + CACHE_TTL_BY_STATUS[status],
    });
  }

  /** Status for candidate lists: failed > ready > empty. */
  putCandidates(
    provider: string,
    cacheKey: string,
    candidates: unknown[],
    failureReason?: string,
  ): void {
    this.put(
      provider,
      cacheKey,
      candidates,
      failureReason ? "failed" : candidates.length > 0 ? "ready" : "empty",
      failureReason,
    );
  }

  clear(): void {
    this.entries.clear();
  }
}

// arXiv asks for at most 1 request / 3s globally per client. Reserve the next
// slot and wait for it (latency, not failure); beyond the bounded wait, throw
// so callers can fall back to OpenAlex/Crossref (port of paceArxiv, AUD-14).
export class Pacer {
  private nextSlotAt = 0;

  constructor(
    private readonly minGapMs: number,
    private readonly maxWaitMs: number,
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}

  async reserve(): Promise<void> {
    const now = this.now();
    const slot = Math.max(this.nextSlotAt, now);
    const waitMs = slot - now;
    if (waitMs > this.maxWaitMs) {
      throw new Error("External provider is rate limited");
    }
    this.nextSlotAt = slot + this.minGapMs;
    if (waitMs > 0) {
      await this.sleep(waitMs);
    }
  }
}
