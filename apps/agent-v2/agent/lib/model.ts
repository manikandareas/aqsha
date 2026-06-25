import { createOpenAI } from "@ai-sdk/openai";
import { withIdleTimeout } from "./idle-fetch.ts";

/**
 * Idle-timeout untuk panggilan HTTP model (default 90s; env `AQSHA_MODEL_IDLE_TIMEOUT_MS`).
 * Memutus koneksi gateway yang stall di tengah-stream → run tak beku selamanya (lihat
 * `idle-fetch.ts`). 90s aman: antar-token normal <1s, bahkan TTFT prompt besar (~86k token)
 * jauh di bawahnya.
 */
const idleEnv = Number(process.env.AQSHA_MODEL_IDLE_TIMEOUT_MS);
// Guard NaN/≤0: a non-numeric env → setTimeout(NaN) fires at 0ms → EVERY model call
// aborts instantly (looks like a dead gateway). Fall back to the 90s default.
const MODEL_STREAM_IDLE_MS = idleEnv > 0 ? idleEnv : 90_000;

/**
 * Model Lite Astra — dipakai root agent DAN semua subagent. Satu sumber agar
 * escape hatch context-window tak drift: subagent yang lupa men-set-nya bikin eve
 * gagal compile compaction untuk model gateway kustom (regresi nyata Fase 7).
 *
 * Provider OpenAI: dukung OpenAI langsung (`OPENAI_API_KEY`) ATAU endpoint
 * OpenAI-compatible/gateway (`OPENAI_BASE_URL`, mis. OpenRouter/LiteLLM). Pakai Chat
 * Completions (`.chat`) demi kompatibilitas gateway maksimal. Model id via `AQSHA_LITE_MODEL`.
 *
 * Compaction eve (selalu on) butuh ukuran context window. eve me-resolve via katalog
 * AI Gateway dari model id — tapi `openai.chat(id)` membuat eve mencari `openai/<id>`
 * (prefix provider), TAK cocok slug katalog (mis. `deepseek/deepseek-v4-flash`) → lookup
 * gagal walau modelnya ada. `AQSHA_LITE_CONTEXT_WINDOW` (jumlah token) → eve pakai nilai
 * ini, lewati lookup. Kosong = biarkan katalog resolve (model OpenAI resmi mis. gpt-4o).
 */
const openai = createOpenAI({
  ...(process.env.OPENAI_BASE_URL ? { baseURL: process.env.OPENAI_BASE_URL } : {}),
  // Bungkus fetch global dengan idle-timeout → koneksi gateway yang hang mid-stream
  // jadi error turn yang retryable, bukan membekukan run. Berlaku untuk root + subagent.
  fetch: withIdleTimeout(fetch, MODEL_STREAM_IDLE_MS),
});

const contextWindow = process.env.AQSHA_LITE_CONTEXT_WINDOW
  ? Number(process.env.AQSHA_LITE_CONTEXT_WINDOW)
  : undefined;

/** Spread ke `defineAgent`: `{ model, ...(modelContextWindowTokens bila di-set) }`. */
export const liteModel = {
  model: openai.chat(process.env.AQSHA_LITE_MODEL ?? "gpt-4o"),
  ...(contextWindow ? { modelContextWindowTokens: contextWindow } : {}),
};
