/**
 * Tipe FeedItem lokal web-v2 (subset yang dirender). web-v2 TIDAK boleh import @aqsha/services
 * (boundary client) → tipe ini mencerminkan kontrak FeedItem (docs/v2/05) untuk field yang dipakai
 * UI. Eden tetap menyediakan tipe penuh dari route; ini hanya untuk prop komponen.
 */
export type FeedKind = "paper" | "news" | "claim" | "topic" | "idea";

export type FeedClaim = {
  claim: string;
  verdict: "supported" | "partially_supported" | "needs_context" | "unverified" | "contradicted";
  verdictLabelRaw: string;
  publisher?: string;
  reviewUrl?: string;
  supportingPaperKeys?: string[];
};

export type FeedVerdict = FeedClaim["verdict"];

export type FeedItem = {
  _id: string;
  kind: FeedKind;
  title: string;
  summary: string;
  tldr?: string;
  url: string;
  resolvedUrl?: string;
  imageUrl?: string;
  provider: string;
  sourceLabel: string;
  paperKey?: string;
  doi?: string;
  authors?: string[];
  year?: number;
  venue?: string;
  citedByCount?: number;
  isOpenAccess?: boolean;
  topics: string[];
  retractionStatus?: "none" | "concern" | "retracted";
  claim?: FeedClaim;
  relevanceScore?: number;
  reason?: string;
  publishedAt?: number;
  // Editorial-mosaic extras (Fase 8). Optional: the feed route only populates
  // them for the kinds that have them (topic→sparkline/trendScore, claim→stance,
  // paper→pdfUrl). Signals/aside self-hide when absent.
  pdfUrl?: string;
  sparkline?: number[];
  trendScore?: number;
  stanceSupporting?: number;
  stanceContrasting?: number;
};

export type DiscoveryItemRef =
  | { kind: "feed"; feedItemId: string }
  | { kind: "paper"; paperKey: string };

export type ExplorePaper = {
  key: string;
  title: string;
  snippet: string;
  abstract?: string;
  url: string;
  pdfUrl?: string;
  doi?: string;
  arxivId?: string;
  openalexId?: string;
  provider: string;
  sourceLabel: string;
  authors: string[];
  year?: number;
  publicationDate?: string;
  venue?: string;
  citedByCount?: number;
  isOpenAccess?: boolean;
  topics: string[];
  score?: number;
  lastSeenAt: number;
};

export type SupportingPaper = {
  key: string;
  title: string;
  year?: number;
  url: string;
  citedByCount?: number;
  isOpenAccess?: boolean;
};

/** Tautan reader internal per-kind. paper→/[key], news→/n/[id], claim→/f/[id]; lain→eksternal. */
export function feedItemHref(item: FeedItem): { href: string; external: boolean } {
  if (item.kind === "paper" && item.paperKey) {
    return { href: `/app/explore/${encodeURIComponent(item.paperKey)}`, external: false };
  }
  if (item.kind === "news") return { href: `/app/explore/n/${item._id}`, external: false };
  if (item.kind === "claim") return { href: `/app/explore/f/${item._id}`, external: false };
  return { href: item.resolvedUrl ?? item.url, external: true };
}

export type FeedMode = "foryou" | "top" | "topics";
export type FeedTopic =
  | "sains_teknologi"
  | "kesehatan"
  | "lingkungan"
  | "sosial_ekonomi"
  | "pendidikan";

export const FEED_TOPIC_LABELS: Record<FeedTopic, string> = {
  sains_teknologi: "Sains & Teknologi",
  kesehatan: "Kesehatan",
  lingkungan: "Lingkungan",
  sosial_ekonomi: "Sosial & Ekonomi",
  pendidikan: "Pendidikan",
};

export const KIND_LABELS: Record<FeedKind, string> = {
  paper: "Paper",
  news: "Berita",
  claim: "Fakta",
  topic: "Topik",
  idea: "Ide",
};
