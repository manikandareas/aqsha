"use client";

import { useAuth } from "@clerk/nextjs";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { readableApiErrorMessage } from "@/lib/api-error";
import { documentEditBus } from "@/lib/document-edit-bus";
import { queryKeys } from "../../../lib/api-query";
import type { TimelineMessage } from "./timeline-types";
import { type AgentKind, agentIdFor, useMastraClient } from "./mastra-client";
import {
  type MastraApproval,
  type MastraChunk,
  type MastraPlanGate,
  type MastraTimelineState,
  initialMastraTimeline,
  reduceMastraChunk,
  reduceWorkflowChunk,
  seedWorkflowProgress,
  settleAssistantTurn,
  startAssistantTurn,
  startRegenerate,
} from "./mastra-timeline";

export type MastraAgentStatus = "ready" | "submitted" | "streaming";

export type MastraAgent = {
  status: MastraAgentStatus;
  messages: TimelineMessage[];
  approvals: MastraApproval[];
  planGate: MastraPlanGate | null;
  error: { message: string } | null;
  send: (
    text: string,
    clientContext?: string[],
    richText?: string,
    attachmentIds?: string[],
    agentKind?: AgentKind,
  ) => Promise<void>;
  sendDeep: (
    question: string,
    clientContext?: string[],
    richText?: string,
    attachmentIds?: string[],
    agentKind?: AgentKind,
  ) => Promise<void>;
  resolvePlan: (approved: boolean, edits?: string) => Promise<void>;
  regenerate: () => Promise<void>;
  approve: (toolCallId: string) => Promise<void>;
  decline: (toolCallId: string) => Promise<void>;
  stop: () => void;
};

/** Id Workflow `/deep` (key di `new Mastra({ workflows })`). */
const DEEP_WORKFLOW_ID = "deep-research";

/** Run Workflow (subset client-js yang dipakai) — stream/resume/observe = `ReadableStream` chunk. */
type DeepRun = {
  readonly runId: string;
  stream: (p: {
    inputData: Record<string, unknown>;
    closeOnSuspend?: boolean;
  }) => Promise<ReadableStream<MastraChunk>>;
  resumeStream: (p: {
    step?: string | string[];
    resumeData?: Record<string, unknown>;
  }) => Promise<ReadableStream<MastraChunk>>;
  observe: (p?: { offset?: number }) => Promise<ReadableStream<MastraChunk>>;
};

/** Iterasi `ReadableStream` via reader (async-iterator ReadableStream belum universal di browser). */
async function* iterateStream<T>(stream: ReadableStream<T>): AsyncGenerator<T> {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value !== undefined) yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

// Pemetaan thread→runId Workflow `/deep` aktif (localStorage) — tak ada get-run-by-thread di
// client-js, jadi FE simpan sendiri untuk re-attach (`observe`) / rehydrate plan-gate saat refresh.
const deepRunKey = (threadId: string) => `aqsha:deep-run:${threadId}`;
function getDeepRunId(threadId: string): string | null {
  try {
    return typeof window !== "undefined" ? window.localStorage.getItem(deepRunKey(threadId)) : null;
  } catch {
    return null;
  }
}
function setDeepRunId(threadId: string, runId: string): void {
  try {
    window.localStorage.setItem(deepRunKey(threadId), runId);
  } catch {
    /* localStorage tak tersedia → re-attach refresh dilewati (bukan fatal) */
  }
}
function clearDeepRunId(threadId: string): void {
  try {
    window.localStorage.removeItem(deepRunKey(threadId));
  } catch {
    /* no-op */
  }
}

/** Pesan server (memory thread) — minimal untuk menemukan pasangan terakhir saat regenerate. */
type ServerMessageLike = { id: string; role?: string };

/** Teks pesan user terakhir di timeline (untuk regenerate). */
function lastUserText(messages: readonly TimelineMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg?.role !== "user") continue;
    const text = msg.parts
      .filter((p) => p.kind === "text")
      .map((p) => (p as { text: string }).text)
      .join("\n")
      .trim();
    return text || null;
  }
  return null;
}

