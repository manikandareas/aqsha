import {
  formatAskAnswersForModel,
  messagePreview,
  normalizeAskQuestions,
  type AskQuestion,
} from "@aqsha/chat-core";
import { BillingService } from "@aqsha/services/billing";
import { ThreadService, TitleService } from "@aqsha/services/chat";
import { estimateCredits } from "@aqsha/services/plan";
import { SendQuotaService } from "@aqsha/services/quota";
import { ResearchService } from "@aqsha/services/research";
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
 *   → verifyCitations → synthesize
 *
 * Keputusan desain (deviasi sah dari §7 plan, dicatat):
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
 * Domain-pack metodologi untuk sintesis (CFG-2): dipilih planner di `draft-plan`, dipakai
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
    "Domain-pack metodologi yang di-inline ke prompt sintesis (CFG-2).",
  ),
});

const EvidenceItemSchema = z.object({
  subQuestion: z.string(),
  findings: z.string().describe("Temuan bukti dari literature-searcher (TANPA [n]; identifikasi via DOI/arXiv/URL — penomoran global di assign-citations, CTX-1)."),
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
const CitedSchema = CounteredSchema.extend({
  numberedInventory: z.string().describe("Daftar sumber bernomor [n] GLOBAL (citation_number) untuk dikutip."),
  numberedSources: z
    .array(NumberedSourceSchema)
    .describe("Sumber bernomor terstruktur → dipersist di metadata laporan (fallback Sumber FE)."),
});
const VerifiedSchema = CitedSchema.extend({ verification: z.string() });

const OutputSchema = z.object({
  status: z.enum(["completed", "cancelled", "blocked"]),
  report: z.string().optional().describe("Laporan tercitasi (status=completed)."),
  plan: z.string().optional(),
  subQuestions: z.array(z.string()).optional(),
  reason: z.string().optional().describe("Alasan blokir/batal (status≠completed)."),
  reasoning: z
    .string()
    .optional()
    .describe("Ringkasan penalaran penulis sintesis (Route B) → blok reasoning FE saat refresh poll."),
});

type Planned = z.infer<typeof PlannedSchema>;
type Searched = z.infer<typeof SearchedSchema>;
type Cited = z.infer<typeof CitedSchema>;
type Verified = z.infer<typeof VerifiedSchema>;

// ── Helper konteks ───────────────────────────────────────────────────────────────────────

/**
 * Tanam threadId chat + run id deep (`AQSHA_DEEP_RUN_KEY`) ke RequestContext sebelum memanggil
 * subagent. Tool riset membaca `MASTRA_THREAD_ID_KEY` (lewat `threadScopeId`) untuk men-scope
 * `research_sources` + RAG, dan menstempel `research_sources.turnId = runId` (semua sumber satu run
 * berbagi turn) → penomoran sitasi `[n]` global + dedupe (G4). Owner/email yang sudah ada di rc tetap
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
  | { kind: "verify"; text: string }
  /** Ringkasan penalaran penulis sintesis (`out.reasoningText`) → blok "reasoning" FE (Route B). */
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
 * per-turn (G4).
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
 * clarify/plan-gate/riset (G1/TC13), dan thread tak muncul di sidebar. Pesan user memakai id
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
 * per-turn (G4). Pertanyaan user sudah dipersist di `ensureDeepThread` (plan-gate) → JANGAN ulang di sini
 * (anti bubble kembar). Preview thread diperbarui ke laporan. Best-effort.
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
    /** Jejak proses untuk rehydrate (FE bangun ulang langkah + detail saat refresh/riwayat, G7). */
    deepProcess?: Record<string, unknown>;
  },
): Promise<void> {
  if (!mastra) return;
  try {
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
        // Idempoten: thread memory biasanya sudah dibuat di `ensureDeepThread` (plan-gate); jaga-jaga.
        await ensureMemoryThread(memory, { threadId: args.threadId, resourceId, title: args.report });
      } catch (err) {
        console.error("[deep-research] thread projection failed", err);
      }
    }
    await memory.saveMessages({
      messages: [
        buildMastraMessage({
          role: "assistant",
          text: args.report,
          threadId: args.threadId,
          resourceId,
          ...(args.reasoning ? { reasoning: args.reasoning } : {}),
          metadata: {
            deepRunId: args.runId,
            ...(args.deepProcess ? { deepProcess: args.deepProcess } : {}),
          },
        }),
      ],
    });
  } catch (err) {
    console.error("[deep-research] persistReport failed", err);
  }
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

