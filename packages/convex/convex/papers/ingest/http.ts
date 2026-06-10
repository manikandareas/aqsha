import type { ActionCtx } from "../../_generated/server";
import { rateLimiter } from "../../limits";

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
  const { timeoutMs = FETCH_TIMEOUT_MS, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...rest, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Check-then-consume a global throttle. Returns false when rate limited. */
export async function globalThrottle(
  ctx: ActionCtx,
  name:
    | "openAlexSearchGlobal"
    | "crossrefLookupGlobal"
    | "arxivSearchGlobal"
    | "unpaywallGlobal"
    | "semanticScholarGlobal",
): Promise<boolean> {
  const status = await rateLimiter.check(ctx, name);
  if (!status.ok) return false;
  await rateLimiter.limit(ctx, name);
  return true;
}
