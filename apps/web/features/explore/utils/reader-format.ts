// Pure, dependency-free formatters shared by the discovery cards and the
// news/fact reader detail pages. Extracted from discovery-item-card.tsx so both
// surfaces format source names, domains, and relative time identically.

type SourceNameItem = {
  kind: string;
  authors?: string[];
  sourceLabel: string;
};

export function sourceName(item: SourceNameItem): string {
  if (item.kind === "paper" && item.authors && item.authors.length > 0) {
    return item.authors.length > 1 ? `${item.authors[0]} dkk.` : item.authors[0];
  }
  return item.sourceLabel;
}

export function domainFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function faviconUrl(url: string): string | null {
  const domain = domainFromUrl(url);
  return domain
    ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
    : null;
}

export function relativeTime(
  ms: number | undefined,
  lang: "id" | "en",
): string | null {
  if (!ms) return null;
  const diff = Date.now() - ms;
  if (diff < 0) return formatAbsoluteDate(ms, lang);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return lang === "en" ? "just now" : "baru saja";
  if (minutes < 60)
    return lang === "en" ? `${minutes} min ago` : `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24)
    return lang === "en"
      ? `${hours} hour${hours > 1 ? "s" : ""} ago`
      : `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  if (days < 7)
    return lang === "en"
      ? `${days} day${days > 1 ? "s" : ""} ago`
      : `${days} hari lalu`;
  return formatAbsoluteDate(ms, lang);
}

export function formatAbsoluteDate(
  ms: number,
  lang: "id" | "en",
): string | null {
  try {
    return new Date(ms).toLocaleDateString(lang === "en" ? "en" : "id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return null;
  }
}
