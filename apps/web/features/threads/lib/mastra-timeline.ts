import type { AskQuestion } from "@aqsha/chat-core";
import { normalizeAskQuestions } from "@aqsha/chat-core";
import { toCards } from "./source-card";
import type {
  ArtifactCardModel,
  DeepStepDetail,
  DeepSubSearch,
  TimelineMessage,
  TimelinePart,
  ToolRow,
  ToolRowModel,
  ToolStatus,
} from "./timeline-types";

/**
 * Adapter chunk Mastra (`@mastra/client-js` `processDataStream` onChunk) → `TimelineMessage[]`
 * yang dipakai komponen existing (MessageList/ToolRow/ChatArtifactCard). Pure reducer: satu
 * `reduceMastraChunk(state, chunk)` per chunk.
 *
 * Tipe presentasi diimpor dari `timeline-types` (netral runtime); helper kecil
 * (title/scalar/desc) hidup di file ini supaya adapter self-contained.
 */

/** Chunk Mastra (subset yang dipakai). `payload` bervariasi per `type`. */
export type MastraChunk = { type: string; runId?: string; payload?: Record<string, unknown> };

/** HITL approval (tool `requireApproval`, mis. delete_artifact) — chunk `tool-call-approval`. */
export type MastraApproval = {
  toolCallId: string;
  toolName: string;
  title: string;
  args: Record<string, unknown>;
};

/** Status turn — diturunkan dari chunk (durable-thread: satu langganan panjang, banyak run). */
export type MastraStatus = "ready" | "submitted" | "streaming";

/** Plan-gate `/deep` (Workflow suspended di step `approve-plan`) → kartu rencana Setujui/Tolak. */
export type MastraPlanGate = { plan: string; subQuestions: string[] };

/**
 * Ask-gate (HITL klarifikasi `ask_questions`) — dirender sebagai kartu Questions di atas composer.
 * `source:"tool"` = chat (tool suspend; resume by `toolCallId`); `source:"workflow"` = `/deep` step
 * `clarify` (resume by `runId` + step "clarify").
 */
export type MastraAskGate = {
  source: "tool" | "workflow";
  questions: AskQuestion[];
  /** toolCallId — jalur chat (resume via sendToolApproval/resumeStream). */
  toolCallId?: string;
  /** runId — jalur `/deep` (resume via run.resumeStream); juga fallback jalur chat. */
  runId?: string;
};

export type MastraTimelineState = {
  messages: TimelineMessage[];
  approvals: MastraApproval[];
  /** Plan-gate `/deep` aktif (Workflow suspended) — dirender sebagai kartu di atas composer. */
  planGate?: MastraPlanGate;
  /** Ask-gate (klarifikasi) aktif — dirender sebagai kartu Questions di atas composer + panel kanan. */
  askGate?: MastraAskGate;
  /** Run terakhir terlihat (dipakai memanggil approval bila perlu). */
  runId?: string;
  /** Run yang sedang menghasilkan output (status=streaming). */
  activeRunId?: string;
  /** Status turn aktif — sumber kebenaran tunggal untuk busy/Stop di FE. */
  status: MastraStatus;
  error?: string;
};

export function initialMastraTimeline(seed: TimelineMessage[] = []): MastraTimelineState {
  return { messages: seed, approvals: [], status: "ready" };
}

/** Pesan dari client-js memory-thread (`MastraDBMessage[]`). */
type MastraDBMessageLike = {
  id: string;
  role?: string;
  /** Kolom `type` Mastra: `"user"` utk input user (durable-thread = signal), `"v2"` utk assistant. */
  type?: string;
  /** Epoch-ms / ISO / Date pembuatan pesan (kolom `mastra_messages.createdAt`). */
  createdAt?: unknown;
  content?: {
    parts?: Array<Record<string, unknown>>;
    content?: unknown;
    reasoning?: unknown;
    metadata?: Record<string, unknown>;
  };
};

/** Normalisasi epoch-ms dari number | ISO-string | Date. 0 bila tak terbaca. */
function toEpochMs(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const t = Date.parse(v);
    if (Number.isFinite(t)) return t;
  }
  if (v instanceof Date) {
    const t = v.getTime();
    if (Number.isFinite(t)) return t;
  }
  return 0;
}

/** createdAt pesan: kolom top-level → part pertama bertanggal → `signal.acceptedAt/createdAt` → 0. */
function messageCreatedAt(m: MastraDBMessageLike): number {
  const top = toEpochMs(m.createdAt);
  if (top) return top;
  for (const p of m.content?.parts ?? []) {
    const t = toEpochMs(p.createdAt);
    if (t) return t;
  }
  const signal = m.content?.metadata?.signal as { acceptedAt?: unknown; createdAt?: unknown } | undefined;
  return toEpochMs(signal?.acceptedAt) || toEpochMs(signal?.createdAt);
}

/**
 * Pesan user? Durable-thread `sendMessage` menyimpan input user sebagai SIGNAL
 * (`role:"signal"`, `type:"user"`, `content.metadata.signal.type:"user"`) — BUKAN `role:"user"`.
 * `/deep` (persistReport) menyimpannya sebagai `role:"user"` biasa. Cocokkan keduanya supaya bubble
 * user tetap di sisi kanan setelah refresh (tanpa ini, signal user → di-render sebagai assistant).
 */
function isUserDbMessage(m: MastraDBMessageLike): boolean {
  if (m.role === "user") return true;
  if (m.role === "assistant") return false;
  const signal = m.content?.metadata?.signal as { type?: unknown } | undefined;
  return m.type === "user" || str(signal?.type) === "user";
}

/**
 * Teks reasoning dari satu part persisted. OpenAI Responses API menulis ringkasan penalaran ke
 * `details[].text` (UI-message v4 `ReasoningUIPart`), sementara field agregat `reasoning`/`text`
 * KOSONG — jadi tanpa fallback `details`, blok reasoning hilang saat refresh. Urutan: `text`/
 * `reasoning` (jalur deep yg kita persist sendiri mengisi `reasoning`) → rakit dari `details`.
 */
function reasoningPartText(p: Record<string, unknown>): string {
  const direct = str(p.text) || str(p.reasoning);
  if (direct.trim()) return direct;
  const details = p.details;
  if (!Array.isArray(details)) return "";
  return details
    .map((d) =>
      d && typeof d === "object" && str((d as Record<string, unknown>).type) === "text"
        ? str((d as Record<string, unknown>).text)
        : "",
    )
    .filter(Boolean)
    .join("\n\n");
}

/** Bentuk persist `tool-invocation` di `mastra_messages.content.parts` (UI-message v2). */
type ToolInvocationLike = {
  state?: unknown;
  toolCallId?: unknown;
  toolName?: unknown;
  args?: unknown;
  result?: unknown;
};

