// Adapter PURE (Slice 6.3) — eve `EveMessage.parts[]` → presentation model timeline.
//
// eve `defaultMessageReducer` sudah menghasilkan `parts[]` ber-state TERURUT (state
// machine per part), jadi adapter cukup mempertahankan urutan array — TIDAK perlu
// barrier per-callId (barrier hanya relevan untuk Claude Agent SDK V1 yang eager;
// eve mengurutkan part di reducer). Tak ada Convex-event shape di sini (uiRunFromRow/
// orderedPartsFromRun V1 mati di V2).
//
// Tanpa DB / tanpa service / tanpa React → murni fungsi, unit-testable (test di 6.9).
// Klasifikasi tool by `state` + `toolMetadata.eve.kind`, BUKAN daftar nama tool hardcoded.

import { defaultMessageReducer } from "eve/react";
import type {
  EveAgentReducerEvent,
  EveDynamicToolPart,
  EveMessage,
  EveMessagePart,
} from "eve/react";
import type { ChatMessage, ChatThreadEvent } from "../types";

/** Status tampil satu tool-call, dipetakan dari `EveDynamicToolPart.state`. */
export type ToolStatus = "running" | "pending" | "completed" | "failed" | "denied";

/** Satu baris scalar (allow-by-type) di body tool-row, dikelompokkan masukan/hasil. */
export type ToolRow = {
  key: string;
  label: string;
  value: string;
  group: "input" | "output";
};

/** Model presentasi satu tool-row (collapsible). Default-deny: hanya scalar yang lolos. */
export type ToolRowModel = {
  toolCallId: string;
  /** Nama tool mentah (mis. "search_web") — dipakai memilih ikon semantik. */
  name: string;
  title: string;
  kind: "tool-call" | "subagent-call" | "load-skill" | "unknown";
  status: ToolStatus;
  isRunning: boolean;
  /** Ringkasan inline (mis. "12 hasil") dari output. */
  description?: string;
  /** Body rows curated (scalar saja). Kosong → render header-only. */
  rows: ToolRow[];
};

/** Model kartu artifact (Slice 6.5) dari output `propose_artifact` yang sukses. */
export type ArtifactCardModel = {
  toolCallId: string;
  artifactId: string;
  title: string;
  artifactType: string;
};

/** Satu bagian terurut dalam timeline satu pesan asisten. */
export type TimelinePart =
  | { kind: "text"; id: string; text: string; streaming: boolean }
  | { kind: "reasoning"; id: string; text: string; thinking: boolean }
  | { kind: "tool"; id: string; model: ToolRowModel }
  | { kind: "artifact"; id: string; model: ArtifactCardModel };

/** Pesan ter-normalisasi untuk renderer (user = bubble; assistant = parts terurut). */
export type TimelineMessage = {
  id: string;
  role: "assistant" | "user";
  /** True selagi turn pesan ini masih streaming (dari `metadata.status`). */
  streaming: boolean;
  /** Runtime turn id (eve `metadata.turnId` / persisted `chat_messages.turnId`) — dipakai
   * memetakan sumber riset (`research_sources.turnId`) ke turn yang menghasilkannya. */
  turnId?: string;
  parts: TimelinePart[];
};

// ── konversi part eve ────────────────────────────────────────────────────────

function mapPart(part: EveMessagePart, id: string, active: boolean): TimelinePart | null {
  switch (part.type) {
    case "text": {
      const text = part.text ?? "";
      if (!text.trim()) return null;
      return { kind: "text", id, text, streaming: active && part.state === "streaming" };
    }
    case "reasoning": {
      const text = part.text ?? "";
      if (!text.trim()) return null;
      // Gate by `active` like text/tool below: a dropped/failed turn never settles
      // `part.state`, so an ungated reasoning part shimmers forever AND stays
      // un-expandable (reasoning.tsx forces the live preview while isThinking).
      return { kind: "reasoning", id, text, thinking: active && part.state === "streaming" };
    }
    case "dynamic-tool": {
      // propose_artifact sukses → kartu artifact clickable + Save-to-workspace (satu-satunya
      // kartu khusus yang disisakan). Sisanya — subagen, verify_*, semua tool — jadi tool-row
      // generik. HITL = percakapan murni (tak ada lagi inputRequest card; agent tanya via teks).
      const artifact = artifactCardModel(part);
      if (artifact) return { kind: "artifact", id: part.toolCallId, model: artifact };
      const model = toolPartModel(part);
      // `active` false → store sudah settle (ready/error); paksa isRunning false agar
      // tool yang ter-orphan di state "running" tak shimmer selamanya (lihat evePartsToTimeline).
      return {
        kind: "tool",
        id: part.toolCallId,
        model: active ? model : { ...model, isRunning: false },
      };
    }
    default:
      return null; // step-start
  }
}

