import {
  formatAskAnswersForModel,
  messagePreview,
  normalizeAskQuestions,
  type AskQuestion,
} from "@aqsha/chat-core";
import {
  DEEP_VIZ_CLASSIFIED_STANCES,
  DEEP_VIZ_STUDY_DESIGNS,
  buildDeepVizBlocks,
  deepVizBlockSchema,
  formatDeepAnalyzeSummary,
  injectVizBlocks,
  type DeepVizBlock,
  type DeepVizSourceInput,
} from "@aqsha/chat-core/deep-viz";
import { BillingService } from "@aqsha/services/billing";
import { ThreadService, TitleService } from "@aqsha/services/chat";
import { estimateCredits } from "@aqsha/services/plan";
import { SendQuotaService } from "@aqsha/services/quota";
import {
  CitationService,
  ResearchService,
  type IntegrityStatus,
  type VerificationResult,
} from "@aqsha/services/research";
import type { Mastra } from "@mastra/core/mastra";
import {
  MASTRA_THREAD_ID_KEY,
  RequestContext,
} from "@mastra/core/request-context";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import {
  askQuestionSchema,
  askQuestionsResumeSchema,
  askQuestionsSuspendSchema,
} from "../lib/ask-questions-schema";
import { deepWriter } from "../agents/deep-writer";
import { getServiceDb } from "../lib/db";
import { runDeepSubagentTask } from "./deep-tasks";
import { inlineSkillInstructions } from "../skills";
import {
  AQSHA_AGENT_KIND_KEY,
  AQSHA_DEEP_RUN_KEY,
  AQSHA_DEEP_SUBQ_INDEX_KEY,
  AQSHA_DEEP_SUBQ_TEXT_KEY,
  type AgentKind,
  ownerFromRequestContext,
} from "../lib/tool-context";
import { effectiveBilledTier, liteProviderOptions, proProviderOptions } from "../model";

/**
 * Workflow `deep-research` — orkestrasi deterministik Mastra untuk `/deep`.
 *
 * Riset mendalam dijalankan sebagai langkah eksplisit (bukan loop model-driven) supaya
 * observable per fase dan resume-safe:
 *
 *   draftClarify (kuota + nilai klarifikasi) → clarify (HITL ask_questions, opsional) → draftPlan
 *   → approvePlan (HITL suspend/resume + gerbang billing) → searchLiterature → counterEvidence
 *   → assignCitations → analyzeSources (evidence viz) → verifyCitations → synthesize → persistReport
 *
 * Keputusan desain (deviasi yang disengaja dari rancangan awal, dicatat):
 * - **Fan-out di dalam `searchStep`** (Promise.all per sub-pertanyaan) alih-alih builder
 *   `.foreach`. Rantai linear `.then` menjaga konteks (question/plan) mengalir utuh tanpa
 *   `.map`/`getStepResult` dan tetap observable per fase. Per-sub-pertanyaan paralel.
 * - **Billing SEKALI di plan-gate** (`requireEntitlement` + `consumeCredits` feature
 *   `deep_research`, idempoten via `runId`). Subagent & penulis TAK pakai processor billing
 *   per-turn; tool `search_*` tetap men-debit `external_search` per pemanggilan, sama seperti
 *   di chat biasa.
 * - **threadId** dialirkan ke subagent via `RequestContext` (`MASTRA_THREAD_ID_KEY`) supaya
 *   tool riset men-scope `research_sources` ke thread chat tanpa memory thread subagent.
 */

// ── Skema data (kontrak antar-step, akumulatif) ──────────────────────────────────────────

const InputSchema = z.object({
  question: z.string().min(1).describe("Pertanyaan riset utama dari pengguna."),
  context: z.string().optional().describe("Konteks tambahan hasil klarifikasi (opsional)."),
  threadId: z.string().min(1).describe("Thread chat untuk men-scope sumber + billing."),
  displayQuestion: z
    .string()
    .optional()
    .describe(
      "Varian `question` ber-penanda @mention (U+E000/E001) untuk DITAMPILKAN/DIPERSIST sebagai pill. Hanya pengaruhi teks pesan user yang disimpan; planner & subagen tetap pakai `question` bersih.",
    ),
  agentKind: z
    .enum(["lite", "pro"])
    .default("lite")
    .describe(
      "Tier agen: `pro` → subagen pakai `proModel` + penalaran tinggi & debit `DEEP_PRO_CREDITS`; `lite` (default) → `liteModel` & `DEEP_LITE_CREDITS`.",
    ),
});

/** Input + hasil penilaian klarifikasi (`clarifyQuestions` kosong = tak perlu bertanya). */
const ClarifiedSchema = InputSchema.extend({
  clarifyQuestions: z
    .array(askQuestionSchema)
    .describe("Pertanyaan klarifikasi pra-rencana (kosong bila pertanyaan sudah cukup spesifik)."),
});

/**
 * Domain-pack metodologi untuk sintesis: dipilih planner di `draft-plan`, dipakai
 * `synthesize` untuk meng-inline skill `research-<domain>` ke prompt (langkah sintesis berjalan
 * `toolChoice:"none"` sehingga tool skill tak bisa dipanggil di sana).
 */
const ResearchDomainSchema = z.enum(["medicine", "cs-ml", "education", "general"]);
type ResearchDomain = z.infer<typeof ResearchDomainSchema>;

const PlanSchema = z.object({
  plan: z.string().min(1).describe("Rencana riset sebagai prosa mengalir."),
  subQuestions: z
    .array(z.string().min(1))
    .min(1)
    .max(8)
    .describe("3-6 sub-pertanyaan riset yang diturunkan dari rencana."),
  domain: ResearchDomainSchema.default("general").describe(
    "Domain-pack metodologi yang di-inline ke prompt sintesis.",
  ),
});

const EvidenceItemSchema = z.object({
  subQuestion: z.string(),
  findings: z.string().describe("Temuan bukti dari literature-searcher (TANPA [n]; identifikasi via DOI/arXiv/URL — penomoran global di assign-citations)."),
});

const PlannedSchema = InputSchema.extend(PlanSchema.shape);
const SearchedSchema = PlannedSchema.extend({ evidence: z.array(EvidenceItemSchema) });
const CounteredSchema = SearchedSchema.extend({ counter: z.string() });
/** Satu sumber bernomor (format kartu FE `{ n, title, url, … }`) — dipersist sebagai fallback laporan. */
const NumberedSourceSchema = z.object({
  n: z.number(),
  title: z.string(),
  url: z.string().nullable(),
  doi: z.string().nullable(),
  origin: z.string(),
  snippet: z.string().optional(),
});
/** Referensi terstruktur per `[n]` unik — bahan `CitationService.verifyIdentifiers` langsung. */
const VerifyRefSchema = z.object({
  citation: z.number(),
  title: z.string(),
  doi: z.string().optional(),
  arxivId: z.string().optional(),
  url: z.string().optional(),
  authors: z.array(z.string()).optional(),
  year: z.number().optional(),
  venue: z.string().optional(),
});
const CitedSchema = CounteredSchema.extend({
  numberedInventory: z.string().describe("Daftar sumber bernomor [n] GLOBAL (citation_number) untuk dikutip."),
  numberedSources: z
    .array(NumberedSourceSchema)
    .describe("Sumber bernomor terstruktur → dipersist di metadata laporan (fallback Sumber FE)."),
  verifyRefs: z
    .array(VerifyRefSchema)
    .describe("Referensi terstruktur per [n] unik → verify-citations panggil CitationService langsung."),
});
/**
 * Hasil analisis bukti (step `analyze-sources`, evidence viz): blok visual deterministik yang
 * memenuhi ambang minimum data + jumlah unit terklasifikasi (bahan panel proses).
 * Best-effort total: step gagal → `vizBlocks: []` dan laporan tampil polos seperti sebelumnya.
 * `.default(...)` WAJIB: snapshot run yang dimulai sebelum field ini ada (restart boot-sweep
 * maupun pemulihan time-travel "Coba lagi") tak memuat keduanya — tanpa default, validasi
 * input step baru menolak run lama selamanya.
 */
const AnalyzedSchema = CitedSchema.extend({
  vizBlocks: z
    .array(deepVizBlockSchema)
    .default([])
    .describe(
      "Blok visual berbasis bukti (chat-core `deep-viz`, deterministik) yang lolos ambang — [] bila analisis gagal/kurang data.",
    ),
  analyzedSourceCount: z
    .number()
    .default(0)
    .describe("Jumlah unit sumber (pasangan [n]×sub-pertanyaan) yang berhasil diklasifikasikan."),
});
const VerifiedSchema = AnalyzedSchema.extend({ verification: z.string() });
/**
 * Hasil sintesis → step `persist-report` (failure domain persist terpisah). SUBSET yang
 * dikonsumsi persist-report + FE saja — korpus bukti (evidence/verifyRefs/question/context) sudah
 * tersimpan di output step-step sebelumnya; mengangkutnya lagi hanya menggemukkan snapshot dan
 * chunk `workflow-step-result` yang dikirim ke browser tepat saat user menunggu laporan.
 */
const SynthesizedSchema = VerifiedSchema.pick({
  threadId: true,
  agentKind: true,
  plan: true,
  subQuestions: true,
  counter: true,
  verification: true,
  numberedInventory: true,
  numberedSources: true,
  vizBlocks: true,
  analyzedSourceCount: true,
}).extend({
  report: z.string().min(1).describe("Laporan tercitasi hasil penulis sintesis."),
  reasoning: z
    .string()
    .describe("Ringkasan penalaran penulis (kosong bila provider tak mengembalikan)."),
});

const OutputSchema = z.object({
  status: z.enum(["completed", "cancelled", "blocked"]),
  report: z.string().optional().describe("Laporan tercitasi (status=completed)."),
  plan: z.string().optional(),
  subQuestions: z.array(z.string()).optional(),
  reason: z.string().optional().describe("Alasan blokir/batal (status≠completed)."),
  reasoning: z
    .string()
    .optional()
    .describe("Ringkasan penalaran penulis sintesis → blok reasoning FE saat refresh poll."),
});

type Planned = z.infer<typeof PlannedSchema>;
type Searched = z.infer<typeof SearchedSchema>;
type Verified = z.infer<typeof VerifiedSchema>;

// ── Helper konteks ───────────────────────────────────────────────────────────────────────

/**
 * Tanam threadId chat + run id deep (`AQSHA_DEEP_RUN_KEY`) ke RequestContext sebelum memanggil
 * subagent. Tool riset membaca `MASTRA_THREAD_ID_KEY` (lewat `threadScopeId`) untuk men-scope
 * `research_sources` + RAG, dan menstempel `research_sources.turnId = runId` (semua sumber satu run
 * berbagi turn) → penomoran sitasi `[n]` global + dedupe. Owner/email yang sudah ada di rc tetap
 * terbawa (callerId/callerEmail subagent valid). Dipakai di step yang memanggil subagent ber-tool riset.
 */
function withDeepRun(
  rc: RequestContext,
  threadId: string,
  runId: string,
  agentKind: AgentKind,
): RequestContext {
  rc.set(MASTRA_THREAD_ID_KEY, threadId);
  rc.set(AQSHA_DEEP_RUN_KEY, runId);
  // Tier per-run → subagent (`modelForRequestContext`) memilih `proModel`/`liteModel`. Set di rc INDUK
  // sebelum fan-out search supaya rc yang DI-CLONE per sub-pertanyaan ikut membawanya.
  rc.set(AQSHA_AGENT_KIND_KEY, agentKind);
  return rc;
}