/** Ekor kontrak JSON rencana — dipakai `planPrompt` DAN `replanPrompt` (satu sumber format). */
const PLAN_JSON_CONTRACT = `AKHIRI responsmu dengan TEPAT SATU blok kode JSON valid (tanpa teks setelahnya) berbentuk:\n\`\`\`json\n{"plan": "<rencana prosa lengkap di sini>", "subQuestions": ["<sub-pertanyaan 1>", "<sub-pertanyaan 2>", "..."], "domain": "<medicine|cs-ml|education|general>"}\n\`\`\`\nField \`domain\` = domain-pack metodologi yang paling cocok dengan topik (kesehatan/biomedis → medicine; CS/ML → cs-ml; pendidikan/pembelajaran → education; selain itu → general).`;

function planPrompt(input: z.infer<typeof InputSchema>): string {
  const ctx = input.context ? `\n\nKonteks tambahan dari pengguna:\n${input.context}` : "";
  return `Pertanyaan riset:\n${input.question}${ctx}\n\nSusun rencana riset mendalam sebagai PROSA mengalir (bukan daftar bernomor, bukan form): jelaskan apa yang akan diselidiki, sub-arah utama yang ditelusuri terpisah, jenis sumber yang dicari, dan cara verifikasi. Lalu turunkan 3-6 sub-pertanyaan riset spesifik dari rencana itu.\n\n${PLAN_JSON_CONTRACT}`;
}

/**
 * Prompt re-derive rencana setelah edit plan-gate (CFG-3): edit user harus MENGUBAH
 * `subQuestions` yang benar-benar diriset, bukan hanya ditempel sebagai prosa untuk writer akhir.
 */
function replanPrompt(input: Planned, edits: string): string {
  const subs = input.subQuestions.map((s, i) => `${i + 1}. ${s}`).join("\n");
  return `Rencana riset untuk pertanyaan:\n${input.question}\n\nRencana saat ini:\n${input.plan}\n\nSub-pertanyaan saat ini:\n${subs}\n\nPengguna meminta penyesuaian berikut SEBELUM riset dijalankan:\n${edits}\n\nTulis ulang rencana sebagai PROSA mengalir yang menghormati penyesuaian itu, lalu turunkan ulang 3-6 sub-pertanyaan (buang/ubah/tambah sub-pertanyaan sesuai permintaan pengguna; pertahankan yang tidak disinggung).\n\n${PLAN_JSON_CONTRACT}`;
}

/**
 * Ekstrak `{plan, subQuestions}` dari output model. Andalkan blok \`\`\`json di akhir (model
 * gateway kerap membungkus JSON dalam markdown); fallback ke objek {...} pertama yang valid.
 * Lebih tahan-banting dari `structuredOutput` native pada model OpenAI-compatible (gateway).
 */
function parsePlan(
  text: string,
): { plan: string; subQuestions: string[]; domain: ResearchDomain } | null {
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((m) => m[1]);
  for (const chunk of [...fenced.reverse(), text]) {
    const start = chunk.indexOf("{");
    const end = chunk.lastIndexOf("}");
    if (start === -1 || end <= start) continue;
    try {
      const obj = JSON.parse(chunk.slice(start, end + 1));
      if (obj && typeof obj.plan === "string" && Array.isArray(obj.subQuestions)) {
        const subQuestions = obj.subQuestions.filter(
          (s: unknown): s is string => typeof s === "string" && s.trim().length > 0,
        );
        const domainParsed = ResearchDomainSchema.safeParse(obj.domain);
        return {
          plan: obj.plan,
          subQuestions,
          domain: domainParsed.success ? domainParsed.data : "general",
        };
      }
    } catch {
      // coba kandidat berikutnya
    }
  }
  return null;
}

/**
 * Prompt penilaian klarifikasi pra-rencana: minta model menilai apakah pertanyaan sudah cukup
 * spesifik; bila tidak, mengembalikan 0-3 pertanyaan klarifikasi TERSTRUKTUR (JSON) — bukan prosa.
 * Sengaja konservatif (kembalikan kosong bila sudah jelas) agar `/deep` yang sudah spesifik tak
 * terpotong gerbang tambahan.
 */