/**
 * History thread Mastra (`getMemoryThread().listMessages()` → `MastraDBMessage[]`) →
 * `TimelineMessage[]` seed. Rekonstruksi part TERURUT: teks, reasoning, DAN tool/artifact
 * (`tool-invocation`) — supaya kartu artefak + jejak proses tetap muncul setelah refresh (G7),
 * konsisten dengan tampilan live.
 */
export function mastraMessagesToTimeline(messages: readonly MastraDBMessageLike[]): TimelineMessage[] {
  return messages.map((m) => {
    const parts: TimelinePart[] = [];
    const raw = m.content?.parts ?? [];
    raw.forEach((p, i) => {
      const type = str(p.type);
      if (type === "text") {
        const text = str(p.text);
        if (text.trim()) parts.push({ kind: "text", id: `${m.id}:t${i}`, text, streaming: false });
      } else if (type === "reasoning") {
        const text = reasoningPartText(p);
        if (text.trim()) parts.push({ kind: "reasoning", id: `${m.id}:r${i}`, text, thinking: false });
      } else if (type === "tool-invocation") {
        const inv = (p.toolInvocation ?? {}) as ToolInvocationLike;
        const toolName = str(inv.toolName);
        const toolCallId = str(inv.toolCallId) || `${m.id}:${i}`;
        // propose_artifact/execute_artifact sukses → kartu artifact (parity live).
        const artifact = artifactFromResult(toolName, toolCallId, inv.result);
        if (artifact) {
          parts.push({ kind: "artifact", id: `artifact:${toolCallId}`, model: artifact });
        } else {
          parts.push({
            kind: "tool",
            id: `tool:${toolCallId}`,
            model: toolModelFromInvocation(toolCallId, toolName, inv),
          });
        }
      }
    });
    // Fallback pesan polos (tanpa `parts`): isi `content.content`/`reasoning` string.
    if (parts.length === 0) {
      if (typeof m.content?.reasoning === "string" && m.content.reasoning.trim()) {
        parts.push({ kind: "reasoning", id: `${m.id}:r`, text: m.content.reasoning, thinking: false });
      }
      if (typeof m.content?.content === "string" && m.content.content.trim()) {
        parts.push({ kind: "text", id: `${m.id}:t`, text: m.content.content, streaming: false });
      }
    }
    // `turnId` dari metadata laporan `/deep` (`deepRunId`) → memetakan Sumber per-turn (G4).
    const deepRunId = m.content?.metadata?.deepRunId;
    // Jejak proses `/deep` (`metadata.deepProcess`) → bangun ulang langkah + detail DI DEPAN laporan
    // (process block sebelum jawaban), agar tetap muncul di riwayat & setelah refresh (G7).
    const deepProcessRaw = m.content?.metadata?.deepProcess;
    const deepProcessObj =
      deepProcessRaw && typeof deepProcessRaw === "object" && !Array.isArray(deepProcessRaw)
        ? (deepProcessRaw as Record<string, unknown>)
        : undefined;
    const deepParts = deepProcessObj ? deepProcessParts(deepProcessObj) : [];
    // Sumber bernomor laporan (`deepProcess.sources`, format tool `{ n, title, url, … }`) → fallback
    // DB-independen untuk pill `[n]` + panel "Sumber" bila fetch `research_sources` live meleset (G4 robust).
    const reportSources = deepProcessObj ? toCards(deepProcessObj.sources) : [];
    return {
      id: m.id,
      role: isUserDbMessage(m) ? "user" : "assistant",
      streaming: false,
      createdAt: messageCreatedAt(m),
      ...(typeof deepRunId === "string" && deepRunId ? { turnId: deepRunId } : {}),
      ...(reportSources.length > 0 ? { reportSources } : {}),
      parts: deepParts.length > 0 ? [...deepParts, ...parts] : parts,
    };
  });
}

/** ToolRowModel dari `tool-invocation` terpersist (rehydrate). `state==='result'` = selesai. */
function toolModelFromInvocation(
  toolCallId: string,
  toolName: string,
  inv: ToolInvocationLike,
): ToolRowModel {
  const completed = inv.state === "result";
  const rows: ToolRow[] = [];
  appendScalarRows(rows, inv.args, "input");
  if (completed) appendScalarRows(rows, inv.result, "output");
  const detail = completed ? searchFlatDetail(toolName, inv.result) : undefined;
  return {
    toolCallId,
    name: toolName,
    title: toolTitle(toolName),
    kind: "tool-call",
    status: completed ? "completed" : "running",
    isRunning: !completed,
    description: completed ? describeOutput(inv.result) : undefined,
    rows,
    ...(detail ? { detail } : {}),
  };
}

/** Buat pesan user optimistik + pesan assistant kosong (streaming) untuk turn baru. */
export function startAssistantTurn(
  state: MastraTimelineState,
  userText: string,
  turnSeed: string,
  attachmentIds?: string[],
): MastraTimelineState {
  const now = Date.now();
  const userMsg: TimelineMessage = {
    id: `${turnSeed}:user`,
    role: "user",
    streaming: false,
    createdAt: now,
    // Lampiran yang dikirim turn ini → ditampilkan EKSAK pada bubble live (tanpa tebak jendela waktu).
    ...(attachmentIds && attachmentIds.length > 0 ? { attachmentIds } : {}),
    parts: [{ kind: "text", id: `${turnSeed}:user:t`, text: userText, streaming: false }],
  };
  const assistantMsg: TimelineMessage = {
    id: `${turnSeed}:assistant`,
    role: "assistant",
    streaming: true,
    createdAt: now,
    parts: [],
  };
  return {
    ...state,
    messages: [...state.messages, userMsg, assistantMsg],
    status: "submitted",
    error: undefined,
  };
}

/** Tandai turn assistant aktif selesai streaming + kembalikan status (kecuali approval menggantung). */
export function settleAssistantTurn(state: MastraTimelineState): MastraTimelineState {
  const idx = lastStreamingAssistantIndex(state.messages);
  const messages =
    idx < 0 ? state.messages : state.messages.map((m, i) => (i === idx ? { ...m, streaming: false } : m));
  // HITL menggantung (approval / ask-gate) → pertahankan status (turn menunggu user), jangan "ready".
  const status: MastraStatus =
    state.approvals.length > 0 || state.askGate ? state.status : "ready";
  return { ...state, messages, status, activeRunId: undefined };
}

/**
 * Apakah pesan asisten terakhir sudah memuat TEKS jawaban non-kosong? Pembeda `error` chunk (FE-6):
 * ada teks → jawaban kemungkinan TERPOTONG (settle + banner "mungkin terpotong", retry via Buat
 * ulang); belum ada teks (baru tool-call/reasoning) → user belum dapat jawaban sama sekali →
 * banner error penuh. Tool-row saja TIDAK dihitung output — dulu 1 tool-row cukup membuat error
 * di-settle senyap, user tak pernah tahu turn-nya gagal.
 */
