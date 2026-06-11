// Deterministic (non-LLM) intent detection for the sandbox compute path,
// mirroring `agent/tools/artifactCommandInference.ts`. Pure and dependency-free
// so it can be unit-tested in isolation and run cheaply before tool assembly:
// when there is no compute intent the sandbox tools are never added to the
// toolset (zero token waste, zero risk). Paper availability is enforced at tool
// execution time (the tool resolves the artifact text), so this stays a pure
// prompt-intent function like the artifact command router.

// Mirrors `AgentKind` from ../runtime; inlined to keep this module free of the
// agent runtime's heavy imports.
type AgentTier = "lite" | "pro";

export type ComputeIntent = "stat_verification";

export interface ComputeRouterDecision {
  /** Whether to expose `verifyStatistics` for this turn. */
  exposeStatVerification: boolean;
  /** The detected compute intent, or null when none fired. */
  intent: ComputeIntent | null;
}

// Strong standalone phrases that are unambiguous verification requests on their
// own (ID + EN). Anchored so e.g. "konsistensi statistiknya" still matches.
const STAT_VERIFICATION_STANDALONE =
  /(statcheck|konsistensi\s+statistik|statistical\s+consistency|p-?\s?value\s+consistency|cek\s+p-?\s?value|periksa\s+p-?\s?value|verifikasi\s+statistik|verify\s+statistic|power\s+analysis|analisis\s+(daya|power))/i;

// An action verb that, combined with a statistics target below, signals intent.
const STAT_VERIFICATION_ACTION =
  /\b(cek|periksa|verifikasi|verifikasikan|validasi|validate|verify|check|reproduksi|reproduce|reproduksikan|hitung\s+(?:ulang|kembali)|uji\s+ulang|recompute|recalculate|rekomputasi)\b/i;

// A statistics target the action must be applied to. No trailing word boundary
// so Indonesian suffixes still match the stem (e.g. "statistiknya",
// "signifikansinya").
const STAT_VERIFICATION_TARGET =
  /\b(statistik|statistical|statistics|p-?\s?values?|nilai\s+p|signifikansi|significance|konsistensi|t-?test|anova|chi-?square|chi-?squared)/i;

/**
 * Detect whether the prompt is asking to verify/recompute the statistics in a
 * paper. Fires on a strong standalone phrase, or on an action verb co-occurring
 * with a statistics target — both anchored to keep false positives low (so a
 * request to "explain the statistical method" does not trigger a recompute).
 */
export function detectStatVerificationIntent(prompt: string): boolean {
  const normalized = (prompt ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return false;
  if (STAT_VERIFICATION_STANDALONE.test(normalized)) return true;
  return (
    STAT_VERIFICATION_ACTION.test(normalized) &&
    STAT_VERIFICATION_TARGET.test(normalized)
  );
}

/**
 * Route a chat turn for sandbox compute. Only the Astra Pro agent exposes the
 * tools (Lite withholds); exposure additionally requires an explicit compute
 * intent in the prompt.
 */
export function routeCompute(args: {
  prompt: string;
  agentKind: AgentTier;
}): ComputeRouterDecision {
  if (args.agentKind !== "pro") {
    return { exposeStatVerification: false, intent: null };
  }
  const intent: ComputeIntent | null = detectStatVerificationIntent(args.prompt)
    ? "stat_verification"
    : null;
  return { exposeStatVerification: intent !== null, intent };
}
