"use client";

import { type AskQuestionsResumeData, normalizeAskQuestions } from "@aqsha/chat-core";
import { useAuth } from "@clerk/nextjs";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { readableApiErrorMessage } from "@/lib/api-error";
import { documentEditBus } from "@/lib/document-edit-bus";
import { queryKeys } from "../../../lib/api-query";
import type { TimelineMessage } from "./timeline-types";
import { type AgentKind, agentIdFor, useMastraClient } from "./mastra-client";
import {
  type MastraApproval,
  type MastraAskGate,
  type MastraChunk,
  type MastraPlanGate,
  type MastraTimelineState,
  dropLastTurn,
  initialMastraTimeline,
  reduceMastraChunk,
  reduceWorkflowChunk,
  seedWorkflowProgress,
  settleAssistantTurn,
  settleWorkflowTurn,
  startAssistantTurn,
  startRegenerate,
} from "./mastra-timeline";

export type MastraAgentStatus = "ready" | "submitted" | "streaming";

export type MastraAgent = {
  status: MastraAgentStatus;
  messages: TimelineMessage[];
  approvals: MastraApproval[];
  planGate: MastraPlanGate | null;
  /** Ask-gate (klarifikasi `ask_questions`) aktif → kartu Questions; `null` bila tak ada. */
  askGate: MastraAskGate | null;
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
  /** Kirim jawaban / skip untuk kartu Questions aktif (chat tool-suspend atau /deep step clarify). */
  resolveAsk: (resume: AskQuestionsResumeData) => Promise<void>;
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
  /** Cancel run Workflow server-side (abort step berjalan + status `canceled`) — Stop `/deep` (FE-4). */
  cancel: () => Promise<unknown>;
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

/**
 * Filter dedup chunk langganan thread (FE-2). Server me-REPLAY buffer run AKTIF dari index 0 pada
 * tiap (re)connect — refresh, blip jaringan (reconnect internal client-js), dan flip
 * `committedAgentKind` lite→pro mid-run (deterministik) — sedangkan reducer `text-delta` append,
 * bukan idempoten → teks/reasoning dobel. Tak ada penanda urutan pada chunk (diverifikasi ke
 * `@mastra/core` 1.47: subscriber stream = replay parts polos + `runId` disisipkan), jadi dedup
 * pakai pencocokan PREFIX signature per-run:
 *
 * - `applied[]` = signature semua chunk run yang sudah diterapkan, berurutan; `cursor` = posisi
 *   pencocokan replay berikutnya (default = akhir → chunk baru).
 * - Chunk `start` = kandidat awal segmen: cari signature-nya di `applied` → ketemu = replay mulai
 *   dari titik itu (set cursor ke sana); tidak = segmen kelanjutan BARU (resume suspend memakai
 *   runId yang sama) → cursor ke akhir.
 * - Chunk cocok pada `applied[cursor]` → duplikat replay, SKIP; divergensi → perlakukan sebagai
 *   chunk baru (append + terapkan).
 *
 * Run terminal tak pernah di-replay lagi → jejaknya dibuang (hemat memori thread panjang).
 */
function createChunkReplayFilter(): (chunk: MastraChunk) => boolean {
  const runs = new Map<string, { applied: string[]; cursor: number }>();
  const sigOf = (chunk: MastraChunk): string => {
    try {
      return `${chunk.type}:${JSON.stringify(chunk.payload ?? null)}`;
    } catch {
      return `${chunk.type}:?`; // payload tak ter-serialize (mis. circular) → jangan pernah skip
    }
  };
  const isTerminal = (chunk: MastraChunk): boolean => {
    if (chunk.type === "abort" || chunk.type === "error") return true;
    if (chunk.type !== "finish") return false;
    const payload = chunk.payload ?? {};
    const stepResult = payload.stepResult;
    const reason =
      stepResult && typeof stepResult === "object" && "reason" in stepResult
        ? String((stepResult as { reason?: unknown }).reason ?? "")
        : String(payload.reason ?? "");
    return reason !== "tool-calls";
  };
  return (chunk) => {
    const runId = chunk.runId;
    if (!runId || !chunk.type) return true;
    let run = runs.get(runId);
    if (!run) {
      run = { applied: [], cursor: 0 };
      runs.set(runId, run);
    }
    const sig = sigOf(chunk);
    if (chunk.type === "start") {
      const idx = run.applied.indexOf(sig);
      run.cursor = idx >= 0 ? idx : run.applied.length;
    }
    if (run.cursor < run.applied.length) {
      if (run.applied[run.cursor] === sig) {
        run.cursor += 1;
        return false; // duplikat replay — sudah diterapkan
      }
      run.cursor = run.applied.length; // divergensi dari prefix → bukan replay murni
    }
    run.applied.push(sig);
    run.cursor = run.applied.length;
    if (isTerminal(chunk)) runs.delete(runId);
    return true;
  };
}

/** Banner degraded langganan (FE-12) — string konstan supaya bisa dibersihkan saat tersambung lagi. */
const SUBSCRIBE_DEGRADED_ERROR = "Koneksi ke Astra terputus. Mencoba menyambung ulang…";

/**
 * Konteks turn terakhir yang DIKIRIM sesi ini (FE-8) — regenerate memakainya supaya kualitas setara
 * turn asli: `clientContext` (hydration @mention + ekspansi slash) ikut terkirim ulang, `richText`
 * mempertahankan pill, dan turn `/deep` di-regen sebagai `/deep` (bukan downgrade ke chat biasa
 * yang menghapus report + meninggalkan `research_sources` yatim). Setelah refresh ref ini kosong →
 * fallback kirim ulang teks polos (perilaku lama).
 */
type LastSentTurn = {
  mode: "chat" | "deep";
  text: string;
  clientContext?: string[];
  richText?: string;
  attachmentIds?: string[];
  agentKind: AgentKind;
};

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
  // lagi. Key = toolCallId (fallback artifactId::instruction bila absen). Tetap dipertahankan
  // sebagai lapis kedua di bawah filter replay umum (aksi ini punya efek samping berbayar).
  const publishedDocEditKeysRef = useRef<Set<string>>(new Set());
  // FE-2: filter dedup replay per-run (lihat `createChunkReplayFilter`) — reducer `text-delta`
  // append (non-idempoten), jadi chunk replay TIDAK boleh sampai ke reducer dua kali.
  const replayFilterRef = useRef(createChunkReplayFilter());
  // FE-8: konteks turn terakhir yang dikirim sesi ini — dipakai regenerate.
  const lastSendRef = useRef<LastSentTurn | null>(null);

  const onChunk = useCallback((chunk: unknown) => {
    if (!replayFilterRef.current(chunk as MastraChunk)) return; // duplikat replay (FE-2)
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
  // dari index 0 saat tersambung → tak ada chunk yang hilang (dedup via `replayFilterRef`).
  // FE-12: kegagalan TIDAK lagi ditelan senyap selamanya — thread yang sudah punya pesan (bukan
  // thread baru pra-kirim, yang subscribe-nya memang wajar gagal) di-log dan setelah beberapa retry
  // menampilkan banner degraded; banner dibersihkan otomatis saat tersambung lagi.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let failures = 0;
    const noteFailure = (err: unknown) => {
      failures += 1;
      if (stateRef.current.messages.length === 0) return; // thread baru pra-kirim → normal, diam
      console.warn("[astra] langganan thread gagal", { attempt: failures, threadId: opts.threadId, err });
      if (failures >= 3) {
        setState((s) =>
          s.error === SUBSCRIBE_DEGRADED_ERROR ? s : { ...s, error: SUBSCRIBE_DEGRADED_ERROR },
        );
      }
    };
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
          failures = 0;
          // Tersambung (lagi) → bersihkan banner degraded bila itu yang tampil.
          setState((s) =>
            s.error === SUBSCRIBE_DEGRADED_ERROR ? { ...s, error: undefined } : s,
          );
          // `maxRetries` FINITE (bukan `reconnect:true` = Infinity): outage panjang akhirnya lolos
          // ke catch loop ini → terdeteksi degraded (FE-12), lalu loop tetap re-subscribe sendiri.
          await sub.processDataStream({ onChunk, reconnect: { maxRetries: 20, delayMs: 1000 } });
          if (cancelled) return;
          await delay(1000); // langganan berakhir tak terduga → tunggu lalu ulang
        } catch (err) {
          if (cancelled) return;
          noteFailure(err); // subscribe awal gagal (thread belum ada) ATAU stream tumbang melewati retry internal
          await delay(1000);
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
      lastSendRef.current = { mode: "chat", text, clientContext, richText, attachmentIds, agentKind };
      const turnSeed = `${opts.threadId}:${Date.now()}`;
      // `richText` = `text` + penanda `@mention` (U+E000/E001) untuk DITAMPILKAN & DIPERSIST sebagai
      // pill. Agen (LLM) tak melihat penanda: `stripMentionMarkersProcessor` (input) men-strip-nya
      // tiap giliran. Tanpa mention, `richText` undefined → pakai `text` apa adanya.
      const display = richText ?? text;
      setState((s) => startAssistantTurn(s, display, turnSeed, attachmentIds));
      try {
        const agent = clientRef.current.getAgent(agentIdFor(agentKind));
        // `clientContext` (ekspansi command + catatan @mention) = konteks EPHEMERAL per-call:
        // dikirim via `ifIdle.streamOptions.context` supaya TAK dipersist ke memory thread.
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
        if (
          chunk.type === "workflow-step-suspended" &&
          (stepId === "approve-plan" || stepId === "clarify")
        ) {
          // Suspend clarify ATAU approve-plan = run TETAP hidup untuk resume → jangan clear runId.
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

  // FE-5: pemicu ulang effect poll re-attach `/deep` TANPA menunggu refresh manual — di-bump saat
  // stream putus tapi run masih hidup server-side (blip jaringan / proxy / agent hang sesaat).
  const [reattachNonce, bumpReattach] = useReducer((n: number) => n + 1, 0);

  // Saat stream `/deep` gagal/putus: pertahankan runId bila run masih HIDUP server-side (running/
  // suspended/waiting) → re-attach poll memulihkannya (return `true`). Hanya clear bila run tak
  // jalan (terminal/pending) atau status tak bisa diverifikasi (default aman = clear, return `false`).
  const clearDeepRunIdUnlessAlive = useCallback(
    async (runId: string | undefined): Promise<boolean> => {
      if (runId) {
        try {
          const st = (await clientRef.current.getWorkflow(DEEP_WORKFLOW_ID).runById(runId)) as unknown as {
            status?: string;
          };
          if (st.status === "running" || st.status === "suspended" || st.status === "waiting") {
            return true;
          }
        } catch {
          /* tak bisa verifikasi → jatuh ke clear */
        }
      }
      clearDeepRunId(opts.threadId);
      deepRunRef.current = null;
      return false;
    },
    [opts.threadId],
  );

  // FE-5: stream `/deep` selesai TANPA chunk terminal & TANPA gerbang HITL (blip jaringan/proxy
  // menutup body tanpa error) → run masih jalan server-side; serahkan ke poll re-attach supaya
  // progres live lanjut di sesi ini, bukan baru pulih setelah refresh manual.
  const maybeReattachAfterStreamClose = useCallback((runId: string) => {
    if (deepRunRef.current?.runId !== runId) return; // terminal normal → runId sudah dibersihkan
    if (stateRef.current.planGate || stateRef.current.askGate) return; // suspend-close normal (HITL)
    bumpReattach();
  }, []);

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
      lastSendRef.current = {
        mode: "deep",
        text: question,
        clientContext,
        richText,
        attachmentIds,
        agentKind,
      };
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
        maybeReattachAfterStreamClose(run.runId);
      } catch (err) {
        // Stream gagal/putus (mis. agent hang sesaat saat fase berat) TAPI run mungkin sudah HIDUP
        // server-side → JANGAN banner error (FE-5): poll re-attach mengambil alih progres live di
        // sesi ini. Banner hanya saat run benar-benar tak jalan.
        if (await clearDeepRunIdUnlessAlive(deepRunRef.current?.runId)) {
          bumpReattach();
          return;
        }
        setState((s) => ({
          ...settleAssistantTurn(s),
          error: readableApiErrorMessage(err, "Gagal memulai riset mendalam."),
        }));
      }
    },
    [
      opts.threadId,
      userId,
      consumeWorkflow,
      clearDeepRunIdUnlessAlive,
      maybeReattachAfterStreamClose,
      commitAgentKind,
    ],
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
        maybeReattachAfterStreamClose(run.runId);
      } catch (err) {
        // Sama seperti sendDeep (FE-5): run masih hidup server-side → poll re-attach, tanpa banner.
        if (await clearDeepRunIdUnlessAlive(run.runId)) {
          bumpReattach();
          return;
        }
        setState((s) => ({
          ...settleAssistantTurn(s),
          error: readableApiErrorMessage(err, "Gagal melanjutkan riset mendalam."),
        }));
      }
    },
    [consumeWorkflow, clearDeepRunIdUnlessAlive, maybeReattachAfterStreamClose],
  );

  const resolveAsk = useCallback(
    async (resume: AskQuestionsResumeData) => {
      const gate = stateRef.current.askGate;
      if (!gate) return;
      // Optimistik: sembunyikan kartu; tetap streaming (jawaban memicu kelanjutan turn).
      setState((s) => ({ ...s, askGate: undefined, status: "streaming" }));
      if (gate.source === "workflow") {
        // /deep step `clarify` → resume Workflow (sejajar resolvePlan). Kelanjutan via consumeWorkflow.
        const run = deepRunRef.current;
        if (!run) {
          setState((s) => ({ ...settleAssistantTurn(s), askGate: undefined }));
          return;
        }
        try {
          const stream = await run.resumeStream({
            step: "clarify",
            resumeData: resume as Record<string, unknown>,
          });
          await consumeWorkflow(stream);
          maybeReattachAfterStreamClose(run.runId);
        } catch (err) {
          // FE-5: run masih hidup server-side → poll re-attach, tanpa banner error.
          if (await clearDeepRunIdUnlessAlive(run.runId)) {
            bumpReattach();
            return;
          }
          setState((s) => ({
            ...settleAssistantTurn(s),
            error: readableApiErrorMessage(err, "Gagal melanjutkan riset mendalam."),
          }));
        }
        return;
      }
      // source === "tool" (chat): resume tool-suspend lewat `sendToolApproval` yang MEMBAWA
      // `resumeData` (non-stream, tanpa runId) → kelanjutan mengalir via langganan thread, tanpa
      // error urutan tool_result (G8), sejajar `respond()`. Bila jalur ini tak resume tool-suspend
      // di server, ganti ke `agent.resumeStream(resume, { runId, toolCallId })` (jalur kanonik docs).
      if (!userId || !gate.toolCallId) {
        // Tanpa `toolCallId` (chunk suspend tak lengkap) atau `userId`, tool tak bisa di-resume di
        // server. Jangan diam-diam telan jawaban (turn tampak selesai lokal, run tetap suspend) —
        // munculkan error supaya user tahu jawabannya tak terkirim.
        setState((s) => ({
          ...settleAssistantTurn(s),
          error: "Gagal mengirim jawaban klarifikasi (sesi tidak lengkap). Coba mulai ulang pertanyaanmu.",
        }));
        return;
      }
      try {
        const agent = clientRef.current.getAgent(agentIdFor(committedAgentKindRef.current));
        await agent.sendToolApproval({
          resourceId: userId,
          threadId: opts.threadId,
          toolCallId: gate.toolCallId,
          approved: true,
          resumeData: resume,
        });
      } catch (err) {
        setState((s) => ({
          ...settleAssistantTurn(s),
          error: readableApiErrorMessage(err, "Gagal mengirim jawaban."),
        }));
      }
    },
    [opts.threadId, userId, consumeWorkflow, clearDeepRunIdUnlessAlive, maybeReattachAfterStreamClose],
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
          // Gerbang HITL: siapkan runRef untuk resume + tampilkan kartu (G7). Bisa clarify (kartu
          // Questions) ATAU approve-plan (kartu rencana) — bedakan dari step mana yang suspended.
          deepRunRef.current ??= (await wf.createRun({
            runId,
            resourceId: userId,
          })) as unknown as DeepRun;
          const clarifyStep = steps["clarify"];
          if (clarifyStep?.status === "suspended" && clarifyStep.suspendPayload) {
            const questions = normalizeAskQuestions(clarifyStep.suspendPayload.questions);
            // Guard sejajar reducer live (`normalizeAskQuestions(...).length === 0 → return state`):
            // payload klarifikasi kosong/rusak (mestinya tak terjadi — suspend hanya saat ada
            // pertanyaan) tak boleh me-render kartu kosong tak-terjawab yang mengunci run. Seed
            // progres lalu settle (bukan spinner menggantung).
            if (questions.length === 0) {
              setState((s) => settleWorkflowTurn(seedWorkflowProgress(s, runId, steps), runId));
              return;
            }
            setState((s) => ({
              ...seedWorkflowProgress(s, runId, steps),
              askGate: { source: "workflow", questions, runId },
            }));
            return;
          }
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
          // FE-7: settle by runId — jangan positional (turn lain tak boleh ikut ter-settle).
          setState((s) => settleWorkflowTurn(seedWorkflowProgress(s, runId, steps), runId));
          clearDeepRunId(opts.threadId);
          deepRunRef.current = null;
          // Sumber baru (citation_number) + judul/preview → refresh panel Sumber & sidebar.
          void qc.invalidateQueries({ queryKey: queryKeys.threads.sources(opts.threadId) });
          void qc.invalidateQueries({ queryKey: queryKeys.threads.all });
          return;
        }
        if (status === "failed" || status === "canceled") {
          setState((s) => settleWorkflowTurn(seedWorkflowProgress(s, runId, steps), runId));
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
    // FE-5: `reattachNonce` di-bump saat stream `/deep` putus tapi run masih hidup → effect re-run,
    // poll mengambil alih progres live tanpa menunggu refresh manual.
  }, [opts.threadId, userId, qc, reattachNonce]);

  const regenerate = useCallback(async () => {
    if (!userId || statusRef.current !== "ready") return;
    const text = lastUserText(stateRef.current.messages);
    if (!text) return;
    // FE-8: turn terakhir dikirim SESI INI (`lastSendRef`) → regen memakai konteks aslinya
    // (clientContext hydration @mention/slash + richText ber-pill) dan turn `/deep` di-regen sebagai
    // `/deep`. Teks bubble = `richText ?? text` turn asli, jadi kecocokan diperiksa terhadap itu.
    // Setelah refresh (ref kosong / turn lebih lama) → fallback kirim ulang teks polos (perilaku lama).
    const last = lastSendRef.current;
    const lastMatches = last !== null && (last.richText ?? last.text) === text;

    // Hapus pasangan [user, assistant] lama DULU lalu kirim ulang → generasi baru berjalan atas
    // history yang BERSIH (tanpa Q&A lama yang mencemari konteks) + tak ada bubble user kembar.
    // (Urutan kirim-dulu-baru-hapus akan menutup celah kehilangan-data sempit bila kirim gagal, TAPI
    // membuat setiap regenerate melihat turn lama di konteks → regresi jalur-umum. Perbaikan tuntas =
    // endpoint regenerate atomik sisi-server; di luar cakupan FE ini.)
    // Memory thread = storage bersama → list/delete via id agent mana pun setara; pakai tier
    // ter-commit demi konsistensi (route agent-scoped).
    const deleteLastServerTurn = async () => {
      const thread = clientRef.current.getMemoryThread({
        threadId: opts.threadId,
        agentId: agentIdFor(committedAgentKindRef.current),
      });
      const res = await thread.listMessages();
      const staleIds = lastTurnMessageIds((res.messages ?? []) as ServerMessageLike[]);
      if (staleIds.length > 0) await thread.deleteMessages(staleIds);
    };

    if (lastMatches && last.mode === "deep") {
      // Regen `/deep` = jalankan ulang Workflow dengan pertanyaan + konteks asli — BUKAN downgrade
      // ke chat biasa (yang menghapus report & meninggalkan `research_sources` yatim). `sendDeep`
      // menambah ulang bubble user + placeholder sendiri → buang pasangan lokal dulu.
      try {
        await deleteLastServerTurn();
      } catch (err) {
        setState((s) => ({
          ...s,
          error: readableApiErrorMessage(err, "Gagal membuat ulang jawaban."),
        }));
        return;
      }
      setState((s) => dropLastTurn(s));
      await sendDeep(last.text, last.clientContext, last.richText, last.attachmentIds, last.agentKind);
      return;
    }

    setState((s) => startRegenerate(s));
    try {
      const agent = clientRef.current.getAgent(agentIdFor(committedAgentKindRef.current));
      await deleteLastServerTurn();
      await agent.sendMessage({
        message: lastMatches ? (last.richText ?? last.text) : text,
        resourceId: userId,
        threadId: opts.threadId,
        // Konteks ephemeral turn asli ikut terkirim ulang (paritas `send`) — tanpa ini hasil regen
        // diam-diam lebih buruk (hydration @mention & ekspansi slash hilang).
        ...(lastMatches && last.clientContext && last.clientContext.length > 0
          ? {
              ifIdle: {
                streamOptions: {
                  context: last.clientContext.map((c) => ({ role: "user" as const, content: c })),
                },
              },
            }
          : {}),
      });
    } catch (err) {
      setState((s) => ({
        ...settleAssistantTurn(s),
        error: readableApiErrorMessage(err, "Gagal membuat ulang jawaban."),
      }));
    }
  }, [opts.threadId, userId, sendDeep]);

  const stop = useCallback(() => {
    const run = deepRunRef.current;
    if (run) {
      // FE-4: Stop saat `/deep` → cancel RUN WORKFLOW server-side. `subscription.abort()`
      // (`POST /agents/:id/threads/abort`) hanya membatalkan run agent chat — workflow terus jalan
      // membakar kredit sementara tombol tampak "rusak". Bersihkan runId agar poll re-attach tak
      // menghidupkan ulang turn yang sengaja dihentikan.
      void run.cancel().catch(() => {});
      clearDeepRunId(opts.threadId);
      deepRunRef.current = null;
      setState((s) => settleAssistantTurn({ ...s, planGate: undefined, askGate: undefined }));
      return;
    }
    // Chat: cancel run server-side; server kirim chunk `abort` → reducer men-settle bersih (tanpa AbortError).
    void subRef.current?.abort().catch(() => {});
    setState((s) => settleAssistantTurn(s));
  }, [opts.threadId]);

  return {
    status: state.status,
    messages: state.messages,
    approvals: state.approvals,
    planGate: state.planGate ?? null,
    askGate: state.askGate ?? null,
    error: state.error ? { message: state.error } : null,
    send,
    sendDeep,
    resolvePlan,
    resolveAsk,
    regenerate,
    approve,
    decline,
    stop,
  };
}
