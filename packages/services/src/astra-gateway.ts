/**
 * Konfigurasi gateway Astra (OpenAI-compatible) dari ENV — helper MURNI, TANPA import `ai`.
 *
 * Versi paket `ai` BERBEDA antar-konsumen (agent = ai@7-beta, route api `/blocknote-ai` = ai@6),
 * jadi modul ini sengaja TIDAK memanggil `createOpenAI`; tiap sisi membuat client-nya sendiri dengan
 * nilai ini. Tujuannya satu SUMBER untuk nama env var + default model id supaya route doc-AI dan
 * runtime agent (`apps/agent/src/mastra/model.ts`) tak drift (mis. default model bergeser di satu sisi).
 */

/** Default model Lite bila `AQSHA_LITE_MODEL` belum di-set. */
export const ASTRA_LITE_MODEL_FALLBACK = "gpt-4o";

export type AstraGatewayConfig = {
  /** `OPENAI_BASE_URL` (gateway OpenAI-compatible, mis. LiteLLM/OpenRouter) — `undefined` = default OpenAI. */
  baseURL: string | undefined;
  /** `OPENAI_API_KEY` — `undefined` = ambil dari env SDK default. */
  apiKey: string | undefined;
  /** Model Lite Astra (`AQSHA_LITE_MODEL`, fallback `ASTRA_LITE_MODEL_FALLBACK`). */
  liteModelId: string;
};

/** Baca konfigurasi gateway Astra dari `process.env`. Dipakai route doc-AI + `model.ts` agent. */
export function resolveAstraGateway(): AstraGatewayConfig {
  return {
    baseURL: process.env.OPENAI_BASE_URL || undefined,
    apiKey: process.env.OPENAI_API_KEY || undefined,
    liteModelId: process.env.AQSHA_LITE_MODEL ?? ASTRA_LITE_MODEL_FALLBACK,
  };
}
