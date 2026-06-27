import { BillingService } from "@aqsha/services/billing";
import { estimateCredits } from "@aqsha/services/plan";
import { SendQuotaService } from "@aqsha/services/quota";
import {
  MASTRA_RESOURCE_ID_KEY,
  MASTRA_THREAD_ID_KEY,
  type RequestContext,
} from "@mastra/core/request-context";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { citationVerifier } from "../agents/citation-verifier";
import { counterEvidence } from "../agents/counter-evidence";
import { deepWriter } from "../agents/deep-writer";
import { literatureSearcher } from "../agents/literature-searcher";
import { getServiceDb } from "../lib/db";
import { AQSHA_EMAIL_KEY } from "../lib/tool-context";

/**
 * Workflow `deep-research` (Fase 2) — port `/deep` eve ke orkestrasi deterministik Mastra.
 *
 * Menggantikan skill `deep-research` model-driven + subagent eve dengan langkah eksplisit yang
 * observable per fase dan resume-safe:
 *
 *   draftPlan → approvePlan (HITL suspend/resume + gerbang billing) → searchLiterature
 *   → counterEvidence → verifyCitations → synthesize
 *
 * Keputusan desain (deviasi sah dari §7 plan, dicatat):
 * - **Fan-out di dalam `searchStep`** (Promise.all per sub-pertanyaan) alih-alih builder
 *   `.foreach`. Rantai linear `.then` menjaga konteks (question/plan) mengalir utuh tanpa
 *   `.map`/`getStepResult` dan tetap observable per fase. Per-sub-pertanyaan paralel.
 * - **Billing SEKALI di plan-gate** (`requireEntitlement` + `consumeCredits` feature
 *   `deep_research`, idempoten via `runId`) — port `begin_deep_research.ts`. Subagent &
 *   penulis TAK pakai processor billing per-turn; tool `search_*` tetap men-debit
 *   `external_search` per pemanggilan (parity eve).
 * - **threadId** dialirkan ke subagent via `RequestContext` (`MASTRA_THREAD_ID_KEY`) supaya
 *   tool riset men-scope `research_sources` ke thread chat tanpa memory thread subagent.
 */

// ── Skema data (kontrak antar-step, akumulatif) ──────────────────────────────────────────

const InputSchema = z.object({
  question: z.string().min(1).describe("Pertanyaan riset utama dari pengguna."),
  context: z.string().optional().describe("Konteks tambahan hasil klarifikasi (opsional)."),
  threadId: z.string().min(1).describe("Thread chat untuk men-scope sumber + billing."),
});

const PlanSchema = z.object({
  plan: z.string().min(1).describe("Rencana riset sebagai prosa mengalir."),
  subQuestions: z
    .array(z.string().min(1))
    .min(1)
    .max(8)
    .describe("3-6 sub-pertanyaan riset yang diturunkan dari rencana."),
});

const EvidenceItemSchema = z.object({
  subQuestion: z.string(),
  findings: z.string().describe("Temuan bukti bernomor [n] dari literature-searcher."),
});

const PlannedSchema = InputSchema.extend(PlanSchema.shape);
const SearchedSchema = PlannedSchema.extend({ evidence: z.array(EvidenceItemSchema) });
const CounteredSchema = SearchedSchema.extend({ counter: z.string() });
const VerifiedSchema = CounteredSchema.extend({ verification: z.string() });

const OutputSchema = z.object({
  status: z.enum(["completed", "cancelled", "blocked"]),
  report: z.string().optional().describe("Laporan tercitasi (status=completed)."),
  plan: z.string().optional(),
  subQuestions: z.array(z.string()).optional(),
  reason: z.string().optional().describe("Alasan blokir/batal (status≠completed)."),
});

type Planned = z.infer<typeof PlannedSchema>;
type Searched = z.infer<typeof SearchedSchema>;
type Countered = z.infer<typeof CounteredSchema>;
type Verified = z.infer<typeof VerifiedSchema>;

// ── Helper konteks ───────────────────────────────────────────────────────────────────────

/** Owner + email dari RequestContext (di-set auth Clerk + `userContextMiddleware`). */
function ownerFrom(rc: RequestContext): { ownerUserId: string | null; ownerEmail: string | null } {
  const id = rc.get(MASTRA_RESOURCE_ID_KEY);
  const email = rc.get(AQSHA_EMAIL_KEY);
  return {
    ownerUserId: typeof id === "string" && id ? id : null,
    ownerEmail: typeof email === "string" && email ? email : null,
  };
}

/**
 * Tanam threadId chat ke RequestContext sebelum memanggil subagent — tool riset membaca
 * `MASTRA_THREAD_ID_KEY` (lewat `threadScopeId`) untuk men-scope `research_sources` + RAG.
 * Owner/email yang sudah ada di rc tetap terbawa (callerId/callerEmail subagent valid).
 */