/**
 * `providerOptions` penalaran per-panggilan subagent (bukan field top-level agent di Mastra 1.47).
 * Per-tier: Pro pakai `proProviderOptions` (effort tinggi), Lite `liteProviderOptions` (effort ringan) —
 * jadi penalaran subagent /deep aktif di KEDUA tier (undefined bila effort di-`off`-kan → spread kosong).
 * Ringkasannya (`reasoningSummary`) dipanen `synthesize` (`out.reasoningText`) → blok penalaran FE.
 */
function deepProviderOptions(agentKind: AgentKind): { providerOptions?: typeof proProviderOptions } {
  const opts = agentKind === "pro" ? proProviderOptions : liteProviderOptions;
  return opts ? { providerOptions: opts } : {};
}

/**
 * Opsi `.generate()` baku untuk subagent `/deep` di rc INDUK: tanam thread+run+tier (`withDeepRun`) +
 * `providerOptions` penalaran Pro. Satu sumber untuk pasangan rc+providerOptions yang dulu ditulis
 * verbatim di tiap step (model membaca tier dari rc, providerOptions dari tier yang sama). Step
 * `search-literature` TIDAK memakai ini — ia meng-clone rc per sub-pertanyaan.
 */
function deepGenOptions(
  rc: RequestContext,
  inputData: { threadId: string; agentKind: AgentKind },
  runId: string,
): { requestContext: RequestContext; providerOptions?: typeof proProviderOptions } {
  return {
    requestContext: withDeepRun(rc, inputData.threadId, runId, inputData.agentKind),
    ...deepProviderOptions(inputData.agentKind),
  };
}

// ── Detail proses (writer.write) ──────────────────────────────────────────────────────────
//
// Tiap step memancarkan detailnya lewat `writer.write(data)` → chunk `workflow-step-output`
// (`payload.output=data`, `payload.stepName=<id>`) di stream Workflow. FE (`reduceWorkflowChunk`)
// memetakan ke body expandable per step ("Proses"). Step `search-literature` memancarkan status per
// sub-pertanyaan (kartu sub-agen) + daftar sumbernya saat selesai (kartu live FE); `research_sources`
// (DB) jadi fallback jalur refresh/riwayat. Best-effort: writer non-fatal — emit dilewati bila tak tersedia.

/** Subset `writer` (ToolStream) yang dipakai step — write data ke stream Workflow. */
type StepWriter = { write: (data: unknown) => Promise<void> } | undefined;

/** Bentuk detail yang dipancarkan tiap step (dibaca FE via `payload.output`). */
type StepDetailEmit =
  | { kind: "plan"; plan: string; subQuestions: string[] }
  | {
      kind: "search-sub";
      subIndex: number;
      subQuestion: string;
      status: "searching" | "done";
      /** Sumber sub-pertanyaan (hanya pada `status:"done"`) → kartu live FE. */
      sources?: EmittedSource[];
    }
  | { kind: "counter"; text: string }
  | { kind: "citations"; count: number }
  /** Analisis bukti (step `analyze-sources`): status awal + ringkasan akhir (unit terklasifikasi, blok layak). */
  | { kind: "analyze"; text: string }
  | { kind: "verify"; text: string }
  /** Ringkasan penalaran penulis sintesis (`out.reasoningText`) → blok "reasoning" FE. */
  | { kind: "reasoning"; text: string };

async function emitDetail(writer: StepWriter, data: StepDetailEmit): Promise<void> {
  if (!writer) return;
  try {
    await writer.write(data);
  } catch (err) {
    // Stream bisa sudah ditutup (mis. plan-gate close-on-suspend) — emit detail tak boleh fatal.
    console.error("[deep-research] emitDetail failed", err);
  }
}

/** Bentuk sumber kompak yang dipancarkan ke FE (kartu live) — favicon diturunkan client-side dari url/doi. */
type EmittedSource = { title: string; url: string | null; doi: string | null; origin: string; snippet: string };

/**
 * Sumber yang baru dipersist satu sub-pertanyaan (turn = `runId`, di-tag `subQuestionIndex`) →
 * kartu live FE. Dibaca SETELAH sub-agen selesai (tool sudah persist) lalu dipancarkan via writer →
 * kartu muncul realtime per sub-pertanyaan tanpa nunggu run settle / fetch DB. Tak pernah throw.
 */
async function subQuestionSources(
  threadId: string,
  runId: string,
  subIndex: number,
): Promise<EmittedSource[]> {
  try {
    const all = await ResearchService.listTurnSources(getServiceDb(), { threadId, turnId: runId });
    return all
      .filter((s) => s.subQuestionIndex === subIndex)
      .map((s) => ({ title: s.title, url: s.url, doi: s.doi, origin: s.origin, snippet: s.snippet }));
  } catch (err) {
    console.error("[deep-research] subQuestionSources failed", err);
    return [];
  }
}

/**
 * Pastikan THREAD MEMORY Mastra (`mastra_threads`) ada SEBELUM `saveMessages`. Pada chat, `sendMessage`
 * membuatnya otomatis; jalur `/deep` memanggil `memory.saveMessages` LANGSUNG dari Workflow tanpa turn
 * agent → tanpa ini `saveMessages` gagal "Thread not found" (mastra_threads ≠ chat_threads proyeksi).
 */
async function ensureMemoryThread(
  memory: Awaited<ReturnType<Awaited<ReturnType<Mastra["getAgent"]>>["getMemory"]>>,
  args: { threadId: string; resourceId: string; title: string },
): Promise<void> {
  if (!memory) return;
  const existing = await memory.getThreadById({ threadId: args.threadId });
  if (existing) return;
  const now = new Date();
  await memory.saveThread({
    thread: {
      id: args.threadId,
      resourceId: args.resourceId,
      title: args.title.slice(0, 80),
      createdAt: now,
      updatedAt: now,
      metadata: {},
    },
  });
}

/**
 * Bangun satu pesan Mastra Memory (format V2) untuk `saveMessages` dari jalur Workflow `/deep`, yang
 * menulis pesan LANGSUNG ke memory thread di luar turn agent (pertanyaan user di plan-gate, laporan
 * akhir di sintesis). `metadata` (mis. `{ deepRunId }`) menempel di `content` agar FE memetakan Sumber
 * per-turn.
 */
function buildMastraMessage(args: {
  role: "user" | "assistant";
  text: string;
  threadId: string;
  resourceId: string | undefined;
  /** Id pesan (deterministik → upsert idempoten saat dipanggil >1× per run). Default acak. */
  id?: string;
  /** Ringkasan penalaran (asisten /deep) → part `reasoning` mendahului teks; dirender FE sbg blok berpikir. */
  reasoning?: string;
  metadata?: Record<string, unknown>;
}) {
  return {
    id: args.id ?? crypto.randomUUID(),
    role: args.role,
    createdAt: new Date(Date.now()),
    threadId: args.threadId,
    resourceId: args.resourceId,
    content: {
      format: 2 as const,
      parts: [
        // Bentuk `ReasoningUIPart` (AI SDK v4 / Mastra V2): `reasoning` + `details`. FE rehydrate
        // membaca `p.text || p.reasoning` (`mastraMessagesToTimeline`) → blok berpikir muncul di riwayat.
        ...(args.reasoning
          ? [
              {
                type: "reasoning" as const,
                reasoning: args.reasoning,
                details: [{ type: "text" as const, text: args.reasoning }],
              },
            ]
          : []),
        { type: "text" as const, text: args.text },
      ],
      content: args.text,
      ...(args.metadata ? { metadata: args.metadata } : {}),
    },
  };
}

/**
 * Proyeksikan thread chat + persist pertanyaan user SEDINI gerbang HITL pertama (sebelum `suspend`).
 * Jalur `/deep` = Workflow yang dijalankan FE (bukan turn agent) → `threadProjectionProcessor` TAK
 * jalan, jadi tanpa ini `chat_threads` kosong → halaman thread "Akses ditolak" saat refresh di
 * clarify/plan-gate/riset, dan thread tak muncul di sidebar. Pesan user memakai id
 * DETERMINISTIK (`deep-user:<runId>`) → aman dipanggil >1× per run (clarify-gate LALU plan-gate):
 * `saveMessages` meng-upsert baris yang sama, bukan bubble kembar. Best-effort: kegagalan tak
 * menggagalkan run.
 */
async function ensureDeepThread(
  mastra: Mastra | undefined,
  requestContext: RequestContext,
  args: {
    threadId: string;
    question: string;
    displayQuestion?: string;
    agentKind: AgentKind;
    runId: string;
  },
): Promise<void> {
  if (!mastra) return;
  const resourceId = ownerFromRequestContext(requestContext).id ?? undefined;
  if (!resourceId) return;
  try {
    const db = getServiceDb();
    await ThreadService.ensureProjected(db, {
      threadId: args.threadId,
      ownerUserId: resourceId,
      agentKind: args.agentKind,
      preview: messagePreview(args.question),
    });
    await TitleService.requestTitle(db, args.threadId, args.question);
    const agent = mastra.getAgent("astra-lite");
    const memory = await agent.getMemory({ requestContext });
    if (!memory) return;
    await ensureMemoryThread(memory, { threadId: args.threadId, resourceId, title: args.question });
    await memory.saveMessages({
      messages: [
        buildMastraMessage({
          // Teks PERSIST = varian ber-marker (bila ada) → bubble user `/deep` tampil ber-pill setelah
          // refresh. Penanda di-strip server-side saat giliran chat berikutnya membaca riwayat
          // (`stripMentionMarkersProcessor`); judul/preview di atas tetap dari `question` bersih.
          role: "user",
          text: args.displayQuestion ?? args.question,
          threadId: args.threadId,
          resourceId,
          // Id deterministik per run → clarify-gate + plan-gate memanggil ini idempoten (tak kembar).
          id: `deep-user:${args.runId}`,
        }),
      ],
    });
  } catch (err) {
    console.error("[deep-research] ensureDeepThread failed", err);
  }
}

/**
 * Persist laporan akhir (assistant) ke memory thread chat (`mastra_messages`) lewat agent `astra-lite`.
 * Disimpan VERBATIM (fidelitas sitasi `[n]`) + `metadata.deepRunId = runId` agar FE memetakan Sumber
 * per-turn. Pertanyaan user sudah dipersist di `ensureDeepThread` (plan-gate) → JANGAN ulang di sini
 * (anti bubble kembar). Preview thread diperbarui ke laporan.
 *
 * THROW saat persist gagal: laporan yang tak tersimpan = produk berbayar LENYAP saat
 * refresh (history dibaca dari `mastra_messages`) — bukan side-effect opsional yang boleh ditelan.
 * Pemanggil = step `persist-report` ber-`retries`; id pesan deterministik `deep-report:<runId>`
 * membuat retry/time-travel meng-upsert baris yang SAMA (tak pernah bubble laporan kembar). Guard
 * `!mastra`/`!memory` tetap return diam — absennya memory = constraint environment (unit test),
 * bukan kegagalan persist.
 */
