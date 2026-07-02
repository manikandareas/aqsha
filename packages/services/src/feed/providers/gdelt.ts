/**
 * GDELT DOC 2.0 API (gratis, tanpa API key) untuk lane feed `kind="news"` — pengganti
 * Google News RSS. Endpoint `ArtList` mode JSON: tiap artikel membawa URL publisher
 * LANGSUNG (bukan redirect opaque) + `socialimage` (gambar diisi saat ingest) + domain +
 * seendate + language. Global coverage; scope via operator `sourcelang:` di query seed.
 *
 * robots: GDELT soft-throttle "1 request / 5 detik" → dibalas body PLAIN-TEXT (bukan JSON).
 * Mitigasi: spacing antar-seed di lane (concurrency 1) + cache pendek via external-cache.
 * `parseGdeltArtList` defensif: body non-JSON (pesan throttle / HTML error) → `[]`.
 */
import { getCache, putCache } from "../../papers/external-cache";
import { fetchWithTimeout, userAgent } from "../../papers/http";
import { collapse, decodeHtmlEntities } from "../../lib/text";
import type { FeedItemInput } from "../model";

const GDELT_ENDPOINT = "https://api.gdeltproject.org/api/v2/doc/doc";
const GDELT_TIMEOUT_MS = 12_000;
/** TTL cache ingest (detik). 2 jam < cron 3 jam → tiap siklus dapat data segar; retry terlindungi. */
const GDELT_CACHE_TTL_SECONDS = 60 * 60 * 2;
const GDELT_DEFAULT_TIMESPAN = "3d";
const GDELT_MAX_RECORDS = 250;

export type GdeltItem = {
  title: string;
  url: string;
  domain?: string;
  sourceLabel: string;
  imageUrl?: string;
  language?: string;
  sourceCountry?: string;
  seenDate?: number;
};

export function gdeltArtListUrl(args: {
  query: string;
  timespan?: string;
  maxrecords?: number;
  sort?: string;
}): string {
  const q = encodeURIComponent(args.query);
  const timespan = encodeURIComponent(args.timespan ?? GDELT_DEFAULT_TIMESPAN);
  const maxrecords = Math.min(Math.max(args.maxrecords ?? 25, 1), GDELT_MAX_RECORDS);
  const sort = args.sort ?? "DateDesc";
  return `${GDELT_ENDPOINT}?query=${q}&mode=ArtList&format=JSON&timespan=${timespan}&maxrecords=${maxrecords}&sort=${sort}`;
}

/** Pure parser (unit-test tanpa network). Body non-JSON / `articles` bukan array → `[]`. */
export function parseGdeltArtList(body: string, limit?: number): GdeltItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return []; // pesan throttle plain-text / halaman HTML error
  }
  const articles = (parsed as { articles?: unknown } | null)?.articles;
  if (!Array.isArray(articles)) return [];

  const out: GdeltItem[] = [];
  for (const raw of articles) {
    if (!raw || typeof raw !== "object") continue;
    const record = raw as Record<string, unknown>;

    const url = typeof record.url === "string" ? record.url.trim() : "";
    if (!isHttpUrl(url)) continue;

    const title = typeof record.title === "string" ? decodeHtmlEntities(record.title).trim() : "";
    if (!title) continue;

    const domain =
      (typeof record.domain === "string" ? domainOf(record.domain) : undefined) ?? domainOf(url);
    const socialImage = typeof record.socialimage === "string" ? record.socialimage.trim() : "";

    out.push({
      title,
      url,
      domain,
      sourceLabel: domain ?? "GDELT",
      imageUrl: isHttpUrl(socialImage) ? socialImage : undefined,
      language: typeof record.language === "string" ? collapse(record.language) || undefined : undefined,
      sourceCountry:
        typeof record.sourcecountry === "string" ? collapse(record.sourcecountry) || undefined : undefined,
      seenDate: parseSeenDate(record.seendate),
    });
    if (limit && out.length >= limit) break;
  }
  return out;
}

