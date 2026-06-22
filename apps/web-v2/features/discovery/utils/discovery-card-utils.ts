import type { DiscoveryItem, FeedItem } from "../types";

function encodePaperRef(paperKey: string) {
  return encodeURIComponent(paperKey);
}

export function feedDetailHref(item: DiscoveryItem): string | null {
  if (item.kind === "paper" && item.paperKey) {
    return `/app/explore/${encodePaperRef(item.paperKey)}`;
  }
  if (item.kind === "news" && item._id) return `/app/explore/n/${item._id}`;
  if (item.kind === "claim" && item._id) return `/app/explore/f/${item._id}`;
  return null;
}

// A `topic` (GDELT trend) item has no ingestible document — its url is a Google
// News *search* page, not an article — so it isn't a valid Save-to-Workspace
// target. Every other kind (paper/news/claim) points at a real document.
export function isSavableToWorkspace(item: Pick<DiscoveryItem, "kind">): boolean {
  return item.kind !== "topic";
}

export function kindLabel(kind: FeedItem["kind"]): string {
  switch (kind) {
    case "paper":
      return "Paper";
    case "news":
      return "Berita";
    case "claim":
      return "Klaim";
    case "topic":
      return "Topik";
    default:
      return "Ide";
  }
}

export function kindPanelClass(kind: FeedItem["kind"]): string {
  switch (kind) {
    case "claim":
      return "bg-gradient-to-br from-coral-soft to-lemon-soft";
    case "topic":
      return "bg-gradient-to-br from-sky-soft to-lavender-soft";
    case "paper":
      return "bg-gradient-to-br from-sky-soft to-mint-soft";
    case "idea":
      return "bg-gradient-to-br from-lavender-soft to-mint-soft";
    default:
      return "bg-gradient-to-br from-lemon-soft to-coral-soft";
  }
}

function formatItemDate(item: DiscoveryItem): string {
  if (item.kind === "paper" && item.year && !item.publishedAt) {
    return String(item.year);
  }
  if (item.publishedAt) {
    try {
      return new Date(item.publishedAt).toLocaleDateString("id-ID", {
        year: "numeric",
        month: "short",
      });
    } catch {
      return "";
    }
  }
  return item.year ? String(item.year) : "";
}

export function buildSourceLine(item: DiscoveryItem): string {
  const parts: string[] = [];
  if (item.kind === "paper" && item.authors && item.authors.length > 0) {
    parts.push(item.authors.slice(0, 4).join(", "));
  } else {
    parts.push(item.sourceLabel);
  }
  const date = formatItemDate(item);
  if (date) parts.push(date);
  return parts.join(" · ");
}
