// Shared, runtime-light types & taxonomy for the Feed surface. Imported by the
// frontend via `@aqsha/convex/feed`, so keep this free of server-only imports.
// Validators live in the sibling leaf module `validators.ts` (also
// `convex/values`-only), so deriving types here introduces no server import.

import type { Infer } from "convex/values";
import type {
  feedClaimSummaryValidator,
  feedItemKindValidator,
  feedItemValidator,
  feedProviderValidator,
  feedRetractionStatusValidator,
  feedVerdictValidator,
} from "./validators";

export type FeedItemKind = Infer<typeof feedItemKindValidator>;

export type FeedProvider = Infer<typeof feedProviderValidator>;

export type FeedVerdict = Infer<typeof feedVerdictValidator>;

export type FeedRetractionStatus = Infer<typeof feedRetractionStatusValidator>;

export type DiscoveryItemRef =
  | { kind: "feed"; feedItemId: string }
  | { kind: "paper"; paperKey: string };

export type DiscoverySavedRef =
  | { kind: "feed"; feedItemId: string }
  | { kind: "paper"; paperKey: string };

// Visual tone keys map onto @aqsha/ui soft tokens at the component layer.
export type FeedVerdictTone =
  | "true"
  | "partial"
  | "context"
  | "unverified"
  | "false";

export type FeedVerdictMeta = {
  /** Badge label shown to users (Bahasa Indonesia). */
  labelId: string;
  tone: FeedVerdictTone;
};

export const FEED_VERDICT_META: Record<FeedVerdict, FeedVerdictMeta> = {
  supported: { labelId: "Terbukti", tone: "true" },
  partially_supported: { labelId: "Sebagian benar", tone: "partial" },
  needs_context: { labelId: "Perlu konteks", tone: "context" },
  unverified: { labelId: "Belum terverifikasi", tone: "unverified" },
  contradicted: { labelId: "Keliru / Hoaks", tone: "false" },
};

export type FeedVerdictSeverity = "info" | "warning" | "high";

// A fact-check verdict attached to a `claim` feed item (stored denormalized as
// `feedItems.primaryClaim`). Verdicts shown to users are human-sourced
// (ClaimReview); AI-derived verdicts stay at `needs_context`/`unverified` per
// the guardrails. Derived from `feedClaimSummaryValidator` (the field doc
// comments live on the validator).
export type FeedClaim = Infer<typeof feedClaimSummaryValidator>;

// One scored research question from the idea generator (RAG + FINER).
export type FeedIdeaQuestion = {
  question: string;
  methodology: string;
  rationale: string;
  /** 0–100; higher = more novel relative to the grounding literature. */
  noveltyScore: number;
  /** 0–100; FINER feasibility for an early-career researcher. */
  feasibilityScore: number;
  /** Gap archetype: geografis | temporal | populasi | metodologis | integrasi | konteks. */
  gapType?: string;
  /** One-line FINER caveat (e.g. "Sempitkan populasi agar layak skripsi"). */
  finerNote?: string;
  supportingSourceKeys?: string[];
};

export type FeedConsensusStance = "yes" | "no" | "possibly" | "neutral";

export type FeedConsensusPaper = {
  key: string;
  title: string;
  stance: FeedConsensusStance;
  year?: number;
  url: string;
  sourceLabel?: string;
};

// Aggregated yes/no/possibly consensus over papers for a science question.
// Papers are ALWAYS returned so the meter is never shown bare (stance
// classification is noisy — show the receipts).
export type FeedConsensus = {
  question: string;
  yes: number;
  no: number;
  possibly: number;
  total: number;
  papers: FeedConsensusPaper[];
  cached: boolean;
};

// Shape returned by `api.feed.getFeed` per item. Derived from
// `feedItemValidator` (packages/convex/convex/feedValidators.ts) with the
// storage-only bookkeeping fields stripped, plus the per-request enrichments
// (claim join, relevance, reason, saved) and the document id.
//
// The `Omit` is load-bearing: `dedupeKey`/`lastSeenAt`/`createdAt` are storage
// internals that must NOT leak into the public/API shape. A naive
// `Infer<typeof feedItemValidator>` would widen this type to include them.
export type FeedItem = Omit<
  Infer<typeof feedItemValidator>,
  "dedupeKey" | "lastSeenAt" | "createdAt"