async function persistDeepReport(
  mastra: Mastra | undefined,
  requestContext: RequestContext,
  args: {
    threadId: string;
    report: string;
    /** Ringkasan penalaran penulis sintesis → dipersist sbg part `reasoning` (blok berpikir riwayat). */
    reasoning?: string;
    runId: string;
    agentKind: AgentKind;
    /** Jejak proses untuk rehydrate (FE bangun ulang langkah + detail saat refresh/riwayat). */
    deepProcess?: Record<string, unknown>;
  },
): Promise<void> {
  if (!mastra) return;
  const agent = mastra.getAgent("astra-lite");
  const memory = await agent.getMemory({ requestContext });
  if (!memory) return;
  const resourceId = ownerFromRequestContext(requestContext).id ?? undefined;
  if (resourceId) {
    try {
      await ThreadService.ensureProjected(getServiceDb(), {
        threadId: args.threadId,
        ownerUserId: resourceId,
        agentKind: args.agentKind,
        preview: messagePreview(args.report),
      });
    } catch (err) {
      // Proyeksi `chat_threads` = kosmetik sidebar/preview (best-effort, paritas `ensureDeepThread`)
      // — BUKAN bagian dari "laporan tersimpan". Gagal deterministik di sini (mis. constraint) tak
      // boleh mengunci run di loop retry/time-travel padahal `saveMessages` sendiri akan sukses.
      console.error("[deep-research] thread projection failed", err);
    }
    // Idempoten: thread memory biasanya sudah dibuat di `ensureDeepThread` (plan-gate); jaga-jaga.
    // TETAP throw — `saveMessages` butuh baris `mastra_threads` (kegagalan nyata domain persist).
    await ensureMemoryThread(memory, { threadId: args.threadId, resourceId, title: args.report });
  }
  await memory.saveMessages({
    messages: [
      buildMastraMessage({
        role: "assistant",
        text: args.report,
        threadId: args.threadId,
        resourceId,
        // Id deterministik per run (paritas `deep-user:<runId>`) → upsert idempoten lintas retry.
        id: `deep-report:${args.runId}`,
        ...(args.reasoning ? { reasoning: args.reasoning } : {}),
        metadata: {
          deepRunId: args.runId,
          ...(args.deepProcess ? { deepProcess: args.deepProcess } : {}),
        },
      }),
    ],
  });
}

/**
 * Persist alasan bail `blocked` sebagai pesan assistant — id deterministik
 * `deep-bail:<runId>` (paritas `deep-report:<runId>`) → upsert idempoten, tak mungkin kembar.
 * Tanpa ini alasan hanya hidup di kartu notice sesi FE; refresh membaca history dari
 * `mastra_messages` dan kehilangan konteks kenapa run berhenti. BEST-EFFORT keseluruhan (beda
 * dgn `persistDeepReport` yang throw): bail = jalur keluar run, kegagalan persist tak boleh
 * mengubah hasil bail.
 */
async function persistDeepNotice(
  mastra: Mastra | undefined,
  requestContext: RequestContext,
  args: { threadId: string; runId: string; reason: string },
): Promise<void> {
  if (!mastra) return;
  try {
    const agent = mastra.getAgent("astra-lite");
    const memory = await agent.getMemory({ requestContext });
    if (!memory) return;
    const resourceId = ownerFromRequestContext(requestContext).id ?? undefined;
    if (!resourceId) return;
    // Idempoten — biasanya sudah dibuat `ensureDeepThread` barusan; jaga-jaga bila itu gagal parsial.
    await ensureMemoryThread(memory, { threadId: args.threadId, resourceId, title: args.reason });
    await memory.saveMessages({
      messages: [
        buildMastraMessage({
          role: "assistant",
          text: `Riset mendalam dihentikan: ${args.reason}`,
          threadId: args.threadId,
          resourceId,
          id: `deep-bail:${args.runId}`,
          metadata: { deepRunId: args.runId },
        }),
      ],
    });
  } catch (err) {
    console.error("[deep-research] persistDeepNotice failed", err);
  }
}

/**
 * Efek durable SEBELUM bail `blocked` (kuota/akses) — satu helper untuk ketiga site.
 * (1) `ensureDeepThread` (idempoten `deep-user:<runId>`) — site draft-clarify bisa bail sebelum
 * gerbang HITL mana pun memproyeksikan thread → tanpa ini refresh = thread kosong; (2)
 * `persistDeepNotice` — alasannya ikut tersimpan. Site `cancelled` (user menolak rencana)
 * SENGAJA tidak lewat sini: settle senyap adalah keputusan user.
 */
async function persistBlockedBail(
  mastra: Mastra | undefined,
  requestContext: RequestContext,
  args: {
    threadId: string;
    question: string;
    displayQuestion?: string;
    agentKind: AgentKind;
    runId: string;
    reason: string;
  },
): Promise<void> {
  await ensureDeepThread(mastra, requestContext, {
    threadId: args.threadId,
    question: args.question,
    displayQuestion: args.displayQuestion,
    agentKind: args.agentKind,
    runId: args.runId,
  });
  await persistDeepNotice(mastra, requestContext, {
    threadId: args.threadId,
    runId: args.runId,
    reason: args.reason,
  });
}

/** Jumlah sitasi unik `[n]` di inventory bernomor (baris bisa berbagi nomor karena dedupe). */
function parseCitationCount(numberedInventory: string): number {
  const nums = new Set<string>();
  for (const m of numberedInventory.matchAll(/^\[(\d+)\]/gm)) {
    if (m[1]) nums.add(m[1]);
  }
  return nums.size;
}

// ── Prompt builders ────────────────────────────────────────────────────────────────────

/**
 * Skema WIRE rencana untuk `structuredOutput` native — menggantikan parser fence manual yang di
 * produksi gagal SENYAP (fence tak tertutup + junk `{"name":…}` → riset jalan dgn 1 sub-question fallback).
 * Sengaja TANPA constraint numerik (`minItems`/`minLength`): dukungan keyword itu tak seragam pada
 * gateway OpenAI-compatible mode strict; kardinalitas ditegakkan `ensurePlanOutput` di kode.
 */
const PlanOutputSchema = z.object({
  plan: z
    .string()
    .describe("Rencana riset lengkap sebagai prosa mengalir (bukan daftar bernomor, bukan form)."),
  subQuestions: z
    .array(z.string())
    .describe("3-6 sub-pertanyaan riset spesifik yang diturunkan dari rencana."),
  domain: ResearchDomainSchema.describe(
    "Domain-pack metodologi paling cocok dengan topik: kesehatan/biomedis → medicine; CS/ML → cs-ml; pendidikan/pembelajaran → education; selain itu → general.",
  ),
});

/**
 * Escape-hatch gateway tanpa `response_format` native: set `AQSHA_STRUCTURED_OUTPUT_INJECTION=1`
 * → Mastra memaksa JSON lewat injeksi prompt sistem alih-alih response_format json_schema.
 */
const STRUCTURED_OUTPUT_INJECTION = process.env.AQSHA_STRUCTURED_OUTPUT_INJECTION === "1";

/** Opsi `structuredOutput` baku langkah `/deep`: strict (gagal validasi = throw, TANPA degradasi senyap). */
function structuredOutputOpts<T extends z.ZodType>(schema: T) {
  return {
    schema,
    errorStrategy: "strict" as const,
    ...(STRUCTURED_OUTPUT_INJECTION ? { jsonPromptInjection: true } : {}),
  };
}

/**
 * Gerbang kualitas hasil `PlanOutputSchema`: rapikan whitespace + tegakkan kardinalitas yang tak
 * dibawa skema wire. Throw (bukan fallback) → ditangani `retries` step / try-catch pemanggil;
 * JANGAN pernah menurunkan diam-diam ke 1 sub-question — itu bug prod yang memicu migrasi ini.
 */
function ensurePlanOutput(output: z.infer<typeof PlanOutputSchema> | undefined): {
  plan: string;
  subQuestions: string[];
  domain: ResearchDomain;
} {
  const plan = output?.plan.trim() ?? "";
  const subQuestions = (output?.subQuestions ?? [])
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (!output || plan.length === 0 || subQuestions.length < 2) {
    throw new Error(
      `deep-research: rencana terstruktur tidak memadai (plan ${plan.length} char, ${subQuestions.length} sub-pertanyaan)`,
    );
  }
  return { plan, subQuestions: subQuestions.slice(0, 8), domain: output.domain };
}

function planPrompt(input: z.infer<typeof InputSchema>): string {
  const ctx = input.context ? `\n\nKonteks tambahan dari pengguna:\n${input.context}` : "";
  return `Pertanyaan riset:\n${input.question}${ctx}\n\nSusun rencana riset mendalam sebagai PROSA mengalir (bukan daftar bernomor, bukan form): jelaskan apa yang akan diselidiki, sub-arah utama yang ditelusuri terpisah, jenis sumber yang dicari, dan cara verifikasi. Lalu turunkan 3-6 sub-pertanyaan riset spesifik dari rencana itu.`;
}

/**
 * Prompt re-derive rencana setelah edit plan-gate: edit user harus MENGUBAH
 * `subQuestions` yang benar-benar diriset, bukan hanya ditempel sebagai prosa untuk writer akhir.
 */
function replanPrompt(input: Planned, edits: string): string {
  const subs = input.subQuestions.map((s, i) => `${i + 1}. ${s}`).join("\n");
  return `Rencana riset untuk pertanyaan:\n${input.question}\n\nRencana saat ini:\n${input.plan}\n\nSub-pertanyaan saat ini:\n${subs}\n\nPengguna meminta penyesuaian berikut SEBELUM riset dijalankan:\n${edits}\n\nTulis ulang rencana sebagai PROSA mengalir yang menghormati penyesuaian itu, lalu turunkan ulang 3-6 sub-pertanyaan (buang/ubah/tambah sub-pertanyaan sesuai permintaan pengguna; pertahankan yang tidak disinggung).`;
}

/**
 * Skema WIRE klarifikasi pra-rencana untuk `structuredOutput`. Longgar by-design: hasil parse
 * TETAP melewati `normalizeAskQuestions` (SSOT normalisasi id/opsi/freeform/lipat "Lainnya" yang
 * sama dipakai reducer FE) — skema hanya menjamin bentuk, bukan semantik.
 */
const ClarifyOutputSchema = z.object({
  questions: z
    .array(
      z.object({
        id: z.string().describe("Id singkat pertanyaan, mis. `scope`."),
        prompt: z.string().describe("Teks pertanyaan klarifikasi."),
        kind: z.enum(["single", "multi"]).describe("`single` pilih satu; `multi` pilih beberapa."),
        options: z
          .array(z.object({ label: z.string() }))
          .describe("2-4 opsi jawaban ringkas."),
        allowOther: z.boolean().describe("true bila jawaban bebas relevan."),
      }),
    )
    .describe("MAKSIMAL 3 pertanyaan; KOSONG bila pertanyaan riset sudah cukup spesifik."),
});

/**
 * Prompt penilaian klarifikasi pra-rencana: minta model menilai apakah pertanyaan sudah cukup
 * spesifik; bila tidak, mengembalikan 0-3 pertanyaan klarifikasi terstruktur — bukan prosa.
 * Sengaja konservatif (kembalikan kosong bila sudah jelas) agar `/deep` yang sudah spesifik tak
 * terpotong gerbang tambahan.
 */
function clarifyPrompt(input: z.infer<typeof InputSchema>): string {
  return `Pertanyaan riset dari pengguna:\n${input.question}\n\nNilai apakah pertanyaan ini SUDAH cukup spesifik untuk langsung diriset mendalam, atau ada AMBIGUITAS PENTING yang bila diklarifikasi akan sangat mengubah arah/kualitas riset (mis. ruang lingkup, populasi/konteks, rentang waktu, sudut pandang, atau format keluaran).\n\nBila sudah cukup spesifik, kembalikan daftar \`questions\` KOSONG. Bila perlu, ajukan MAKSIMAL 3 pertanyaan klarifikasi yang paling menentukan — ringkas, tiap pertanyaan \`single\` (pilih satu) atau \`multi\` (pilih beberapa) dengan 2-4 opsi; set \`allowOther: true\` bila jawaban bebas relevan.`;
}

function searcherPrompt(subQuestion: string, input: Planned): string {
  return `Topik riset utama: ${input.question}\n\nSub-pertanyaan yang HARUS kamu jawab dengan literatur:\n${subQuestion}\n\nCari bukti terkuat dan kembalikan tiap sumber berguna dengan: judul, identifier (DOI/arXiv/URL), penulis + tahun bila tersedia, extract bukti 2-4 kalimat, dan rating kekuatan. JANGAN menomori sumber dan JANGAN menulis penanda [n] — penomoran sitasi global dilakukan belakangan.`;
}

