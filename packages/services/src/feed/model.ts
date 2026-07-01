/**
 * Feed domain model — framework-agnostic helpers porting V1 `feed/model.ts` +
 * `feed/validators.ts` shapes. Pure leaf module (no DB/Elysia/BullMQ imports) so the
 * write funnel (`buildFeedItemRow`) runs identically in worker lanes + ensureFeedItemForPaperKey.
 *
 * INVARIAN: `deriveOrderAt` + `deriveSearchText` HARUS jalan di SETIAP write feed
 * (`buildFeedItemRow` adalah satu-satunya konstruktor row) supaya keyset infinite-scroll
 * konsisten (search_tsv retained; read-path search dihapus). Lihat docs/v2/06 Fase 4.
 */
import type { NewFeedItem } from "@aqsha/db";
import type { ExplorePaperInput } from "../explore/model";
import { normalizeDoi } from "../papers/identifiers";

export type FeedKind = "paper" | "news" | "claim" | "topic" | "idea";
export type FeedProvider =
  | "openalex"
  | "exa_news"
  | "google_news"
  | "gdelt"
  | "google_factcheck"
  | "turnbackhoax";
export type FeedRetractionStatus = "none" | "concern" | "retracted";

/** Denormalized claim summary (jsonb di feed_items.primary_claim). Port feedClaimSummaryValidator. */
export type FeedClaim = {
  claim: string;
  verdict: "supported" | "partially_supported" | "needs_context" | "unverified" | "contradicted";
  verdictSource: string;
  verdictBy: "human" | "ai";
  verdictLabelRaw: string;
  publisher?: string;
  reviewUrl?: string;
  reviewedAt?: number;
  evidence?: string;
  confidence?: number;
  severity?: "info" | "warning" | "high";
  claimant?: string;
  claimDate?: number;
  supportingPaperKeys?: string[];
};

/**
 * Input write feed (subset feedItemFields yang ditulis caller). `id`/`orderAt`/`searchText`/
 * `createdAt` di-derive `buildFeedItemRow`; `lastSeenAt` default `now`.
 */
export type FeedItemInput = {
  kind: FeedKind;
  title: string;
  summary: string;
  tldr?: string;
  tldrId?: string;
  titleId?: string;
  url: string;
  resolvedUrl?: string;
  imageUrl?: string;
  articleText?: string;
  enrichAttempts?: number;
  provider: FeedProvider;
  sourceLabel: string;
  paperKey?: string;
  doi?: string;
  authors?: string[];
  year?: number;
  venue?: string;
  pdfUrl?: string;
  citedByCount?: number;
  isOpenAccess?: boolean;
  topics: string[];
  trendScore: number;
  retractionStatus?: FeedRetractionStatus;
  primaryClaim?: FeedClaim;
  stanceSupporting?: number;
  stanceContrasting?: number;
  sparkline?: number[];
  publishedAt?: number;
  dedupeKey: string;
  lastSeenAt?: number;
};

const SEARCH_TEXT_CAP = 2000;

/**
 * Kunci sort kronologis NON-optional untuk by_order (getFeedPaginated). Port V1 deriveOrderAt:
 * `publishedAt ?? lastSeenAt ?? createdAt`. Dengan `lastSeenAt`/`createdAt` default `now`,
 * item tanpa tanggal publish tetap punya orderAt total.
 */
export function deriveOrderAt(item: {
  publishedAt?: number;
  lastSeenAt: number;
  createdAt: number;
}): number {
  return item.publishedAt ?? item.lastSeenAt ?? item.createdAt;
}

/**
 * Blob title+summary+topics (lowercase, whitespace-collapsed, cap 2000) untuk index full-text
 * (kolom search_tsv GENERATED). Port V1 deriveSearchText.
 */
export function deriveSearchText(item: {
  title: string;
  summary: string;
  topics: string[];
}): string {
  return `${item.title} ${item.summary} ${item.topics.join(" ")}`
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SEARCH_TEXT_CAP);
}