function clarifyPrompt(input: z.infer<typeof InputSchema>): string {
  return `Pertanyaan riset dari pengguna:\n${input.question}\n\nNilai apakah pertanyaan ini SUDAH cukup spesifik untuk langsung diriset mendalam, atau ada AMBIGUITAS PENTING yang bila diklarifikasi akan sangat mengubah arah/kualitas riset (mis. ruang lingkup, populasi/konteks, rentang waktu, sudut pandang, atau format keluaran).\n\nBila sudah cukup spesifik, kembalikan daftar KOSONG. Bila perlu, ajukan MAKSIMAL 3 pertanyaan klarifikasi yang paling menentukan — ringkas, tiap pertanyaan \`single\` (pilih satu) atau \`multi\` (pilih beberapa) dengan 2-4 opsi; set \`allowOther: true\` bila jawaban bebas relevan.\n\nAKHIRI dengan TEPAT SATU blok kode JSON valid (tanpa teks setelahnya):\n\`\`\`json\n{"questions": [{"id": "scope", "prompt": "...", "kind": "single", "options": [{"label": "..."}], "allowOther": true}]}\n\`\`\`\nKembalikan {"questions": []} bila tak perlu klarifikasi.`;
}

/**
 * Ekstrak `AskQuestion[]` dari output model (blok ```json` di akhir; fallback objek {...} pertama).
 * Normalisasi item mentah (id/opsi/freeform/lipat "Lainnya") = `normalizeAskQuestions` — SSOT yang
 * sama dipakai reducer FE; di sini dibatasi `max: 3` (klarifikasi pra-rencana ringkas).
 */
function parseClarifyQuestions(text: string): AskQuestion[] {
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((m) => m[1] ?? "");
  for (const chunk of [...fenced.reverse(), text]) {
    const start = chunk.indexOf("{");
    const end = chunk.lastIndexOf("}");
    if (start === -1 || end <= start) continue;
    try {
      const obj = JSON.parse(chunk.slice(start, end + 1));
      if (obj && Array.isArray(obj.questions)) return normalizeAskQuestions(obj.questions, { max: 3 });
    } catch {
      // coba kandidat berikutnya
    }
  }
  return [];
}

function searcherPrompt(subQuestion: string, input: Planned): string {
  return `Topik riset utama: ${input.question}\n\nSub-pertanyaan yang HARUS kamu jawab dengan literatur:\n${subQuestion}\n\nCari bukti terkuat dan kembalikan tiap sumber berguna dengan: judul, identifier (DOI/arXiv/URL), penulis + tahun bila tersedia, extract bukti 2-4 kalimat, dan rating kekuatan. JANGAN menomori sumber dan JANGAN menulis penanda [n] — penomoran sitasi global dilakukan belakangan (CTX-1).`;
}

function counterPrompt(input: Searched): string {
  const inventory = input.evidence
    .map((e, i) => `### Sub-pertanyaan ${i + 1}: ${e.subQuestion}\n${e.findings}`)
    .join("\n\n");
  return `Inventaris bukti yang kesimpulannya sedang terbentuk untuk topik "${input.question}":\n\n${inventory}\n\nCari bukti yang MELEMAHKAN atau menentang kesimpulan-kesimpulan di atas. Laporkan jujur bila tak ada.`;
}

function verifyPrompt(input: Cited): string {
  return `Daftar referensi bernomor [n] yang akan dikutip — verifikasi integritasnya dengan SATU panggilan verify_identifiers:\n\n${input.numberedInventory}`;
}

/** Nama skill domain-pack per `ResearchDomain` (di-inline ke prompt sintesis, CFG-2). */
const DOMAIN_SKILL_NAME: Record<ResearchDomain, string> = {
  medicine: "research-medicine",
  "cs-ml": "research-cs-ml",
  education: "research-education",
  general: "research-general",
};