function counterPrompt(input: Searched): string {
  const inventory = input.evidence
    .map((e, i) => `### Sub-pertanyaan ${i + 1}: ${e.subQuestion}\n${e.findings}`)
    .join("\n\n");
  return `Inventaris bukti yang kesimpulannya sedang terbentuk untuk topik "${input.question}":\n\n${inventory}\n\nCari bukti yang MELEMAHKAN atau menentang kesimpulan-kesimpulan di atas. Laporkan jujur bila tak ada.`;
}

// ── Analisis bukti (evidence viz) — wire schema + prompt step `analyze-sources` ─────────

/**
 * Stance/design wire — diderivasi dari const chat-core `deep-viz` supaya vocab tak bisa
 * drift dari builder viz; CHECK kolom `research_sources` menyalin daftar yang sama
 * (dijaga test sinkronisasi di `packages/services`).
 */
const AnalyzeStanceSchema = z.enum(DEEP_VIZ_CLASSIFIED_STANCES);
const AnalyzeDesignSchema = z.enum(DEEP_VIZ_STUDY_DESIGNS);

/**
 * Skema WIRE klasifikasi per unit `[n]×subQ`. Paritas `PlanOutputSchema`: TANPA constraint
 * numerik (`min`/`max`) — dukungan keyword strict-mode tak seragam di gateway; integer/range
 * disanitasi di kode (unit di luar inventaris dibuang).
 */
const AnalyzeInsightSchema = z.object({
  n: z.number().describe("Nomor sitasi [n] unit — PERSIS dari daftar unit."),
  subQuestionIndex: z.number().describe("Index sub-pertanyaan unit (0-based) — PERSIS dari daftar unit."),
  stance: AnalyzeStanceSchema.describe(
    "Posisi TEMUAN paper terhadap sub-pertanyaan unit (bukan opini penulis): ragu → mixed; tidak menjawab sub-pertanyaan → not_applicable.",
  ),
  studyDesign: AnalyzeDesignSchema.describe("Desain studi paper (tebakan terbaik dari judul+snippet)."),
  outcomes: z
    .array(z.string())
    .describe("Maksimal 3 outcome/variabel utama yang diukur paper (frasa pendek, bahasa Indonesia, lowercase)."),
});

const AnalyzeChunkOutputSchema = z.object({
  insights: z
    .array(AnalyzeInsightSchema)
    .describe("Satu entri per unit dari daftar unit — jangan mengarang unit di luar daftar."),
});

/**
 * Chunk PERTAMA sekalian membawa penilaian global (answerable/claims/openQuestions) — hemat satu
 * panggilan; chunk berikutnya memakai `AnalyzeChunkOutputSchema` (insights saja). Kardinalitas
 * (3-6 klaim, 2-4 pertanyaan) ditegakkan builder chat-core, bukan skema wire.
 */
const AnalyzeFullOutputSchema = AnalyzeChunkOutputSchema.extend({
  subQuestionAnswerable: z.array(
    z.object({
      subQuestionIndex: z.number(),
      answerable: z
        .boolean()
        .describe("true HANYA bila sub-pertanyaan berbentuk dapat dijawab ya/tidak (mis. \"apakah X efektif?\")."),
    }),
  ),
  claims: z
    .array(
      z.object({
        text: z.string().describe("Klaim faktual ringkas (1 kalimat)."),
        reasoning: z.string().describe("Alasan singkat kenapa bukti mendukung klaim ini."),
        papers: z.array(z.number()).describe("Nomor sitasi [n] pendukung — HANYA dari inventaris."),
      }),
    )
    .describe("3-6 klaim utama yang jujur terhadap bukti + bukti tandingan."),
  openQuestions: z
    .array(
      z.object({
        question: z.string(),
        why: z.string().describe("Mengapa pertanyaan ini penting dan masih terbuka."),
      }),
    )
    .describe("2-4 pertanyaan riset terbuka, dipandu bukti tandingan + celah bukti."),
});

/** Satu unit klasifikasi = pasangan unik `[n] × subQuestionIndex` + baris DB pemiliknya. */
type AnalyzeUnit = {
  n: number;
  subQuestionIndex: number;
  /** Id baris `research_sources` unit ini (bisa >1 — duplikat paper sama; semuanya di-update). */
  rowIds: string[];
  title: string;
  snippet: string;
  year: number | null;
  venue: string | null;
  evidenceStrength: "strong" | "medium" | "weak";
};

function analyzeUnitList(units: AnalyzeUnit[]): string {
  return units
    .map((u) => {
      const meta = [u.year !== null ? String(u.year) : null, u.venue].filter(Boolean).join("; ");
      return `- (n=${u.n}, subQ=${u.subQuestionIndex}) ${u.title}${meta ? ` (${meta})` : ""} [${u.evidenceStrength}] — ${u.snippet}`;
    })
    .join("\n");
}

/** Prompt klasifikasi satu chunk unit (dipakai SEMUA panggilan analisis). */
function analyzeChunkPrompt(input: z.infer<typeof CitedSchema>, units: AnalyzeUnit[]): string {
  const subs = input.subQuestions.map((q, i) => `${i}. ${q}`).join("\n");
  return `Pertanyaan riset utama:\n${input.question}\n\nSub-pertanyaan (index 0-based):\n${subs}\n\nUnit sumber yang HARUS diklasifikasikan (satu entri \`insights\` per unit; \`n\` dan \`subQuestionIndex\` PERSIS seperti tertulis):\n${analyzeUnitList(units)}\n\nUntuk tiap unit: \`stance\` = posisi TEMUAN paper terhadap sub-pertanyaan unit itu, berdasar judul + abstrak/snippet (ragu → mixed; tidak menjawab sub-pertanyaan → not_applicable). \`studyDesign\` = desain studi. \`outcomes\` = maksimal 3 outcome/variabel utama yang diukur. JANGAN mengarang unit di luar daftar.`;
}

/** Seksi tambahan panggilan PERTAMA: penilaian global (answerable, claims, open questions). */
function analyzeGlobalPrompt(input: z.infer<typeof CitedSchema>): string {
  return `Selain klasifikasi unit di atas, nilai juga tingkat riset keseluruhan.\n\nInventaris sumber bernomor lengkap:\n${input.numberedInventory}\n\nBukti tandingan (adversarial):\n${input.counter}\n\nKembalikan juga:\n- \`subQuestionAnswerable\`: untuk TIAP sub-pertanyaan, \`answerable: true\` hanya bila pertanyaannya berbentuk dapat dijawab ya/tidak — bukan pertanyaan terbuka/deskriptif.\n- \`claims\`: 3-6 klaim faktual utama yang didukung inventaris, jujur terhadap bukti tandingan; \`papers\` = nomor sitasi [n] pendukung dari inventaris (JANGAN nomor di luar inventaris; JANGAN menulis angka agregat — kekuatan bukti dihitung sistem).\n- \`openQuestions\`: 2-4 pertanyaan riset terbuka paling penting, dipandu bukti tandingan dan celah pada bukti (\`why\` = mengapa penting).`;
}

/** Deskriptor satu baris per blok viz untuk prompt writer (id + ringkasan data — TANPA angka baru). */
function vizBlockDescriptor(block: DeepVizBlock): string {
  switch (block.type) {
    case "consensus-meter":
      return `- {{viz:${block.id}}} — meter konsensus sub-pertanyaan ${block.subQuestionIndex + 1} (N=${block.n}): "${block.question}"`;
    case "results-timeline": {
      const years = block.points.map((p) => p.year);
      return `- {{viz:${block.id}}} — timeline publikasi ${Math.min(...years)}–${Math.max(...years)} (${block.points.length} paper)`;
    }
    case "top-contributors":
      return `- {{viz:${block.id}}} — tabel top author & venue (${block.authors.length} author, ${block.venues.length} venue)`;
    case "claims-evidence":
      return `- {{viz:${block.id}}} — tabel klaim & kekuatan bukti (${block.claims.length} klaim)`;
    case "gaps-matrix":
      return `- {{viz:${block.id}}} — matriks research gaps (${block.rows.length} outcome × 4 desain studi)`;
    case "open-questions":
      return `- {{viz:${block.id}}} — pertanyaan riset terbuka (${block.items.length} item)`;
  }
}

/**
 * Seksi kontrak penempatan blok viz di prompt writer — hanya bila ada
 * blok. Writer HANYA menaruh marker `{{viz:<id>}}`; datanya di-inject post-process
 * (`injectVizBlocks`) sehingga model tak pernah menulis angka.
 */
function vizPromptSection(blocks: DeepVizBlock[]): string {
  if (blocks.length === 0) return "";
  return [
    "",
    "",
    "## Blok visual tersedia (WAJIB ditempatkan)",
    "Berikut blok visual yang SUDAH dihitung dari data. Sisipkan penandanya di laporan, masing-masing pada BARIS TERSENDIRI, persis: {{viz:<id>}}",
    ...blocks.map(vizBlockDescriptor),
    "Aturan penempatan (gaya artikel ilmiah):",
    "- Meter konsensus: TEPAT setelah paragraf yang menyimpulkan sub-pertanyaan terkait.",
    "- Timeline & kontributor: di bagian karakteristik/peta literatur (biasanya awal pembahasan), timeline dulu, dipisah minimal satu paragraf.",
    "- Tabel klaim & bukti: di bagian sintesis bukti, sebelum kesimpulan.",
    "- Gaps matrix lalu open questions: di bagian keterbatasan/arah riset ke depan, setelah kesimpulan utama.",
    '- JANGAN dua penanda berurutan tanpa paragraf prosa di antaranya; setiap blok diantar kalimat yang merujuknya (mis. "Gambar berikut merangkum sebaran temuan…").',
    "- JANGAN mengarang penanda lain, JANGAN menulis blok ```aqsha:viz sendiri, JANGAN mengubah data.",
  ].join("\n");
}

/**
 * Format verdict `CitationService.verifyIdentifiers` → teks verifikasi untuk prompt sintesis +
 * panel proses. DETERMINISTIK — dulu tabel hasil subagent LLM `citation-verifier`; data
 * sumbernya sudah terstruktur sejak `assign-citations`, jadi LLM hanya menambah biaya + drift
 * parsing. Framing netral: flag bukan tuduhan (bisa typo metadata / database tak lengkap /
 * provider outage) — paritas dgn instruksi subagent lama.
 */
const VERDICT_LABEL: Record<IntegrityStatus, string> = {
  verified: "terverifikasi",
  metadata_mismatch: "metadata tidak cocok",
  identifier_invalid: "identifier tidak valid",
  not_found: "tidak ditemukan di database",
  unverifiable: "tidak dapat diverifikasi otomatis",
};

function formatVerificationText(result: VerificationResult): string {
  const lines = result.items.map((item) => {
    const n = item.citation !== undefined ? `[${item.citation}] ` : "";
    const issues = item.issues.length > 0 ? ` — ${item.issues.join("; ")}` : "";
    const matched = item.matchedTitle ? ` (cocok dgn: "${item.matchedTitle}")` : "";
    return `- ${n}${item.reference}: ${VERDICT_LABEL[item.status]}${issues}${matched}`;
  });
  return [
    `Ringkasan verifikasi: ${result.summary.checked} referensi diperiksa, ${result.summary.verified} terverifikasi, ${result.summary.flagged} ditandai perlu tinjauan.`,
    ...lines,
    result.caveat,
    ...(result.note ? [result.note] : []),
  ].join("\n");
}

