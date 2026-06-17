import { fetchWithTimeout } from "../../papers/ingest/http";

// Lazy/best-effort resolver from a news.google.com redirect link to the real
// publisher URL. Used during enrichment so the reader's source card, outbound
// link, and the "Tanya Astra" research seed point at the publisher (not the
// opaque Google redirect).
//
// This is deliberately best-effort and fragile by nature — Google rotates the
// article-URL format and offers no API. Empirically (2026-06) the current
// `CBMi…` generation no longer 302-redirects to the publisher and no longer
// exposes the `data-n-a-sg`/`data-n-a-ts` signature attributes in the
// interstitial, so this resolver returns `null` for those (callers fall back to
// the redirect URL, which still resolves client-side in the user's browser).
// Older / signature-exposing generations and any that redirect ARE decoded. We
// never block ingestion on this; failures are silent.

const DECODE_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const DECODE_TIMEOUT_MS = 12_000;
const BATCHEXECUTE_ENDPOINT =
  "https://news.google.com/_/DotsSplashUi/data/batchexecute";

export async function resolvePublisherUrl(
  redirectUrl: string,
): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(redirectUrl);
  } catch {
    return null;
  }

  // Already a publisher URL (not a Google redirect) — nothing to resolve.
  if (parsed.hostname !== "news.google.com") {
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? redirectUrl
      : null;
  }

  const articleId = extractArticleId(parsed.pathname);
  if (!articleId) return null;

  try {
    const response = await fetchWithTimeout(redirectUrl, {
      timeoutMs: DECODE_TIMEOUT_MS,
      redirect: "follow",
      headers: { "User-Agent": DECODE_UA },
    });

    // Legacy formats 302-redirect straight to the publisher.
    const finalUrl = offGoogleUrl(response.url);
    if (finalUrl) return finalUrl;

    // Signature-exposing generations decode via batchexecute.
    return await decodeViaBatchExecute(articleId, await response.text());
  } catch {
    return null;
  }
}

function offGoogleUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    // Only a non-Google host is a real publisher. A redirect with no consent
    // cookie often lands on consent.google.com / accounts.google.com /
    // www.google.com/sorry — those must NOT be treated as the publisher URL.
    return host && !isGoogleHost(host) ? url : null;
  } catch {
    return null;
  }
}

function isGoogleHost(host: string): boolean {
  return /(^|\.)google\.[a-z.]+$/i.test(host);
}

function extractArticleId(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  const idx = parts.lastIndexOf("articles");
  return idx >= 0 && parts[idx + 1] ? parts[idx + 1] : null;
}

async function decodeViaBatchExecute(
  articleId: string,
  interstitialHtml: string,
): Promise<string | null> {
  const signature = interstitialHtml.match(/data-n-a-sg="([^"]+)"/)?.[1];
  const timestamp = interstitialHtml.match(/data-n-a-ts="([^"]+)"/)?.[1];
  if (!signature || !timestamp) return null;

  const innerRequest = JSON.stringify([
    "garturlreq",
    [
      ["X", "X", ["X", "X"], null, null, 1, 1, "US:en", null, 1, null, null, null, null, null, 0, 1],
      "X",
      "X",
      1,
      [1, 1, 1],
      1,
      1,
      null,
      0,
      0,
      null,
      0,
    ],
    articleId,
    timestamp,
    signature,
  ]);
  const fReq = JSON.stringify([[["Fbv4je", innerRequest, null, "generic"]]]);
  const body = new URLSearchParams({ "f.req": fReq }).toString();

  const response = await fetchWithTimeout(BATCHEXECUTE_ENDPOINT, {
    method: "POST",
    timeoutMs: DECODE_TIMEOUT_MS,
    headers: {
      "User-Agent": DECODE_UA,
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body,
  });
  if (!response.ok) return null;
  return parseBatchExecuteUrl(await response.text());
}

// Pure parser for the batchexecute response (unit-tested). The body is the
// XSSI-guarded `)]}'` prefix followed by length-prefixed JSON chunks; the
// decoded URL lives in the `Fbv4je` (`garturlres`) inner payload.
export function parseBatchExecuteUrl(responseText: string): string | null {
  const withoutPrefix = responseText.replace(/^\)\]\}'/, "");
  for (const line of withoutPrefix.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("[")) continue;
    let outer: unknown;
    try {
      outer = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (!Array.isArray(outer)) continue;
    for (const entry of outer) {
      if (
        Array.isArray(entry) &&
        entry[0] === "wrb.fr" &&
        entry[1] === "Fbv4je" &&
        typeof entry[2] === "string"
      ) {
        try {
          const inner = JSON.parse(entry[2]) as unknown;
          if (
            Array.isArray(inner) &&
            typeof inner[1] === "string" &&
            /^https?:\/\//.test(inner[1])
          ) {
            return inner[1];
          }
        } catch {
          // try the next entry
        }
      }
    }
  }
  return null;
}