/**
 * Panduan metodologi + gaya yang DI-INLINE ke prompt sintesis (CFG-2): langkah `synthesize`
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

function synthesisPrompt(input: Verified): string {
  const evidence = input.evidence
    .map((e, i) => `### Sub-pertanyaan ${i + 1}: ${e.subQuestion}\n${e.findings}`)
    .join("\n\n");
  return `Tulis jawaban riset tercitasi untuk pertanyaan:\n${input.question}\n\nRencana yang disetujui:\n${input.plan}\n\nDaftar sumber bernomor (SATU-SATUNYA sumber nomor [n] — WAJIB pakai nomor PERSIS ini saat mengutip; jangan menomori ulang):\n${input.numberedInventory}\n\nInventaris bukti (untuk ekstrak & narasi — teks temuan TIDAK bernomor; petakan tiap klaim ke daftar sumber bernomor di atas via DOI/arXiv/URL/judul):\n${evidence}\n\nBukti tandingan (adversarial):\n${input.counter}\n\nVerdict verifikasi sitasi:\n${input.verification}\n\nPanduan metodologi & gaya (SUDAH disertakan di bawah — kamu TIDAK bisa dan TIDAK perlu memuat skill lewat tool di langkah ini):\n\n${synthesisGuidance(input.domain)}\n\nSintesiskan menjadi jawaban terstruktur dan jujur: ringkasan temuan per sub-pertanyaan, lalu bukti tandingan & keterbatasan. Setiap klaim faktual membawa penanda [n] inline dari daftar sumber bernomor di atas (penanda dirender sebagai pill sumber + panel "Sumber" terpisah — JANGAN tulis daftar/bagian "Sumber"/daftar pustaka sendiri di akhir). JANGAN mengarang identifier.`;
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
  execute: async ({ inputData, requestContext, bail, runId }) => {
    const { id: ownerUserId, email: ownerEmail } = ownerFromRequestContext(requestContext);
    if (ownerUserId) {
      const quota = await SendQuotaService.check(getServiceDb(), {
        ownerUserId,
        ownerEmail,
        feature: "deep_research",
      });
      if (!quota.ok) {
        return bail({
          status: "blocked" as const,
          reason: `Kuota deep research tidak tersedia (${quota.reason}).`,
        });
      }
    }
    let clarifyQuestions: AskQuestion[] = [];
    try {
      const out = await deepWriter.generate(clarifyPrompt(inputData), {
        ...deepGenOptions(requestContext, inputData, runId),
        toolChoice: "none",
      });
      clarifyQuestions = parseClarifyQuestions(out.text);
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
 * ditolak" (G1). TANPA gerbang billing di sini — billing tetap sekali di plan-gate.
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
 * 1. draftPlan — susun rencana prosa + sub-pertanyaan terstruktur via `deepWriter`. Precheck kuota
 * dipindah ke `draft-clarify` (gerbang paling awal) → step ini fokus menyusun rencana.
 * `toolChoice:"none"` (CFG-5): step ini berjalan SEBELUM gerbang billing `approve-plan`, jadi tool
 * berbayar (`search_*`) tak boleh bisa jalan di sini; `delete_artifact` (approval-suspend) juga
 * dilarang dalam workflow-generate (lihat `tools/index.ts`). Murni menulis JSON rencana.
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
    });
    const parsed = parsePlan(out.text);
    const plan = parsed?.plan ?? out.text;
    const subQuestions =
      parsed && parsed.subQuestions.length > 0 ? parsed.subQuestions : [inputData.question];
    const domain = parsed?.domain ?? "general";
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
      // kartu rencana (thread durable, tak "Akses ditolak"), bukan thread kosong (G1/TC13).
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
        return bail({ status: "blocked" as const, reason: `Akses deep research ditolak (${gate.reason}).` });
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
        return bail({ status: "blocked" as const, reason: `Kuota deep research habis (${debit.reason}).` });
      }
    }
    if (!resumeData.edits) return inputData;
    // CFG-3: edit user harus sampai ke `subQuestions` yang benar-benar diriset fan-out — bukan
    // hanya ditempel sebagai prosa yang baru dibaca writer akhir. Re-derive rencana+sub-pertanyaan
    // dengan satu pass murah (`toolChoice:"none"`); gagal → fallback perilaku lama (append prosa).
    try {
      const out = await deepWriter.generate(replanPrompt(inputData, resumeData.edits), {
        ...deepGenOptions(requestContext, inputData, runId),
        toolChoice: "none",
      });
      const parsed = parsePlan(out.text);
      if (parsed && parsed.subQuestions.length > 0) {
        await emitDetail(writer, {
          kind: "plan",
          plan: parsed.plan,
          subQuestions: parsed.subQuestions,
        });
        return {
          ...inputData,
          plan: parsed.plan,
          subQuestions: parsed.subQuestions,
          domain: parsed.domain,
        };
      }
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
 * Isolasi kegagalan per sub-pertanyaan (CFG-4): satu subagent yang melempar (429/timeout
 * terminal) TIDAK menggagalkan seluruh fan-out — kredit sudah didebit di plan-gate, jadi run
 * harus degradasi per-sub-Q (catat gap jujur ke sintesis), bukan `failed` tanpa hasil parsial.
 */