function withThread(rc: RequestContext, threadId: string): RequestContext {
  rc.set(MASTRA_THREAD_ID_KEY, threadId);
  return rc;
}

// ── Prompt builders ────────────────────────────────────────────────────────────────────

function planPrompt(input: z.infer<typeof InputSchema>): string {
  const ctx = input.context ? `\n\nKonteks tambahan dari pengguna:\n${input.context}` : "";
  return `Pertanyaan riset:\n${input.question}${ctx}\n\nSusun rencana riset mendalam sebagai PROSA mengalir (bukan daftar bernomor, bukan form): jelaskan apa yang akan diselidiki, sub-arah utama yang ditelusuri terpisah, jenis sumber yang dicari, dan cara verifikasi. Lalu turunkan 3-6 sub-pertanyaan riset spesifik dari rencana itu.\n\nAKHIRI responsmu dengan TEPAT SATU blok kode JSON valid (tanpa teks setelahnya) berbentuk:\n\`\`\`json\n{"plan": "<rencana prosa lengkap di sini>", "subQuestions": ["<sub-pertanyaan 1>", "<sub-pertanyaan 2>", "..."]}\n\`\`\``;
}

/**
 * Ekstrak `{plan, subQuestions}` dari output model. Andalkan blok \`\`\`json di akhir (model
 * gateway kerap membungkus JSON dalam markdown); fallback ke objek {...} pertama yang valid.
 * Lebih tahan-banting dari `structuredOutput` native pada model OpenAI-compatible (gateway).
 */
function parsePlan(text: string): { plan: string; subQuestions: string[] } | null {
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
        return { plan: obj.plan, subQuestions };
      }
    } catch {
      // coba kandidat berikutnya
    }
  }
  return null;
}

function searcherPrompt(subQuestion: string, input: Planned): string {
  return `Topik riset utama: ${input.question}\n\nSub-pertanyaan yang HARUS kamu jawab dengan literatur:\n${subQuestion}\n\nCari bukti terkuat dan kembalikan tiap sumber berguna bernomor [n] (dengan judul, identifier DOI/arXiv/URL, extract bukti 2-4 kalimat, dan rating kekuatan).`;
}

function counterPrompt(input: Searched): string {
  const inventory = input.evidence
    .map((e, i) => `### Sub-pertanyaan ${i + 1}: ${e.subQuestion}\n${e.findings}`)
    .join("\n\n");
  return `Inventaris bukti yang kesimpulannya sedang terbentuk untuk topik "${input.question}":\n\n${inventory}\n\nCari bukti yang MELEMAHKAN atau menentang kesimpulan-kesimpulan di atas. Laporkan jujur bila tak ada.`;
}

function verifyPrompt(input: Countered): string {
  const inventory = input.evidence.map((e) => e.findings).join("\n\n");
  return `Daftar referensi yang akan dikutip (ekstrak judul + identifier + nomor [n] dari teks berikut, lalu verifikasi integritasnya dengan SATU panggilan verify_identifiers):\n\n${inventory}`;
}

function synthesisPrompt(input: Verified): string {
  const inventory = input.evidence
    .map((e, i) => `### Sub-pertanyaan ${i + 1}: ${e.subQuestion}\n${e.findings}`)
    .join("\n\n");
  return `Tulis jawaban riset tercitasi untuk pertanyaan:\n${input.question}\n\nRencana yang disetujui:\n${input.plan}\n\nInventaris bukti:\n${inventory}\n\nBukti tandingan (adversarial):\n${input.counter}\n\nVerdict verifikasi sitasi:\n${input.verification}\n\nSintesiskan menjadi jawaban terstruktur dan jujur: ringkasan temuan per sub-pertanyaan, bukti tandingan & keterbatasan, lalu daftar sumber. Setiap klaim faktual membawa penanda [n] yang memetakan ke sumber di inventaris. Baca domain-pack + cite-apa7/write-academic-id lewat tool skill sebelum menulis. JANGAN mengarang identifier.`;
}

// ── Steps ─────────────────────────────────────────────────────────────────────────────────

/**
 * 1. draftPlan — precheck kuota deep (ramah, `SendQuotaService`) lalu susun rencana prosa +
 * sub-pertanyaan terstruktur via `deepWriter`. Blok kuota → `bail` cepat (tak menyusun rencana).
 */
