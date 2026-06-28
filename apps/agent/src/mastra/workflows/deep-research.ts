import { messagePreview } from "@aqsha/chat-core";
import { BillingService } from "@aqsha/services/billing";
import { ThreadService, TitleService } from "@aqsha/services/chat";
import { estimateCredits } from "@aqsha/services/plan";
import { SendQuotaService } from "@aqsha/services/quota";
import { ResearchService } from "@aqsha/services/research";
import type { Mastra } from "@mastra/core/mastra";
import {
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
import { AQSHA_DEEP_RUN_KEY, ownerFromRequestContext } from "../lib/tool-context";

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
const CitedSchema = CounteredSchema.extend({
  numberedInventory: z.string().describe("Daftar sumber bernomor [n] GLOBAL (citation_number) untuk dikutip."),
});
const VerifiedSchema = CitedSchema.extend({ verification: z.string() });

const OutputSchema = z.object({
  status: z.enum(["completed", "cancelled", "blocked"]),
  report: z.string().optional().describe("Laporan tercitasi (status=completed)."),
  plan: z.string().optional(),
  subQuestions: z.array(z.string()).optional(),
  reason: z.string().optional().describe("Alasan blokir/batal (status≠completed)."),
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
function withDeepRun(rc: RequestContext, threadId: string, runId: string): RequestContext {
  rc.set(MASTRA_THREAD_ID_KEY, threadId);
  rc.set(AQSHA_DEEP_RUN_KEY, runId);
  return rc;
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
  metadata?: Record<string, unknown>;
}) {
  return {
    id: crypto.randomUUID(),
    role: args.role,
    createdAt: new Date(Date.now()),
    threadId: args.threadId,
    resourceId: args.resourceId,
    content: {
      format: 2 as const,
      parts: [{ type: "text" as const, text: args.text }],
      content: args.text,
      ...(args.metadata ? { metadata: args.metadata } : {}),
    },
  };
}

/**
 * Proyeksikan thread chat + persist pertanyaan user SEDINI plan-gate (sebelum `suspend`). Jalur `/deep`
 * = Workflow yang dijalankan FE (bukan turn agent) → `threadProjectionProcessor` TAK jalan, jadi tanpa
 * ini `chat_threads` kosong → halaman thread "Akses ditolak" saat refresh di plan-gate/riset (G1/TC13),
 * dan thread tak muncul di sidebar. Persist pertanyaan SEKALI di sini (BUKAN lagi di `persistDeepReport`)
 * supaya tak ada bubble user kembar. Best-effort: kegagalan tak menggagalkan run.
 */
async function ensureDeepThread(
  mastra: Mastra | undefined,
  requestContext: RequestContext,
  args: { threadId: string; question: string },
): Promise<void> {
  if (!mastra) return;
  const resourceId = ownerFromRequestContext(requestContext).id ?? undefined;
  if (!resourceId) return;
  try {
    const db = getServiceDb();
    await ThreadService.ensureProjected(db, {
      threadId: args.threadId,
      ownerUserId: resourceId,
      agentKind: "lite",
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
          role: "user",
          text: args.question,
          threadId: args.threadId,
          resourceId,
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
  args: { threadId: string; report: string; runId: string },
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
          agentKind: "lite",
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
          metadata: { deepRunId: args.runId },
        }),
      ],
    });
  } catch (err) {
    console.error("[deep-research] persistReport failed", err);
  }
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

function verifyPrompt(input: Cited): string {
  return `Daftar referensi bernomor [n] yang akan dikutip — verifikasi integritasnya dengan SATU panggilan verify_identifiers:\n\n${input.numberedInventory}`;
}

