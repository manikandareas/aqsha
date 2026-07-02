import { UserRepo } from "@aqsha/db";
import { getEntitlementSnapshot } from "@aqsha/services/billing";
import { AgentPreferencesService } from "@aqsha/services/preferences";
import { WorkspaceService } from "@aqsha/services/workspace";
import { Agent } from "@mastra/core/agent";
import { StreamErrorRetryProcessor, TokenLimiterProcessor } from "@mastra/core/processors";
import type { RequestContext } from "@mastra/core/request-context";
import { astraInstructions, astraProInstructions, sessionContextBlock } from "../instructions";
import { getServiceDb } from "../lib/db";
import { ownerFromRequestContext, type AgentKind } from "../lib/tool-context";
import { createMemory } from "../memory";
import { liteModel, liteProviderOptions, proModel, proProviderOptions } from "../model";
import { makeBillingProcessors } from "../processors/billing";
import { ElideHistoryToolResultsProcessor } from "../processors/elide-history-tool-results";
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
 *   effort `high`), `maxSteps: 12` (TOOL-1: diturunkan dari 22 — budget longgar terbukti memicu
 *   belasan tool call utk prompt sepele; kedalaman Pro datang dari reasoning effort + batch paralel,
 *   bukan jumlah langkah), context window + recall lebih dalam (32/12/3), instruksi `Pro` (riset
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
    maxSteps: 12,
    contextWindowTokens: Number(process.env.AQSHA_PRO_CONTEXT_WINDOW) || 200_000,
    providerOptions: proProviderOptions,
  },
};

/**
 * Blok "Konteks sesi" dinamis (CTX-5): tanggal + nama + paket, dibaca per-call dari RequestContext
 * + DB (2 lookup ringan, best-effort). Ditempel di AKHIR instruksi statis → prefix ter-cache.
 */
async function resolveSessionContext(
  tier: AgentKind,
  requestContext: RequestContext | undefined,
): Promise<string> {
  const dateText = new Intl.DateTimeFormat("id-ID", {
    dateStyle: "full",
    timeZone: "Asia/Jakarta",
  }).format(new Date());
  let userName: string | null = null;
  let planKey: string | null = null;
  let workspaceNames: string[] = [];
  let preferences: Awaited<ReturnType<typeof AgentPreferencesService.get>> | null = null;
  try {
    const { id, email } = ownerFromRequestContext(requestContext);
    if (id) {
      const db = getServiceDb();
      const [user, snapshot, workspaces, prefs] = await Promise.all([
        UserRepo.findByOwnerUserId(db, id),
        getEntitlementSnapshot(db, id, email),
        // Ringkasan workspace aktif (IMP-1): nama saja, maks 6 — ambient awareness topik riset
        // user tanpa tool call; detail tetap lewat `list_workspaces`/`list_artifacts`.
        WorkspaceService.list(db, id, { limit: 6 }),
        // Preferensi stabil profil (IMP-2) — lintas-thread by design (data profil eksplisit,
        // bukan recall percakapan); override yang diminta user di thread aktif tetap menang.
        AgentPreferencesService.get(db, id),
      ]);
      userName = user?.name ?? null;
      planKey = snapshot.planKey ?? null;
      workspaceNames = workspaces.items.map((w) => w.name);
      preferences = prefs;
    }
  } catch (err) {
    // Best-effort: kegagalan lookup tak boleh menggagalkan turn — blok tetap memuat tanggal+tier.
    console.error("[astra] resolveSessionContext failed", err);
  }
  return sessionContextBlock({ dateText, userName, planKey, tier, workspaceNames, preferences });
}

/**
 * IMP-6: matcher retry untuk error transien gateway/jaringan yang TIDAK tertangkap matcher
 * bawaan OpenAI-Responses (429 rate-limit, 5xx gateway, socket reset). Tanpa ini satu blip
 * mematikan seluruh turn — termasuk hasil 9 langkah tool yang sudah terkumpul. Debit billing
 * aman dari retry: idempotencyKey turn-scoped (CFG-9).
 */
function isTransientProviderError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: unknown; statusCode?: unknown; status?: unknown; message?: unknown };
  const status =
    typeof e.statusCode === "number" ? e.statusCode : typeof e.status === "number" ? e.status : null;
  if (status === 429 || (status !== null && status >= 500 && status <= 599)) return true;
  const code = typeof e.code === "string" ? e.code.toUpperCase() : "";
  if (code === "ECONNRESET" || code === "ETIMEDOUT" || code === "ECONNREFUSED") return true;
  const message = typeof e.message === "string" ? e.message : "";
  return /econnreset|socket hang up|fetch failed|too many requests|bad gateway|service unavailable|gateway timeout/i.test(
    message,
  );
}