/** Nama skill domain-pack per `ResearchDomain` (di-inline ke prompt sintesis). */
const DOMAIN_SKILL_NAME: Record<ResearchDomain, string> = {
  medicine: "research-medicine",
  "cs-ml": "research-cs-ml",
  education: "research-education",
  general: "research-general",
};

/**
 * Panduan metodologi + gaya yang DI-INLINE ke prompt sintesis: langkah `synthesize`
 * berjalan `toolChoice:"none"` sehingga instruksi lama "baca skill lewat tool" tak pernah bisa
 * dieksekusi. Konten diambil dari inline skills (SSOT = SKILL.md via codegen) — bukan salinan.
 */
function synthesisGuidance(domain: ResearchDomain): string {
  const domainSkill = DOMAIN_SKILL_NAME[domain];
  return [
    `## Metodologi domain (${domainSkill})`,
    inlineSkillInstructions(domainSkill),
    "",
    "## Gaya penulisan akademik Indonesia (write-academic-id)",
    inlineSkillInstructions("write-academic-id"),
    "",
    "## Konvensi APA 7 (cite-apa7) — HANYA untuk penyebutan naratif",
    "Berlaku saat menyebut sumber secara naratif di prosa (mis. \"Vaswani et al. (2017) menunjukkan …\"). Penanda sitasi inline TETAP [n], dan JANGAN menulis bagian daftar pustaka.",
    inlineSkillInstructions("cite-apa7"),
  ].join("\n");
}

/**
 * Clamp temuan per sub-pertanyaan di prompt sintesis (lapis kedua setelah budget inventory —
 * prompt sintesis yang menggelembung pernah membuat run macet permanen di produksi):
 * teks subagent search umumnya ≤ ~11KB, tapi tak ada jaminan — batasi supaya prompt writer
 * tetap berbatas walau satu subagent menulis sangat panjang. Codepoint-safe (`messagePreview`).
 */
const SYNTHESIS_FINDINGS_MAX_CHARS = 10_000;

function synthesisPrompt(input: Verified): string {
  const evidence = input.evidence
    .map(
      (e, i) =>
        `### Sub-pertanyaan ${i + 1}: ${e.subQuestion}\n${messagePreview(e.findings, SYNTHESIS_FINDINGS_MAX_CHARS)}`,
    )
    .join("\n\n");
  return `Tulis jawaban riset tercitasi untuk pertanyaan:\n${input.question}\n\nRencana yang disetujui:\n${input.plan}\n\nDaftar sumber bernomor (SATU-SATUNYA sumber nomor [n] — WAJIB pakai nomor PERSIS ini saat mengutip; jangan menomori ulang):\n${input.numberedInventory}\n\nInventaris bukti (untuk ekstrak & narasi — teks temuan TIDAK bernomor; petakan tiap klaim ke daftar sumber bernomor di atas via DOI/arXiv/URL/judul):\n${evidence}\n\nBukti tandingan (adversarial):\n${input.counter}\n\nVerdict verifikasi sitasi:\n${input.verification}\n\nPanduan metodologi & gaya (SUDAH disertakan di bawah — kamu TIDAK bisa dan TIDAK perlu memuat skill lewat tool di langkah ini):\n\n${synthesisGuidance(input.domain)}\n\nSintesiskan menjadi jawaban terstruktur dan jujur: ringkasan temuan per sub-pertanyaan, lalu bukti tandingan & keterbatasan. Setiap klaim faktual membawa penanda [n] inline dari daftar sumber bernomor di atas (penanda dirender sebagai pill sumber + panel "Sumber" terpisah — JANGAN tulis daftar/bagian "Sumber"/daftar pustaka sendiri di akhir). JANGAN mengarang identifier.${vizPromptSection(input.vizBlocks)}`;
}

// ── Steps ─────────────────────────────────────────────────────────────────────────────────

/**
 * 0. draftClarify — GERBANG KUOTA paling awal (dipindah dari draft-plan; user terblok tak sampai
 * memicu generasi apa pun) lalu nilai perlu-tidaknya klarifikasi pra-rencana → 0-3 pertanyaan
 * terstruktur (`AskQuestion[]`). `toolChoice:"none"` → murni tulis JSON, tak menjalankan tool.
 * Best-effort: generasi gagal → anggap tak perlu klarifikasi (lanjut ke draft-plan).
 */
const draftClarifyStep = createStep({
  id: "draft-clarify",
  inputSchema: InputSchema,
  outputSchema: ClarifiedSchema,
  execute: async ({ inputData, requestContext, bail, runId, mastra }) => {
    const { id: ownerUserId, email: ownerEmail } = ownerFromRequestContext(requestContext);
    if (ownerUserId) {
      const quota = await SendQuotaService.check(getServiceDb(), {
        ownerUserId,
        ownerEmail,
        feature: "deep_research",
      });
      if (!quota.ok) {
        // Bail PALING DINI — belum ada gerbang HITL yang memproyeksikan thread, jadi efek
        // durable (bubble user + alasan) wajib dari sini.
        const reason = `Kuota deep research tidak tersedia (${quota.reason}).`;
        await persistBlockedBail(mastra, requestContext, { ...inputData, runId, reason });
        return bail({ status: "blocked" as const, reason });
      }
    }
    let clarifyQuestions: AskQuestion[] = [];
    try {
      const out = await deepWriter.generate(clarifyPrompt(inputData), {
        ...deepGenOptions(requestContext, inputData, runId),
        toolChoice: "none",
        structuredOutput: structuredOutputOpts(ClarifyOutputSchema),
      });
      clarifyQuestions = normalizeAskQuestions(out.object?.questions ?? [], { max: 3 });
    } catch (err) {
      console.error("[deep-research] draftClarify failed", err);
    }
    return { ...inputData, clarifyQuestions };
  },
});

/**
 * 0b. clarify — HITL KLARIFIKASI (`suspend({ questions })` → kartu Questions FE → `resume({ action,
 * answers })`), sejajar plan-gate tapi memakai kontrak `ask_questions`. Tanpa pertanyaan → lanjut
 * langsung (tak suspend). Jawaban disisipkan ke `context` planner; dilewati → biarkan apa adanya.
 * Proyeksikan thread SEBELUM suspend (idempoten via `runId`) supaya refresh saat kartu tak "Akses
 * ditolak". TANPA gerbang billing di sini — billing tetap sekali di plan-gate.
 */
const clarifyGateStep = createStep({
  id: "clarify",
  inputSchema: ClarifiedSchema,
  outputSchema: InputSchema,
  resumeSchema: askQuestionsResumeSchema,
  suspendSchema: askQuestionsSuspendSchema,
  execute: async ({ inputData, resumeData, suspend, requestContext, runId, mastra }) => {
    const { clarifyQuestions, ...base } = inputData;
    if (!clarifyQuestions || clarifyQuestions.length === 0) return base;
    if (!resumeData) {
      await ensureDeepThread(mastra, requestContext, {
        threadId: base.threadId,
        question: base.question,
        displayQuestion: base.displayQuestion,
        agentKind: base.agentKind,
        runId,
      });
      return await suspend({ questions: clarifyQuestions });
    }
    if (resumeData.action === "skipped") return base;
    const answersText = formatAskAnswersForModel(clarifyQuestions, resumeData);
    const context = [base.context, answersText]
      .filter((s): s is string => typeof s === "string" && s.length > 0)
      .join("\n\n");
    return { ...base, context };
  },
});

/**
 * 1. draftPlan — susun rencana prosa + sub-pertanyaan terstruktur via `deepWriter` dengan
 * `structuredOutput` strict (fallback parse-manual yang senyap sengaja DIHAPUS — gagal
 * validasi → throw → `retries: 1` → run failed SEBELUM gerbang billing, user tak kehilangan kredit).
 * `toolChoice:"none"`: step ini berjalan SEBELUM gerbang billing `approve-plan`, jadi tool
 * berbayar (`search_*`) tak boleh bisa jalan di sini; `delete_artifact` (approval-suspend) juga
 * dilarang dalam workflow-generate (lihat `tools/index.ts`). Murni menulis rencana terstruktur.
 */
const draftPlanStep = createStep({
  id: "draft-plan",
  inputSchema: InputSchema,
  outputSchema: PlannedSchema,
  retries: 1,
  execute: async ({ inputData, requestContext, runId, writer }) => {
    const out = await deepWriter.generate(planPrompt(inputData), {
      ...deepGenOptions(requestContext, inputData, runId),
      toolChoice: "none",
      structuredOutput: structuredOutputOpts(PlanOutputSchema),
    });
    const { plan, subQuestions, domain } = ensurePlanOutput(out.object);
    await emitDetail(writer, { kind: "plan", plan, subQuestions });
    return { ...inputData, plan, subQuestions, domain };
  },
});

/**
 * 2. approvePlan — HITL plan-gate (`suspend` → kartu rencana FE → `resume({ approved, edits })`)
 * lalu gerbang billing (titik commit). Snapshot persist selamat-restart. Batal → bail; blok
 * kuota/akses → bail. Approve → debit 1 slot deep (idempoten `runId:deep`).
 */
const approvePlanStep = createStep({
  id: "approve-plan",
  inputSchema: PlannedSchema,
  outputSchema: PlannedSchema,
  resumeSchema: z.object({
    approved: z.boolean().describe("Pengguna menyetujui rencana?"),
    edits: z.string().optional().describe("Penyesuaian rencana dari pengguna (opsional)."),
  }),
  suspendSchema: z.object({
    plan: z.string(),
    subQuestions: z.array(z.string()),
  }),
  execute: async ({ inputData, resumeData, suspend, bail, requestContext, runId, mastra, writer }) => {
    if (!resumeData) {
      // Proyeksikan thread + persist pertanyaan SEBELUM suspend → refresh saat plan-gate me-resume
      // kartu rencana (thread durable, tak "Akses ditolak"), bukan thread kosong.
      await ensureDeepThread(mastra, requestContext, {
        threadId: inputData.threadId,
        question: inputData.question,
        displayQuestion: inputData.displayQuestion,
        agentKind: inputData.agentKind,
        runId,
      });
      return await suspend({ plan: inputData.plan, subQuestions: inputData.subQuestions });
    }
    if (!resumeData.approved) {
      return bail({ status: "cancelled" as const, plan: inputData.plan });
    }
    const { id: ownerUserId, email: ownerEmail } = ownerFromRequestContext(requestContext);
    if (ownerUserId) {
      const db = getServiceDb();
      // Tier billing EFEKTIF (lihat `effectiveBilledTier`): Pro hanya saat model Pro benar-benar
      // disetel — tanpa `AQSHA_PRO_MODEL` subagen jatuh ke model Lite (lihat `modelForRequestContext`/
      // `deepProviderOptions`), jadi bebankan tarif Lite supaya adil. Pro → debit `DEEP_PRO_CREDITS`
      // (120) & butuh plan berbayar ("starter"); Lite → `DEEP_LITE_CREDITS` (60) dgn `requiredPlan:
      // "free"` (Free pakai kuota bulanannya).
      const billedAgentKind = effectiveBilledTier(inputData.agentKind);
      const credits = estimateCredits({ feature: "deep_research", agentKind: billedAgentKind });
      const requiredPlan = billedAgentKind === "pro" ? ("starter" as const) : ("free" as const);
      const gate = await BillingService.requireEntitlement(db, {
        ownerUserId,
        ownerEmail,
        feature: "deep_research",
        credits,
        requiredPlan,
      });
      if (!gate.ok) {
        const reason = `Akses deep research ditolak (${gate.reason}).`;
        await persistBlockedBail(mastra, requestContext, { ...inputData, runId, reason });
        return bail({ status: "blocked" as const, reason });
      }
      const debit = await BillingService.consumeCredits(db, {
        ownerUserId,
        ownerEmail,
        feature: "deep_research",
        provider: "openai",
        agentKind: billedAgentKind,
        requiredPlan,
        threadId: inputData.threadId,
        idempotencyKey: `${runId}:deep`,
      });
      if (!debit.ok) {
        const reason = `Kuota deep research habis (${debit.reason}).`;
        await persistBlockedBail(mastra, requestContext, { ...inputData, runId, reason });
        return bail({ status: "blocked" as const, reason });
      }
    }
    if (!resumeData.edits) return inputData;
    // Edit user harus sampai ke `subQuestions` yang benar-benar diriset fan-out — bukan
    // hanya ditempel sebagai prosa yang baru dibaca writer akhir. Re-derive rencana+sub-pertanyaan
    // dengan satu pass murah (`toolChoice:"none"` + structuredOutput strict); gagal → fallback
    // perilaku lama (append prosa) — di titik ini debit SUDAH terjadi, run tak boleh mati.
    try {
      const out = await deepWriter.generate(replanPrompt(inputData, resumeData.edits), {
        ...deepGenOptions(requestContext, inputData, runId),
        toolChoice: "none",
        structuredOutput: structuredOutputOpts(PlanOutputSchema),
      });
      const { plan, subQuestions, domain } = ensurePlanOutput(out.object);
      await emitDetail(writer, { kind: "plan", plan, subQuestions });
      return { ...inputData, plan, subQuestions, domain };
    } catch (err) {
      console.error("[deep-research] replan after edits failed", err);
    }
    return {
      ...inputData,
      plan: `${inputData.plan}\n\nPenyesuaian dari pengguna: ${resumeData.edits}`,
    };
  },
});

