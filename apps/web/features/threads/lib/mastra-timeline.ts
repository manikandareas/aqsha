import type {
  ArtifactCardModel,
  TimelineMessage,
  TimelinePart,
  ToolRow,
  ToolRowModel,
  ToolStatus,
} from "./timeline-types";

/**
 * Adapter chunk Mastra (`@mastra/client-js` `processDataStream` onChunk) → `TimelineMessage[]`
 * yang dipakai komponen existing (MessageList/ToolRow/ChatArtifactCard). Pure reducer: satu
 * `reduceMastraChunk(state, chunk)` per chunk. Menggantikan `eve-timeline.ts` untuk runtime
 * Mastra (dipilih via flag `NEXT_PUBLIC_AGENT_RUNTIME`).
 *
 * Hanya import TYPE dari `eve-timeline` (di-erase saat compile) supaya tak menyeret runtime eve;
 * helper kecil (title/scalar/desc) diduplikasi di sini agar lepas saat eve dihapus (Fase 3).
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

export type MastraTimelineState = {
  messages: TimelineMessage[];
  approvals: MastraApproval[];
  runId?: string;
  error?: string;
};

export function initialMastraTimeline(seed: TimelineMessage[] = []): MastraTimelineState {
  return { messages: seed, approvals: [] };
}

/** Pesan dari client-js memory-thread (`MastraDBMessage[]`). */
type MastraDBMessageLike = {
  id: string;
  role?: string;
  content?: { parts?: Array<Record<string, unknown>>; content?: unknown; reasoning?: unknown };
};

/**
 * History thread Mastra (`getMemoryThread().listMessages()` → `MastraDBMessage[]`) →
 * `TimelineMessage[]` seed (teks + reasoning; tool/artifact tak direplay di history, sama
 * seperti fallback eve `chatMessagesToTimeline`).
 */
export function mastraMessagesToTimeline(messages: readonly MastraDBMessageLike[]): TimelineMessage[] {
  return messages.map((m) => {
    const parts: TimelinePart[] = [];
    const raw = m.content?.parts ?? [];
    let textAcc = "";
    let reasoningAcc = "";
    for (const p of raw) {
      const type = str(p.type);
      if (type === "text") textAcc += str(p.text);
      else if (type === "reasoning") reasoningAcc += str(p.text) || str(p.reasoning);
    }
    if (!textAcc && typeof m.content?.content === "string") textAcc = m.content.content;
    if (!reasoningAcc && typeof m.content?.reasoning === "string") reasoningAcc = m.content.reasoning;
    if (reasoningAcc.trim()) {
      parts.push({ kind: "reasoning", id: `${m.id}:r`, text: reasoningAcc, thinking: false });
    }
    if (textAcc.trim()) {
      parts.push({ kind: "text", id: `${m.id}:t`, text: textAcc, streaming: false });
    }
    return {
      id: m.id,
      role: m.role === "user" ? "user" : "assistant",
      streaming: false,
      parts,
    };
  });
}

/** Buat pesan user optimistik + pesan assistant kosong (streaming) untuk turn baru. */
export function startAssistantTurn(
  state: MastraTimelineState,
  userText: string,
  turnSeed: string,
): MastraTimelineState {
  const userMsg: TimelineMessage = {
    id: `${turnSeed}:user`,
    role: "user",
    streaming: false,
    parts: [{ kind: "text", id: `${turnSeed}:user:t`, text: userText, streaming: false }],
  };
  const assistantMsg: TimelineMessage = {
    id: `${turnSeed}:assistant`,
    role: "assistant",
    streaming: true,
    parts: [],
  };
  return { ...state, messages: [...state.messages, userMsg, assistantMsg], error: undefined };
}

/** Tandai turn assistant aktif selesai streaming. */
export function settleAssistantTurn(state: MastraTimelineState): MastraTimelineState {
  const idx = lastAssistantIndex(state.messages);
  const messages = state.messages.map((m, i) => (i === idx ? { ...m, streaming: false } : m));
  return { ...state, messages };
}

function lastAssistantIndex(messages: TimelineMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.role === "assistant") return i;
  }
  return -1;
}

/** Reduksi satu chunk Mastra ke state timeline. Immutable (aman untuk React state). */
export function reduceMastraChunk(
  state: MastraTimelineState,
  chunk: MastraChunk,
): MastraTimelineState {
  const idx = lastAssistantIndex(state.messages);
  if (idx < 0) return state;
  const payload = chunk.payload ?? {};

  switch (chunk.type) {
    case "start":
    case "step-start":
      return chunk.runId ? { ...state, runId: chunk.runId } : state;

    case "text-start":
      return upsertPart(state, idx, textPart(strId(payload.id), ""), true);
    case "text-delta":
      return appendText(state, idx, "text", strId(payload.id), str(payload.text));

    case "reasoning-start":
      return upsertPart(state, idx, reasoningPart(strId(payload.id), ""), true);
    case "reasoning-delta":
      return appendText(state, idx, "reasoning", strId(payload.id), str(payload.text));
    case "reasoning-end":
      return setReasoningThinking(state, idx, strId(payload.id), false);

    case "tool-call-input-streaming-start":
    case "tool-call":
      return upsertToolPart(state, idx, {
        toolCallId: str(payload.toolCallId),
        toolName: str(payload.toolName),
        args: asRecord(payload.args),
        status: "running",
      });

    case "tool-result":
    case "tool-output": {
      const toolName = str(payload.toolName);
      const result = payload.result ?? payload.output;
      // propose_artifact sukses → kartu artifact (parity eve).
      const artifact = artifactFromResult(toolName, str(payload.toolCallId), result);
      if (artifact) return replaceWithArtifact(state, idx, artifact);
      return completeToolPart(state, idx, str(payload.toolCallId), result, payload.isError === true);
    }
    case "tool-error":
      return completeToolPart(state, idx, str(payload.toolCallId), undefined, true);

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

    case "error":
      return { ...state, error: extractError(payload.error) };
    case "tripwire":
      return { ...state, error: str(payload.reason) || "Permintaan diblokir (kuota/kebijakan)." };

    default:
      return state; // source/finish/lifecycle lain → tak mempengaruhi timeline
  }
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
      return {
        ...p,
        model: {
          ...p.model,
          status: isError ? "failed" : "completed",
          isRunning: false,
          description: isError ? p.model.description : describeOutput(result),
          rows,
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

// ── tool model + scalar helpers (duplikat dari eve-timeline; self-contained) ──────

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

const MAX_VALUE_LEN = 240;

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

function describeOutput(output: unknown): string | undefined {
  if (Array.isArray(output)) return `${output.length} hasil`;
  if (output && typeof output === "object") {
    const o = output as Record<string, unknown>;
    for (const k of COUNT_KEYS) if (typeof o[k] === "number") return `${o[k]} hasil`;
    for (const k of LIST_KEYS) if (Array.isArray(o[k])) return `${(o[k] as unknown[]).length} hasil`;
  }
  return undefined;
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
function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function extractError(err: unknown): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return "Terjadi kesalahan saat memproses.";
}