/**
 * Satu-satunya konstruktor row feed_items. Mint `id`, set `createdAt`/`lastSeenAt`,
 * dan derive `orderAt`/`searchText`. Semua jalur write (worker lane + ensureFeedItemForPaperKey)
 * WAJIB lewat sini.
 */
export function buildFeedItemRow(input: FeedItemInput, now: number): NewFeedItem {
  const lastSeenAt = input.lastSeenAt ?? now;
  const createdAt = now;
  const orderAt = deriveOrderAt({ publishedAt: input.publishedAt, lastSeenAt, createdAt });
  const searchText = deriveSearchText({
    title: input.title,
    summary: input.summary,
    topics: input.topics,
  });
  return {
    id: crypto.randomUUID(),
    kind: input.kind,
    title: input.title,
    summary: input.summary,
    tldr: input.tldr,
    tldrId: input.tldrId,
    titleId: input.titleId,
    url: input.url,
    resolvedUrl: input.resolvedUrl,
    imageUrl: input.imageUrl,
    articleText: input.articleText,
    enrichAttempts: input.enrichAttempts,
    provider: input.provider,
    sourceLabel: input.sourceLabel,
    paperKey: input.paperKey,
    doi: input.doi,
    authors: input.authors,
    year: input.year,
    venue: input.venue,
    pdfUrl: input.pdfUrl,
    citedByCount: input.citedByCount,
    isOpenAccess: input.isOpenAccess,
    topics: input.topics,
    trendScore: input.trendScore,
    retractionStatus: input.retractionStatus,
    primaryClaim: input.primaryClaim ?? null,
    stanceSupporting: input.stanceSupporting,
    stanceContrasting: input.stanceContrasting,
    sparkline: input.sparkline,
    publishedAt: input.publishedAt,
    dedupeKey: input.dedupeKey,
    lastSeenAt,
    createdAt,
    orderAt,
    searchText,
  };
}

// ── Paper → feed item builder (hydration + paper materialization) ───────────