/**
 * 3. searchLiterature — fan-out paralel: satu `literatureSearcher` per sub-pertanyaan. Tool
 * `search_*` men-debit `external_search` + persist `research_sources` ke thread chat.
 *
 * Isolasi kegagalan per sub-pertanyaan: satu subagent yang melempar (429/timeout
 * terminal) TIDAK menggagalkan seluruh fan-out — kredit sudah didebit di plan-gate, jadi run
 * harus degradasi per-sub-Q (catat gap jujur ke sintesis), bukan `failed` tanpa hasil parsial.
 */
const searchStep = createStep({
  id: "search-literature",
  inputSchema: PlannedSchema,
  outputSchema: SearchedSchema,
  // TANPA `retries`: re-run step = re-debit `external_search` per tool-call baru. Isolasi
  // per-sub-Q di bawah sudah membuat step ini tak melempar. (Karena subagent jalan sebagai
  // background task persisten, restart step justru AMAN: task selesai di-reuse by `toolCallId`,
  // tak menjalankan ulang subagent.)
  execute: async ({ inputData, mastra, requestContext, runId, writer, abortSignal }) => {
    // Tanam thread+run di rc induk dulu → entries() yang DI-CLONE per sub-Q sudah membawanya.
    withDeepRun(requestContext, inputData.threadId, runId, inputData.agentKind);
    const owner = ownerFromRequestContext(requestContext);
    const evidence = await Promise.all(
      inputData.subQuestions.map(async (subQuestion, subIndex) => {
        // Clone rc per sub-pertanyaan (Promise.all paralel) lalu stempel index/teks → tool riset
        // men-tag `research_sources.subQuestionIndex` tanpa balapan antar-sub-Q (rc induk dibagi).
        const subRc = new RequestContext(requestContext.entries());
        subRc.set(AQSHA_DEEP_SUBQ_INDEX_KEY, subIndex);
        subRc.set(AQSHA_DEEP_SUBQ_TEXT_KEY, subQuestion);
        await emitDetail(writer, { kind: "search-sub", subIndex, subQuestion, status: "searching" });
        // Subagent jalan sebagai background task persisten — `toolCallId` deterministik
        // per (run, sub-Q) → restart run me-reuse hasil task selesai (tanpa re-debit search).
        // `abortSignal` ikut — Stop dari user menutup task run ini, bukan membiarkannya jalan terus.
        const taskBase = {
          mastra,
          runId,
          threadId: inputData.threadId,
          ...(owner.id ? { resourceId: owner.id } : {}),
          timeoutMs: 600_000,
          abortSignal,
        };
        let findings = "";
        try {
          const out = await runDeepSubagentTask({
            ...taskBase,
            toolCallId: `${runId}:search:${subIndex}`,
            args: {
              agentId: "literature-searcher",
              prompt: searcherPrompt(subQuestion, inputData),
              requestContext: Array.from(subRc.entries()),
            },
          });
          findings = out.text.trim();
          // Guard turn-senyap subagent: selesai pas di tool-call → teks kosong. Retry SEKALI
          // dengan pengingat eksplisit; masih kosong → catat gap jujur (jangan biarkan bucket kosong
          // mengalir senyap ke sintesis). Jangan dispatch empty-retry untuk run yang sedang
          // dibatalkan (catch isolasi per-sub-Q di bawah menelan abort-error attempt pertama).
          if (!findings && !abortSignal.aborted) {
            const retry = await runDeepSubagentTask({
              ...taskBase,
              toolCallId: `${runId}:search:${subIndex}:empty-retry`,
              args: {
                agentId: "literature-searcher",
                prompt: `${searcherPrompt(subQuestion, inputData)}\n\nPENTING: percobaan sebelumnya berakhir tanpa teks. AKHIRI responsmu dengan ringkasan teks temuan (atau nyatakan jujur bila buktinya tipis) — jangan berhenti pada pemanggilan tool.`,
                requestContext: Array.from(subRc.entries()),
              },
            });
            findings = retry.text.trim();
          }
        } catch (err) {
          // Kegagalan satu subagent tak boleh menolak seluruh Promise.all.
          console.error(`[deep-research] literature-searcher sub-Q ${subIndex} failed`, err);
        }
        if (!findings) {
          findings =
            "(Sub-pertanyaan ini GAGAL diriset: subagent selesai tanpa teks temuan. Nyatakan gap ini secara eksplisit di laporan — JANGAN mengarang temuan untuk bagian ini.)";
        }
        // Sumber yang baru dipersist sub-agen ini → pancarkan live (kartu muncul realtime di FE).
        const sources = await subQuestionSources(inputData.threadId, runId, subIndex);
        await emitDetail(writer, { kind: "search-sub", subIndex, subQuestion, status: "done", sources });
        return { subQuestion, findings };
      }),
    );
    return { ...inputData, evidence };
  },
});

/**
 * 4. counterEvidence — cari bukti tandingan adversarial atas inventaris. `retries: 1`:
 * step LLM pasca-billing tak boleh mematikan run karena satu error transien (kredit deep sudah
 * didebit di plan-gate; re-run bisa mengulang sedikit debit `external_search` — jauh lebih murah
 * daripada run `failed` tanpa refund).
 */
const counterEvidenceStep = createStep({
  id: "counter-evidence",
  inputSchema: SearchedSchema,
  outputSchema: CounteredSchema,
  retries: 1,
  execute: async ({ inputData, mastra, requestContext, runId, writer, abortSignal }) => {
    // Emit di AWAL step → body panel proses terisi jujur selama fase lambat berjalan
    // (ditimpa teks final di akhir step; paritas pola `search-sub` status "searching").
    await emitDetail(writer, {
      kind: "counter",
      text: `Menelusuri bukti tandingan atas temuan ${inputData.evidence.length} sub-pertanyaan…`,
    });
    // Background task persisten — restart run me-reuse hasil task selesai.
    const rc = withDeepRun(requestContext, inputData.threadId, runId, inputData.agentKind);
    const owner = ownerFromRequestContext(requestContext);
    const out = await runDeepSubagentTask({
      mastra,
      runId,
      threadId: inputData.threadId,
      ...(owner.id ? { resourceId: owner.id } : {}),
      timeoutMs: 600_000,
      abortSignal,
      toolCallId: `${runId}:counter`,
      args: {
        agentId: "counter-evidence",
        prompt: counterPrompt(inputData),
        requestContext: Array.from(rc.entries()),
      },
    });
    // Guard teks kosong (turn subagent bisa selesai pas di tool-call): jangan biarkan bagian adversarial hilang senyap.
    const counter =
      out.text.trim() ||
      "(Pencarian bukti tandingan berakhir tanpa teks — perlakukan sebagai BELUM diverifikasi ada/tidaknya bukti tandingan, BUKAN sebagai ketiadaan bukti tandingan.)";
    await emitDetail(writer, { kind: "counter", text: counter });
    return { ...inputData, counter };
  },
});

/** Clamp snippet per baris inventory (codepoint-safe via `messagePreview`). */
const INVENTORY_SNIPPET_MAX_CHARS = 240;
/** Budget total inventory — melewati ini, baris berikutnya tanpa snippet (identitas [n] tetap). */
const INVENTORY_CHAR_BUDGET = 48_000;

/**
 * 5. assignCitations — nomori `research_sources` run ini (turnId=runId) → `citation_number` 1..N
 * (dedupe by DOI/arXiv/locator) lalu susun inventory bernomor GLOBAL untuk verify + synthesis.
 * `retries: 1`: step pasca-billing murni DB dan idempoten (`assignCitationNumbers`
 * menghitung ulang penomoran deterministik lalu overwrite) — blip DB satu kali tak boleh
 * mematikan run yang kreditnya sudah didebit.
 */
const assignCitationsStep = createStep({
  id: "assign-citations",
  inputSchema: CounteredSchema,
  outputSchema: CitedSchema,
  retries: 1,
  execute: async ({ inputData, runId, writer }) => {
    const items = await ResearchService.assignCitationNumbers(getServiceDb(), {
      threadId: inputData.threadId,
      turnId: runId,
    });
    const numbered = items.filter((s) => s.citationNumber !== null);
    // Baris inventory bawa authors/year/venue → verify_identifiers + daftar pustaka APA
    // bekerja dari metadata asli provider, bukan karangan model.
    //
    // BERBATAS (temuan produksi run yang macet): run kaya-sumber (262 baris) dengan snippet penuh per baris
    // menggelembungkan prompt sintesis sampai ~400KB (~100k token) → panggilan penulis merangkak
    // melampaui timeout task 15 menit, dan tiap retry mewarisi prompt beracun yang sama → run
    // "macet" permanen. Snippet per baris di-clamp; setelah budget total tersentuh, baris
    // berikutnya ditulis TANPA snippet — identitas `[n] judul (meta) — identifier` tetap utuh
    // sehingga SEMUA nomor sitasi tetap bisa dikutip writer.
    let inventoryChars = 0;
    let snippetlessRows = 0;
    const numberedInventory = numbered
      .map((s) => {
        const meta = [
          s.authors.length > 0 ? s.authors.join(", ") : null,
          s.year !== null ? String(s.year) : null,
          s.venue,
        ]
          .filter(Boolean)
          .join("; ");
        const withinBudget = inventoryChars < INVENTORY_CHAR_BUDGET;
        if (s.snippet && !withinBudget) snippetlessRows += 1;
        const snippet =
          s.snippet && withinBudget ? ` — ${messagePreview(s.snippet, INVENTORY_SNIPPET_MAX_CHARS)}` : "";
        const line = `[${s.citationNumber}] ${s.title}${meta ? ` (${meta})` : ""} — ${
          s.doi ?? s.arxivId ?? s.url ?? s.locator
        }${snippet} (${s.evidenceStrength})`;
        inventoryChars += line.length + 1;
        return line;
      })
      .join("\n");
    if (snippetlessRows > 0) {
      console.log(
        `[deep-research] assign-citations run=${runId}: inventory menyentuh budget ${INVENTORY_CHAR_BUDGET} char — ${snippetlessRows} baris ditulis tanpa snippet`,
      );
    }
    // Jumlah sitasi unik [n] (dedupe by DOI/arXiv/locator) — sumber penomoran ditampilkan FE.
    const uniqueCitations = new Set(numbered.map((s) => s.citationNumber)).size;
    // Sumber bernomor terstruktur (format kartu FE) → dipersist di `metadata.deepProcess.sources`
    // supaya pill `[n]` + panel "Sumber" tetap ter-resolve walau fetch `research_sources` live meleset.
    const numberedSources = numbered.map((s) => ({
      n: s.citationNumber ?? 0,
      title: s.title,
      url: s.url,
      doi: s.doi,
      origin: s.origin,
      ...(s.snippet ? { snippet: s.snippet } : {}),
    }));
    // Referensi terstruktur per [n] UNIK (baris bisa berbagi nomor karena dedupe) — bahan
    // `verify-citations` memanggil CitationService LANGSUNG, tanpa parsing inventory.
    const seenCitation = new Set<number>();
    const verifyRefs = numbered.flatMap((s) => {
      const n = s.citationNumber ?? 0;
      if (seenCitation.has(n)) return [];
      seenCitation.add(n);
      return [
        {
          citation: n,
          title: s.title,
          ...(s.doi ? { doi: s.doi } : {}),
          ...(s.arxivId ? { arxivId: s.arxivId } : {}),
          ...(s.url ? { url: s.url } : {}),
          ...(s.authors.length > 0 ? { authors: s.authors } : {}),
          ...(s.year !== null ? { year: s.year } : {}),
          ...(s.venue ? { venue: s.venue } : {}),
        },
      ];
    });
    await emitDetail(writer, { kind: "citations", count: uniqueCitations });
    return { ...inputData, numberedInventory, numberedSources, verifyRefs };
  },
});

