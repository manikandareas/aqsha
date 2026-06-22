import { createOpenAI } from "@ai-sdk/openai";
import { defineAgent } from "eve";

/**
 * Astra (Aqsha V2 Fase 6). Model statis per-agent — invarian eve: tidak ada
 * tier per-turn, satu agent = satu model. P6 ship SATU agent (Lite).
 *
 * Provider OpenAI: dukung OpenAI langsung (set `OPENAI_API_KEY`) ATAU endpoint
 * OpenAI-compatible/gateway (set `OPENAI_BASE_URL`, mis. LiteLLM). Pakai Chat
 * Completions (`.chat`) demi kompatibilitas gateway maksimal. Model id di-override
 * via `AQSHA_LITE_MODEL` (default placeholder — owner set saat E2E).
 */
const openai = createOpenAI(
  process.env.OPENAI_BASE_URL ? { baseURL: process.env.OPENAI_BASE_URL } : {},
);

const liteModelId = process.env.AQSHA_LITE_MODEL ?? "gpt-4o";

// Escape hatch context window untuk compaction eve. Compaction (selalu on) butuh ukuran
// context window model untuk memutuskan kapan men-summarize. eve me-resolve via katalog
// AI Gateway dari model id — model id KUSTOM lewat gateway (mis. LiteLLM
// `openai/deepseek/...`) TAK ada di katalog → eve gagal compile & tak boot. Set
// `AQSHA_LITE_CONTEXT_WINDOW` (jumlah token) agar eve pakai nilai ini, lewati lookup.
// Kosong = model dikenal eve (mis. `gpt-4o`) → biarkan katalog yang resolve (lebih akurat).
const liteContextWindow = process.env.AQSHA_LITE_CONTEXT_WINDOW
  ? Number(process.env.AQSHA_LITE_CONTEXT_WINDOW)
  : undefined;

export default defineAgent({
  model: openai.chat(liteModelId),
  ...(liteContextWindow ? { modelContextWindowTokens: liteContextWindow } : {}),
  // D-E (Slice 6.2): proses eve (Node v25) meng-`import` kode service ASLI in-process.
  // `externalDependencies` membuat eve (1) MEMBIARKAN impor ini external saat meng-compile
  // modul authored (tools/channels/hooks) — tak di-inline Rolldown → dep transitif tak
  // ikut bundle; (2) men-trace paket ke output build hosted (`server/node_modules`). Node
  // me-resolve `@aqsha/services`/`@aqsha/db` via exports condition `node` → `dist/*.js`.
  build: {
    externalDependencies: ["@aqsha/services", "@aqsha/db"],
  },
});
