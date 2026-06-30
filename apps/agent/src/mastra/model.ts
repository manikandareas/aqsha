import { createOpenAI } from "@ai-sdk/openai";
import type { AgentKind } from "@aqsha/chat-core";
import type { RequestContext } from "@mastra/core/request-context";
import { agentKindFromRequestContext } from "./lib/tool-context";

/**
 * Model Astra (chat lite/pro + subagent /deep). Provider OpenAI / gateway OpenAI-compatible
 * (`OPENAI_BASE_URL`); model id via `AQSHA_LITE_MODEL` / `AQSHA_PRO_MODEL`.
 *
 * Pakai **Responses API** (`.responses`), BUKAN Chat Completions (`.chat`): hanya Responses yang
 * memancarkan ringkasan penalaran sebagai part `reasoning-*` (`reasoningSummary`) → trace berpikir
 * model GPT-5 (lite & pro) tampil di UI. Dengan `.chat` opsi `reasoningEffort` membuat model berpikir
 * lebih dalam tapi trace-nya TAK PERNAH ter-stream.
 *
 * CATATAN gateway: Responses API tak universal di gateway OpenAI-compatible. Bila `OPENAI_BASE_URL`
 * menunjuk gateway tanpa dukungan Responses (atau model non-penalaran seperti gpt-4o), set
 * `AQSHA_LITE_REASONING_EFFORT=off` / `AQSHA_PRO_REASONING_EFFORT=off` → opsi penalaran tak dikirim,
 * model tetap jalan sekadar tanpa trace. Context window ditegakkan `TokenLimiter` (bukan model id).
 */
const openai = createOpenAI({
  ...(process.env.OPENAI_BASE_URL ? { baseURL: process.env.OPENAI_BASE_URL } : {}),
  ...(process.env.OPENAI_API_KEY ? { apiKey: process.env.OPENAI_API_KEY } : {}),
});

export const liteModel = openai.responses(process.env.AQSHA_LITE_MODEL ?? "gpt-4o");

/**
 * Model Pro Astra — model penalaran lebih kuat (`AQSHA_PRO_MODEL`). Fallback ke `AQSHA_LITE_MODEL`
 * lalu `gpt-4o` bila belum di-set → degradasi aman (Pro tetap jalan, sekadar tak lebih kuat) sampai
 * owner set env. Kedalaman penalaran disetel via `proProviderOptions` (default effort `"high"`).
 */
export const proModel = openai.responses(
  process.env.AQSHA_PRO_MODEL ?? process.env.AQSHA_LITE_MODEL ?? "gpt-4o",
);

/**
 * Apakah model Pro benar-benar disetel (`AQSHA_PRO_MODEL` eksplisit)? Saat `false`, Pro mem-fallback ke
 * model Lite → output setara Lite. Billing harus ikut turun ke rate Lite supaya pengguna tak dibebani
 * rate Pro (~6×) untuk keluaran setara Lite sampai owner menyetel model. Dipakai `makeBillingProcessors`
 * (chat) + `deep-research` (debit). CATATAN: ini TAK lagi menggerbang penalaran — kedua tier kini punya
 * model penalaran sendiri, jadi reasoning aktif terlepas dari flag ini.
 */
export const PRO_MODEL_CONFIGURED = Boolean(process.env.AQSHA_PRO_MODEL);

/** Ringkasan penalaran yang diminta dari Responses API (`auto` | `concise` | `detailed`). */
const REASONING_SUMMARY = process.env.AQSHA_REASONING_SUMMARY ?? "auto";

/**
 * `providerOptions` penalaran satu tier. `reasoningEffort` mengontrol kedalaman berpikir
 * (`minimal|low|medium|high|xhigh`); `reasoningSummary` MEMUNCULKAN ringkasannya sebagai part
 * `reasoning-*` yang dirender FE. `effort` kosong / `"off"` → tak mengirim opsi penalaran sama sekali
 * (escape-hatch untuk model non-penalaran / gateway tanpa Responses).
 */
function reasoningProviderOptions(effort: string | undefined) {
  const e = (effort ?? "").trim();
  if (!e || e.toLowerCase() === "off") return undefined;
  return { openai: { reasoningEffort: e, reasoningSummary: REASONING_SUMMARY } };
}

/** Lite: penalaran ringan default (`low`) → tier cepat tetap responsif. `AQSHA_LITE_REASONING_EFFORT`. */
export const liteProviderOptions = reasoningProviderOptions(
  process.env.AQSHA_LITE_REASONING_EFFORT ?? "low",
);

/** Pro: penalaran dalam default (`high`). `AQSHA_PRO_REASONING_EFFORT`. */
export const proProviderOptions = reasoningProviderOptions(
  process.env.AQSHA_PRO_REASONING_EFFORT ?? "high",
);

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
