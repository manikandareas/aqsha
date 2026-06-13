// Agent tier. Canonical home is here (cross-domain: feed/papers/billing/v2 all
// consume it); the legacy runtime.ts re-exports it until that file is retired.
export type AgentKind = "lite" | "pro";

// Single source of truth for LLM model selection.
//
// Env var names are aligned to the lite/pro agent tiers used across the app
// (composer toggle, agentKind, astraLite/astraPro). The previous names
// (AQSHA_NORMAL_MODEL, AQSHA_PRO_MODEL, AQSHA_DEEP_MODEL) are still honored as
// fallbacks so existing deployments keep working unchanged — the hardcoded
// defaults match the previous behavior exactly.
//
// Preferred → legacy → default:
//   AQSHA_CHAT_LITE_MODEL → AQSHA_NORMAL_MODEL → "gpt-5.4-mini"
//   AQSHA_CHAT_PRO_MODEL  → AQSHA_PRO_MODEL    → "gpt-5.5"
//   AQSHA_DEEP_LITE_MODEL →                    → "gpt-5.4-mini"
//   AQSHA_DEEP_PRO_MODEL  → AQSHA_DEEP_MODEL   → "gpt-5.5"

function envModel(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

export const CHAT_LITE_MODEL =
  envModel("AQSHA_CHAT_LITE_MODEL", "AQSHA_NORMAL_MODEL") ?? "gpt-5.4-mini";
export const CHAT_PRO_MODEL =
  envModel("AQSHA_CHAT_PRO_MODEL", "AQSHA_PRO_MODEL") ?? "gpt-5.5";

export const DEEP_LITE_MODEL = envModel("AQSHA_DEEP_LITE_MODEL") ?? "gpt-5.4-mini";
export const DEEP_PRO_MODEL =
  envModel("AQSHA_DEEP_PRO_MODEL", "AQSHA_DEEP_MODEL") ?? "gpt-5.5";

/** Chat model for an agent tier (Astra Lite / Astra Pro). */
export function chatModelForAgent(agentKind: AgentKind | undefined): string {
  return agentKind === "pro" ? CHAT_PRO_MODEL : CHAT_LITE_MODEL;
}

/**
 * Deep-research model for an agent tier (heavy planning/synthesis on pro). Used
 * for BOTH generation and the upfront billing estimate so they never diverge.
 * Legacy/in-flight runs without an agentKind behave like pro (the old default).
 */
export function deepModelForAgent(agentKind: AgentKind | undefined): string {
  return (agentKind ?? "pro") === "pro" ? DEEP_PRO_MODEL : DEEP_LITE_MODEL;
}
