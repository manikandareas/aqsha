/**
 * Redis-backed cache for research provider results, reusing the paper
 * resolver's `external-cache` (TTL ready 24h / empty 1.5h / failed 12m). This
 * replaces the V1 in-process `ProviderCache` (Map) so caching survives across
 * the multi-process V2 deployment and acts as the only provider "pacing" beyond
 * the arXiv politeness pacer.
 */

import { getCache, putCache } from "../papers/external-cache";
import type { ResearchCandidate } from "./types";

export type CachedCandidates = {
  status: "ready" | "empty" | "failed";
  candidates: ResearchCandidate[];
};

/**
 * Read cached candidates for a provider+key, or `null` on miss / parse error.
 * MEMBAWA `status` (CTX-2): pemanggil WAJIB membedakan `failed` (kegagalan provider yang
 * di-cache 12 mnt sebagai backoff) dari `ready`/`empty` — cache `failed` TIDAK boleh
 * disajikan sebagai "tak ada hasil".
 */
export async function readCachedCandidates(
  provider: string,
  cacheKey: string,
): Promise<CachedCandidates | null> {
  const cached = await getCache(provider, cacheKey);
  if (!cached) return null;
  const status =
    cached.status === "ready" || cached.status === "empty" || cached.status === "failed"
      ? cached.status
      : null;
  if (!status) return null;
  try {
    const parsed = JSON.parse(cached.valueJson);
    return Array.isArray(parsed) ? { status, candidates: parsed as ResearchCandidate[] } : null;
  } catch {
    return null;
  }
}

/**
 * Cache candidates. `ready` for hits, `empty` for genuinely-no-results, `failed`
 * for provider errors (short TTL so a transient failure isn't pinned long).
 */
export async function writeCachedCandidates(
  provider: string,
  cacheKey: string,
  candidates: ResearchCandidate[],
  status: "ready" | "empty" | "failed" = candidates.length > 0 ? "ready" : "empty",
): Promise<void> {
  await putCache(provider, cacheKey, status, JSON.stringify(candidates));
}
