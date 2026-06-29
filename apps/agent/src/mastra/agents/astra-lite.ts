import { Agent } from "@mastra/core/agent";
import { TokenLimiterProcessor } from "@mastra/core/processors";
import { astraInstructions } from "../instructions";
import { memory } from "../memory";
import { liteModel } from "../model";
import { billingDebitProcessor, billingPrecheckProcessor } from "../processors/billing";
import { EnsureFinalResponseProcessor } from "../processors/ensure-final-response";
import { stripMentionMarkersProcessor } from "../processors/strip-mention-markers";
import { threadArtifactManifestProcessor } from "../processors/thread-artifact-manifest";
import {
  threadProjectionInputProcessor,
  threadProjectionProcessor,
} from "../processors/thread-projection";
import { inlineSkills } from "../skills";
import { astraTools } from "../tools";

/**
 * Astra Lite — agent chat utama (Fase 1: parity penuh dengan eve).
 *
 * - `tools`: 17 tool app (5 read / 6 write / 6 research+verify) — port 1:1 dari eve `defineTool`.
 * - `memory`: Mastra Memory (history + semantic recall) = SoT pesan.
 * - `inputProcessors`: `TokenLimiter` (jendela context, ganti compaction eve) +
 *   `billingPrecheck` (gate kuota/cooldown → abort tripwire).
 * - `outputProcessors`: `billingDebit` (consumeCredits per-turn) — ganti hook `step.completed`;
 *   `threadProjection` (upsert tipis `chat_threads` + title async) — ganti hook `projection.ts`.
 * - `skills`: 11 `SKILL.md` (metodologi) — Mastra auto-menyediakan tool `skill`/`skill_read`/
 *   `skill_search` (progressive disclosure), TANPA sandbox.
 * - `maxSteps`/`ensureFinalResponse`: batasi tool-loop + jamin teks akhir (anti turn senyap
 *   saat model nyangkut nge-tool sampai cap step — lihat `EnsureFinalResponseProcessor`).
 */
const CONTEXT_WINDOW_TOKENS = Number(process.env.AQSHA_LITE_CONTEXT_WINDOW) || 128_000;
// Sisakan ruang untuk output + tool results; batasi input ~75% context window.
const TOKEN_LIMIT = Math.floor(CONTEXT_WINDOW_TOKENS * 0.75);

// Budget langkah tool-loop per giliran. Cukup untuk riset multi-pencarian, tapi mencegah model
// nyangkut. `EnsureFinalResponseProcessor` memakai angka SAMA → reminder mendarat di step terakhir.
const MAX_STEPS = 10;

export const astraLite = new Agent({
  id: "astra-lite",
  name: "Astra",
  instructions: astraInstructions,
  model: liteModel,
  tools: astraTools,
  skills: inlineSkills,
  memory,
  // Default opsi `stream()` (vNext) → FE tak perlu mengirim `maxSteps`; satu sumber kebenaran.
  defaultOptions: { maxSteps: MAX_STEPS },
  inputProcessors: [
    // Strip penanda @mention (U+E000/E001) dari teks user PALING AWAL → token-count & semua
    // processor/LLM di bawahnya melihat teks bersih (penanda cuma untuk render pill di FE).
    stripMentionMarkersProcessor,
    new TokenLimiterProcessor(TOKEN_LIMIT),
    threadProjectionInputProcessor,
    billingPrecheckProcessor,
    // Manifest lampiran thread (durable, anti-"linglung"): setelah billingPrecheck supaya turn
    // yang diblok kuota tak menjalankan query artifact; sebelum EnsureFinalResponse (per-step).
    threadArtifactManifestProcessor,
    new EnsureFinalResponseProcessor(MAX_STEPS),
  ],
  outputProcessors: [billingDebitProcessor, threadProjectionProcessor],
});
