/**
 * Redis-backed external-lookup cache. Replaces V1's `externalLookupCache` table
 * + `getCache`/`putCache` Convex functions. Keyed per provider so the paper
 * resolver and Jina reader cache absorb repeat lookups (and act as the only
 * "pacing" mechanism now that the Convex rate-limiter is gone).
 *
 * Cache key shape: `extcache:{provider}:{cacheKey}`.
 * TTL by status (CACHE_TTL_BY_STATUS from V1, in seconds):
 *   ready  → 24h   (stable lookups)
 *   empty  → 1.5h  (retried sooner; corpora publish daily)
 *   failed → 12m   (don't pin a transient error for long)
 */

import Redis from "ioredis";

export type CacheStatus = "ready" | "empty" | "failed";

// Seconds. Mirrors V1's CACHE_TTL_BY_STATUS (which was in ms).
const CACHE_TTL_SECONDS_BY_STATUS: Record<CacheStatus, number> = {
  ready: 60 * 60 * 24, // 24h
  empty: 60 * 90, // 1.5h
  failed: 60 * 12, // 12m
};

let client: Redis | null = null;

function getRedis(): Redis {
  if (client) return client;
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is required for the external-lookup cache");
  // Fail-fast: cache adalah optimisasi, BUKAN jalur kritis. maxRetriesPerRequest:null +
  // offline queue (default) akan MENGGANTUNG get/set selamanya saat Redis down → resolvePaper
  // ikut hang. Pakai config cepat-tolak supaya getCache/putCache try/catch degrade ke live lookup.
  client = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    commandTimeout: 2000,
    enableOfflineQueue: false,
  });
  client.on("error", () => {
    // Redis cache error non-fatal (di-handle getCache/putCache); silence unhandled error.
  });
  return client;
}

function keyFor(provider: string, cacheKey: string): string {
  return `extcache:${provider}:${cacheKey}`;
}

type CacheEntry = { status: string; valueJson: string };

export async function getCache(
  provider: string,
  cacheKey: string,
): Promise<CacheEntry | null> {
  try {
    const raw = await getRedis().get(keyFor(provider, cacheKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (typeof parsed?.valueJson !== "string") return null;
    return parsed;
  } catch {
    // Cache is best-effort — a Redis hiccup must degrade to a live lookup,
    // never throw out of the resolver.
    return null;
  }
}

export async function putCache(
  provider: string,
  cacheKey: string,
  status: CacheStatus,
  valueJson: string,
): Promise<void> {
  try {
    const ttlSeconds = CACHE_TTL_SECONDS_BY_STATUS[status];
    const payload = JSON.stringify({ status, valueJson } satisfies CacheEntry);
    await getRedis().set(keyFor(provider, cacheKey), payload, "EX", ttlSeconds);
  } catch {
    // Best-effort write; swallow so a cache failure never breaks resolution.
  }
}
