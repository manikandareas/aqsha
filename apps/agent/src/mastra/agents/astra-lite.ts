import { Agent } from "@mastra/core/agent";
import { TokenLimiterProcessor } from "@mastra/core/processors";
import { astraInstructions, astraProInstructions } from "../instructions";
import type { AgentKind } from "../lib/tool-context";
import { createMemory } from "../memory";
import { liteModel, liteProviderOptions, proModel, proProviderOptions } from "../model";
import { makeBillingProcessors } from "../processors/billing";
import { EnsureFinalResponseProcessor } from "../processors/ensure-final-response";
import { stripMentionMarkersProcessor } from "../processors/strip-mention-markers";
import { threadArtifactManifestProcessor } from "../processors/thread-artifact-manifest";
import { makeThreadProjectionProcessors } from "../processors/thread-projection";
import { inlineSkills } from "../skills";
import { astraTools } from "../tools";

/**
 * Astra — agent chat utama, dua tier dari SATU factory (`createAstraAgent`):
 *
 * - **Lite** (`astra-lite`): default. Model `liteModel` + penalaran ringan (`liteProviderOptions`,
 *   effort `low`), `maxSteps: 10`, recall 16/6/2. Fitur billing `normal_chat`.
 * - **Pro** (`astra-pro`): model penalaran `proModel` + penalaran dalam (`proProviderOptions`,
 *   effort `high`), `maxSteps: 22`, context window + recall lebih dalam (32/12/3), instruksi `Pro` (riset
 *   lebih dalam + verifikasi proaktif). Fitur billing `pro_chat` (rate lebih tinggi). FE memilih tier
 *   dengan menunjuk agent ID dari `agentKind` composer — tak ada knob per-call yang dikirim klien.
 *
 * Knob bersama (tool 17, skills 11, memory SoT, TokenLimiter, billing-precheck, manifest lampiran,
 * EnsureFinalResponse) identik; hanya nilai per-tier yang berbeda → satu definisi, bukan dua salinan.
 */
type TierProfile = {
  id: string;
  name: string;
  instructions: string;
  model: typeof liteModel;
  maxSteps: number;
  contextWindowTokens: number;
  /** `providerOptions` penalaran per-tier (effort + reasoningSummary). `undefined` bila effort `off`. */
  providerOptions?: typeof proProviderOptions;
};

const PROFILES: Record<AgentKind, TierProfile> = {
  lite: {
    id: "astra-lite",
    name: "Astra",
    instructions: astraInstructions,
    model: liteModel,
    maxSteps: 10,
    contextWindowTokens: Number(process.env.AQSHA_LITE_CONTEXT_WINDOW) || 128_000,
    providerOptions: liteProviderOptions,
  },
  pro: {
    id: "astra-pro",
    name: "Astra Pro",
    instructions: astraProInstructions,
    model: proModel,
    maxSteps: 22,
    contextWindowTokens: Number(process.env.AQSHA_PRO_CONTEXT_WINDOW) || 200_000,
    providerOptions: proProviderOptions,
  },
};

function createAstraAgent(tier: AgentKind): Agent {
  const p = PROFILES[tier];
  // Sisakan ruang untuk output + tool results; batasi input ~75% context window.
  const tokenLimit = Math.floor(p.contextWindowTokens * 0.75);
  const { precheck: billingPrecheck, debit: billingDebit } = makeBillingProcessors(tier);
  const { input: projectionInput, output: projectionOutput } = makeThreadProjectionProcessors(tier);

  return new Agent({
    id: p.id,
    name: p.name,
    instructions: p.instructions,
    model: p.model,
    tools: astraTools,
    skills: inlineSkills,
    memory: createMemory(tier),
    // Default opsi `stream()` (vNext) → FE tak perlu mengirim `maxSteps`/`providerOptions`; satu sumber
    // kebenaran. `EnsureFinalResponseProcessor` memakai angka MAX_STEPS yang SAMA → reminder mendarat di
    // step terakhir. `providerOptions` (penalaran per-tier) di-set kecuali effort di-`off`-kan via env.
    defaultOptions: {
      maxSteps: p.maxSteps,
      ...(p.providerOptions ? { providerOptions: p.providerOptions } : {}),
    },
    inputProcessors: [
      // Strip penanda @mention (U+E000/E001) dari teks user PALING AWAL → token-count & semua
      // processor/LLM di bawahnya melihat teks bersih (penanda cuma untuk render pill di FE).
      stripMentionMarkersProcessor,
      new TokenLimiterProcessor(tokenLimit),
      projectionInput,
      billingPrecheck,
      // Manifest lampiran thread (durable, anti-"linglung"): setelah billingPrecheck supaya turn
      // yang diblok kuota tak menjalankan query artifact; sebelum EnsureFinalResponse (per-step).
      threadArtifactManifestProcessor,
      new EnsureFinalResponseProcessor(p.maxSteps),
    ],
    outputProcessors: [billingDebit, projectionOutput],
  });
}

export const astraLite = createAstraAgent("lite");
export const astraPro = createAstraAgent("pro");
