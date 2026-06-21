/**
 * Google News RSS (free) untuk lane feed `kind="news"`. Port V1 `feed/providers/googleNews.ts`.
 * Fetch RSS edisi Indonesia, parse fast-xml-parser, emit item ringan. Link redirect opaque
 * `news.google.com` di-keep verbatim; resolusi ke publisher = langkah enrichment terpisah
 * (googleNewsDecode.ts). Cache 24h via external-cache.
 *
 * robots.txt: Google News disallow bot path + tanpa API resmi. Mitigasi: UA browser, volume
 * rendah (cron + seed capped), spacing antar-seed, headline-only, cache. Anggap unofficial/swappable.
 */
import { XMLParser } from "fast-xml-parser";
import { getCache, putCache } from "../../papers/external-cache";
import { fetchWithTimeout } from "../../papers/http";
import { collapse } from "../../lib/text";
import type { FeedItemInput } from "../model";

const GOOGLE_NEWS_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const GOOGLE_NEWS_EDITION = "hl=id&gl=ID&ceid=ID:id";
const RSS_TIMEOUT_MS = 12_000;

export type GoogleNewsItem = {
  title: string;
  redirectUrl: string;
  guid: string;
  publisherName: string;
  publisherDomain?: string;
  pubDate?: number;
  descriptionSnippet?: string;
};

const googleNewsXmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name) => name === "item",
});

export function googleNewsSearchUrl(query: string): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&${GOOGLE_NEWS_EDITION}`;
}

export function googleNewsTopicUrl(topic: string): string {
  return `https://news.google.com/rss/headlines/section/topic/${topic}?${GOOGLE_NEWS_EDITION}`;
}

/** Pure parser (unit-tested tanpa network). */
export function parseGoogleNewsRss(xml: string, limit?: number): GoogleNewsItem[] {
  let parsed: unknown;
  try {
    parsed = googleNewsXmlParser.parse(xml);
  } catch {
    return [];
  }
  const rawItems = readPath(parsed, ["rss", "channel", "item"]);
  const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];

  const out: GoogleNewsItem[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const record = raw as Record<string, unknown>;

    const redirectUrl = typeof record.link === "string" ? record.link.trim() : "";
    if (!redirectUrl) continue;

    const guid = extractGuid(record.guid);
    if (!guid) continue;

    const { publisherName, publisherDomain } = extractSource(record.source);
    const rawTitle =
      typeof record.title === "string"
        ? record.title
        : typeof record.title === "number"
          ? String(record.title)
          : "";
    const title = stripPublisherSuffix(decodeHtmlEntities(rawTitle).trim(), publisherName);
    if (!title) continue;

    out.push({
      title,
      redirectUrl,
      guid,
      publisherName: collapse(publisherName) || "Google News",
      publisherDomain,
      pubDate: parsePubDate(record.pubDate),
      descriptionSnippet:
        typeof record.description === "string" ? stripHtml(record.description) || undefined : undefined,
    });
    if (limit && out.length >= limit) break;
  }
  return out;
}

/** Network fetch (cache 24h via external-cache). */
export async function fetchGoogleNews(args: { url: string; limit?: number }): Promise<GoogleNewsItem[]> {
  const cacheKey = `gnews:rss:${args.limit ?? "all"}:${args.url}`;
  const cached = await getCache("google_news", cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached.valueJson) as GoogleNewsItem[];
    } catch {
      // fall through
    }
  }

  let items: GoogleNewsItem[] = [];
  try {
    const response = await fetchWithTimeout(args.url, {
      timeoutMs: RSS_TIMEOUT_MS,
      redirect: "follow",
      headers: {
        "User-Agent": GOOGLE_NEWS_UA,
        Accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
      },
    });
    if (!response.ok) {
      await putCache("google_news", cacheKey, "failed", "[]");
      return [];
    }
    items = parseGoogleNewsRss(await response.text(), args.limit);
  } catch {
    await putCache("google_news", cacheKey, "failed", "[]");
    return [];
  }

  await putCache("google_news", cacheKey, items.length > 0 ? "ready" : "empty", JSON.stringify(items));
  return items;
}

/** Dedup across seeds (guid primary, title+domain secondary). Port dedupeGoogleNewsItems. */
export function dedupeGoogleNewsItems(
  bySeed: Array<{ label: string; items: GoogleNewsItem[] }>,
  cap: number,
): Array<{ item: GoogleNewsItem; topicLabel: string }> {
  const seenGuid = new Set<string>();
  const seenSecondary = new Set<string>();
  const out: Array<{ item: GoogleNewsItem; topicLabel: string }> = [];
  for (const seed of bySeed) {
    for (const item of seed.items) {
      const guid = item.guid.trim();
      if (!guid || seenGuid.has(guid)) continue;
      const secondary = item.publisherDomain
        ? `${normalizeNewsTitle(item.title)}|${item.publisherDomain}`
        : null;
      if (secondary && seenSecondary.has(secondary)) continue;
      seenGuid.add(guid);
      if (secondary) seenSecondary.add(secondary);
      out.push({ item, topicLabel: seed.label });
      if (out.length >= cap) return out;
    }
  }
  return out;
}

/** Map → FeedItemInput kind=news (summary kosong; enrichment mengisi). Port buildGoogleNewsFeedItems. */
export function buildGoogleNewsFeedInputs(
  collected: Array<{ item: GoogleNewsItem; topicLabel: string }>,
  now: number,
): FeedItemInput[] {
  return collected.map(({ item, topicLabel }) => ({
    kind: "news" as const,
    title: item.title,
    summary: "",
    url: item.redirectUrl,
    provider: "google_news" as const,
    sourceLabel: item.publisherName,
    topics: [topicLabel],
    trendScore: 0,
    publishedAt: item.pubDate ?? now,
    dedupeKey: `news:gnews:${item.guid}`,
    lastSeenAt: now,
  }));
}

function readPath(value: unknown, path: string[]): unknown {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function extractGuid(guid: unknown): string {
  if (typeof guid === "string") return guid.trim();
  if (guid && typeof guid === "object") {
    const text = (guid as Record<string, unknown>)["#text"];
    if (typeof text === "string") return text.trim();
    if (typeof text === "number") return String(text);
  }
  return "";
}

function extractSource(source: unknown): { publisherName: string; publisherDomain?: string } {
  if (source && typeof source === "object") {
    const record = source as Record<string, unknown>;
    const name = typeof record["#text"] === "string" ? record["#text"] : "";
    const url = typeof record["@_url"] === "string" ? record["@_url"] : undefined;
    return { publisherName: name, publisherDomain: url ? domainOf(url) : undefined };
  }
  if (typeof source === "string") return { publisherName: source };
  return { publisherName: "" };
}

function stripPublisherSuffix(title: string, publisher: string): string {
  const trimmed = title.trim();
  const suffix = publisher.trim() ? ` - ${publisher.trim()}` : "";
  if (suffix && trimmed.endsWith(suffix)) return trimmed.slice(0, -suffix.length).trim();
  return trimmed;
}

function parsePubDate(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : undefined;
}

function domainOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function normalizeNewsTitle(title: string): string {
  return title.toLowerCase().replace(/\s+/g, " ").trim();
}

function stripHtml(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&(?:apos|#39|#x27);/gi, "'")
    .replace(/&#(\d+);/g, (_, dec) => safeFromCodePoint(Number(dec)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeFromCodePoint(parseInt(hex, 16)));
}

function safeFromCodePoint(code: number): string {
  try {
    return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : "";
  } catch {
    return "";
  }
}