function lastAssistantHasAnswerText(state: MastraTimelineState): boolean {
  const last = state.messages.findLast((m) => m.role === "assistant");
  if (!last) return false;
  return last.parts.some((p) => p.kind === "text" && p.text.trim().length > 0);
}

/**
 * Buang pasangan [user, assistant] TERAKHIR dari timeline lokal — dipakai regenerate `/deep` (FE-8):
 * `sendDeep` menambah ulang bubble user + placeholder-nya sendiri, jadi keduanya harus hilang dulu
 * (beda dari `startRegenerate` yang mempertahankan bubble user untuk jalur chat).
 */
export function dropLastTurn(state: MastraTimelineState): MastraTimelineState {
  let lastAssistant = -1;
  for (let i = state.messages.length - 1; i >= 0; i -= 1) {
    if (state.messages[i]!.role === "assistant") {
      lastAssistant = i;
      break;
    }
  }
  if (lastAssistant < 0) return state;
  // Awal turn = pesan non-assistant beruntun tepat sebelum assistant terakhir (role user/signal).
  let start = lastAssistant;
  while (start > 0 && state.messages[start - 1]!.role !== "assistant") start -= 1;
  return { ...state, messages: state.messages.slice(0, start), error: undefined };
}

/**
 * Mulai regenerate (G6): buang pesan assistant terakhir (jawaban lama) lalu tambah placeholder
 * assistant streaming baru — TANPA menambah bubble user duplikat (pertahankan pesan user terakhir).
 */
export function startRegenerate(state: MastraTimelineState): MastraTimelineState {
  const messages = [...state.messages];
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.role === "assistant") {
      messages.splice(i, 1);
      break;
    }
  }
  messages.push({
    id: `regen:${messages.length}:${Date.now()}`,
    role: "assistant",
    streaming: true,
    createdAt: Date.now(),
    parts: [],
  });
  return { ...state, messages, status: "submitted", error: undefined };
}

function lastStreamingAssistantIndex(messages: TimelineMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role === "assistant" && m.streaming) return i;
  }
  return -1;
}

/**
 * Pastikan ada pesan assistant streaming aktif untuk menerima chunk. Pada kirim optimistik,
 * `startAssistantTurn` sudah membuatnya. Pada RESUME saat refresh (langganan me-replay buffer run
 * in-flight tanpa kirim optimistik), pesan terakhir = bubble user / turn lama yang sudah settle →
 * buat placeholder baru. Mengembalikan [state, index].
 */
function ensureActiveAssistant(state: MastraTimelineState): [MastraTimelineState, number] {
  const idx = lastStreamingAssistantIndex(state.messages);
  if (idx >= 0) return [state, idx];
  const assistant: TimelineMessage = {
    id: `resume:${state.runId ?? state.messages.length}:assistant`,
    role: "assistant",
    streaming: true,
    createdAt: Date.now(),
    parts: [],
  };
  const messages = [...state.messages, assistant];
  return [{ ...state, messages }, messages.length - 1];
}

/**
 * Reduksi satu chunk Mastra ke state timeline. Immutable (aman untuk React state).
 *
 * Durable-thread: satu langganan `subscribeToThread` panjang menerima banyak run (chunk membawa
 * `runId`). Status diturunkan dari chunk di sini (bukan per-promise di hook): `start`→streaming,
 * `finish`(reason≠tool-calls)/`abort`→ready. `ensureActiveAssistant` membuat placeholder saat
 * RESUME refresh (buffer run in-flight di-replay tanpa kirim optimistik).
 */
export function reduceMastraChunk(
  state: MastraTimelineState,
  chunk: MastraChunk,
): MastraTimelineState {
  const payload = chunk.payload ?? {};

  switch (chunk.type) {
    case "start":
    case "step-start": {
      const withRun: MastraTimelineState = {
        ...state,
        status: "streaming",
        ...(chunk.runId ? { runId: chunk.runId, activeRunId: chunk.runId } : {}),
      };
      const [next] = ensureActiveAssistant(withRun);
      return next;
    }

    case "text-start": {
      const [s, idx] = ensureActiveAssistant(streaming(state));
      return upsertPart(s, idx, textPart(strId(payload.id), ""), true);
    }
    case "text-delta": {
      const [s, idx] = ensureActiveAssistant(streaming(state));
      return appendText(s, idx, "text", strId(payload.id), str(payload.text));
    }

    case "reasoning-start": {
      const [s, idx] = ensureActiveAssistant(streaming(state));
      return upsertPart(s, idx, reasoningPart(strId(payload.id), ""), true);
    }
    case "reasoning-delta": {
      const [s, idx] = ensureActiveAssistant(streaming(state));
      return appendText(s, idx, "reasoning", strId(payload.id), str(payload.text));
    }
    case "reasoning-end": {
      const [s, idx] = ensureActiveAssistant(streaming(state));
      return setReasoningThinking(s, idx, strId(payload.id), false);
    }

    case "tool-call-input-streaming-start":
    case "tool-call": {
      const [s, idx] = ensureActiveAssistant(streaming(state));
      return upsertToolPart(s, idx, {
        toolCallId: str(payload.toolCallId),
        toolName: str(payload.toolName),
        args: asRecord(payload.args),
        status: "running",
      });
    }

    case "tool-result":
    case "tool-output": {
      const [s0, idx] = ensureActiveAssistant(state);
      const toolCallId = str(payload.toolCallId);
      // ask_questions selesai (tool-suspend di-resume) → gate SUDAH terjawab; bersihkan agar tak
      // muncul lagi saat langganan tunggal me-replay buffer dari index 0 (reconnect / refresh /
      // ganti agentKind). Tanpa ini, `tool-call-suspended` yang di-replay men-set ulang askGate dan
      // `finish` mempertahankannya (via settleAssistantTurn) → kartu Klarifikasi terjawab nongol lagi
      // & composer macet menunggu. (Guard sejajar `publishedDocEditKeysRef` untuk request_document_edit.)
      const s =
        toolCallId && s0.askGate?.toolCallId === toolCallId ? { ...s0, askGate: undefined } : s0;
      const toolName = str(payload.toolName);
      const result = payload.result ?? payload.output;
      // propose_artifact sukses → render sebagai kartu artifact, bukan tool-row generik.
      const artifact = artifactFromResult(toolName, toolCallId, result);
      if (artifact) return replaceWithArtifact(s, idx, artifact);
      return completeToolPart(s, idx, toolCallId, result, payload.isError === true);
    }
    case "tool-error": {
      const [s, idx] = ensureActiveAssistant(state);
      return completeToolPart(s, idx, str(payload.toolCallId), undefined, true);
    }

    case "tool-call-approval":
      return {
        ...state,
        approvals: upsertApproval(state.approvals, {
          toolCallId: str(payload.toolCallId),
          toolName: str(payload.toolName),
          title: toolTitle(str(payload.toolName)),
          args: asRecord(payload.args),
        }),
      };

    case "tool-call-suspended": {
      // ask_questions men-suspend turn → kartu Questions (payload.suspendPayload.questions). Tool
      // lain tak dipakai di jalur ini; payload tanpa `questions` diabaikan (defensif).
      const sp = asRecord(payload.suspendPayload);
      const questions = normalizeAskQuestions(sp.questions);
      if (questions.length === 0) return state;
      const [s, idx] = ensureActiveAssistant(streaming(state));
      const toolCallId = str(payload.toolCallId);
      const withPending = setToolPending(s, idx, toolCallId);
      return {
        ...withPending,
        askGate: {
          source: "tool",
          questions,
          ...(toolCallId ? { toolCallId } : {}),
          ...(chunk.runId ? { runId: chunk.runId } : {}),
        },
      };
    }

    case "finish": {
      // Finish terminal: reason≠tool-calls → turn selesai. reason=tool-calls = masih ada langkah/
      // approval menggantung → biarkan streaming (chunk berikutnya menyusul / menunggu user).
      const reason = finishReason(payload);
      if (reason === "tool-calls") return state;
      return settleAssistantTurn(state);
    }

    case "abort":
      // Stop bersih (server cancel via abortThread) → settle, tanpa error. (G5)
      return settleAssistantTurn(state);

    case "error":
      // FE-6: bedakan error-ekor berdasarkan ada/tidaknya TEKS jawaban. Sudah ada teks → provider
      // mati mid-jawaban: settle + banner "mungkin terpotong" supaya user tahu bisa retry (dulu
      // di-settle senyap → setengah jawaban tampak lengkap). Belum ada teks (baru tool-call/
      // reasoning) → turn gagal tanpa jawaban: banner error penuh.
      if (lastAssistantHasAnswerText(state)) {
        return {
          ...settleAssistantTurn(state),
          error:
            "Jawaban terhenti sebelum selesai dan mungkin terpotong. Gunakan \"Buat ulang\" untuk mencoba lagi.",
        };
      }
      return { ...settleAssistantTurn(state), error: extractError(payload.error) };
    case "tripwire":
      return {
        ...settleAssistantTurn(state),
        error: str(payload.reason) || "Permintaan diblokir (kuota/kebijakan).",
      };

    default:
      return state; // step-finish/source/lifecycle lain → tak mempengaruhi timeline
  }
}

