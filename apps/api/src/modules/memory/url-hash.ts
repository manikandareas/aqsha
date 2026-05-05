import { createHash } from "node:crypto";

const TRACKING_QUERY_PREFIXES = ["utm_", "ref_"];
const TRACKING_QUERY_KEYS = new Set([
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "yclid",
  "_hsenc",
  "_hsmi",
]);

export function urlNormalize(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hostname = parsed.hostname.toLowerCase();
    parsed.hash = "";

    const filtered: [string, string][] = [];
    for (const [key, value] of parsed.searchParams.entries()) {
      const lower = key.toLowerCase();
      if (TRACKING_QUERY_KEYS.has(lower)) continue;
      if (TRACKING_QUERY_PREFIXES.some((prefix) => lower.startsWith(prefix))) {
        continue;
      }
      filtered.push([key, value]);
    }
    filtered.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

    const search = new URLSearchParams(filtered).toString();
    parsed.search = search ? `?${search}` : "";

    let pathname = parsed.pathname;
    if (pathname.length > 1 && pathname.endsWith("/")) {
      pathname = pathname.slice(0, -1);
    }
    parsed.pathname = pathname;

    return parsed.toString();
  } catch {
    return url.trim().toLowerCase();
  }
}

export function urlNormalizeAndHash(url: string): string {
  const normalized = urlNormalize(url);
  return createHash("sha256").update(normalized).digest("hex");
}