/**
 * Id pasangan [user, assistant] terakhir di memory server (untuk dihapus saat regenerate).
 * Durable-thread `sendMessage` menyimpan input user sebagai SIGNAL (`role:"signal"`, BUKAN
 * `role:"user"`) → mencocokkan `role==="user"` akan MELEWATKANNYA, menyisakan baris user lama saat
 * kirim ulang → bubble user kembar setelah refresh (G6). Cocokkan berbasis POSISI: hapus pesan
 * assistant terakhir + semua pesan non-assistant tepat sebelumnya (turn user), apa pun label role.
 */
function lastTurnMessageIds(messages: readonly ServerMessageLike[]): string[] {
  let lastAssistant = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]!.role === "assistant") {
      lastAssistant = i;
      break;
    }
  }
  if (lastAssistant < 0) return [];
  const ids: string[] = [messages[lastAssistant]!.id];
  for (let i = lastAssistant - 1; i >= 0; i -= 1) {
    if (messages[i]!.role === "assistant") break;
    ids.push(messages[i]!.id);
  }
  return ids;
}

/** Handle langganan thread (`subscribeToThread`) — abort=cancel run server-side; unsubscribe=tutup. */
type ThreadSubscription = {
  processDataStream: (o: {
    onChunk: (c: unknown) => void;
    reconnect?: boolean | { maxRetries?: number; delayMs?: number };
  }) => Promise<void>;
  abort: () => Promise<boolean>;
  unsubscribe: () => void;
};

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Hook agent Mastra (durable-thread). Menggantikan pola `agent.stream()` terikat-koneksi.
 *
 * - Mount: SATU `subscribeToThread` panjang (`reconnect:true`) → menerima SEMUA run thread + replay
 *   buffer run in-flight saat refresh (G1: progres lanjut + jawaban tak terpotong; run terlepas dari
 *   koneksi via `sendMessage`, disconnect klien tak meng-abort generasi).
 * - Kirim: `sendMessage` (run durable) — output mengalir via langganan, BUKAN ditunggu di sini.
 * - Stop: `subscription.abort()` (= `abortThread`, cancel server-side) → chunk `abort` bersih, tanpa
 *   `AbortError` (G5).
 * - HITL: `sendToolApproval` (non-stream) → output resume via langganan, tanpa error urutan
 *   `tool_result must be preceded by a tool_call` (G8).
 *
 * Memory = SoT pesan: klien hanya kirim pesan BARU; `resource` di-override server
 * (`mapUserToResourceId`). Status diturunkan dari chunk di reducer (sumber kebenaran tunggal).
 */