const draftPlanStep = createStep({
  id: "draft-plan",
  inputSchema: InputSchema,
  outputSchema: PlannedSchema,
  execute: async ({ inputData, requestContext, bail }) => {
    const { ownerUserId, ownerEmail } = ownerFrom(requestContext);
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
    const out = await deepWriter.generate(planPrompt(inputData), {
      requestContext: withThread(requestContext, inputData.threadId),
    });
    const parsed = parsePlan(out.text);
    const plan = parsed?.plan ?? out.text;
    const subQuestions =
      parsed && parsed.subQuestions.length > 0 ? parsed.subQuestions : [inputData.question];
    return { ...inputData, plan, subQuestions };
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
  execute: async ({ inputData, resumeData, suspend, bail, requestContext, runId }) => {
    if (!resumeData) {
      return await suspend({ plan: inputData.plan, subQuestions: inputData.subQuestions });
    }
    if (!resumeData.approved) {
      return bail({ status: "cancelled" as const, plan: inputData.plan });
    }
    const { ownerUserId, ownerEmail } = ownerFrom(requestContext);
    if (ownerUserId) {
      const db = getServiceDb();
      const credits = estimateCredits({ feature: "deep_research", agentKind: "lite" });
      const gate = await BillingService.requireEntitlement(db, {
        ownerUserId,
        ownerEmail,
        feature: "deep_research",
        credits,
        requiredPlan: "free",
      });
      if (!gate.ok) {
        return bail({ status: "blocked" as const, reason: `Akses deep research ditolak (${gate.reason}).` });
      }
      const debit = await BillingService.consumeCredits(db, {
        ownerUserId,
        ownerEmail,
        feature: "deep_research",
        provider: "openai",
        agentKind: "lite",
        requiredPlan: "free",
        threadId: inputData.threadId,
        idempotencyKey: `${runId}:deep`,
      });
      if (!debit.ok) {
        return bail({ status: "blocked" as const, reason: `Kuota deep research habis (${debit.reason}).` });
      }
    }
    const plan = resumeData.edits
      ? `${inputData.plan}\n\nPenyesuaian dari pengguna: ${resumeData.edits}`
      : inputData.plan;
    return { ...inputData, plan };
  },
});

/**
 * 3. searchLiterature — fan-out paralel: satu `literatureSearcher` per sub-pertanyaan. Tool
 * `search_*` men-debit `external_search` + persist `research_sources` ke thread chat.
 */
const searchStep = createStep({
  id: "search-literature",
  inputSchema: PlannedSchema,
  outputSchema: SearchedSchema,
  execute: async ({ inputData, requestContext }) => {
    const rc = withThread(requestContext, inputData.threadId);
    const evidence = await Promise.all(
      inputData.subQuestions.map(async (subQuestion) => {
        const out = await literatureSearcher.generate(searcherPrompt(subQuestion, inputData), {
          requestContext: rc,
        });
        return { subQuestion, findings: out.text };
      }),
    );
    return { ...inputData, evidence };
  },
});

/** 4. counterEvidence — cari bukti tandingan adversarial atas inventaris. */
const counterEvidenceStep = createStep({
  id: "counter-evidence",
  inputSchema: SearchedSchema,
  outputSchema: CounteredSchema,
  execute: async ({ inputData, requestContext }) => {
    const out = await counterEvidence.generate(counterPrompt(inputData), {
      requestContext: withThread(requestContext, inputData.threadId),
    });
    return { ...inputData, counter: out.text };
  },
});

/** 5. verifyCitations — verifikasi integritas referensi (batch `verify_identifiers`). */
const citationVerifyStep = createStep({
  id: "verify-citations",
  inputSchema: CounteredSchema,
  outputSchema: VerifiedSchema,
  execute: async ({ inputData, requestContext }) => {
    const out = await citationVerifier.generate(verifyPrompt(inputData), {
      requestContext: withThread(requestContext, inputData.threadId),
    });
    return { ...inputData, verification: out.text };
  },
});

/** 6. synthesize — penulis akhir (deepWriter, "root") merangkai jawaban tercitasi. */
const synthesizeStep = createStep({
  id: "synthesize",
  inputSchema: VerifiedSchema,
  outputSchema: OutputSchema,
  execute: async ({ inputData, requestContext }) => {
    // `toolChoice: "none"`: seluruh bukti sudah ada di prompt; paksa penulis MENULIS teks
    // (bukan berhenti di tool-call kosong) — jaminan `out.text` terisi pada model gateway.
    const out = await deepWriter.generate(synthesisPrompt(inputData), {
      requestContext: withThread(requestContext, inputData.threadId),
      toolChoice: "none",
    });
    return {
      status: "completed" as const,
      report: out.text,
      plan: inputData.plan,
      subQuestions: inputData.subQuestions,
    };
  },
});

export const deepResearch = createWorkflow({
  id: "deep-research",
  description: "Riset mendalam tercitasi: plan-gate (HITL) → cari literatur → bukti tandingan → verifikasi sitasi → sintesis.",
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
})
  .then(draftPlanStep)
  .then(approvePlanStep)
  .then(searchStep)
  .then(counterEvidenceStep)
  .then(citationVerifyStep)
  .then(synthesizeStep)
  .commit();
