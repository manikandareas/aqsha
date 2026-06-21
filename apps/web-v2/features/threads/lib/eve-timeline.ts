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
  title: string;
  kind: "tool-call" | "subagent-call" | "load-skill" | "unknown";
  status: ToolStatus;
  isRunning: boolean;
  /** Ringkasan inline (mis. "12 hasil") dari output. */
  description?: string;
  /** Body rows curated (scalar saja). Kosong → render header-only. */
  rows: ToolRow[];
};

/** Satu bagian terurut dalam timeline satu pesan asisten. */
export type TimelinePart =
  | { kind: "text"; id: string; text: string; streaming: boolean }
  | { kind: "reasoning"; id: string; text: string; thinking: boolean }
  | { kind: "tool"; id: string; model: ToolRowModel };

/** Pesan ter-normalisasi untuk renderer (user = bubble; assistant = parts terurut). */
export type TimelineMessage = {
  id: string;
  role: "assistant" | "user";
  /** True selagi turn pesan ini masih streaming (dari `metadata.status`). */
  streaming: boolean;
  parts: TimelinePart[];
};

// ── konversi part eve ────────────────────────────────────────────────────────

function mapPart(part: EveMessagePart, id: string): TimelinePart | null {
  switch (part.type) {
    case "text": {
      const text = part.text ?? "";
      if (!text.trim()) return null;
      return { kind: "text", id, text, streaming: part.state === "streaming" };
    }
    case "reasoning": {
      const text = part.text ?? "";
      if (!text.trim()) return null;
      return { kind: "reasoning", id, text, thinking: part.state === "streaming" };
    }
    case "dynamic-tool":
      return { kind: "tool", id: part.toolCallId, model: toolPartModel(part) };
    default:
      return null; // step-start
  }
}

/** Map `EveMessage[]` (live, dari `agent.data.messages`) → timeline ter-normalisasi. */
export function evePartsToTimeline(messages: readonly EveMessage[]): TimelineMessage[] {
  return messages.map((m) => {
    const parts: TimelinePart[] = [];
    m.parts.forEach((part, i) => {
      const mapped = mapPart(part, `${m.id}:${i}`);
      if (mapped) parts.push(mapped);
    });
    return {
      id: m.id,
      role: m.role,
      streaming: m.metadata?.status === "streaming",
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