// ── artifact card model ────────────────────────────────────────────────────────

const ARTIFACT_TOOL_NAMES = new Set(["propose_artifact", "execute_artifact"]);

/** Kartu artifact bila part = `propose_artifact` sukses ber-output {artifactId}, else null. */
export function artifactCardModel(part: EveDynamicToolPart): ArtifactCardModel | null {
  if (part.state !== "output-available") return null;
  const name = part.toolMetadata?.eve?.name ?? part.toolName;
  if (!ARTIFACT_TOOL_NAMES.has(name)) return null;
  const out = part.output;
  if (!out || typeof out !== "object") return null;
  const o = out as Record<string, unknown>;
  if (typeof o.artifactId !== "string") return null;
  return {
    toolCallId: part.toolCallId,
    artifactId: o.artifactId,
    title: typeof o.title === "string" ? o.title : "Dokumen",
    artifactType: typeof o.artifactType === "string" ? o.artifactType : "markdown",
  };
}

/**
 * Map `EveMessage[]` (live, dari `agent.data.messages`) → timeline ter-normalisasi.
 *
 * `active` = turn benar-benar berjalan (`agent.status` submitted/streaming). Per-message
 * `metadata.status` TAK ANDAL sebagai sinyal loading: saat turn di-drop (mis. backstop billing
 * `onMessage → return null`, ~204) atau gagal, reducer eve TAK men-settle `metadata.status`
 * (turn.failed = no-op untuk status message), jadi message ter-park selamanya di "streaming".
 * Store-level `status` DI-settle (→ ready saat stream kosong, → error saat gagal), jadi kita
 * gate semua indikator live (`streaming`, tool `isRunning`) dengan `active` supaya shimmer
 * berhenti begitu turn berhenti — bukan menunggu sinyal message yang tak pernah datang.
 */
export function evePartsToTimeline(
  messages: readonly EveMessage[],
  active: boolean,
): TimelineMessage[] {
  return messages.map((m) => {
    const parts: TimelinePart[] = [];
    m.parts.forEach((part, i) => {
      const mapped = mapPart(part, `${m.id}:${i}`, active);
      if (mapped) parts.push(mapped);
    });
    return {
      id: m.id,
      role: m.role,
      streaming: active && m.metadata?.status === "streaming",
      turnId: m.metadata?.turnId,
      parts,
    };
  });
}

// ── gabung event log di LEVEL EVENT (port eve-chat-template) ───────────────────
//
// SATU event log mentah → gabung prefix-aware → `defaultMessageReducer` SEKALI → pesan.
// Menggantikan merge 3-sumber + dedup turnId di level render (akar flicker/stale-card).

/** Dua event stream sama bila JSON-nya identik (eve emit event immutable per posisi). */
function areSameStreamEvent(a: EveAgentReducerEvent, b: EveAgentReducerEvent): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Gabung log persisted (`events`) dengan event live (`streamed`) → satu log. `streamed` yang
 * sudah ada di `events` (prefix yang ter-refetch usai turn) di-skip → tak dobel. `events` =
 * prefix server-authoritative; `streamed` = buffer live `agent.events`. Pola template
 * `mergeStreamEventLogs`/`appendUniqueStreamEvent`. Resume pakai overlay `[...events,...resumed]`
 * langsung (range disjoint), bukan fungsi ini.
 */
export function mergeStreamEventLogs(
  events: readonly EveAgentReducerEvent[],
  streamed: readonly EveAgentReducerEvent[],
): EveAgentReducerEvent[] {
  if (streamed.length === 0) return events.slice();
  const merged = events.slice();
  for (const ev of streamed) {
    if (!merged.some((existing) => areSameStreamEvent(existing, ev))) merged.push(ev);
  }
  return merged;
}

/** Reduce satu event log → data pesan, lewat `defaultMessageReducer` SEKALI (jalur tunggal). */
export function reduceEventsToMessageData(events: readonly EveAgentReducerEvent[]) {
  const reducer = defaultMessageReducer();
  let data = reducer.initial();
  for (const ev of events) data = reducer.reduce(data, ev);
  return data;
}

// ── replay event stream persisted (fix timeline persist) ──────────────────────
//
// `chat_thread_events` menyimpan event stream eve MENTAH per thread. Me-replay-nya
// lewat `defaultMessageReducer` (reducer YANG SAMA dengan live `useEveAgent`) →
// `EveMessage[]` identik dengan buffer live, lalu `evePartsToTimeline` → timeline penuh
// (tool, load-skill, subagent, HITL, hasil). Inilah yang membuat timeline reload == live
// SECARA KONSTRUKSI (bukan reimplementasi paralel), dan memungkinkan progress in-flight
// tetap terlihat setelah refresh (klien poll endpoint events selagi turn berjalan).