/** Network fetch (cache pendek via external-cache; body throttle → status failed, retry cepat). */
export async function fetchGdelt(args: { url: string; limit?: number }): Promise<GdeltItem[]> {
  const cacheKey = `gdelt:artlist:${args.limit ?? "all"}:${args.url}`;
  const cached = await getCache("gdelt", cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached.valueJson) as GdeltItem[];
    } catch {
      // fall through ke live fetch
    }
  }

  let body = "";
  let ok = false;
  try {
    const response = await fetchWithTimeout(args.url, {
      timeoutMs: GDELT_TIMEOUT_MS,
      redirect: "follow",
      headers: { "User-Agent": userAgent(), Accept: "application/json, */*;q=0.8" },
    });
    ok = response.ok;
    body = await response.text();
  } catch {
    await putCache("gdelt", cacheKey, "failed", "[]");
    return [];
  }

  const items = parseGdeltArtList(body, args.limit);
  // Body JSON valid (mulai "{") = hasil sah (ready/empty); selain itu (throttle/HTML) = failed.
  const isJsonBody = body.trimStart().startsWith("{");
  if (!ok || !isJsonBody) {
    // Throttle/HTML → TTL "failed" pendek (default) supaya siklus/re-trigger berikut mencoba lagi
    // cepat; JANGAN pin 2 jam (sama seperti jalur catch network-error di atas).
    await putCache("gdelt", cacheKey, "failed", "[]");
    return items;
  }
  await putCache(
    "gdelt",
    cacheKey,
    items.length > 0 ? "ready" : "empty",
    JSON.stringify(items),
    GDELT_CACHE_TTL_SECONDS,
  );
  return items;
}

/** Dedup lintas-seed: url primary, `(normalizedTitle|domain)` secondary. */
export function dedupeGdeltItems(
  bySeed: Array<{ label: string; topics: string[]; items: GdeltItem[] }>,
  cap: number,
): Array<{ item: GdeltItem; topics: string[] }> {
  const seenUrl = new Set<string>();
  const seenSecondary = new Set<string>();
  const out: Array<{ item: GdeltItem; topics: string[] }> = [];
  for (const seed of bySeed) {
    for (const item of seed.items) {
      const url = item.url.trim();
      if (!url || seenUrl.has(url)) continue;
      const secondary = item.domain
        ? `${normalizeNewsTitle(item.title)}|${item.domain}`
        : null;
      if (secondary && seenSecondary.has(secondary)) continue;
      seenUrl.add(url);
      if (secondary) seenSecondary.add(secondary);
      out.push({ item, topics: seed.topics });
      if (out.length >= cap) return out;
    }
  }
  return out;
}

/**
 * Map → FeedItemInput kind=news (provider gdelt). `imageUrl` DIISI dari socialimage saat ingest
 * (beda dari Google News yang menunggu enrich). `summary` kosong; lane enrich mengisi tldr/summary.
 * `topics` = topic seed (vocabulary INTEREST_FIELD_TOPICS) → langsung nyalakan personalisasi.
 * `dedupeKey` = `news:{domain}:{normalizedTitle}` (collapse story tersindikasi via upsertByDedupeKey).
 */
export function buildGdeltFeedInputs(
  collected: Array<{ item: GdeltItem; topics: string[] }>,
  now: number,
): FeedItemInput[] {
  return collected.map(({ item, topics }) => ({
    kind: "news" as const,
    title: item.title,
    summary: "",
    url: item.url,
    imageUrl: item.imageUrl,
    provider: "gdelt" as const,
    sourceLabel: item.sourceLabel,
    topics,
    trendScore: 0,
    publishedAt: item.seenDate ?? now,
    dedupeKey: newsDedupeKey(item),
    lastSeenAt: now,
  }));
}

function newsDedupeKey(item: GdeltItem): string {
  const title = normalizeNewsTitle(item.title);
  return item.domain ? `news:${item.domain}:${title}` : `news:${title}`;
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function domainOf(value: string): string | undefined {
  const raw = value.trim();
  if (!raw) return undefined;
  try {
    const host = raw.includes("://") ? new URL(raw).hostname : new URL(`https://${raw}`).hostname;
    return host.replace(/^www\./, "") || undefined;
  } catch {
    return undefined;
  }
}

function normalizeNewsTitle(title: string): string {
  return title.toLowerCase().replace(/\s+/g, " ").trim();
}

/** GDELT seendate `YYYYMMDDTHHMMSSZ` → epoch ms. Fallback Date.parse; gagal → undefined. */
function parseSeenDate(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const compact = value.trim().match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/);
  if (compact) {
    const iso = `${compact[1]}-${compact[2]}-${compact[3]}T${compact[4]}:${compact[5]}:${compact[6]}Z`;
    const ms = Date.parse(iso);
    return Number.isFinite(ms) ? ms : undefined;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : undefined;
}