> & {
  _id: string;
  /** Fact-check verdict for `claim` items. */
  claim?: FeedClaim;
  /** Per-user relevance in [0,100]; drives the relevance-color encoding. */
  relevanceScore?: number;
  /** Specific "why am I seeing this" reason, e.g. "Karena minat: Diabetes". */
  reason?: string;
  /** Whether the current viewer has saved this feed item. */
  saved?: boolean;
};

export type ExplorePaperLike = {
  key: string;
  title: string;
  snippet: string;
  url: string;
  sourceLabel: string;
  doi?: string;
  authors: string[];
  year?: number;
  publicationDate?: string;
  venue?: string;
  pdfUrl?: string;
  citedByCount?: number;
  isOpenAccess?: boolean;
  topics: string[];
  score?: number;
};

export type DiscoveryItem = Omit<FeedItem, "_id"> & {
  _id?: string;
  itemRef: DiscoveryItemRef;
  saved: boolean;
};

// The unified chronological sort key for the cross-kind paginated feed
// (getFeedPaginated, by_order index). Non-optional on the table so the index is
// total — a row without publishedAt (claims, topics, un-enriched news) would
// otherwise sort indeterminately. Derived + maintained at every feedItems write
// path (upsertFeedItems / claims / paper materialization).
export function deriveOrderAt(item: {
  publishedAt?: number;
  lastSeenAt: number;
  createdAt: number;
}): number {
  return item.publishedAt ?? item.lastSeenAt ?? item.createdAt;
}

export function discoveryItemKey(item: Pick<DiscoveryItem, "itemRef">): string {
  return item.itemRef.kind === "paper"
    ? `paper:${item.itemRef.paperKey}`
    : item.itemRef.feedItemId;
}

export function savedRefKey(ref: DiscoverySavedRef): string {
  return ref.kind === "paper" ? `paper:${ref.paperKey}` : ref.feedItemId;
}

export function feedItemToDiscoveryItem(item: FeedItem): DiscoveryItem {
  return {
    ...item,
    saved: Boolean(item.saved),
    itemRef: { kind: "feed", feedItemId: item._id },
  };
}

export function paperToDiscoveryItem(
  paper: ExplorePaperLike,
  savedRefs: ReadonlySet<string> = new Set(),
): DiscoveryItem {
  const itemRef: DiscoveryItemRef = { kind: "paper", paperKey: paper.key };
  return {
    itemRef,
    saved: savedRefs.has(savedRefKey(itemRef)),
    kind: "paper",
    title: paper.title,
    summary: paper.snippet,
    tldr: paper.snippet,
    url: paper.url,
    provider: "openalex",
    sourceLabel: paper.sourceLabel,
    paperKey: paper.key,
    doi: paper.doi,
    authors: paper.authors,
    year: paper.year,
    venue: paper.venue,
    pdfUrl: paper.pdfUrl,
    citedByCount: paper.citedByCount,
    isOpenAccess: paper.isOpenAccess,
    topics: paper.topics,
    trendScore: paper.citedByCount ?? paper.score ?? 0,
    publishedAt: paper.publicationDate
      ? parseDateMs(paper.publicationDate)
      : paper.year
        ? Date.UTC(paper.year, 0, 1)
        : undefined,
  };
}

function parseDateMs(value: string): number | undefined {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : undefined;
}

// UI tone → soft-token family used by the verdict badge in the web app
// (apps/web/app/globals.css). Kept here so the mapping is shared/auditable.
export const FEED_VERDICT_TONE_TOKEN: Record<
  FeedVerdictTone,
  { soft: string; foreground: string; border: string }
> = {
  true: { soft: "mint-soft", foreground: "mint-foreground", border: "mint-soft-border" },
  partial: { soft: "lemon-soft", foreground: "lemon-foreground", border: "lemon-soft-border" },
  context: { soft: "coral-soft", foreground: "coral-foreground", border: "coral-soft-border" },
  unverified: { soft: "muted", foreground: "muted-foreground", border: "border" },
  false: {
    soft: "destructive/10",
    foreground: "destructive",
    border: "destructive/25",
  },
};