/**
 * Settle turn Workflow BY `runId` (FE-7): `settleAssistantTurn` menyasar last-streaming-by-POSITION,
 * jadi `workflow-finish` yang telat (reject-plan → kirim pesan baru cepat) bisa men-settle placeholder
 * turn BARU → ghost bubble kosong. Di sini sasar pesan ber-`turnId === runId` (di-tag saat
 * `workflow-start`/seed); status hanya kembali "ready" bila tak ada turn lain yang masih streaming.
 */
export function settleWorkflowTurn(
  state: MastraTimelineState,
  runId: string | undefined,
): MastraTimelineState {
  if (!runId) return settleAssistantTurn(state);
  const tagged = state.messages.some((m) => m.role === "assistant" && m.turnId === runId);
  if (!tagged) {
    // Run tak pernah men-tag turn (chunk terminal tiba sebelum workflow-start terlihat). Fallback
    // positional hanya bila tak ada run LAIN yang aktif — kalau ada, jangan sentuh turn miliknya.
    return state.activeRunId && state.activeRunId !== runId ? state : settleAssistantTurn(state);
  }
  const messages = state.messages.map((m) =>
    m.role === "assistant" && m.turnId === runId && m.streaming ? { ...m, streaming: false } : m,
  );
  const anyStreaming = messages.some((m) => m.role === "assistant" && m.streaming);
  const status: MastraStatus =
    anyStreaming || state.approvals.length > 0 || state.askGate ? state.status : "ready";
  return {
    ...state,
    messages,
    status,
    activeRunId: state.activeRunId === runId ? undefined : state.activeRunId,
  };
}

/** Set status streaming tanpa menyentuh pesan (dipakai sebelum menerapkan chunk konten). */
function streaming(state: MastraTimelineState): MastraTimelineState {
  return state.status === "streaming" ? state : { ...state, status: "streaming" };
}

/** Reason dari chunk `finish` (`payload.stepResult.reason` atau `payload.reason`). */
function finishReason(payload: Record<string, unknown>): string {
  const stepResult = payload.stepResult;
  if (stepResult && typeof stepResult === "object" && "reason" in stepResult) {
    return str((stepResult as { reason?: unknown }).reason);
  }
  return str(payload.reason);
}

// ── adapter Workflow `/deep` (G2) ──────────────────────────────────────────────
//
// Stream Workflow (`run.stream`/`resumeStream`/`observe`) memancarkan `StreamVNextChunkType`
// {type,payload,runId,from:'WORKFLOW'} STEP-LEVEL (subagent pakai `.generate()`, tak ada token
// delta). Adapter ini memetakan langkah → tool-row "Proses" + laporan akhir, terpisah dari
// `reduceMastraChunk` (chat). Laporan diambil dari `workflow-step-result` step `synthesize`
// (`workflow-finish` TAK membawa report); plan-gate dari `workflow-step-suspended` `approve-plan`.

const WF_STEP_LABELS: Record<string, string> = {
  "draft-clarify": "Menilai kebutuhan klarifikasi",
  clarify: "Menunggu klarifikasi",
  "draft-plan": "Menyusun rencana",
  "approve-plan": "Menunggu persetujuan rencana",
  "search-literature": "Menelaah literatur",
  "counter-evidence": "Mencari bukti tandingan",
  "assign-citations": "Menomori sumber",
  "verify-citations": "Memverifikasi sitasi",
  synthesize: "Menulis sintesis",
};

function wfStepLabel(stepId: string): string {
  return WF_STEP_LABELS[stepId] ?? humanizeSlug(stepId);
}

/**
 * Urutan step user-facing Workflow `/deep` (cocokkan rantai `.then()` di `deep-research.ts`).
 * Dipakai untuk menyeed stepper saat re-attach refresh. Step `input` (mapping) sengaja dilewati.
 */
const WF_STEP_ORDER = [
  "draft-plan",
  "approve-plan",
  "search-literature",
  "counter-evidence",
  "assign-citations",
  "verify-citations",
  "synthesize",
] as const;

/** Status step Mastra (`runById().steps[id].status`) → `ToolStatus` baris "Proses". */
function wfStepStatusToTool(status: string): ToolStatus {
  switch (status) {
    case "success":
      return "completed";
    case "failed":
      return "failed";
    case "suspended":
    case "waiting":
    case "paused":
      return "pending";
    default:
      return "running"; // running / pending / lainnya = sedang berjalan
  }
}