/** Cap unit klasifikasi per run (lebih → prioritaskan evidenceStrength kuat, sisanya di-drop). */
const ANALYZE_UNIT_CAP = 60;
/** Unit per panggilan LLM klasifikasi. */
const ANALYZE_CHUNK_SIZE = 20;
const ANALYZE_STRENGTH_PRIORITY: Record<AnalyzeUnit["evidenceStrength"], number> = {
  strong: 0,
  medium: 1,
  weak: 2,
};

/**
 * 5b. analyzeSources — klasifikasi stance/design/outcomes per unit `[n]×subQ` (LLM structuredOutput
 * strict, pola draft-plan) lalu `buildDeepVizBlocks` deterministik (chat-core) → blok visual untuk
 * writer. Keputusan desain: model SELALU lite (tugas klasifikasi, hemat) dan
 * TANPA ledger `deep_analyze` (butuh migration CHECK `provider_usage_ledger` baru — tak sepadan
 * untuk rate 0; biaya sudah tertanggung debit deep di plan-gate). BEST-EFFORT TOTAL pasca-billing:
 * retry per panggilan LLM di DALAM step (bukan `retries` engine — step pasca-billing tak boleh
 * melempar); gagal total → `vizBlocks: []`, laporan tampil polos. Panggilan generate langsung
 * (bukan `runDeepSubagentTask`) mengikuti preseden draft-plan — `structuredOutput` belum lewat
 * jalur task; restart run mengulang step ini (murah, deterministik-ish).
 */
const analyzeSourcesStep = createStep({
  id: "analyze-sources",
  inputSchema: CitedSchema,
  outputSchema: AnalyzedSchema,
  execute: async ({ inputData, requestContext, runId, writer }) => {
    const fallback = { ...inputData, vizBlocks: [] as DeepVizBlock[], analyzedSourceCount: 0 };
    try {
      const rows = await ResearchService.listTurnSources(getServiceDb(), {
        threadId: inputData.threadId,
        turnId: runId,
      });
      const numbered = rows.filter((r) => r.citationNumber !== null);
      if (numbered.length === 0) return fallback;

      // Unit klasifikasi = pasangan unik `[n] × subQuestionIndex` (kemunculan pertama menang;
      // baris duplikat paper yang sama menambah `rowIds` — persist klasifikasi menyasar semuanya).
      // Baris tanpa subQuestionIndex tak bisa dinilai stance-nya (tetap ikut builder di bawah).
      const unitByKey = new Map<string, AnalyzeUnit>();
      for (const row of numbered) {
        if (row.subQuestionIndex === null) continue;
        const key = `${row.citationNumber}:${row.subQuestionIndex}`;
        const existing = unitByKey.get(key);
        if (existing) {
          existing.rowIds.push(row.id);
          continue;
        }
        unitByKey.set(key, {
          n: row.citationNumber as number,
          subQuestionIndex: row.subQuestionIndex,
          rowIds: [row.id],
          title: row.title,
          snippet: row.snippet,
          year: row.year,
          venue: row.venue,
          evidenceStrength: row.evidenceStrength,
        });
      }
      const allUnits = [...unitByKey.values()].sort(
        (a, b) =>
          ANALYZE_STRENGTH_PRIORITY[a.evidenceStrength] - ANALYZE_STRENGTH_PRIORITY[b.evidenceStrength] ||
          a.n - b.n ||
          a.subQuestionIndex - b.subQuestionIndex,
      );
      const units = allUnits.slice(0, ANALYZE_UNIT_CAP);
      if (allUnits.length > units.length) {
        console.log(
          `[deep-research] analyze-sources run=${runId}: ${allUnits.length - units.length} unit di-drop (cap ${ANALYZE_UNIT_CAP})`,
        );
      }
      await emitDetail(writer, {
        kind: "analyze",
        text: `Menganalisis bukti: mengklasifikasikan ${units.length} unit sumber (${numbered.length} baris)…`,
      });

      // Model SELALU lite — clone rc supaya tier run (pro) di rc induk tak ikut ke panggilan
      // analisis. Cast `out.object` per skema: generic `structuredOutput` tak terbawa inference
      // Mastra melalui helper (validasi runtime tetap strict via `structuredOutputOpts`).
      const analyzeGenerate = async <T extends z.ZodType>(
        prompt: string,
        schema: T,
      ): Promise<z.output<T> | undefined> => {
        const out = await deepWriter.generate(prompt, {
          requestContext: withDeepRun(
            new RequestContext(requestContext.entries()),
            inputData.threadId,
            runId,
            "lite",
          ),
          ...deepProviderOptions("lite"),
          toolChoice: "none",
          structuredOutput: structuredOutputOpts(schema),
        });
        return out.object as z.output<T> | undefined;
      };
      const withOneRetry = async <T>(label: string, fn: () => Promise<T>): Promise<T | null> => {
        try {
          return await fn();
        } catch (err) {
          console.error(`[deep-research] analyze-sources ${label} attempt 1 failed`, err);
          try {
            return await fn();
          } catch (err2) {
            console.error(`[deep-research] analyze-sources ${label} attempt 2 failed`, err2);
            return null;
          }
        }
      };

      const chunks: AnalyzeUnit[][] = [];
      for (let i = 0; i < units.length; i += ANALYZE_CHUNK_SIZE) {
        chunks.push(units.slice(i, i + ANALYZE_CHUNK_SIZE));
      }
      // Semua chunk paralel — prompt tiap chunk hanya bergantung inputData + unit chunk itu.
      // Chunk pertama sekalian membawa penilaian global (answerable/claims/openQuestions).
      // Kegagalan satu chunk = insight-nya hilang saja (blok yang ambangnya tak terpenuhi
      // otomatis drop) — bukan kegagalan step.
      let global: z.infer<typeof AnalyzeFullOutputSchema> | null = null;
      const rawInsights: Array<z.infer<typeof AnalyzeInsightSchema>> = [];
      if (chunks.length > 0) {
        const firstPromise = withOneRetry("chunk 0 (global)", () =>
          analyzeGenerate(
            `${analyzeChunkPrompt(inputData, chunks[0] ?? [])}\n\n${analyzeGlobalPrompt(inputData)}`,
            AnalyzeFullOutputSchema,
          ),
        );
        const restPromise = Promise.all(
          chunks.slice(1).map((chunk, i) =>
            withOneRetry(`chunk ${i + 1}`, () =>
              analyzeGenerate(analyzeChunkPrompt(inputData, chunk), AnalyzeChunkOutputSchema),
            ),
          ),
        );
        const first = await firstPromise;
        const rest = await restPromise;
        if (first) {
          global = first;
          rawInsights.push(...(first.insights ?? []));
        }
        for (const r of rest) if (r) rawInsights.push(...(r.insights ?? []));
      }

      // Sanitasi insight: hanya unit yang benar-benar DIKIRIM ke LLM (set ter-cap) — dalam praktik
      // model ikut "mengklasifikasi" pasangan lain yang dilihatnya di inventaris global; subQ
      // pasangan itu tebakan (inventaris tak memuat subQ) → tak dipercaya.
      // Duplikat: kemunculan pertama menang.
      const sentKeys = new Set(units.map((u) => `${u.n}:${u.subQuestionIndex}`));
      const insightByKey = new Map<
        string,
        { stance: z.infer<typeof AnalyzeStanceSchema>; studyDesign: z.infer<typeof AnalyzeDesignSchema>; outcomes: string[] }
      >();
      for (const ins of rawInsights) {
        if (!Number.isInteger(ins.n) || !Number.isInteger(ins.subQuestionIndex)) continue;
        const key = `${ins.n}:${ins.subQuestionIndex}`;
        if (!sentKeys.has(key) || insightByKey.has(key)) continue;
        insightByKey.set(key, {
          stance: ins.stance,
          studyDesign: ins.studyDesign,
          outcomes: ins.outcomes.filter((o) => o.trim().length > 0).slice(0, 3),
        });
      }

      // Persist klasifikasi ke `research_sources` (best-effort — kolom = fallback/observabilitas;
      // kegagalan DB tak menggagalkan step, blok tetap dibangun dari state workflow).
      const updates = [...unitByKey.entries()].flatMap(([key, unit]) => {
        const insight = insightByKey.get(key);
        if (!insight) return [];
        return unit.rowIds.map((id) => ({ id, ...insight }));
      });
      if (updates.length > 0) {
        try {
          await ResearchService.setSourceClassification(getServiceDb(), updates);
        } catch (err) {
          console.error("[deep-research] analyze-sources persist classification failed", err);
        }
      }

      // Input builder = SEMUA baris bernomor (termasuk unit di luar cap / tanpa subQ — blok yang
      // tak butuh stance seperti timeline/kontributor tetap memakai metadatanya; stance null aman).
      const sources: DeepVizSourceInput[] = numbered.map((row) => {
        const insight =
          row.subQuestionIndex !== null
            ? insightByKey.get(`${row.citationNumber}:${row.subQuestionIndex}`)
            : undefined;
        return {
          n: row.citationNumber as number,
          subQuestionIndex: row.subQuestionIndex,
          title: row.title,
          authors: row.authors,
          year: row.year,
          venue: row.venue,
          citedByCount: row.citedByCount,
          evidenceStrength: row.evidenceStrength,
          stance: insight?.stance ?? null,
          studyDesign: insight?.studyDesign ?? null,
          outcomes: insight?.outcomes ?? [],
          topics: row.topics,
        };
      });
      const subQuestionAnswerable = (global?.subQuestionAnswerable ?? [])
        .filter(
          (e) =>
            Number.isInteger(e.subQuestionIndex) &&
            e.subQuestionIndex >= 0 &&
            e.subQuestionIndex < inputData.subQuestions.length,
        )
        .map((e) => ({ subQuestionIndex: e.subQuestionIndex, answerable: e.answerable === true }));
      const claims = (global?.claims ?? [])
        .map((c) => ({ text: c.text, reasoning: c.reasoning, papers: c.papers.filter((p) => Number.isInteger(p)) }))
        .slice(0, 6);
      const openQuestions = (global?.openQuestions ?? []).slice(0, 4);

      const vizBlocks = buildDeepVizBlocks({
        subQuestions: inputData.subQuestions,
        sources,
        subQuestionAnswerable,
        claims,
        openQuestions,
      });
      await emitDetail(writer, {
        kind: "analyze",
        text: formatDeepAnalyzeSummary(insightByKey.size, vizBlocks.map((b) => b.id)),
      });
      return { ...inputData, vizBlocks, analyzedSourceCount: insightByKey.size };
    } catch (err) {
      // Best-effort total: analisis gagal → laporan polos, JANGAN throw pasca-billing.
      console.error("[deep-research] analyze-sources failed", err);
      return fallback;
    }
  },
});

