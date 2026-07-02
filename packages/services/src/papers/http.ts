/**
 * Framework-agnostic HTTP helpers for the paper-resolution stack. Ported from
 * V1 `papers/ingest/http.ts`, minus the Convex rate-limiter `globalThrottle`
 * (the Redis cache absorbs repeats; see providers.ts TODO for real pacing).
 */

const FETCH_TIMEOUT_MS = 12_000;

export function contactEmail(): string | undefined {
  return (
    process.env.AQSHA_CONTACT_EMAIL ||
    process.env.CROSSREF_MAILTO ||
    process.env.UNPAYWALL_EMAIL ||
    undefined
  );
}

export function userAgent(): string {
  const email = contactEmail();
  return email
    ? `Aqsha/1.0 (https://aqsha.app; mailto:${email})`
    : "Aqsha/1.0 (https://aqsha.app)";
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = FETCH_TIMEOUT_MS, signal, ...rest } = init;
  // `AbortSignal.timeout` stays armed for the whole Response lifetime, so the
  // deadline also covers body consumption (`.json()`/`.text()`) the caller does
  // AFTER this returns. The old controller+`clearTimeout(finally)` disarmed on
  // headers, leaving a host that stalls its body to hang the read forever.
  const deadline = AbortSignal.timeout(timeoutMs);
  return fetch(url, {
    ...rest,
    signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
  });
}

const RETRY_BASE_DELAY_MS = 400;
const RETRY_JITTER_MS = 800;

/**
 * `fetchWithTimeout` + SATU retry ber-jitter pada 429/5xx atau kegagalan jaringan (CFG-8) —
 * untuk API akademik yang flaky (OpenAlex/Crossref/arXiv/Firecrawl). Timeout/abort TIDAK
 * di-retry (menggandakan latensi terburuk tanpa harapan beda hasil); 4xx lain juga tidak
 * (deterministik). Response non-ok yang tak di-retry dikembalikan apa adanya — pola caller
 * `if (!response.ok) throw` tetap jalan.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const shouldRetryStatus = (status: number) => status === 429 || status >= 500;
  const backoff = () =>
    new Promise((resolve) =>
      setTimeout(resolve, RETRY_BASE_DELAY_MS + Math.random() * RETRY_JITTER_MS),
    );
  try {
    const response = await fetchWithTimeout(url, init);
    if (!shouldRetryStatus(response.status)) return response;
    await response.body?.cancel().catch(() => {});
    await backoff();
    return fetchWithTimeout(url, init);
  } catch (error) {
    // Timeout/abort (`TimeoutError`/`AbortError`) bukan kandidat retry; error jaringan lain ya.
    if (error instanceof DOMException) throw error;
    await backoff();
    return fetchWithTimeout(url, init);
  }
}

/**
 * Host yang TAK BOLEH dijangkau fetch server-side ke URL pihak ketiga (anti-SSRF):
 * loopback / link-local / private / metadata-cloud. Dipakai untuk URL yang berasal
 * dari metadata provider (OA pdf_url) — bukan host API kita yang hardcoded.
 */
export function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h.endsWith(".internal") ||
    h.endsWith(".local")
  ) {
    return true;
  }
  // IPv6: ::1 loopback, fe80::/10 link-local, fc00::/7 unique-local.
  if (h === "::1" || /^(fe[89ab]|f[cd])/.test(h)) return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  }
  return false;
}

/** URL ditolak guard SSRF (non-https, host internal, atau redirect tak valid). */
export class BlockedUrlError extends Error {}

const MAX_SAFE_REDIRECTS = 5;

/**
 * Ikuti redirect SECARA MANUAL sambil memvalidasi https + host tak-diblok di SETIAP hop
 * — `redirect:"follow"` melewati pengecekan per-hop sehingga URL terpercaya bisa menembus
 * ke alamat internal. `doFetch` menjalankan satu hop (`redirect:"manual"`); caller yang
 * memiliki semantik timeout & konsumsi body. Mengembalikan Response final non-redirect.
 * Throw `BlockedUrlError` bila ada hop yang tak aman / redirect rusak.
 */
export async function followRedirectsSafely(
  startUrl: string,
  doFetch: (url: URL) => Promise<Response>,
  maxRedirects = MAX_SAFE_REDIRECTS,
): Promise<Response> {
  let current: URL;
  try {
    current = new URL(startUrl);
  } catch {
    throw new BlockedUrlError("URL tidak valid");
  }
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    if (current.protocol !== "https:") throw new BlockedUrlError("Hanya https");
    if (isBlockedHost(current.hostname)) throw new BlockedUrlError("Host tidak diizinkan");
    const res = await doFetch(current);
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      await res.body?.cancel().catch(() => {});
      if (!loc) throw new BlockedUrlError("Redirect tanpa lokasi");
      try {
        current = new URL(loc, current);
      } catch {
        throw new BlockedUrlError("Redirect tidak valid");
      }
      continue;
    }
    return res;
  }
  throw new BlockedUrlError("Terlalu banyak redirect");
}
