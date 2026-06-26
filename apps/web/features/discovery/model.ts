// Discovery item model for the editorial mosaic (Fase 8). `DiscoveryItem` is the
// wire `FeedItem` carrying a precomputed `itemRef` (the save/hide handle). Feed
// rows ref by feedItemId; live external papers (search augmentation) ref by
// paperKey — see `paperToDiscoveryItem` in Fase 8.2.

import type { DiscoveryItemRef, ExplorePaper, FeedItem } from "./types";

export type DiscoveryItem = FeedItem & { itemRef: DiscoveryItemRef };

export function feedItemToDiscoveryItem(item: FeedItem): DiscoveryItem {
  return { ...item, itemRef: { kind: "feed", feedItemId: item._id } };
}

// Live external paper (search augmentation, Fase 8) → DiscoveryItem. Refs by
// paperKey (not yet materialized into a feed row), synthetic `_id` for React keys.
export function paperToDiscoveryItem(paper: Omit<ExplorePaper, "lastSeenAt">): DiscoveryItem {
  return {
    _id: `paper:${paper.key}`,
    kind: "paper",
    title: paper.title,
    summary: paper.snippet,
    tldr: paper.abstract ?? paper.snippet,
    url: paper.url,
    resolvedUrl: paper.url,
    imageUrl: undefined,
    provider: paper.provider,
    sourceLabel: paper.sourceLabel,
    paperKey: paper.key,
    doi: paper.doi,
    pdfUrl: paper.pdfUrl,
    authors: paper.authors,
    year: paper.year,
    venue: paper.venue,
    citedByCount: paper.citedByCount,
    isOpenAccess: paper.isOpenAccess,
    topics: paper.topics,
    itemRef: { kind: "paper", paperKey: paper.key },
  };
}

/** Stable key for React lists + local hidden/relevance maps. */
export function discoveryItemKey(item: DiscoveryItem): string {
  return item.itemRef.kind === "feed"
    ? `feed:${item.itemRef.feedItemId}`
    : `paper:${item.itemRef.paperKey}`;
}

/** Internal reader href, or null when the item only points at an external source. */
export function feedDetailHref(item: DiscoveryItem): string | null {
  if (item.kind === "paper" && item.paperKey) {
    return `/app/explore/${encodeURIComponent(item.paperKey)}`;
  }
  if (item.kind === "news") return `/app/explore/n/${item._id}`;
  return null;
}

// Most identifier-rich URL for ingestion: canonical DOI > hosted PDF > decoded
// publisher URL > the (possibly opaque) source url.
export function bestIngestUrl(item: DiscoveryItem): string {
  if (item.doi) return `https://doi.org/${item.doi}`;
  return item.pdfUrl ?? item.resolvedUrl ?? item.url;
}

export function kindLabel(kind: FeedItem["kind"]): string {
  return kind === "paper" ? "Paper" : "Berita";
}

export function kindPanelClass(kind: FeedItem["kind"]): string {
  return kind === "paper"
    ? "bg-gradient-to-br from-sky-soft to-mint-soft"
    : "bg-gradient-to-br from-lemon-soft to-coral-soft";
}