type WorkflowStepSnapshot = { status?: unknown; output?: unknown };

/**
 * Seed progres Workflow `/deep` dari snapshot `runById().steps` saat re-attach refresh fase RUNNING.
 * Tanpa ini, `observe()` hanya memancarkan chunk BARU sesudah titik observasi sehingga step yang
 * sudah lewat tak pernah dirender → layar progres kosong sampai run selesai. Membangun ulang
 * stepper (step selesai + step berjalan) dan, bila `synthesize` sudah sukses, teks laporan akhir.
 * Idempoten (key `wf:<stepId>` / `wf:report`) → aman dipanggil ulang saat rekonsiliasi terminal.
 */
export function seedWorkflowProgress(
  state: MastraTimelineState,
  runId: string,
  steps: Record<string, WorkflowStepSnapshot | WorkflowStepSnapshot[]>,
): MastraTimelineState {
  const base: MastraTimelineState = { ...state, status: "streaming", runId, activeRunId: runId };
  // Sasar turn assistant yang SUDAH ber-`turnId === runId` (poll re-seed = idempoten, tak menduplikat
  // bubble). Bila belum ada (seed pertama saat re-attach), buat placeholder lalu tandai turnId =
  // runId → memetakan Sumber per-turn (G4), konsisten dengan `workflow-start` live.
  const existing = base.messages.findIndex((m) => m.role === "assistant" && m.turnId === runId);
  let idx: number;
  let next: MastraTimelineState;
  if (existing >= 0) {
    idx = existing;
    next = base;
  } else {
    const [seeded, ai] = ensureActiveAssistant(base);
    idx = ai;
    next = { ...seeded, messages: seeded.messages.map((m, i) => (i === idx ? { ...m, turnId: runId } : m)) };
  }
  for (const stepId of WF_STEP_ORDER) {
    const raw = steps[stepId];
    if (!raw) continue;
    const sr = Array.isArray(raw) ? raw[raw.length - 1] : raw;
    const status = str(sr?.status);
    if (!status) continue;
    next = upsertWorkflowStep(next, idx, stepId, wfStepStatusToTool(status));
    // Rekonstruksi detail dari nilai return step (tersedia saat step selesai) → body expandable
    // tetap terisi setelah refresh fase RUNNING (rencana, kartu sub-agen, bukti tandingan, dll.).
    const detail = detailFromStepOutput(stepId, sr?.output);
    if (detail) next = setStepDetail(next, idx, stepId, detail);
    if (stepId === "synthesize" && status === "success") {
      const report = reportFromOutput(sr?.output);
      if (report) next = setReportText(next, idx, report);
      // Penalaran sintesis (Route B) dari nilai return step → blok reasoning tetap muncul saat
      // refresh poll fase RUNNING sebelum pesan riwayat termuat (rehydrate dari content part).
      const reasoning = reasoningFromOutput(sr?.output);
      if (reasoning) next = setDeepReasoning(next, idx, reasoning);
    }
  }
  return next;
}

export function reduceWorkflowChunk(
  state: MastraTimelineState,
  chunk: MastraChunk,
): MastraTimelineState {
  const payload = chunk.payload ?? {};
  switch (chunk.type) {
    case "workflow-start": {
      const runId = chunk.runId;
      const withRun: MastraTimelineState = {
        ...state,
        status: "streaming",
        ...(runId ? { runId, activeRunId: runId } : {}),
      };
      const [s, idx] = ensureActiveAssistant(withRun);
      // Tandai turn assistant dgn runId → memetakan Sumber per-turn live (G4).
      if (!runId) return s;
      return { ...s, messages: s.messages.map((m, i) => (i === idx ? { ...m, turnId: runId } : m)) };
    }

    case "workflow-step-start": {
      const id = str(payload.id);
      if (!id) return streaming(state);
      const [s, idx] = ensureActiveAssistant(streaming(state));
      return upsertWorkflowStep(s, idx, id, "running");
    }

    case "workflow-step-result": {
      const id = str(payload.id);
      const [s, idx] = ensureActiveAssistant(state);
      const failed = str(payload.status) === "failed";
      let next = upsertWorkflowStep(s, idx, id, failed ? "failed" : "completed");
      if (id === "synthesize") {
        const report = reportFromOutput(payload.output);
        if (report) next = setReportText(next, idx, report);
      }
      return next;
    }

    case "workflow-step-suspended": {
      const stepId = str(payload.id);
      const sp = asRecord(payload.suspendPayload);
      const [s, idx] = ensureActiveAssistant(streaming(state));
      if (stepId === "approve-plan") {
        const withStep = upsertWorkflowStep(s, idx, "approve-plan", "pending");
        return {
          ...withStep,
          planGate: { plan: str(sp.plan), subQuestions: strArray(sp.subQuestions) },
        };
      }
      if (stepId === "clarify") {
        // Klarifikasi pra-rencana (`ask_questions`) → kartu Questions, sejajar plan-gate.
        const questions = normalizeAskQuestions(sp.questions);
        if (questions.length === 0) return state;
        const withStep = upsertWorkflowStep(s, idx, "clarify", "pending");
        return {
          ...withStep,
          askGate: { source: "workflow", questions, ...(chunk.runId ? { runId: chunk.runId } : {}) },
        };
      }
      return state;
    }

    case "workflow-finish":
    case "workflow-canceled":
      // `closeOnSuspend` (default) menutup stream saat gerbang HITL dengan chunk terminal ini. Bila
      // plan-gate/ask-gate masih aktif, ini SUSPEND-close — BUKAN finish sungguhan → PERTAHANKAN
      // kartu + status streaming (tunggu keputusan user), jangan settle. `resolvePlan`/`resolveAsk`
      // yang membersihkan gate saat user memutuskan → finish berikutnya (resume) baru settle (G2).
      // FE-7: settle by runId — finish telat dari run lama tak boleh mengenai turn baru.
      if (state.planGate || state.askGate) return state;
      return settleWorkflowTurn({ ...state, planGate: undefined, askGate: undefined }, chunk.runId);

    case "workflow-step-output": {
      // Detail proses yang dipancarkan step via `writer.write` (`payload.output`, `payload.stepName`).
      // Lampirkan ke body expandable step terkait (rencana, kartu sub-agen pencarian, dll.).
      const stepId = str(payload.stepName);
      if (!stepId) return state;
      const [s, idx] = ensureActiveAssistant(streaming(state));
      // Ringkasan penalaran sintesis (Route B) → blok reasoning (mengambang ke atas, parity chat),
      // BUKAN detail step. Sisanya = detail proses biasa.
      const out = asRecord(payload.output);
      if (str(out.kind) === "reasoning") {
        const text = str(out.text);
        return text ? setDeepReasoning(s, idx, text) : s;
      }
      return applyStepOutputDetail(s, idx, stepId, payload.output);
    }

    case "error":
      // FE-7: sejajar workflow-finish — error run lama tak boleh men-settle turn baru secara posisi.
      return {
        ...settleWorkflowTurn({ ...state, planGate: undefined, askGate: undefined }, chunk.runId),
        error: extractError(payload.error),
      };

    default:
      return state; // step-progress/waiting/step-finish → diabaikan (granularitas)
  }
}