function createAstraAgent(tier: AgentKind): Agent {
  const p = PROFILES[tier];
  // Sisakan ruang untuk output + tool results; batasi input ~75% context window.
  const tokenLimit = Math.floor(p.contextWindowTokens * 0.75);
  const { precheck: billingPrecheck, debit: billingDebit } = makeBillingProcessors(tier);
  const { input: projectionInput, output: projectionOutput } = makeThreadProjectionProcessors(tier);

  return new Agent({
    id: p.id,
    name: p.name,
    // Dynamic instructions (CTX-5): inti statis per-tier + blok "Konteks sesi" di akhir.
    instructions: async ({ requestContext }) =>
      `${p.instructions}${await resolveSessionContext(tier, requestContext)}`,
    model: p.model,
    tools: astraTools,
    skills: inlineSkills,
    memory: createMemory(tier),
    // Default opsi `stream()` (vNext) → FE tak perlu mengirim `maxSteps`/`providerOptions`; satu sumber
    // kebenaran. `EnsureFinalResponseProcessor` memakai angka MAX_STEPS yang SAMA → checkpoint
    // kecukupan (~40%/70% budget, TOOL-1) dan reminder+`toolChoice:"none"` step terakhir mendarat
    // tepat. `providerOptions` (penalaran per-tier) di-set kecuali effort di-`off`-kan via env.
    defaultOptions: {
      maxSteps: p.maxSteps,
      ...(p.providerOptions ? { providerOptions: p.providerOptions } : {}),
    },
    inputProcessors: [
      // Strip penanda @mention (U+E000/E001) dari teks user PALING AWAL → token-count & semua
      // processor/LLM di bawahnya melihat teks bersih (penanda cuma untuk render pill di FE).
      // (Juga per-step utk pesan history/recall yang tak lewat processInput — CTX-4.)
      stripMentionMarkersProcessor,
      // Elide payload hasil tool BESAR di pesan riwayat (CTX-6) SEBELUM TokenLimiter → jendela
      // history tak lagi didominasi dump JSON basi.
      new ElideHistoryToolResultsProcessor(),
      // `trimMode:"contiguous"` (CFG-11): default `best-fit` memangkas non-kontigu — melubangi
      // tengah percakapan & bisa memisahkan tool-call dari tool-result-nya dekat batas token.
      new TokenLimiterProcessor({ limit: tokenLimit, trimMode: "contiguous" }),
      projectionInput,
      billingPrecheck,
      // Manifest lampiran thread (durable, anti-"linglung"): setelah billingPrecheck supaya turn
      // yang diblok kuota tak menjalankan query artifact; sebelum EnsureFinalResponse (per-step).
      threadArtifactManifestProcessor,
      new EnsureFinalResponseProcessor(p.maxSteps),
    ],
    outputProcessors: [billingDebit, projectionOutput],
    // IMP-6: retry error stream transien (429/5xx/socket reset) dgn backoff eksponensial —
    // matcher bawaan OpenAI-Responses + matcher gateway/jaringan kita. 2 percobaan ulang cukup
    // untuk blip; error persisten tetap sampai ke FE (banner error jalur normal).
    errorProcessors: [
      new StreamErrorRetryProcessor({
        maxRetries: 2,
        delayMs: ({ retryCount }) => Math.min(1_000 * 2 ** retryCount, 8_000),
        matchers: [isTransientProviderError],
      }),
    ],
  });
}

/**
 * DUR-1 (di-BLOK framework, 2026-07-02): `createDurableAgent`/`createEventedAgent` (Mastra 1.47)
 * SENGAJA tidak dipakai di sini. Dibuktikan dengan smoke test in-process
 * (`scripts/smoke-durable-chat.ts`): agent yang dibungkus durable memulai run
 * (`sendMessage` → `accepted.action:"wake"`) tapi NOL chunk sampai ke `subscribeToThread` —
 * chunk durable mengalir di topic durable-nya sendiri (konsumsi via `stream()`/`observe()` route
 * durable), BUKAN channel durable-thread yang dipakai seluruh FE (send-message +
 * threads/subscribe). Agent polos pada harness yang sama PASS penuh. Jangan bungkus ulang
 * sebelum Mastra mengawinkan thread-stream-runtime dengan durable agent — jalankan smoke itu
 * lagi untuk memverifikasi.
 */
export const astraLite = createAstraAgent("lite");
export const astraPro = createAstraAgent("pro");