/** Event terakhir yang berarti turn SELESAI/parkir (idle): `turn.*` final + lifecycle
 *  `session.*` (tiap turn diakhiri `session.waiting`). Dipakai `recoverPending` + basis
 *  `SETTLED_OR_PARKED_LAST`. */
const SETTLED_EVENT_TYPES = new Set([
  "turn.completed",
  "turn.failed",
  "session.completed",
  "session.failed",
  "session.waiting",
]);

/**
 * Settled ATAU parkir-menunggu-input. `input.requested` ditambahkan: walau HITL kini
 * percakapan, `ask_question` masih di harness → bila model memakainya, stream eve parkir di
 * `session.waiting` dan `agent.status` jadi `ready` (composer terbuka). Kalau reload
 * menganggapnya "berjalan", `busy` mengunci composer → user tak bisa menjawab.
 */
const SETTLED_OR_PARKED_LAST = new Set([...SETTLED_EVENT_TYPES, "input.requested"]);

/**
 * True bila turn sedang BERJALAN (sedang eksekusi), bukan selesai/parkir. Heuristik =
 * tipe event TERAKHIR di log persisted (event tersimpan urut stream eve via identity `id`):
 * - `turn.completed`/`turn.failed` → selesai.
 * - `input.requested` → parkir menunggu jawaban user (lihat `SETTLED_OR_PARKED_LAST`).
 * - selain itu (`actions.requested`/`action.result`/`step.*`/`reasoning.*`/`message.*`/
 *   `subagent.*`/`turn.started`) → masih eksekusi → aktif.
 *
 * Dipakai (a) menyalakan poll endpoint events (progress in-flight terlihat setelah refresh),
 * (b) gate indikator live + lock composer (`resuming`). Turn berurutan (eve serial per
 * session) → event terakhir mencerminkan state turn terbaru. (`session.*` tak dipersist,
 * jadi `turn.completed`/`input.requested` adalah penanda terakhir yang tersimpan.)
 *
 * Catatan: turn yang MACET (proses mati tanpa `turn.completed`) tetap tampak aktif →
 * poll sampai user pindah thread; reconciler server-side adalah peningkatannya.
 */
export function isStreamActive(events: readonly Pick<ChatThreadEvent, "type">[]): boolean {
  const last = events[events.length - 1];
  if (!last) return false;
  return !SETTLED_OR_PARKED_LAST.has(last.type);
}

/**
 * Replay satu event log mentah → timeline (reduce SEKALI + map). `active` = ada turn in-flight
 * → diteruskan ke `evePartsToTimeline` agar tool shimmer & berhenti begitu settle. Dipakai
 * surface untuk merender `base` (overlay/merge) jadi pesan.
 */
export function eventsToTimeline(
  events: readonly EveAgentReducerEvent[],
  active: boolean,
): TimelineMessage[] {
  return evePartsToTimeline(reduceEventsToMessageData(events).messages, active);
}

/**
 * Cursor resume = `max(event_index)+1` → `startIndex` stream eve ("reconnect by event count").
 * `event_index` kontigu dari 0 (di-assign `max+1` per insert), jadi ini SELALU sama dengan
 * `events.length`; loop max dipertahankan sebagai bentuk defensif eksplisit. 0 bila kosong.
 * ponytail: drop event mid-stream (insert ter-`swallow`) menggeser cursor < posisi eve sebenarnya
 * → resume bisa replay delta yang sudah diterapkan; reconciler server-side adalah upgrade-nya.
 */
export function streamIndexFromEvents(events: readonly Pick<ChatThreadEvent, "eventIndex">[]): number {
  let max = -1;
  for (const e of events) if (e.eventIndex > max) max = e.eventIndex;
  return max + 1;
}

/**
 * Recovery pesan pending lintas-reload (port `getChatForUser` template) — `message` bila turn-nya
 * BELUM settle, `null` bila ada event settled SETELAH `createdAt` (turn sudah selesai → pesan
 * sudah masuk timeline; bubble basi jangan ditampilkan). Klien-side: `events` sudah di-fetch.
 */
export function recoverPending(
  events: readonly Pick<ChatThreadEvent, "type" | "createdAt">[],
  message: string | null | undefined,
  createdAt: number | null | undefined,
): string | null {
  if (!message || createdAt == null) return null;
  const settled = events.some((e) => SETTLED_EVENT_TYPES.has(e.type) && e.createdAt > createdAt);
  return settled ? null : message;
}

/**
 * Map transkrip persisted (`ChatMessage[]` dari api-v2) → timeline. History = teks +
 * reasoning saja (fallback thread LAMA pra-migration event log). Thread baru pakai
 * `eventsToTimeline` (timeline penuh).
 */