/** Tool-row "Proses" untuk satu langkah Workflow (keyed `wf:<stepId>`). */
function upsertWorkflowStep(
  state: MastraTimelineState,
  msgIdx: number,
  stepId: string,
  status: ToolStatus,
): MastraTimelineState {
  const toolCallId = `wf:${stepId}`;
  const isRunning = status === "running" || status === "pending";
  return mutateMessage(state, msgIdx, (parts) => {
    const i = parts.findIndex((p) => p.kind === "tool" && p.model.toolCallId === toolCallId);
    if (i < 0) {
      const model: ToolRowModel = {
        toolCallId,
        name: stepId,
        title: wfStepLabel(stepId),
        kind: "tool-call",
        status,
        isRunning,
        description: undefined,
        rows: [],
      };
      return [...parts, { kind: "tool", id: `tool:${toolCallId}`, model }];
    }
    return parts.map((p, j) =>
      j === i && p.kind === "tool" ? { ...p, model: { ...p.model, status, isRunning } } : p,
    );
  });
}

/** Set teks laporan akhir `/deep` (satu blok, bukan delta) sebagai jawaban (text part terakhir). */
function setReportText(
  state: MastraTimelineState,
  msgIdx: number,
  report: string,
): MastraTimelineState {
  return mutateMessage(state, msgIdx, (parts) => {
    const part: TimelinePart = { kind: "text", id: "wf:report", text: report, streaming: false };
    const i = parts.findIndex((p) => p.kind === "text" && p.id === "wf:report");
    return i < 0 ? [...parts, part] : parts.map((p, j) => (j === i ? part : p));
  });
}

/**
 * String field dari nilai return step (langsung `o[key]`, atau ter-bungkus `o.result[key]` — dua
 * bentuk yang dipancarkan Mastra). Sumber bersama untuk `report`/`reasoning` step `synthesize`.
 */
function stringFromOutput(output: unknown, key: string): string {
  if (!output || typeof output !== "object") return "";
  const o = output as Record<string, unknown>;
  if (typeof o[key] === "string") return o[key] as string;
  const r = o.result;
  if (r && typeof r === "object" && typeof (r as Record<string, unknown>)[key] === "string") {
    return (r as Record<string, unknown>)[key] as string;
  }
  return "";
}

function reportFromOutput(output: unknown): string {
  return stringFromOutput(output, "report");
}

/** Ringkasan penalaran sintesis dari nilai return step `synthesize` (`OutputSchema.reasoning`). */
function reasoningFromOutput(output: unknown): string {
  return stringFromOutput(output, "reasoning");
}

/**
 * Blok penalaran `/deep` (Route B) — satu part reasoning (id stabil `wf:reasoning`) di atas laporan,
 * dirender `<Reasoning>` yang sama dgn chat. Overwrite (bukan skip) → emit live/refresh/seed konvergen.
 */
