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
