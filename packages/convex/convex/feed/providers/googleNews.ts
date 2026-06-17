import { XMLParser } from "fast-xml-parser";
import type { Infer } from "convex/values";
import type { ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { fetchWithTimeout } from "../../papers/ingest/http";
import { collapse } from "../../lib/text";
import { feedItemValidator } from "../validators";

// Google News RSS provider (free) for the feed `kind="news"` lane. Replaces the
// paid Exa news lane. We fetch the public RSS edition feeds, parse with the
// already-installed fast-xml-parser, and emit lightweight items. The opaque
// news.google.com redirect link is kept verbatim as `redirectUrl`; resolving it
// to the real publisher URL is a separate lazy/best-effort step (see
// googleNewsDecode.ts) run during enrichment.
//
// robots.txt note: Google News disallows the generic bot path and exposes no
// official API/SLA. We mitigate per the revamp plan: a browser UA, low volume
// (cron cadence + capped seeds), polite inter-seed spacing, headline-only data
// (full article bodies are read from the publisher, not Google), and result
// caching. Treat this feed as unofficial + swappable for direct publisher RSS.

const GOOGLE_NEWS_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const GOOGLE_NEWS_EDITION = "hl=id&gl=ID&ceid=ID:id";
const RSS_TIMEOUT_MS = 12_000;

export type GoogleNewsItem = {
  title: string;
  /** Opaque news.google.com/rss/articles/... redirect link. */
  redirectUrl: string;
  /** Stable per-article id (the `<guid>` text); the canonical dedup key. */
  guid: string;
  publisherName: string;
  publisherDomain?: string;
  /** Publish time in epoch ms, when `<pubDate>` parses. */
  pubDate?: number;
  /** Plain-text `<description>` (usually just title + publisher — low value). */
  descriptionSnippet?: string;
};

/** A `feedItems`-shaped insert object (the `upsertFeedItems` element shape). */
export type FeedItemInsert = Infer<typeof feedItemValidator>;

// `isArray: item` forces single-result feeds to parse `<item>` as an array;
// `@_`-prefixed attributes expose `<source url>` and `<guid isPermaLink>`.
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

// ── Pure parser (unit-tested without network) ──────────────────────────────
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

    const redirectUrl =
      typeof record.link === "string" ? record.link.trim() : "";
    if (!redirectUrl) continue;

    const guid = extractGuid(record.guid);
    if (!guid) continue;

    const { publisherName, publisherDomain } = extractSource(record.source);
    // fast-xml-parser coerces a purely-numeric text node to a JS number, so a
    // bare numeric headline ("2026") would otherwise be dropped — stringify it.
    const rawTitle =
      typeof record.title === "string"
        ? record.title
        : typeof record.title === "number"
          ? String(record.title)
          : "";
    const title = stripPublisherSuffix(
      decodeHtmlEntities(rawTitle).trim(),
      publisherName,
    );
    if (!title) continue;

    out.push({
      title,
      redirectUrl,
      guid,
      publisherName: collapse(publisherName) || "Google News",
      publisherDomain,
      pubDate: parsePubDate(record.pubDate),
      descriptionSnippet:
        typeof record.description === "string"
          ? stripHtml(record.description) || undefined
          : undefined,
    });
    if (limit && out.length >= limit) break;
  }
  return out;
}

// ── Network fetch (cached via the shared external-lookup cache) ────────────
export async function fetchGoogleNews(
  ctx: ActionCtx,
  args: { url: string; limit?: number },
): Promise<GoogleNewsItem[]> {
  const cacheKey = `gnews:rss:${args.limit ?? "all"}:${args.url}`;
  const cached: { valueJson: string } | null = await ctx.runQuery(
    internal.agent.providers.externalProviders.getCache,
    { provider: "google_news", cacheKey },
  );
  if (cached) {
    try {
      return JSON.parse(cached.valueJson) as GoogleNewsItem[];
    } catch {
      // fall through to a fresh fetch
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
      await putCache(ctx, cacheKey, "failed", "[]");
      return [];
    }
    items = parseGoogleNewsRss(await response.text(), args.limit);
  } catch {
    await putCache(ctx, cacheKey, "failed", "[]");
    return [];
  }

  await putCache(
    ctx,
    cacheKey,
    items.length > 0 ? "ready" : "empty",
    JSON.stringify(items),
  );
  return items;
}

// ── Pure dedup across seeds (unit-tested) ──────────────────────────────────
// Primary key = `guid`; secondary = normalized title + publisher domain (the
// same article surfaces across seeds with a different guid).
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
      // Secondary key (same article, different guid across seeds) only applies
      // when a publisher domain is known. Without it, two distinct guids that
      // merely share a generic headline must NOT be merged on title alone.
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

// ── Pure mapping to feedItems insert shape (unit-tested) ────────────────────
// `summary` is intentionally empty here: the RSS `<description>` is just
// title + publisher (no real snippet). Enrichment fills `summary`/`tldr`/
// `articleText` from the resolved publisher article.
export function buildGoogleNewsFeedItems(
  collected: Array<{ item: GoogleNewsItem; topicLabel: string }>,
  now: number,
): FeedItemInsert[] {
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
    createdAt: now,
  }));
}

// ── Helpers ────────────────────────────────────────────────────────────────
async function putCache(
  ctx: ActionCtx,
  cacheKey: string,
  status: "ready" | "empty" | "failed",
  valueJson: string,
): Promise<void> {
  await ctx.runMutation(internal.agent.providers.externalProviders.putCache, {
    provider: "google_news",
    cacheKey,
    status,
    valueJson,
  });
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

function extractSource(source: unknown): {
  publisherName: string;
  publisherDomain?: string;
} {
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
  if (suffix && trimmed.endsWith(suffix)) {
    return trimmed.slice(0, -suffix.length).trim();
  }
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
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
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