function setDeepReasoning(
  state: MastraTimelineState,
  msgIdx: number,
  text: string,
): MastraTimelineState {
  return upsertPart(state, msgIdx, { kind: "reasoning", id: "wf:reasoning", text, thinking: false }, false);
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

// ── detail proses `/deep` (DeepStepDetail) ─────────────────────────────────────
//
// Tiga sumber detail, satu bentuk akhir (`ToolRowModel.detail`):
//   1) live — chunk `workflow-step-output` (`writer.write`) → `applyStepOutputDetail`/`mergeLiveDetail`.
//   2) refresh poll — snapshot `steps[id].output` (nilai return step) → `detailFromStepOutput`.
//   3) riwayat — `metadata.deepProcess` pesan asisten → `deepProcessParts`.
// Daftar sumber kartu search di-resolve TERPISAH dari `research_sources` (join `subQuestionIndex`).

/** ToolRowModel satu langkah Workflow (keyed `wf:<stepId>`) dengan detail opsional. */
function buildStepModel(stepId: string, status: ToolStatus, detail?: DeepStepDetail): ToolRowModel {
  return {
    toolCallId: `wf:${stepId}`,
    name: stepId,
    title: wfStepLabel(stepId),
    kind: "tool-call",
    status,
    isRunning: status === "running" || status === "pending",
    description: undefined,
    rows: [],
    ...(detail ? { detail } : {}),
  };
}

/** Upsert satu sub-pencarian (keyed `index`) lalu urut sesuai index sub-pertanyaan. */
function upsertSubSearch(list: DeepSubSearch[], sub: DeepSubSearch): DeepSubSearch[] {
  const i = list.findIndex((s) => s.index === sub.index);
  const next = i < 0 ? [...list, sub] : list.map((s, j) => (j === i ? sub : s));
  return [...next].sort((a, b) => a.index - b.index);
}

/** Gabung emit live (`workflow-step-output`) ke detail step. `prev` = detail terkumpul (akumulatif). */
function mergeLiveDetail(
  prev: DeepStepDetail | undefined,
  data: Record<string, unknown>,
): DeepStepDetail | undefined {
  switch (str(data.kind)) {
    case "plan":
      return { kind: "plan", plan: str(data.plan), subQuestions: strArray(data.subQuestions) };
    case "search-sub": {
      const liveSources = toCards(data.sources);
      const sub: DeepSubSearch = {
        index: num(data.subIndex),
        subQuestion: str(data.subQuestion),
        status: str(data.status) === "done" ? "completed" : "running",
        ...(liveSources.length > 0 ? { sources: liveSources } : {}),
      };
      const existing = prev?.kind === "search" ? prev.subSearches : [];
      return { kind: "search", subSearches: upsertSubSearch(existing, sub) };
    }
    case "counter":
    case "verify":
      return { kind: "text", text: str(data.text) };
    case "citations":
      return { kind: "citations", count: num(data.count) };
    default:
      return prev;
  }
}

/** Set/gabung `detail` ke tool-row `wf:<stepId>` (buat row bila belum ada — live aman). */
function setStepDetailWith(
  state: MastraTimelineState,
  msgIdx: number,
  stepId: string,
  fn: (prev: DeepStepDetail | undefined) => DeepStepDetail | undefined,
): MastraTimelineState {
  const toolCallId = `wf:${stepId}`;
  return mutateMessage(state, msgIdx, (parts) => {
    const i = parts.findIndex((p) => p.kind === "tool" && p.model.toolCallId === toolCallId);
    if (i < 0) {
      const detail = fn(undefined);
      return [...parts, { kind: "tool", id: `tool:${toolCallId}`, model: buildStepModel(stepId, "running", detail) }];
    }
    return parts.map((p, j) => {
      if (j !== i || p.kind !== "tool") return p;
      const detail = fn(p.model.detail);
      return { ...p, model: { ...p.model, ...(detail ? { detail } : {}) } };
    });
  });
}

/** Live: lampirkan detail dari chunk `workflow-step-output` (`payload.output`) ke step. */
function applyStepOutputDetail(
  state: MastraTimelineState,
  msgIdx: number,
  stepId: string,
  output: unknown,
): MastraTimelineState {
  const data = asRecord(output);
  return setStepDetailWith(state, msgIdx, stepId, (prev) => mergeLiveDetail(prev, data));
}

/** Set detail final (seed/rehydrate) ke step — overwrite. */
function setStepDetail(
  state: MastraTimelineState,
  msgIdx: number,
  stepId: string,
  detail: DeepStepDetail,
): MastraTimelineState {
  return setStepDetailWith(state, msgIdx, stepId, () => detail);
}

/** Jumlah sitasi unik `[n]` dari inventory bernomor (baris bisa berbagi nomor karena dedupe). */
function countInventory(inventory: string): number {
  const nums = new Set<string>();
  for (const m of inventory.matchAll(/^\[(\d+)\]/gm)) if (m[1]) nums.add(m[1]);
  return nums.size;
}

/** Refresh poll: rekonstruksi detail dari nilai RETURN step (`steps[id].output`). */
function detailFromStepOutput(stepId: string, output: unknown): DeepStepDetail | null {
  const o = asRecord(output);
  switch (stepId) {
    case "draft-plan": {
      const plan = str(o.plan);
      const subQuestions = strArray(o.subQuestions);
      return plan || subQuestions.length > 0 ? { kind: "plan", plan, subQuestions } : null;
    }
    case "search-literature": {
      const subQuestions = strArray(o.subQuestions);
      if (subQuestions.length === 0) return null;
      return {
        kind: "search",
        subSearches: subQuestions.map((q, i) => ({ index: i, subQuestion: q, status: "completed" as ToolStatus })),
      };
    }
    case "counter-evidence": {
      const text = str(o.counter);
      return text ? { kind: "text", text } : null;
    }
    case "assign-citations": {
      const inventory = str(o.numberedInventory);
      return inventory ? { kind: "citations", count: countInventory(inventory) } : null;
    }
    case "verify-citations": {
      const text = str(o.verification);
      return text ? { kind: "text", text } : null;
    }
    default:
      return null;
  }
}

/**
 * Riwayat: bangun tool-row "Proses" + detail dari `metadata.deepProcess` pesan asisten `/deep`
 * (dipersist `persistDeepReport`). Semua step = completed (laporan ada → run sukses). approve-plan
 * & synthesize sengaja dilewati (synthesize = jawaban itu sendiri).
 */
function deepProcessParts(deepProcess: Record<string, unknown>): TimelinePart[] {
  const plan = str(deepProcess.plan);
  const subQuestions = strArray(deepProcess.subQuestions);
  const counter = str(deepProcess.counter);
  const verification = str(deepProcess.verification);
  const citationCount = num(deepProcess.citationCount);
  const parts: TimelinePart[] = [];
  const push = (stepId: string, detail: DeepStepDetail) => {
    parts.push({ kind: "tool", id: `tool:wf:${stepId}`, model: buildStepModel(stepId, "completed", detail) });
  };
  if (plan || subQuestions.length > 0) push("draft-plan", { kind: "plan", plan, subQuestions });
  if (subQuestions.length > 0) {
    push("search-literature", {
      kind: "search",
      subSearches: subQuestions.map((q, i) => ({ index: i, subQuestion: q, status: "completed" as ToolStatus })),
    });
  }
  if (counter) push("counter-evidence", { kind: "text", text: counter });
  if (citationCount > 0) push("assign-citations", { kind: "citations", count: citationCount });
  if (verification) push("verify-citations", { kind: "text", text: verification });
  return parts;
}

// ── part builders ────────────────────────────────────────────────────────────

function textPart(id: string, text: string): TimelinePart {
  return { kind: "text", id, text, streaming: true };
}
function reasoningPart(id: string, text: string): TimelinePart {
  return { kind: "reasoning", id, text, thinking: true };
}

function upsertPart(
  state: MastraTimelineState,
  msgIdx: number,
  part: TimelinePart,
  skipIfExists: boolean,
): MastraTimelineState {
  return mutateMessage(state, msgIdx, (parts) => {
    const existing = parts.findIndex((p) => p.id === part.id);
    if (existing >= 0) return skipIfExists ? parts : parts.map((p, i) => (i === existing ? part : p));
    return [...parts, part];
  });
}

function appendText(
  state: MastraTimelineState,
  msgIdx: number,
  kind: "text" | "reasoning",
  id: string,
  delta: string,
): MastraTimelineState {
  return mutateMessage(state, msgIdx, (parts) => {
    const i = parts.findIndex((p) => p.id === id && p.kind === kind);
    if (i < 0) {
      const fresh = kind === "text" ? textPart(id, delta) : reasoningPart(id, delta);
      return [...parts, fresh];
    }
    return parts.map((p, j) => {
      if (j !== i) return p;
      if (p.kind === "text" || p.kind === "reasoning") return { ...p, text: p.text + delta };
      return p;
    });
  });
}

function setReasoningThinking(
  state: MastraTimelineState,
  msgIdx: number,
  id: string,
  thinking: boolean,
): MastraTimelineState {
  return mutateMessage(state, msgIdx, (parts) =>
    parts.map((p) => (p.id === id && p.kind === "reasoning" ? { ...p, thinking } : p)),
  );
}

function upsertToolPart(
  state: MastraTimelineState,
  msgIdx: number,
  input: { toolCallId: string; toolName: string; args: Record<string, unknown>; status: ToolStatus },
): MastraTimelineState {
  const model = toolModel(input.toolCallId, input.toolName, input.args, input.status);
  return mutateMessage(state, msgIdx, (parts) => {
    const i = parts.findIndex((p) => p.kind === "tool" && p.model.toolCallId === input.toolCallId);
    if (i < 0) return [...parts, { kind: "tool", id: `tool:${input.toolCallId}`, model }];
    return parts.map((p, j) =>
      j === i && p.kind === "tool" ? { ...p, model: { ...p.model, ...model } } : p,
    );
  });
}

function completeToolPart(
  state: MastraTimelineState,
  msgIdx: number,
  toolCallId: string,
  result: unknown,
  isError: boolean,
): MastraTimelineState {
  return mutateMessage(state, msgIdx, (parts) =>
    parts.map((p) => {
      if (p.kind !== "tool" || p.model.toolCallId !== toolCallId) return p;
      const rows = [...p.model.rows];
      if (!isError) appendScalarRows(rows, result, "output");
      const detail = isError ? undefined : searchFlatDetail(p.model.name, result);
      return {
        ...p,
        model: {
          ...p.model,
          status: isError ? "failed" : "completed",
          isRunning: false,
          description: isError ? p.model.description : describeOutput(result),
          rows,
          ...(detail ? { detail } : {}),
        },
      };
    }),
  );
}

function replaceWithArtifact(
  state: MastraTimelineState,
  msgIdx: number,
  artifact: ArtifactCardModel,
): MastraTimelineState {
  return mutateMessage(state, msgIdx, (parts) => {
    const without = parts.filter(
      (p) => !(p.kind === "tool" && p.model.toolCallId === artifact.toolCallId),
    );
    return [...without, { kind: "artifact", id: `artifact:${artifact.toolCallId}`, model: artifact }];
  });
}

function mutateMessage(
  state: MastraTimelineState,
  msgIdx: number,
  fn: (parts: TimelinePart[]) => TimelinePart[],
): MastraTimelineState {
  const messages = state.messages.map((m, i) =>
    i === msgIdx ? { ...m, parts: fn(m.parts) } : m,
  );
  return { ...state, messages };
}

function upsertApproval(list: MastraApproval[], a: MastraApproval): MastraApproval[] {
  if (list.some((x) => x.toolCallId === a.toolCallId)) return list;
  return [...list, a];
}

/** Set tool-row `toolCallId` ke status `pending` (menunggu user) — dipakai saat ask_questions suspend. */
function setToolPending(
  state: MastraTimelineState,
  msgIdx: number,
  toolCallId: string,
): MastraTimelineState {
  if (!toolCallId) return state;
  return mutateMessage(state, msgIdx, (parts) =>
    parts.map((p) =>
      p.kind === "tool" && p.model.toolCallId === toolCallId
        ? { ...p, model: { ...p.model, status: "pending", isRunning: true } }
        : p,
    ),
  );
}

// ── tool model + scalar helpers (self-contained, tak diimpor dari luar adapter) ──────

function toolModel(
  toolCallId: string,
  name: string,
  args: Record<string, unknown>,
  status: ToolStatus,
): ToolRowModel {
  const rows: ToolRow[] = [];
  appendScalarRows(rows, args, "input");
  return {
    toolCallId,
    name,
    title: toolTitle(name),
    kind: "tool-call",
    status,
    isRunning: status === "running",
    description: undefined,
    rows,
  };
}

function artifactFromResult(
  toolName: string,
  toolCallId: string,
  result: unknown,
): ArtifactCardModel | null {
  if (toolName !== "propose_artifact" && toolName !== "execute_artifact") return null;
  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;
  const artifactId = str(r.artifactId ?? r._id ?? r.id);
  if (!artifactId) return null;
  return {
    toolCallId,
    artifactId,
    title: str(r.title) || "Dokumen",
    artifactType: str(r.artifactType) || "markdown",
  };
}

function toScalarString(value: unknown): string | null {
  if (typeof value === "string") {
    // Nilai PENUH (tanpa potong) — pemendekan dilakukan di presentasi: baris pendek tampil polos,
    // yang panjang dipromosikan ke preview + panel step (lihat `ToolRow`), jadi teks tak jadi
    // buntu "…" yang tak terbaca.
    const cleaned = value.replace(/\s+/g, " ").trim();
    return cleaned || null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "Ya" : "Tidak";
  return null;
}

function appendScalarRows(rows: ToolRow[], value: unknown, group: "input" | "output"): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const scalar = toScalarString(raw);
    if (scalar === null) continue;
    rows.push({ key, label: humanizeKey(key), value: scalar, group });
  }
}