export function useMastraAgent(opts: {
  threadId: string;
  seedMessages?: TimelineMessage[];
  /** Tier TERSIMPAN thread (`chat_threads.agent_kind`) — seed `committedAgentKind` sebelum turn
   * pertama supaya langganan + regenerate/approval menunjuk channel agent yang benar saat membuka
   * thread Pro / refresh di tengah turn Pro. `undefined`/baru → "lite". */
  initialAgentKind?: AgentKind;
}): MastraAgent {
  const client = useMastraClient();
  const { userId } = useAuth();
  const qc = useQueryClient();

  const [state, setState] = useState<MastraTimelineState>(() =>
    initialMastraTimeline(opts.seedMessages ?? []),
  );

  const clientRef = useRef(client);
  clientRef.current = client;
  const subRef = useRef<ThreadSubscription | null>(null);
  const deepRunRef = useRef<DeepRun | null>(null);
  const statusRef = useRef(state.status);
  statusRef.current = state.status;

  // Tier agen yang sedang DIJALANKAN (bukan pilihan composer yang masih pending). Di-commit HANYA saat
  // sebuah turn benar-benar dimulai (send/sendDeep) → langganan thread menunjuk agent yang benar tanpa
  // ter-tear-down saat user sekadar menggeser selektor di tengah stream. `ref` untuk baca sinkron di
  // respond/regenerate; `state` untuk men-trigger ulang effect langganan. Turn berurutan (guard
  // `statusRef`) → satu agent aktif pada satu waktu; buffer di-replay dari index 0 menutup race re-subscribe.
  // Tier yang sedang DIJALANKAN = tier turn yang sudah dikirim sesi ini (`sentKind`); kalau belum ada
  // → tier TERSIMPAN thread (`initialAgentKind`, resolve async dari useThread di surface). Derivasi
  // sederhana — sejajar `override ?? threadDefault` di `useComposerAgentSelection`: sebelum kirim,
  // langganan mengikuti tier thread (re-attach turn Pro yang berjalan saat refresh); setelah kirim,
  // mengikuti turn aktif (tak ter-clobber saat tier thread baru resolve).
  const initialAgentKind: AgentKind = opts.initialAgentKind ?? "lite";
  const [sentKind, setSentKind] = useState<AgentKind | null>(null);
  const committedAgentKind = sentKind ?? initialAgentKind;
  // Mirror sinkron untuk baca di respond/regenerate (di luar render), pola sama spt stateRef/statusRef.
  const committedAgentKindRef = useRef(committedAgentKind);
  committedAgentKindRef.current = committedAgentKind;
  const commitAgentKind = useCallback((kind: AgentKind) => setSentKind(kind), []);
  const stateRef = useRef(state);
  stateRef.current = state;
  // Dedup sinyal `request_document_edit` per tool-call. Langganan thread tunggal me-REPLAY buffer
  // dari index 0 tiap reconnect (refresh / blip / ganti agentKind) → chunk tool-result yang SAMA bisa
  // tiba berkali-kali; tanpa guard ini tiap replay memicu ulang AI editor + men-debit `doc_ai_edit`
  // lagi. Key = toolCallId (fallback artifactId::instruction bila absen).
  const publishedDocEditKeysRef = useRef<Set<string>>(new Set());

  const onChunk = useCallback((chunk: unknown) => {
    setState((s) => reduceMastraChunk(s, chunk as MastraChunk));
    // Sinyal `request_document_edit` (Fase 3.5) → picu AI editor dokumen terbuka via bus event
    // (editor reader artifact = satu React tree dengan chat). Editor yang artifactId-nya cocok
    // memanggil `invokeAI` → diff Accept/Reject; bila tak ada editor cocok, no-op (bisa diperluas
    // jadi affordance "buka dokumen").
    const c = chunk as MastraChunk;
    if (c?.type === "tool-result" || c?.type === "tool-output") {
      const payload = c.payload ?? {};
      if (payload.toolName === "request_document_edit") {
        const result = (payload.result ?? payload.output) as
          | { ok?: unknown; artifactId?: unknown; instruction?: unknown }
          | undefined;
        const artifactId = typeof result?.artifactId === "string" ? result.artifactId : null;
        const instruction = typeof result?.instruction === "string" ? result.instruction : null;
        if (result?.ok === true && artifactId && instruction) {
          const toolCallId = typeof payload.toolCallId === "string" ? payload.toolCallId : null;
          const dedupeKey = toolCallId ?? `${artifactId}::${instruction}`;
          if (!publishedDocEditKeysRef.current.has(dedupeKey)) {
            publishedDocEditKeysRef.current.add(dedupeKey);
            documentEditBus.publish({ artifactId, instruction });
          }
        }
      }
    }
  }, []);

  // Langganan thread tunggal & panjang. Self-healing: subscribe awal bisa gagal untuk thread baru
  // (belum ada di server) → retry tiap 1 dtk sampai `sendMessage` pertama membuatnya; buffer di-replay
  // dari index 0 saat tersambung → tak ada chunk yang hilang.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const loop = async () => {
      while (!cancelled) {
        try {
          const agent = clientRef.current.getAgent(agentIdFor(committedAgentKind));
          const sub = (await agent.subscribeToThread({
            threadId: opts.threadId,
            resourceId: userId,
          })) as unknown as ThreadSubscription;
          if (cancelled) {
            sub.unsubscribe();
            return;
          }
          subRef.current = sub;
          await sub.processDataStream({ onChunk, reconnect: true });
          if (cancelled) return;
          await delay(1000); // langganan berakhir tak terduga → tunggu lalu ulang
        } catch {
          if (cancelled) return;
          await delay(1000); // subscribe awal gagal (thread belum ada) → retry
        }
      }
    };
    void loop();
    return () => {
      cancelled = true;
      subRef.current?.unsubscribe();
      subRef.current = null;
    };
  }, [opts.threadId, userId, onChunk, committedAgentKind]);

  // Sidebar (judul/preview) + send-status di-refresh saat turn beralih streaming→ready.
  const prevStatusRef = useRef(state.status);
  useEffect(() => {
    if (prevStatusRef.current !== "ready" && state.status === "ready") {
      void qc.invalidateQueries({ queryKey: queryKeys.threads.all });
    }
    prevStatusRef.current = state.status;
  }, [state.status, qc]);

  const send = useCallback(
    async (
      text: string,
      clientContext?: string[],
      richText?: string,
      attachmentIds?: string[],
      agentKind: AgentKind = "lite",
    ) => {
      if (!text.trim() || !userId || statusRef.current !== "ready") return;
      // Commit tier turn ini → langganan thread berpindah ke agent yang sama (Pro mengalir di channel
      // `astra-pro`). Turn berurutan → aman; buffer replay menutup race re-subscribe.
      commitAgentKind(agentKind);
      const turnSeed = `${opts.threadId}:${Date.now()}`;
      // `richText` = `text` + penanda `@mention` (U+E000/E001) untuk DITAMPILKAN & DIPERSIST sebagai
      // pill. Agen (LLM) tak melihat penanda: `stripMentionMarkersProcessor` (input) men-strip-nya
      // tiap giliran. Tanpa mention, `richText` undefined → pakai `text` apa adanya.
      const display = richText ?? text;
      setState((s) => startAssistantTurn(s, display, turnSeed, attachmentIds));
      try {
        const agent = clientRef.current.getAgent(agentIdFor(agentKind));
        // `clientContext` (ekspansi command + catatan @mention) = konteks EPHEMERAL per-call (tak
        // dipersist ke memory thread), pindah ke `ifIdle.streamOptions.context` (parity eve).
        await agent.sendMessage({
          message: display,
          resourceId: userId,
          threadId: opts.threadId,
          ...(clientContext && clientContext.length > 0
            ? {
                ifIdle: {
                  streamOptions: {
                    context: clientContext.map((c) => ({ role: "user" as const, content: c })),
                  },
                },
              }
            : {}),
        });
      } catch (err) {
        setState((s) => ({
          ...settleAssistantTurn(s),
          error: readableApiErrorMessage(err, "Gagal mengirim pesan."),
        }));
      }
    },
    [opts.threadId, userId, commitAgentKind],
  );

  const respond = useCallback(
    async (toolCallId: string, approved: boolean) => {
      if (!userId) return;
      setState((s) => ({ ...s, approvals: s.approvals.filter((a) => a.toolCallId !== toolCallId) }));
      try {
        // Approval menyusul turn yang memunculkannya → agent tier yang sama (route agent-scoped).
        const agent = clientRef.current.getAgent(agentIdFor(committedAgentKindRef.current));
        await agent.sendToolApproval({
          resourceId: userId,
          threadId: opts.threadId,
          toolCallId,
          approved,
        });
      } catch (err) {
        setState((s) => ({ ...s, error: readableApiErrorMessage(err, "Gagal memproses persetujuan.") }));
      }
    },
    [opts.threadId, userId],
  );

  const approve = useCallback((toolCallId: string) => respond(toolCallId, true), [respond]);
  const decline = useCallback((toolCallId: string) => respond(toolCallId, false), [respond]);

  // ── `/deep` = Workflow `deep-research` (G2). Run terlepas dari koneksi; FE simpan runId untuk
  //    re-attach saat refresh. Plan-gate = suspend `approve-plan` → kartu → `resumeStream`. ──────
  const consumeWorkflow = useCallback(
    async (stream: ReadableStream<MastraChunk>) => {
      // `closeOnSuspend` (default) menutup stream saat plan-gate dengan chunk terminal `workflow-finish`.
      // Bedakan SUSPEND-close (run TETAP hidup untuk resume) dari finish sungguhan: bila stream ini
      // sempat suspend di `approve-plan`, JANGAN bersihkan runId/runRef — kartu rencana + `resolvePlan`
      // (resume) + re-attach saat refresh (G2/G7) bergantung padanya.
      let suspended = false;
      for await (const chunk of iterateStream(stream)) {
        setState((s) => reduceWorkflowChunk(s, chunk));
        const stepId = (chunk.payload as { id?: unknown } | undefined)?.id;
        if (chunk.type === "workflow-step-suspended" && stepId === "approve-plan") {
          suspended = true;
        }
        // Sumber terisi selagi run lanjut: setelah search-literature (subQuestionIndex + OG image
        // sudah dipersist) & assign-citations (citation_number) → refresh kartu sumber per sub-agen
        // tanpa menunggu workflow-finish.
        if (
          chunk.type === "workflow-step-result" &&
          (stepId === "search-literature" || stepId === "assign-citations")
        ) {
          void qc.invalidateQueries({ queryKey: queryKeys.threads.sources(opts.threadId) });
        }
        if (
          !suspended &&
          (chunk.type === "workflow-finish" || chunk.type === "workflow-canceled")
        ) {
          clearDeepRunId(opts.threadId);
          deepRunRef.current = null;
          // Sumber baru (citation_number) sudah dipersist → refresh panel Sumber + sidebar.
          void qc.invalidateQueries({ queryKey: queryKeys.threads.sources(opts.threadId) });
          void qc.invalidateQueries({ queryKey: queryKeys.threads.all });
        }
      }
    },
    [opts.threadId, qc],
  );

  // Saat stream `/deep` gagal/putus: pertahankan runId bila run masih HIDUP server-side (running/
  // suspended/waiting) → re-attach poll memulihkannya saat refresh (durable). Hanya clear bila run
  // tak jalan (terminal/pending) atau status tak bisa diverifikasi (default aman = clear).
  const clearDeepRunIdUnlessAlive = useCallback(
    async (runId: string | undefined) => {
      if (runId) {
        try {
          const st = (await clientRef.current.getWorkflow(DEEP_WORKFLOW_ID).runById(runId)) as unknown as {
            status?: string;
          };
          if (st.status === "running" || st.status === "suspended" || st.status === "waiting") return;
        } catch {
          /* tak bisa verifikasi → jatuh ke clear */
        }
      }
      clearDeepRunId(opts.threadId);
      deepRunRef.current = null;
    },
    [opts.threadId],
  );

  const sendDeep = useCallback(
    async (
      question: string,
      clientContext?: string[],
      richText?: string,
      attachmentIds?: string[],
      agentKind: AgentKind = "lite",
    ) => {
      if (!userId || !question.trim() || statusRef.current !== "ready") return;
      // Commit tier → respond/regenerate konsisten. (`/deep` mengalir di channel Workflow, bukan
      // channel agent, tapi commit menjaga langganan & aksi lanjutan tetap selaras.)
      commitAgentKind(agentKind);
      const turnSeed = `${opts.threadId}:${Date.now()}`;
      // Bubble user `/deep` ber-pill = `richText` (ber-marker) untuk TAMPIL + PERSIST; planner +
      // semua prompt subagen tetap pakai `question` BERSIH. `displayQuestion` hanya dipakai workflow
      // saat menyimpan pesan user ke memory (penanda di-strip server-side untuk LLM).
      const display = richText ?? question;
      setState((s) => startAssistantTurn(s, display, turnSeed, attachmentIds));
      try {
        const wf = clientRef.current.getWorkflow(DEEP_WORKFLOW_ID);
        const run = (await wf.createRun({ resourceId: userId })) as unknown as DeepRun;
        deepRunRef.current = run;
        setDeepRunId(opts.threadId, run.runId);
        const inputData: Record<string, unknown> = { question, threadId: opts.threadId, agentKind };
        if (richText && richText !== question) inputData.displayQuestion = richText;
        if (clientContext && clientContext.length > 0) inputData.context = clientContext.join("\n\n");
        const stream = await run.stream({ inputData, closeOnSuspend: true });
        await consumeWorkflow(stream);
      } catch (err) {
        // Stream gagal/putus (mis. agent hang sesaat saat fase berat) TAPI run mungkin sudah HIDUP
        // server-side → pertahankan runId supaya refresh me-resume via poll re-attach (durable).
        await clearDeepRunIdUnlessAlive(deepRunRef.current?.runId);
        setState((s) => ({
          ...settleAssistantTurn(s),
          error: readableApiErrorMessage(err, "Gagal memulai riset mendalam."),
        }));
      }
    },
    [opts.threadId, userId, consumeWorkflow, clearDeepRunIdUnlessAlive, commitAgentKind],
  );

  const resolvePlan = useCallback(
    async (approved: boolean, edits?: string) => {
      const run = deepRunRef.current;
      if (!run) {
        // Ref run hilang (mis. setelah error tak terduga) → tak bisa resume; settle bersih supaya
        // UI tak menggantung di status "streaming" tanpa jalan keluar.
        setState((s) => ({ ...settleAssistantTurn(s), planGate: undefined }));
        return;
      }
      setState((s) => ({ ...s, planGate: undefined, status: approved ? "streaming" : "ready" }));
      try {
        const stream = await run.resumeStream({
          step: "approve-plan",
          resumeData: { approved, ...(edits ? { edits } : {}) },
        });
        await consumeWorkflow(stream);
      } catch (err) {
        // Sama seperti sendDeep: bila run masih hidup server-side, pertahankan runId (durable refresh).
        await clearDeepRunIdUnlessAlive(run.runId);
        setState((s) => ({
          ...settleAssistantTurn(s),
          error: readableApiErrorMessage(err, "Gagal melanjutkan riset mendalam."),
        }));
      }
    },
    [consumeWorkflow, clearDeepRunIdUnlessAlive],
  );

  // Regenerate (G6): re-run pesan user terakhir TANPA duplikat. Buang jawaban lama dari timeline +
  // hapus pasangan [user, assistant] terakhir di memory server, lalu kirim ulang (re-add SEKALI) →
  // tak ada bubble user kembar (live maupun setelah refresh).
  // Re-attach `/deep` saat refresh: cek runId tersimpan → POLL `runById`. suspended → kartu rencana
  // lagi (G7); running/waiting/pending → seed stepper dari snapshot tiap poll (progres lanjut tampil);
  // success → seed laporan + settle; failed/canceled → settle; semua bersihkan runId saat terminal.
  // (laporan akhir juga tersimpan di history via persistReport → rehydrate normal tanpa runId.)
  useEffect(() => {
    if (!userId) return;
    const runId = getDeepRunId(opts.threadId);
    if (!runId) return;
    let cancelled = false;
    // Indikator "sedang bekerja" SEGERA (sebelum poll pertama resolve) bila turn benar-benar
    // menggantung (pesan terakhir = user, jawaban belum dipersist) → hilangkan jeda layar kosong.
    // Untuk run yang sudah selesai (history sudah memuat laporan), JANGAN tampilkan shimmer prematur.
    setState((s) => {
      if (s.status !== "ready") return s;
      const last = s.messages[s.messages.length - 1];
      return last && last.role === "user" ? { ...s, status: "submitted" } : s;
    });
    void (async () => {
      const wf = clientRef.current.getWorkflow(DEEP_WORKFLOW_ID);
      // Re-attach via POLL `runById` (BUKAN `observe()`): granularitas `/deep` = step-level (subagent
      // pakai `.generate()`, tak ada token delta), dan `observe()` Workflow tak andal me-replay
      // step yang sudah lewat (→ layar kosong) serta bisa mengirim `workflow-finish` tanpa marker
      // suspend (→ salah meng-clear runId). Poll snapshot men-seed stepper idempoten sampai
      // suspended/terminal. Re-seed memetakan ke turn ber-`turnId` yang sama (tanpa duplikat bubble).
      let errors = 0;
      let sourcesRefreshed = false;
      while (!cancelled) {
        let wfState: {
          status?: string;
          steps?: Record<
            string,
            { status?: unknown; output?: unknown; suspendPayload?: Record<string, unknown> }
          >;
        };
        try {
          wfState = (await wf.runById(runId)) as typeof wfState;
        } catch {
          if (cancelled) return;
          // Error transien (agent single-thread sempat hang saat fase berat / restart dev) → JANGAN
          // clear runId; coba lagi. Run tetap hidup server-side. Menyerah hanya setelah lama tak
          // responsif — TANPA clear runId, agar refresh berikutnya bisa re-attach lagi.
          errors += 1;
          if (errors >= 8) {
            setState((s) => settleAssistantTurn(s));
            return;
          }
          await delay(2500);
          continue;
        }
        errors = 0;
        if (cancelled) return;
        const status = wfState.status;
        const steps = wfState.steps ?? {};
        if (status === "suspended") {
          // Plan-gate (HITL): siapkan runRef untuk `resolvePlan` + tampilkan kartu rencana (G7).
          deepRunRef.current ??= (await wf.createRun({
            runId,
            resourceId: userId,
          })) as unknown as DeepRun;
          const sp = steps["approve-plan"]?.suspendPayload ?? {};
          const subQuestions = Array.isArray(sp.subQuestions)
            ? sp.subQuestions.filter((x): x is string => typeof x === "string")
            : [];
          setState((s) => ({
            ...seedWorkflowProgress(s, runId, steps),
            planGate: { plan: typeof sp.plan === "string" ? sp.plan : "", subQuestions },
          }));
          return;
        }
        if (status === "success") {
          setState((s) => settleAssistantTurn(seedWorkflowProgress(s, runId, steps)));
          clearDeepRunId(opts.threadId);
          deepRunRef.current = null;
          // Sumber baru (citation_number) + judul/preview → refresh panel Sumber & sidebar.
          void qc.invalidateQueries({ queryKey: queryKeys.threads.sources(opts.threadId) });
          void qc.invalidateQueries({ queryKey: queryKeys.threads.all });
          return;
        }
        if (status === "failed" || status === "canceled") {
          setState((s) => settleAssistantTurn(seedWorkflowProgress(s, runId, steps)));
          clearDeepRunId(opts.threadId);
          deepRunRef.current = null;
          return;
        }
        // running / waiting / pending → render progres terkini lalu poll lagi (step-level).
        setState((s) => seedWorkflowProgress(s, runId, steps));
        // Sekali, saat search-literature selesai: refresh sumber → kartu per sub-agen terisi
        // (subQuestionIndex + OG image) walau run masih lanjut ke fase berikutnya.
        if (!sourcesRefreshed && steps["search-literature"]?.status === "success") {
          sourcesRefreshed = true;
          void qc.invalidateQueries({ queryKey: queryKeys.threads.sources(opts.threadId) });
        }
        await delay(2500);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [opts.threadId, userId, qc]);

  const regenerate = useCallback(async () => {
    if (!userId || statusRef.current !== "ready") return;
    const text = lastUserText(stateRef.current.messages);
    if (!text) return;
    setState((s) => startRegenerate(s));
    try {
      // Regenerate turn terakhir di tier yang sama (route agent-scoped). Memory thread = storage
      // bersama → list/delete via id agent mana pun setara; pakai tier ter-commit demi konsistensi.
      const agentId = agentIdFor(committedAgentKindRef.current);
      const agent = clientRef.current.getAgent(agentId);
      const thread = clientRef.current.getMemoryThread({
        threadId: opts.threadId,
        agentId,
      });
      // Hapus pasangan [user, assistant] lama DULU lalu kirim ulang → generasi baru berjalan atas
      // history yang BERSIH (tanpa Q&A lama yang mencemari konteks) + tak ada bubble user kembar.
      // (Urutan kirim-dulu-baru-hapus akan menutup celah kehilangan-data sempit bila kirim gagal, TAPI
      // membuat setiap regenerate melihat turn lama di konteks → regresi jalur-umum. Perbaikan tuntas =
      // endpoint regenerate atomik sisi-server; di luar cakupan FE ini.)
      const res = await thread.listMessages();
      const staleIds = lastTurnMessageIds((res.messages ?? []) as ServerMessageLike[]);
      if (staleIds.length > 0) await thread.deleteMessages(staleIds);
      await agent.sendMessage({ message: text, resourceId: userId, threadId: opts.threadId });
    } catch (err) {
      setState((s) => ({
        ...settleAssistantTurn(s),
        error: readableApiErrorMessage(err, "Gagal membuat ulang jawaban."),
      }));
    }
  }, [opts.threadId, userId]);

  const stop = useCallback(() => {
    // Cancel run server-side; server kirim chunk `abort` → reducer men-settle bersih (tanpa AbortError).
    void subRef.current?.abort().catch(() => {});
    setState((s) => settleAssistantTurn(s));
  }, []);

  return {
    status: state.status,
    messages: state.messages,
    approvals: state.approvals,
    planGate: state.planGate ?? null,
    error: state.error ? { message: state.error } : null,
    send,
    sendDeep,
    resolvePlan,
    regenerate,
    approve,
    decline,
    stop,
  };
}