function collapseTrim(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

function firstSentence(text: string): string | undefined {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return undefined;
  const match = clean.match(/^.*?[.!?](?=\s|$)/);
  return collapseTrim(match ? match[0] : clean, 220);
}

function parseDateMs(value: string): number | undefined {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : undefined;
}

/**
 * Map paper (explore cache) → FeedItemInput kind=paper (port V1 paperToFeedItem). Dipakai lane
 * refreshTrendingPapers DAN ensureFeedItemForPaperKey (materialisasi save/hide). `dedupeKey`
 * = `paper:{key}` (idempotent), `trendScore` = citedByCount ?? score ?? 0, retraction dicek
 * dari id work yang ditandai is_retracted.
 */
export function paperToFeedInput(
  paper: ExplorePaperInput,
  retractedIds: Set<string>,
): FeedItemInput {
  const publishedAt = paper.publicationDate ? parseDateMs(paper.publicationDate) : undefined;
  const retractedDoi = paper.doi ? normalizeDoi(paper.doi) : "";
  const retracted =
    (retractedDoi.length > 0 && retractedIds.has(retractedDoi)) ||
    (paper.openalexId != null && retractedIds.has(paper.openalexId));
  return {
    kind: "paper",
    title: paper.title,
    summary: collapseTrim(paper.snippet, 400),
    tldr: firstSentence(paper.abstract ?? paper.snippet),
    url: paper.url,
    provider: "openalex",
    sourceLabel: paper.sourceLabel,
    paperKey: paper.key,
    doi: paper.doi,
    authors: paper.authors.length > 0 ? paper.authors : undefined,
    year: paper.year,
    venue: paper.venue,
    pdfUrl: paper.pdfUrl,
    citedByCount: paper.citedByCount,
    isOpenAccess: paper.isOpenAccess,
    topics: paper.topics,
    trendScore: paper.citedByCount ?? paper.score ?? 0,
    retractionStatus: retracted ? "retracted" : "none",
    publishedAt,
    dedupeKey: `paper:${paper.key}`,
  };
}

/** FeedItem response (V1 shapeFeedItem): row mentah minus field storage-internal + enrichments. */
export type FeedItemResponse = {
  _id: string;
  kind: FeedKind;
  title: string;
  summary: string;
  tldr?: string;
  tldrId?: string;
  titleId?: string;
  url: string;
  resolvedUrl?: string;
  imageUrl?: string;
  articleText?: string;
  enrichAttempts?: number;
  provider: FeedProvider;
  sourceLabel: string;
  paperKey?: string;
  doi?: string;
  authors?: string[];
  year?: number;
  venue?: string;
  pdfUrl?: string;
  citedByCount?: number;
  isOpenAccess?: boolean;
  topics: string[];
  trendScore: number;
  retractionStatus?: FeedRetractionStatus;
  primaryClaim?: FeedClaim;
  stanceSupporting?: number;
  stanceContrasting?: number;
  sparkline?: number[];
  publishedAt?: number;
  claim?: FeedClaim;
  relevanceScore?: number;
  reason?: string;
  saved?: boolean;
};

/** A feed_items row as read back from Drizzle (subset yang dipakai shaping). */
export type FeedItemRow = {
  id: string;
  kind: string;
  title: string;
  summary: string;
  tldr: string | null;
  tldrId: string | null;
  titleId: string | null;
  url: string;
  resolvedUrl: string | null;
  imageUrl: string | null;
  articleText: string | null;
  enrichAttempts: number | null;
  provider: string;
  sourceLabel: string;
  paperKey: string | null;
  doi: string | null;
  authors: string[] | null;
  year: number | null;
  venue: string | null;
  pdfUrl: string | null;
  citedByCount: number | null;
  isOpenAccess: boolean | null;
  topics: string[];
  trendScore: number;
  retractionStatus: string | null;
  primaryClaim: unknown;
  stanceSupporting: number | null;
  stanceContrasting: number | null;
  sparkline: number[] | null;
  publishedAt: number | null;
};

function opt<T>(value: T | null | undefined): T | undefined {
  return value === null ? undefined : value;
}

/**
 * Proyeksi row → FeedItem response (V1 shapeFeedItem): strip `dedupeKey`/`lastSeenAt`/
 * `createdAt`/`searchText`/`orderAt`; surface `primaryClaim` JUGA sebagai `claim` (kartu);
 * graft per-request `relevanceScore`/`reason`/`saved`.
 */
export function shapeFeedItem(
  row: FeedItemRow,
  extra?: { relevanceScore?: number; reason?: string; saved?: boolean },
): FeedItemResponse {
  const primaryClaim = (row.primaryClaim ?? undefined) as FeedClaim | undefined;
  return {
    _id: row.id,
    kind: row.kind as FeedKind,
    title: row.title,
    summary: row.summary,
    tldr: opt(row.tldr),
    tldrId: opt(row.tldrId),
    titleId: opt(row.titleId),
    url: row.url,
    resolvedUrl: opt(row.resolvedUrl),
    imageUrl: opt(row.imageUrl),
    articleText: opt(row.articleText),
    enrichAttempts: opt(row.enrichAttempts),
    provider: row.provider as FeedProvider,
    sourceLabel: row.sourceLabel,
    paperKey: opt(row.paperKey),
    doi: opt(row.doi),
    authors: opt(row.authors),
    year: opt(row.year),
    venue: opt(row.venue),
    pdfUrl: opt(row.pdfUrl),
    citedByCount: opt(row.citedByCount),
    isOpenAccess: opt(row.isOpenAccess),
    topics: row.topics,
    trendScore: row.trendScore,
    retractionStatus: opt(row.retractionStatus) as FeedRetractionStatus | undefined,
    primaryClaim,
    stanceSupporting: opt(row.stanceSupporting),
    stanceContrasting: opt(row.stanceContrasting),
    sparkline: opt(row.sparkline),
    publishedAt: opt(row.publishedAt),
    claim: primaryClaim,
    relevanceScore: extra?.relevanceScore,
    reason: extra?.reason,
    saved: extra?.saved,
  };
}