const searchStep = createStep({
  id: "search-literature",
  inputSchema: PlannedSchema,
  outputSchema: SearchedSchema,
  // TANPA `retries`: re-run step = re-debit `external_search` per tool-call baru. Isolasi
  // per-sub-Q di bawah sudah membuat step ini tak melempar. (Pasca-DUR-7 restart step justru
  // AMAN: task selesai di-reuse by `toolCallId`, tak menjalankan ulang subagent.)
  execute: async ({ inputData, mastra, requestContext, runId, writer }) => {
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
        // DUR-7: subagent jalan sebagai background task persisten — `toolCallId` deterministik
        // per (run, sub-Q) → restart run me-reuse hasil task selesai (tanpa re-debit search).
        const taskBase = {
          mastra,
          runId,
          threadId: inputData.threadId,
          ...(owner.id ? { resourceId: owner.id } : {}),
          timeoutMs: 600_000,
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
          // Guard turn-senyap subagent (CTX-7): selesai pas di tool-call → teks kosong. Retry SEKALI
          // dengan pengingat eksplisit; masih kosong → catat gap jujur (jangan biarkan bucket kosong
          // mengalir senyap ke sintesis).
          if (!findings) {
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
          // CFG-4: kegagalan satu subagent tak boleh menolak seluruh Promise.all.
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
 * 4. counterEvidence — cari bukti tandingan adversarial atas inventaris. `retries: 1` (CFG-4):
 * step LLM pasca-billing tak boleh mematikan run karena satu error transien (kredit deep sudah
 * didebit di plan-gate; re-run bisa mengulang sedikit debit `external_search` — jauh lebih murah
 * daripada run `failed` tanpa refund).
 */
const counterEvidenceStep = createStep({
  id: "counter-evidence",
  inputSchema: SearchedSchema,
  outputSchema: CounteredSchema,
  retries: 1,
  execute: async ({ inputData, mastra, requestContext, runId, writer }) => {
    // DUR-7: background task persisten — restart run me-reuse hasil task selesai.
    const rc = withDeepRun(requestContext, inputData.threadId, runId, inputData.agentKind);
    const owner = ownerFromRequestContext(requestContext);
    const out = await runDeepSubagentTask({
      mastra,
      runId,
      threadId: inputData.threadId,
      ...(owner.id ? { resourceId: owner.id } : {}),
      timeoutMs: 600_000,
      toolCallId: `${runId}:counter`,
      args: {
        agentId: "counter-evidence",
        prompt: counterPrompt(inputData),
        requestContext: Array.from(rc.entries()),
      },
    });
    // Guard teks kosong (CTX-7): jangan biarkan bagian adversarial hilang senyap.
    const counter =
      out.text.trim() ||
      "(Pencarian bukti tandingan berakhir tanpa teks — perlakukan sebagai BELUM diverifikasi ada/tidaknya bukti tandingan, BUKAN sebagai ketiadaan bukti tandingan.)";
    await emitDetail(writer, { kind: "counter", text: counter });
    return { ...inputData, counter };
  },
});

/**
 * 5. assignCitations — nomori `research_sources` run ini (turnId=runId) → `citation_number` 1..N
 * (dedupe by DOI/arXiv/locator) lalu susun inventory bernomor GLOBAL untuk verify + synthesis (G4).
 */
const assignCitationsStep = createStep({
  id: "assign-citations",
  inputSchema: CounteredSchema,
  outputSchema: CitedSchema,
  execute: async ({ inputData, runId, writer }) => {
    const items = await ResearchService.assignCitationNumbers(getServiceDb(), {
      threadId: inputData.threadId,
      turnId: runId,
    });
    const numbered = items.filter((s) => s.citationNumber !== null);
    // Baris inventory bawa authors/year/venue (CTX-8) → verify_identifiers + daftar pustaka APA
    // bekerja dari metadata asli provider, bukan karangan model.
    const numberedInventory = numbered
      .map((s) => {
        const meta = [
          s.authors.length > 0 ? s.authors.join(", ") : null,
          s.year !== null ? String(s.year) : null,
          s.venue,
        ]
          .filter(Boolean)
          .join("; ");
        return `[${s.citationNumber}] ${s.title}${meta ? ` (${meta})` : ""} — ${
          s.doi ?? s.arxivId ?? s.url ?? s.locator
        }${s.snippet ? ` — ${s.snippet}` : ""} (${s.evidenceStrength})`;
      })
      .join("\n");
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
    await emitDetail(writer, { kind: "citations", count: uniqueCitations });
    return { ...inputData, numberedInventory, numberedSources };
  },
});

/** 6. verifyCitations — verifikasi integritas referensi bernomor (batch `verify_identifiers`). */
const citationVerifyStep = createStep({
  id: "verify-citations",
  inputSchema: CitedSchema,
  outputSchema: VerifiedSchema,
  retries: 1,
  execute: async ({ inputData, mastra, requestContext, runId, writer }) => {
    // DUR-7: background task persisten — restart run me-reuse hasil task selesai.
    const rc = withDeepRun(requestContext, inputData.threadId, runId, inputData.agentKind);
    const owner = ownerFromRequestContext(requestContext);
    const out = await runDeepSubagentTask({
      mastra,
      runId,
      threadId: inputData.threadId,
      ...(owner.id ? { resourceId: owner.id } : {}),
      timeoutMs: 300_000,
      toolCallId: `${runId}:verify`,
      args: {
        agentId: "citation-verifier",
        prompt: verifyPrompt(inputData),
        requestContext: Array.from(rc.entries()),
      },
    });
    // Guard teks kosong (CTX-7): tanpa verdict, tandai belum-terverifikasi — jangan diam.
    const verification =
      out.text.trim() ||
      "(Verifikasi sitasi berakhir tanpa verdict — perlakukan SEMUA referensi sebagai belum terverifikasi otomatis dan sarankan pemeriksaan manual.)";
    await emitDetail(writer, { kind: "verify", text: verification });
    return { ...inputData, verification };
  },
});

/** 7. synthesize — penulis akhir (deepWriter, "root") merangkai jawaban tercitasi + persist. */
const synthesizeStep = createStep({
  id: "synthesize",
  inputSchema: VerifiedSchema,
  outputSchema: OutputSchema,
  retries: 1,
  execute: async ({ inputData, requestContext, mastra, runId, writer }) => {
    // `toolChoice: "none"`: seluruh bukti sudah ada di prompt; paksa penulis MENULIS teks
    // (bukan berhenti di tool-call kosong) — jaminan `out.text` terisi pada model gateway.
    // DUR-7: background task persisten — restart run me-reuse laporan task selesai.
    const rc = withDeepRun(requestContext, inputData.threadId, runId, inputData.agentKind);
    const owner = ownerFromRequestContext(requestContext);
    const out = await runDeepSubagentTask({
      mastra,
      runId,
      threadId: inputData.threadId,
      ...(owner.id ? { resourceId: owner.id } : {}),
      timeoutMs: 900_000,
      toolCallId: `${runId}:synthesize`,
      args: {
        agentId: "deep-writer",
        prompt: synthesisPrompt(inputData),
        requestContext: Array.from(rc.entries()),
        toolChoice: "none",
      },
    });
    // Ringkasan penalaran penulis (Responses API `reasoningSummary`) → blok "reasoning" di atas
    // laporan (parity dgn chat). Route B: dipanen post-hoc dari hasil `.generate`, bukan di-stream
    // token-level (aman thd durable refresh) → emit live + dipersist di pesan untuk rehydrate.
    const reasoning = (out.reasoningText ?? "").trim();
    if (reasoning) await emitDetail(writer, { kind: "reasoning", text: reasoning });
    // Persist verbatim ke memory thread chat → muncul di history + rehydrate saat refresh (G1/G2).
    // (Pertanyaan user sudah dipersist di `ensureDeepThread` pada plan-gate.) `deepProcess` =
    // jejak proses agar FE bangun ulang langkah + detail tanpa runId (riwayat/refresh, G7). Teks
    // counter/verify dipersist PENUH (tanpa clamp) → panel detail menampilkan narasi utuh.
    await persistDeepReport(mastra, requestContext, {
      threadId: inputData.threadId,
      report: out.text,
      reasoning,
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
      },
    });
    return {
      status: "completed" as const,
      report: out.text,
      plan: inputData.plan,
      subQuestions: inputData.subQuestions,
      ...(reasoning ? { reasoning } : {}),
    };
  },
});

export const deepResearch = createWorkflow({
  id: "deep-research",
  description: "Riset mendalam tercitasi: klarifikasi (HITL, opsional) → plan-gate (HITL) → cari literatur → bukti tandingan → verifikasi sitasi → sintesis.",
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
  .then(citationVerifyStep)
  .then(synthesizeStep)
  .commit();