const COUNT_KEYS = ["resultCount", "count", "total"] as const;
const LIST_KEYS = ["results", "items", "sources", "papers", "documents", "matches"] as const;

function describeOutput(output: unknown): string | undefined {
  if (Array.isArray(output)) return `${output.length} hasil`;
  if (output && typeof output === "object") {
    const o = output as Record<string, unknown>;
    for (const k of COUNT_KEYS) if (typeof o[k] === "number") return `${o[k]} hasil`;
    for (const k of LIST_KEYS) if (Array.isArray(o[k])) return `${(o[k] as unknown[]).length} hasil`;
  }
  return undefined;
}

/** Tool riset eksternal yang hasilnya (`{results:[...]}`) jadi kartu sumber inline (chat normal). */
const SEARCH_TOOLS = new Set(["search_web", "search_arxiv", "search_papers", "lookup_doi"]);

/** Detail kartu sumber dari hasil tool `search_*` (stream/rehydrate) → body tool-row `search-flat`. */
function searchFlatDetail(toolName: string, result: unknown): DeepStepDetail | undefined {
  if (!SEARCH_TOOLS.has(toolName)) return undefined;
  const cards = toCards(asRecord(result).results);
  return cards.length > 0 ? { kind: "search-flat", sources: cards } : undefined;
}

const TOOL_LABELS: Record<string, string> = {
  search_web: "Mencari web",
  search_arxiv: "Mencari arXiv",
  lookup_doi: "Menelusuri DOI",
  search_thread_documents: "Mencari dokumen percakapan",
  list_artifacts: "Mendata artefak",
  get_artifact: "Membuka artefak",
  get_render_payload: "Memuat artefak",
  list_workspaces: "Mendata workspace",
  propose_artifact: "Menyusun artefak",
  save_url: "Menyimpan tautan",
  create_workspace: "Membuat workspace",
  rename_workspace: "Mengubah nama workspace",
  link_to_workspace: "Menautkan ke workspace",
  delete_artifact: "Menghapus artefak",
  search_papers: "Mencari paper",
  verify_citations: "Memverifikasi sitasi",
  verify_identifiers: "Memverifikasi referensi",
  ask_questions: "Menanyakan klarifikasi",
};

function toolTitle(rawName: string): string {
  return TOOL_LABELS[rawName] ?? humanizeSlug(rawName);
}

const KEY_LABELS: Record<string, string> = {
  query: "Kueri",
  doi: "DOI",
  arxivId: "arXiv",
  title: "Judul",
  name: "Nama",
  url: "URL",
  limit: "Batas",
  workspaceId: "Workspace",
  artifactId: "Artefak",
  threadId: "Percakapan",
  markdown: "Isi",
};

function humanizeKey(key: string): string {
  return KEY_LABELS[key] ?? humanizeSlug(key);
}

function humanizeSlug(slug: string): string {
  const spaced = slug
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!spaced) return slug;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// ── primitives ────────────────────────────────────────────────────────────────

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function strId(v: unknown): string {
  return typeof v === "string" && v ? v : "0";
}
function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}
function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function extractError(err: unknown): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return "Terjadi kesalahan saat memproses.";
}