function synthesisPrompt(input: Verified): string {
  const evidence = input.evidence
    .map((e, i) => `### Sub-pertanyaan ${i + 1}: ${e.subQuestion}\n${e.findings}`)
    .join("\n\n");
  return `Tulis jawaban riset tercitasi untuk pertanyaan:\n${input.question}\n\nRencana yang disetujui:\n${input.plan}\n\nDaftar sumber bernomor (WAJIB pakai nomor [n] PERSIS ini saat mengutip; jangan menomori ulang):\n${input.numberedInventory}\n\nInventaris bukti (untuk ekstrak & narasi):\n${evidence}\n\nBukti tandingan (adversarial):\n${input.counter}\n\nVerdict verifikasi sitasi:\n${input.verification}\n\nSintesiskan menjadi jawaban terstruktur dan jujur: ringkasan temuan per sub-pertanyaan, bukti tandingan & keterbatasan, lalu bagian "Sumber" yang mendaftar [n] sesuai daftar sumber bernomor di atas. Setiap klaim faktual membawa penanda [n] dari daftar itu. Baca domain-pack + cite-apa7/write-academic-id lewat tool skill sebelum menulis. JANGAN mengarang identifier.`;
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
    const out = await deepWriter.generate(planPrompt(inputData), {
      requestContext: withDeepRun(requestContext, inputData.threadId, runId),
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
  execute: async ({ inputData, resumeData, suspend, bail, requestContext, runId, mastra }) => {
    if (!resumeData) {
      // Proyeksikan thread + persist pertanyaan SEBELUM suspend → refresh saat plan-gate me-resume
      // kartu rencana (thread durable, tak "Akses ditolak"), bukan thread kosong (G1/TC13).
      await ensureDeepThread(mastra, requestContext, {
        threadId: inputData.threadId,
        question: inputData.question,
      });
      return await suspend({ plan: inputData.plan, subQuestions: inputData.subQuestions });
    }
    if (!resumeData.approved) {
      return bail({ status: "cancelled" as const, plan: inputData.plan });
    }
    const { id: ownerUserId, email: ownerEmail } = ownerFromRequestContext(requestContext);
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
  execute: async ({ inputData, requestContext, runId }) => {
    const rc = withDeepRun(requestContext, inputData.threadId, runId);
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
  execute: async ({ inputData, requestContext, runId }) => {
    const out = await counterEvidence.generate(counterPrompt(inputData), {
      requestContext: withDeepRun(requestContext, inputData.threadId, runId),
    });
    return { ...inputData, counter: out.text };
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
  execute: async ({ inputData, runId }) => {
    const items = await ResearchService.assignCitationNumbers(getServiceDb(), {
      threadId: inputData.threadId,
      turnId: runId,
    });
    const numberedInventory = items
      .filter((s) => s.citationNumber !== null)
      .map(
        (s) =>
          `[${s.citationNumber}] ${s.title} — ${s.doi ?? s.arxivId ?? s.url ?? s.locator}${
            s.snippet ? ` — ${s.snippet}` : ""
          } (${s.evidenceStrength})`,
      )
      .join("\n");
    return { ...inputData, numberedInventory };
  },
});

/** 6. verifyCitations — verifikasi integritas referensi bernomor (batch `verify_identifiers`). */
const citationVerifyStep = createStep({
  id: "verify-citations",
  inputSchema: CitedSchema,
  outputSchema: VerifiedSchema,
  execute: async ({ inputData, requestContext, runId }) => {
    const out = await citationVerifier.generate(verifyPrompt(inputData), {
      requestContext: withDeepRun(requestContext, inputData.threadId, runId),
    });
    return { ...inputData, verification: out.text };
  },
});

/** 7. synthesize — penulis akhir (deepWriter, "root") merangkai jawaban tercitasi + persist. */
const synthesizeStep = createStep({
  id: "synthesize",
  inputSchema: VerifiedSchema,
  outputSchema: OutputSchema,
  execute: async ({ inputData, requestContext, mastra, runId }) => {
    // `toolChoice: "none"`: seluruh bukti sudah ada di prompt; paksa penulis MENULIS teks
    // (bukan berhenti di tool-call kosong) — jaminan `out.text` terisi pada model gateway.
    const out = await deepWriter.generate(synthesisPrompt(inputData), {
      requestContext: withDeepRun(requestContext, inputData.threadId, runId),
      toolChoice: "none",
    });
    // Persist verbatim ke memory thread chat → muncul di history + rehydrate saat refresh (G1/G2).
    // (Pertanyaan user sudah dipersist di `ensureDeepThread` pada plan-gate.)
    await persistDeepReport(mastra, requestContext, {
      threadId: inputData.threadId,
      report: out.text,
      runId,
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
  .then(assignCitationsStep)
  .then(citationVerifyStep)
  .then(synthesizeStep)
  .commit();
