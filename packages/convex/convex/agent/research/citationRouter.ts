// Deterministic (non-LLM) intent detection for the chat-side `verifyCitations`
// tool, mirroring `agent/sandbox/computeRouter.ts`. Pure + dependency-free so it
// runs cheaply before tool assembly and is unit-testable. Paper availability is
// enforced at tool-execution time (the tool resolves the artifact text), so this
// stays a pure prompt-intent function. Unlike sandbox compute, citation
// verification is a free feature exposed on both Lite and Pro.

// Unambiguous standalone phrases (ID + EN).
const CITATION_VERIFY_STANDALONE =
  /(verifikasi\s+sitasi|cek\s+sitasi|periksa\s+sitasi|verifikasi\s+referensi|periksa\s+referensi|cek\s+referensi|verifikasi\s+daftar\s+pustaka|periksa\s+daftar\s+pustaka|verify\s+citations?|check\s+citations?|verify\s+references?|check\s+references?|audit\s+(citations?|references?|bibliography))/i;

// An action verb that, combined with a citation target, signals intent.
const CITATION_VERIFY_ACTION =
  /\b(cek|periksa|verifikasi|verifikasikan|validasi|validate|verify|check|audit|telusuri)\b/i;

// A citation target the action must apply to. No trailing boundary so Indonesian
// suffixes still match the stem (e.g. "sitasinya", "referensinya").
const CITATION_VERIFY_TARGET =
  /\b(sitasi|citations?|referensi|references?|daftar\s+pustaka|bibliogra|rujukan)/i;

/**
 * Detect whether the prompt asks to verify/check/audit the citations or
 * bibliography of a paper. Fires on a strong standalone phrase, or on an action
 * verb co-occurring with a citation target — anchored to keep false positives
 * low (so "write a literature review with citations" does not trigger).
 */
export function detectCitationVerifyIntent(prompt: string): boolean {
  const normalized = (prompt ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return false;
  if (CITATION_VERIFY_STANDALONE.test(normalized)) return true;
  return (
    CITATION_VERIFY_ACTION.test(normalized) &&
    CITATION_VERIFY_TARGET.test(normalized)
  );
}
