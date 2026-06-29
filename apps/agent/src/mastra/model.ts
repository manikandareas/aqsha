import { createOpenAI } from "@ai-sdk/openai";
import type { AgentKind } from "@aqsha/chat-core";
import type { RequestContext } from "@mastra/core/request-context";
import { agentKindFromRequestContext } from "./lib/tool-context";

/**
 * Model Lite Astra (Fase 0/1) — dipakai root agent (dan, nanti, subagent /deep).
 *
 * Provider OpenAI / gateway OpenAI-compatible (`OPENAI_BASE_URL`, mis. LiteLLM/OpenRouter).
 * Pakai Chat Completions (`.chat`) demi kompatibilitas gateway maksimal; model id via
 * `AQSHA_LITE_MODEL`. Berbeda dengan eve, Mastra TIDAK butuh `modelContextWindowTokens` —
 * batas context window ditegakkan oleh `TokenLimiter` processor (Fase 1), bukan compaction
 * yang me-resolve katalog dari model id. Jadi escape-hatch `AQSHA_LITE_CONTEXT_WINDOW` eve
 * tak lagi diperlukan di sini.
 *
 * Model `LanguageModelV4` (provider AI SDK v7 = `@ai-sdk/provider@4`) diterima native oleh
 * `MastraModelConfig`.
 */
const openai = createOpenAI({
  ...(process.env.OPENAI_BASE_URL ? { baseURL: process.env.OPENAI_BASE_URL } : {}),
  ...(process.env.OPENAI_API_KEY ? { apiKey: process.env.OPENAI_API_KEY } : {}),
});

export const liteModel = openai.chat(process.env.AQSHA_LITE_MODEL ?? "gpt-4o");

/**
 * Model Pro Astra — model penalaran lebih kuat untuk tier Pro (`AQSHA_PRO_MODEL`). Fallback ke
 * `AQSHA_LITE_MODEL` lalu `gpt-4o` bila belum di-set → degradasi aman (Pro tetap jalan, sekadar tak
 * lebih kuat) sampai owner set env di produksi. Reasoning/thinking diaktifkan di sisi agent
 * (`reasoning: "high"`); efektif hanya bila model ini mendukung penalaran (LanguageModelV4), no-op
 * pada model non-penalaran seperti gpt-4o.
 */
export const proModel = openai.chat(
  process.env.AQSHA_PRO_MODEL ?? process.env.AQSHA_LITE_MODEL ?? "gpt-4o",
);

/**
 * Apakah model Pro benar-benar disetel (`AQSHA_PRO_MODEL` eksplisit)? Saat `false`, Pro mem-fallback ke
 * model Lite TANPA penalaran (lihat `proModel`/`proProviderOptions`) → output setara Lite. Billing harus
 * ikut turun ke rate Lite supaya pengguna tak dibebani rate Pro (~6×) untuk keluaran setara Lite sampai
 * owner menyetel model di produksi. Dipakai `makeBillingProcessors` (chat) + `deep-research` (debit).
 */
export const PRO_MODEL_CONFIGURED = Boolean(process.env.AQSHA_PRO_MODEL);

/**
 * `providerOptions` penalaran untuk tier Pro. HANYA aktif saat `AQSHA_PRO_MODEL` di-set EKSPLISIT —
 * `reasoningEffort` ditolak (400) oleh model non-penalaran seperti gpt-4o, jadi jangan kirim saat Pro
 * mem-fallback ke model Lite. Owner yang menyetel `AQSHA_PRO_MODEL` diasumsikan memilih model yang
 * mendukung penalaran. `AQSHA_PRO_REASONING_EFFORT` opsional (default `"high"`).
 */
export const proProviderOptions = PRO_MODEL_CONFIGURED
  ? { openai: { reasoningEffort: process.env.AQSHA_PRO_REASONING_EFFORT ?? "high" } }
  : undefined;

/**
 * Tier billing EFEKTIF dari tier yang DIMINTA: Pro hanya saat model Pro benar-benar disetel
 * (`PRO_MODEL_CONFIGURED`) — tanpa `AQSHA_PRO_MODEL`, output Pro setara Lite (lihat `proModel`/
 * `proProviderOptions`), jadi bebankan tarif Lite supaya adil. SATU sumber aturan downgrade (dipakai
 * processor billing chat + workflow `/deep`), ditaruh bersama `PRO_MODEL_CONFIGURED`.
 */
export function effectiveBilledTier(requested: AgentKind): AgentKind {
  return requested === "pro" && PRO_MODEL_CONFIGURED ? "pro" : "lite";
}

/**
 * Pilih model menurut tier (`AQSHA_AGENT_KIND_KEY`) di RequestContext — dipakai subagent `/deep`
 * yang punya SATU definisi tapi melayani run lite & pro (tier di-tanam step Workflow per-run).
 * Chat biasa tak memakai ini: tiap tier punya agent terpisah dengan model statis.
 */
export function modelForRequestContext({ requestContext }: { requestContext?: RequestContext }) {
  return agentKindFromRequestContext(requestContext) === "pro" ? proModel : liteModel;
}
