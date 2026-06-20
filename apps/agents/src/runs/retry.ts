// Transient-error classification + backoff for the streaming query loop.
//
// A /deep (or normal) turn drives a long-lived streaming HTTP request to the
// model API (or the Anthropic-compatible gateway). When the local network drops
// mid-stream — a Wi-Fi switch, a sleep/wake, a gateway idle-timeout — the socket
// is closed before the response finishes and the SDK throws (or surfaces a
// result error). Under Bun the message is the native fetch text "The socket
// connection was closed unexpectedly…"; under Node/undici it is "fetch failed" /
// "terminated" / "ECONNRESET". These are RETRIABLE: re-dispatching the same
// turn/phase from scratch is safe (deep phases are isolated + idempotent).
//
// ALLOW-LIST, not deny-list: only messages that clearly indicate a transient
// transport/availability fault retry. Terminal faults (max-turns, auth, invalid
// request, budget) never match here, so they keep failing fast.

const TRANSIENT_SIGNATURES: readonly string[] = [
  // Bun native fetch (this service runs on Bun).
  "socket connection was closed",
  // Node/undici transport.
  "fetch failed",
  "terminated",
  "premature close",
  "other side closed",
  "socket hang up",
  "socket disconnected",
  "network socket disconnected",
  // POSIX socket / DNS errnos — EAI_AGAIN/ENOTFOUND are the classic signature of
  // a network interface that just went away (DNS can't resolve).
  "econnreset",
  "econnrefused",
  "econnaborted",
  "etimedout",
  "enotfound",
  "eai_again",
  "enetdown",
  "enetunreach",
  "ehostunreach",
  "epipe",
  // Generic connection/network phrasings the SDK/CLI wraps API errors in.
  "connection error",
  "connection closed",
  "connection reset",
  "connection refused",
  "network error",
  "request timed out",
  "timeout",
  // Upstream availability — gateways (e.g. OpenRouter) and the API itself return
  // these transiently; a re-run usually lands on a healthy backend.
  "overloaded",
  "service unavailable",
  "bad gateway",
  "gateway timeout",
  // Envoy/gateway upstream faults (the proxy in front of the API/gateway dropped
  // the upstream connection before the response headers arrived).
  "upstream connect error",
  "disconnect/reset",
  " 502",
  " 503",
  " 504",
  " 529",
];

/**
 * True when a stream/run error message indicates a transient transport or
 * upstream-availability fault that is worth retrying. Case-insensitive substring
 * match against a curated allow-list; an empty/undefined message is never
 * transient.
 */
export function isTransientConnectionError(message: string | undefined): boolean {
  if (!message) return false;
  const haystack = message.toLowerCase();
  return TRANSIENT_SIGNATURES.some((signature) => haystack.includes(signature));
}

/**
 * Exponential backoff with full ±jitter for retry attempt `attempt` (1-based:
 * the delay BEFORE re-dispatching after the `attempt`-th failure). Capped at
 * `maxMs`. `random` is injectable for deterministic tests (defaults to
 * Math.random, which is fine in service runtime — unlike workflow scripts).
 */
export function backoffDelayMs(input: {
  attempt: number;
  baseMs: number;
  maxMs: number;
  random?: () => number;
}): number {
  const random = input.random ?? Math.random;
  const exponential = Math.min(input.maxMs, input.baseMs * 2 ** (input.attempt - 1));
  // ±20% jitter so concurrent runs that all dropped on the same network blip do
  // not retry in lockstep.
  const jitter = exponential * 0.2 * (random() * 2 - 1);
  return Math.max(0, Math.round(exponential + jitter));
}