/**
 * 6. verifyCitations — verifikasi integritas referensi bernomor. DETERMINISTIK: data
 * referensi sudah terstruktur sejak `assign-citations` (`verifyRefs` per [n] unik) → panggil
 * `CitationService.verifyIdentifiers` LANGSUNG, tanpa subagent LLM (lebih murah, tanpa drift
 * parsing inventory↔verdict, hasil konsisten lintas-run; tak perlu background task persisten karena
 * tak ada model call — restart run tinggal mengulang batch lookup Crossref/OpenAlex yang murah).
 * `retries: 1` tetap (provider di engine bisa transien).
 */
const citationVerifyStep = createStep({
  id: "verify-citations",
  inputSchema: AnalyzedSchema,
  outputSchema: VerifiedSchema,
  retries: 1,
  execute: async ({ inputData, requestContext, runId, writer }) => {
    if (inputData.verifyRefs.length === 0) {
      const verification = "(Tidak ada referensi bernomor untuk diverifikasi pada run ini.)";
      await emitDetail(writer, { kind: "verify", text: verification });
      return { ...inputData, verification };
    }
    // Emit di AWAL step (ditimpa verdict final) → panel proses jujur selama fase verifikasi.
    await emitDetail(writer, {
      kind: "verify",
      text: `Memverifikasi ${inputData.verifyRefs.length} referensi (keberadaan, konsistensi metadata, DOI/arXiv)…`,
    });
    // Paritas dgn tool `verify_identifiers`: rekam usage `citation_verify` (rate 0 hari ini,
    // idempoten per-run) dan hormati gate — kuota habis TIDAK boleh tetap menjalankan verifikasi.
    const { id: ownerUserId, email: ownerEmail } = ownerFromRequestContext(requestContext);
    if (ownerUserId) {
      const charged = await BillingService.consumeCredits(getServiceDb(), {
        ownerUserId,
        ownerEmail,
        feature: "citation_verify",
        provider: "crossref",
        threadId: inputData.threadId,
        idempotencyKey: `${runId}:verify`,
      });
      if (!charged.ok) {
        const verification =
          "(Verifikasi sitasi TIDAK dijalankan: kuota fitur verifikasi habis — perlakukan SEMUA referensi sebagai belum terverifikasi otomatis dan sarankan pemeriksaan manual.)";
        await emitDetail(writer, { kind: "verify", text: verification });
        return { ...inputData, verification };
      }
    }
    const result = await CitationService.verifyIdentifiers(inputData.verifyRefs);
    const verification = formatVerificationText(result);
    await emitDetail(writer, { kind: "verify", text: verification });
    return { ...inputData, verification };
  },
});

/** 7. synthesize — penulis akhir (deepWriter, "root") merangkai jawaban tercitasi. */
const synthesizeStep = createStep({
  id: "synthesize",
  inputSchema: VerifiedSchema,
  outputSchema: SynthesizedSchema,
  retries: 1,
  execute: async ({ inputData, requestContext, mastra, runId, writer, abortSignal }) => {
    // `toolChoice: "none"`: seluruh bukti sudah ada di prompt; paksa penulis MENULIS teks
    // (bukan berhenti di tool-call kosong) — jaminan `out.text` terisi pada model gateway.
    // Background task persisten — restart run me-reuse laporan task selesai.
    const rc = withDeepRun(requestContext, inputData.threadId, runId, inputData.agentKind);
    const owner = ownerFromRequestContext(requestContext);
    const out = await runDeepSubagentTask({
      mastra,
      runId,
      threadId: inputData.threadId,
      ...(owner.id ? { resourceId: owner.id } : {}),
      timeoutMs: 900_000,
      abortSignal,
      toolCallId: `${runId}:synthesize`,
      args: {
        agentId: "deep-writer",
        prompt: synthesisPrompt(inputData),
        requestContext: Array.from(rc.entries()),
        toolChoice: "none",
      },
    });
    // Ringkasan penalaran penulis (Responses API `reasoningSummary`) → blok "reasoning" di atas
    // laporan (parity dgn chat). Dipanen post-hoc dari hasil `.generate`, bukan di-stream
    // token-level (aman thd durable refresh) → emit live + dipersist di pesan untuk rehydrate.
    const reasoning = (out.reasoningText ?? "").trim();
    if (reasoning) await emitDetail(writer, { kind: "reasoning", text: reasoning });
    // Laporan kosong (blip gateway / turn senyap penulis) HARUS gagal DI step ini: lolos ke
    // `persist-report` = gagal di validasi input `min(1)` di sana, dan time-travel ke persist
    // selalu me-replay laporan kosong yang sama dari snapshot — buntu. Gagal di sini →
    // retry/time-travel synthesize menulis ulang; deep-tasks TIDAK me-reuse completed kosong
    // (completedWithText) → retry itu benar-benar men-dispatch attempt penulis baru, bukan
    // memutar hasil kosong yang sama selamanya.
    const rawReport = (out.text ?? "").trim();
    if (!rawReport) throw new Error("deep-research: penulis sintesis mengembalikan teks kosong");
    // Post-process viz — SELALU dijalankan (juga saat `vizBlocks` kosong: anti-forgery men-strip
    // fence ```aqsha:viz tulisan model + marker liar). Pure & idempoten — retry synthesize
    // mengulang injeksi dengan hasil sama.
    const injected = injectVizBlocks(rawReport, inputData.vizBlocks);
    const report = injected.report;
    // Guard kosong DIULANG pasca-strip: laporan yang hanya berisi fence viz palsu jadi kosong
    // setelah injeksi — harus gagal di sini (retry menulis ulang; `completedWithText` deep-tasks
    // menilai hasil seperti itu tak layak reuse sehingga attempt baru benar-benar di-dispatch).
    if (!report.trim()) {
      throw new Error("deep-research: laporan kosong setelah stripping anti-forgery viz");
    }
    if (
      inputData.vizBlocks.length > 0 ||
      injected.strippedFenceCount > 0 ||
      injected.removedMarkerCount > 0
    ) {
      console.log(
        `[deep-research] viz injection run=${runId}: placed=[${injected.placedIds.join(",")}] appended=[${injected.appendedIds.join(",")}] dropped=[${injected.droppedIds.join(",")}] strippedFences=${injected.strippedFenceCount} removedMarkers=${injected.removedMarkerCount}`,
      );
    }
    // Persist ke memory = step `persist-report` TERPISAH — kegagalan simpan tak lagi menelan
    // laporan senyap, dan retry/time-travel persist tak menyentuh jalur LLM/task sama sekali.
    return {
      threadId: inputData.threadId,
      agentKind: inputData.agentKind,
      plan: inputData.plan,
      subQuestions: inputData.subQuestions,
      counter: inputData.counter,
      verification: inputData.verification,
      numberedInventory: inputData.numberedInventory,
      numberedSources: inputData.numberedSources,
      vizBlocks: inputData.vizBlocks,
      analyzedSourceCount: inputData.analyzedSourceCount,
      report,
      reasoning,
    };
  },
});

/**
 * 8. persistReport — simpan laporan ke memory thread sebagai step tersendiri. Failure
 * domain terpisah dari `synthesize`: persist murni DB, idempoten (id pesan `deep-report:<runId>`),
 * jadi boleh `retries: 2` + di-time-travel TANPA menyentuh jalur LLM/task. Dulu best-effort di
 * dalam synthesize → gagal = run tetap `success` tapi laporan LENYAP saat refresh (history dibaca
 * dari `mastra_messages`) padahal user bayar penuh. `deepProcess` = jejak proses agar FE bangun
 * ulang langkah + detail tanpa runId (riwayat/refresh); teks counter/verify dipersist PENUH
 * (tanpa clamp) → panel detail menampilkan narasi utuh.
 */
const persistReportStep = createStep({
  id: "persist-report",
  inputSchema: SynthesizedSchema,
  outputSchema: OutputSchema,
  retries: 2,
  execute: async ({ inputData, requestContext, mastra, runId }) => {
    // TEMP-TEST E2E (HAPUS SETELAH UJI): HANYA saat env `AQSHA_E2E_FAIL_PERSIST=1` — gagal
    // selama file flag ada (toggle mid-run tanpa restart proses); hapus flag lalu "Coba lagi"
    // (time-travel) harus memulihkan tanpa debit baru. Tanpa env (prod) = nol I/O fs, dan file
    // /tmp nyasar di host TIDAK bisa mematikan persist semua user.
    if (process.env.AQSHA_E2E_FAIL_PERSIST === "1") {
      const { existsSync } = await import("node:fs");
      if (existsSync("/tmp/aqsha-fail-persist")) {
        throw new Error("uji E2E: persist digagalkan via flag /tmp/aqsha-fail-persist");
      }
    }
    await persistDeepReport(mastra, requestContext, {
      threadId: inputData.threadId,
      report: inputData.report,
      reasoning: inputData.reasoning,
      runId,
      agentKind: inputData.agentKind,
      deepProcess: {
        plan: inputData.plan,
        subQuestions: inputData.subQuestions,
        counter: inputData.counter.trim(),
        verification: inputData.verification.trim(),
        citationCount: parseCitationCount(inputData.numberedInventory),
        // Fallback Sumber DB-independen: FE me-resolve `[n]` + panel "Sumber" dari sini bila fetch
        // `research_sources` live meleset (lihat `messageSourceCards`).
        sources: inputData.numberedSources,
        // Evidence viz: ringkasan untuk baris panel proses "analyze" di riwayat. HANYA id + jumlah
        // — data blok penuh sudah terangkut di fence ```aqsha:viz dalam `report` (satu-satunya
        // sumber render figure); menduplikasinya di metadata menggemukkan tiap load pesan.
        ...(inputData.vizBlocks.length > 0 || inputData.analyzedSourceCount > 0
          ? {
              vizBlockIds: inputData.vizBlocks.map((b) => b.id),
              analyzedSourceCount: inputData.analyzedSourceCount,
            }
          : {}),
      },
    });
    return {
      status: "completed" as const,
      report: inputData.report,
      plan: inputData.plan,
      subQuestions: inputData.subQuestions,
      ...(inputData.reasoning ? { reasoning: inputData.reasoning } : {}),
    };
  },
});

export const deepResearch = createWorkflow({
  id: "deep-research",
  description: "Riset mendalam tercitasi: klarifikasi (HITL, opsional) → plan-gate (HITL) → cari literatur → bukti tandingan → nomori sitasi → analisis bukti (viz) → verifikasi sitasi → sintesis → persist laporan.",
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
})
  .then(draftClarifyStep)
  .then(clarifyGateStep)
  .then(draftPlanStep)
  .then(approvePlanStep)
  .then(searchStep)
  .then(counterEvidenceStep)
  .then(assignCitationsStep)
  .then(analyzeSourcesStep)
  .then(citationVerifyStep)
  .then(synthesizeStep)
  .then(persistReportStep)
  .commit();
