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

import type { EveDynamicToolPart, EveMessage, EveMessagePart } from "eve/react";
import type { ChatMessage } from "../types";

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

/** Opsi terpilih dalam satu input-request HITL (eve). */
export type HitlOption = {
  id: string;
  label: string;
  style?: "danger" | "default" | "primary";
};

/**
 * Model presentasi satu kartu HITL (Slice 6.5) dari `EveDynamicToolPart` ber-`inputRequest`.
 * `display` memilih kontrol; `responded` true setelah user menjawab (part →
 * `approval-responded`). `toolName`/`input` dipakai kartu khusus (mis. preview
 * `propose_artifact`).
 */
export type HitlCardModel = {
  toolCallId: string;
  requestId: string;
  toolName: string;
  prompt: string;
  display: "confirmation" | "select" | "text";
  options: HitlOption[];
  allowFreeform: boolean;
  /** Input mentah tool (untuk preview, mis. judul+markdown propose_artifact). */
  input: unknown;
  /** True bila sudah dijawab/diputuskan (kartu jadi read-only). */
  responded: boolean;
  /** Untuk approval: hasil keputusan setelah dijawab. */
  approved?: boolean;
  /** Jawaban terkirim (select/text) bila ada. */
  answeredOptionId?: string;
  answeredText?: string;
};

/** Model kartu artifact (Slice 6.5) dari output `propose_artifact` yang sukses. */
export type ArtifactCardModel = {
  toolCallId: string;
  artifactId: string;
  title: string;
  artifactType: string;
};

/** Status integritas satu referensi (Slice 7.2) — sejajar `IntegrityStatus` service. */
export type VerdictStatus =
  | "verified"
  | "metadata_mismatch"
  | "identifier_invalid"
  | "not_found"
  | "unverifiable";

/** Satu baris verdict sitasi (di-keyed `[n]`). */
export type VerificationVerdict = {
  citation?: number;
  reference: string;
  status: VerdictStatus;
  issues: string[];
  matchedTitle?: string;
};

/** Model kartu verifikasi sitasi (Slice 7.2) dari output `verify_identifiers`/`verify_citations`. */
export type VerificationCardModel = {
  toolCallId: string;
  checked: number;
  verified: number;
  flagged: number;
  items: VerificationVerdict[];
  note?: string;
};

/** Satu bagian terurut dalam timeline satu pesan asisten. */
export type TimelinePart =
  | { kind: "text"; id: string; text: string; streaming: boolean }
  | { kind: "reasoning"; id: string; text: string; thinking: boolean }
  | { kind: "tool"; id: string; model: ToolRowModel }
  | { kind: "hitl"; id: string; model: HitlCardModel }
  | { kind: "artifact"; id: string; model: ArtifactCardModel }
  | { kind: "verification"; id: string; model: VerificationCardModel };

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
      // HITL park (Slice 6.5): part ber-`inputRequest` (approval ATAU ask_question) →
      // kartu interaktif, BUKAN tool-row. Klasifikasi by `inputRequest`/`state`, BUKAN
      // daftar nama tool (set V1 obsolete).
      const hitl = hitlCardModel(part);
      if (hitl) return { kind: "hitl", id: part.toolCallId, model: hitl };
      // propose_artifact sukses → kartu artifact clickable + Save-to-workspace.
      const artifact = artifactCardModel(part);
      if (artifact) return { kind: "artifact", id: part.toolCallId, model: artifact };
      // verify_identifiers/verify_citations sukses → kartu tabel verdict [n]→status (Slice 7.2).
      const verification = verificationCardModel(part);
      if (verification) return { kind: "verification", id: part.toolCallId, model: verification };
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

// ── HITL + artifact card model ─────────────────────────────────────────────────

/** Kartu HITL bila part di state approval/answer ber-`inputRequest`, else null. */
export function hitlCardModel(part: EveDynamicToolPart): HitlCardModel | null {
  if (part.state !== "approval-requested" && part.state !== "approval-responded") return null;
  const req = part.toolMetadata?.eve?.inputRequest;
  if (!req) return null;
  const inputResponse = part.toolMetadata?.eve?.inputResponse;
  return {
    toolCallId: part.toolCallId,
    requestId: req.requestId,
    toolName: part.toolMetadata?.eve?.name ?? part.toolName,
    prompt: req.prompt,
    display: req.display ?? "confirmation",
    options: (req.options ?? []).map((o) => ({ id: o.id, label: o.label, style: o.style })),
    allowFreeform: Boolean(req.allowFreeform),
    input: part.input,
    responded: part.state === "approval-responded",
    approved: part.state === "approval-responded" ? part.approval?.approved : undefined,
    answeredOptionId: inputResponse?.optionId,
    answeredText: inputResponse?.text,
  };
}

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

const VERIFY_TOOL_NAMES = new Set(["verify_identifiers", "verify_citations"]);
const VERDICT_STATUSES = new Set<VerdictStatus>([
  "verified",
  "metadata_mismatch",
  "identifier_invalid",
  "not_found",
  "unverifiable",
]);

/** Satu verdict dari item output verify (default-deny: butuh reference + status valid). */
function toVerdict(raw: unknown): VerificationVerdict | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.reference !== "string") return null;
  if (typeof o.status !== "string" || !VERDICT_STATUSES.has(o.status as VerdictStatus)) return null;
  return {
    reference: o.reference,
    status: o.status as VerdictStatus,
    citation: typeof o.citation === "number" ? o.citation : undefined,
    issues: Array.isArray(o.issues) ? o.issues.filter((i): i is string => typeof i === "string") : [],
    matchedTitle: typeof o.matchedTitle === "string" ? o.matchedTitle : undefined,
  };
}

/** Kartu verifikasi bila part = verify tool sukses ber-output `{ items[], summary }`, else null. */
export function verificationCardModel(part: EveDynamicToolPart): VerificationCardModel | null {
  if (part.state !== "output-available") return null;
  const name = part.toolMetadata?.eve?.name ?? part.toolName;
  if (!VERIFY_TOOL_NAMES.has(name)) return null;
  const out = part.output;
  if (!out || typeof out !== "object") return null;
  const o = out as Record<string, unknown>;
  if (!Array.isArray(o.items)) return null;
  const items = o.items.map(toVerdict).filter((v): v is VerificationVerdict => v !== null);
  const summary = (o.summary ?? {}) as Record<string, unknown>;
  const num = (v: unknown, fallback: number) => (typeof v === "number" ? v : fallback);
  return {
    toolCallId: part.toolCallId,
    checked: num(summary.checked, items.length),
    verified: num(summary.verified, 0),
    flagged: num(summary.flagged, 0),
    items,
    note: typeof o.note === "string" ? o.note : undefined,
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

/**
 * Map transkrip persisted (`ChatMessage[]` dari api-v2) → timeline. History = teks +
 * reasoning saja (dipersist 6.1); **tanpa** tool parts (live-only, D-F).
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
  propose_research_plan: "Menyusun rencana riset",
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
