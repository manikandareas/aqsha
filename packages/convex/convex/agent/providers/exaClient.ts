import Exa from "exa-js";

// Single low-level Exa client constructor. The per-user candidate search
// (`externalProviders.searchExaCandidates`) and the Exa contents read
// (`externalProviders.readWithExaContents`) build their client here so there is
// exactly one `new Exa(...)` call site / one place the API key is read. Exa is
// now agent-only (the feed/explore/ingest surfaces no longer use it).
//
// Callers keep their own rate buckets, result mapping, and `contents` char
// caps, and invoke `exa.search(...)` / `exa.getContents(...)` directly so each
// call site retains the library's overload-driven result typing
// (e.g. `result.summary`, `result.text`, `result.image`).

/**
 * Construct an Exa client from `EXA_API_KEY`. Returns `null` when the key is
 * absent so callers short-circuit exactly as before (each had its own
 * `if (!apiKey) return [...]` / `return readFailure(...)` branch).
 */
export function getExaClient(): Exa | null {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new Exa(apiKey);
}