export function chatMessagesToTimeline(messages: readonly ChatMessage[]): TimelineMessage[] {
  return messages.map((m) => {
    const parts: TimelinePart[] = [];
    if (m.reasoning?.trim()) {
      parts.push({ kind: "reasoning", id: `${m.id}:r`, text: m.reasoning, thinking: false });
    }
    if (m.text?.trim()) {
      parts.push({ kind: "text", id: `${m.id}:t`, text: m.text, streaming: false });
    }
    return {
      id: m.id,
      role: m.role === "user" ? "user" : "assistant",
      streaming: false,
      turnId: m.turnId ?? undefined,
      parts,
    };
  });
}

// ── tool-row model ────────────────────────────────────────────────────────────

function toolStatus(state: EveDynamicToolPart["state"]): ToolStatus {
  switch (state) {
    case "input-streaming":
    case "input-available":
      return "running";
    case "approval-requested":
    case "approval-responded":
      return "pending";
    case "output-available":
      return "completed";
    case "output-error":
      return "failed";
    case "output-denied":
      return "denied";
    default:
      return "running";
  }
}

/** Pure model satu tool-call dari `EveDynamicToolPart`. Default-deny scalar. */
export function toolPartModel(part: EveDynamicToolPart): ToolRowModel {
  const kind = part.toolMetadata?.eve?.kind ?? "tool-call";
  const rawName = part.toolMetadata?.eve?.name ?? part.toolName;
  const status = toolStatus(part.state);

  const rows: ToolRow[] = [];
  appendScalarRows(rows, part.input, "input");

  let description: string | undefined;
  if (part.state === "output-available") {
    description = describeOutput(part.output);
    appendScalarRows(rows, part.output, "output");
  } else if (part.state === "output-error") {
    const err = clampValue(String(part.errorText ?? ""));
    if (err) rows.push({ key: "error", label: "Error", value: err, group: "output" });
  }

  return {
    toolCallId: part.toolCallId,
    name: rawName,
    title: toolTitle(rawName),
    kind,
    status,
    isRunning: status === "running",
    description,
    rows,
  };
}

const MAX_VALUE_LEN = 240;

/** Scalar → string (default-deny object/array/null → null). String dipangkas + 1 baris. */
function toScalarString(value: unknown): string | null {
  if (typeof value === "string") {
    const cleaned = value.replace(/\s+/g, " ").trim();
    return cleaned ? clampValue(cleaned) : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "Ya" : "Tidak";
  return null;
}

function clampValue(value: string): string {
  return value.length > MAX_VALUE_LEN ? `${value.slice(0, MAX_VALUE_LEN - 1)}…` : value;
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

/** Ringkasan jumlah hasil bila output array / punya field count / field list. */
function describeOutput(output: unknown): string | undefined {
  if (Array.isArray(output)) return `${output.length} hasil`;
  if (output && typeof output === "object") {
    const o = output as Record<string, unknown>;
    for (const k of COUNT_KEYS) {
      if (typeof o[k] === "number") return `${o[k]} hasil`;
    }
    for (const k of LIST_KEYS) {
      if (Array.isArray(o[k])) return `${(o[k] as unknown[]).length} hasil`;
    }
  }
  return undefined;
}

// Label Indonesia untuk tool yang dikenal (diisi lebih lengkap di 6.4/6.5). Tool tak
// dikenal jatuh ke `humanizeSlug`. BUKAN gerbang klasifikasi — sekadar copy ramah.
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
  execute_artifact: "Membuat artefak",
  save_url: "Menyimpan tautan",
  create_workspace: "Membuat workspace",
  rename_workspace: "Mengubah nama workspace",
  link_to_workspace: "Menautkan ke workspace",
  delete_artifact: "Menghapus artefak",
  ask_question: "Bertanya",
  search_papers: "Mencari paper",
  begin_deep_research: "Memulai riset mendalam",
  propose_research_plan: "Menyusun rencana riset", // legacy (event lama); tool diganti begin_deep_research

  // Subagent deep-research (Slice 7.1) — nama dir subagent muncul sebagai `eve.name`.
  "literature-searcher": "Menelaah literatur",
  "counter-evidence": "Mencari bukti tandingan",
  "citation-verifier": "Memverifikasi sitasi",
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
  question: "Pertanyaan",
  questionCount: "Jumlah pertanyaan",
  workspaceId: "Workspace",
  artifactId: "Artefak",
  threadId: "Percakapan",
  message: "Tugas",
  summary: "Ringkasan",
};

function humanizeKey(key: string): string {
  return KEY_LABELS[key] ?? humanizeSlug(key);
}

/** snake/camel/kebab → "Sentence case". Pure, no-leak (hanya nama tool/kunci). */
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
