// Activity stream view-model (plan docs/agent-activity-stream-plan.md §3–§4).
//
// `RunEvent` (run.ts) stays the wire/storage row; this module derives a
// render-friendly `ActivityEvent` tree from the events already embedded on an
// `AgentRunRow` (via api.agent.queries.listRuns). Pure + deterministic so it can
// be unit-tested and called from `uiRunFromRow`. Convex reactivity is the
// transport — no SSE/WebSocket. This is the "SDK event → internal app event"
// adaptation layer; raw payloads/secrets never cross it (allow-list per type).
//
// Type-only import (erased at runtime) → no runtime cycle with uiAdapters, which
// imports `activityEventsFromRun` as a value.
import type { AgentRunRow } from "./uiAdapters";

export type ActivityStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "waiting_approval";

export type ActivityActor = "main" | "subagent" | "tool" | "system";

export type ActivityVisibility = "user" | "developer" | "hidden";

export type ActivityType =
  | "run" // run header (started/completed/failed/cancelled)
  | "tool" // one tool invocation (start→end folded into one node)
  | "subagent" // one sub-agent instance
  | "phase" // deep-research phase
  | "approval" // HITL waiting for approval/answer
  | "system"; // compaction, system notes

export type ActivityEvent = {
  id: string; // stable: `${runId}:${seq}` (or the folded pair's start seq)
  runId: string;
  parentId?: string; // nesting (sub-agent → its tools); Fase 1 coarse by seq window
  seq: number; // execution order
  type: ActivityType;
  status: ActivityStatus;
  actor: ActivityActor;
  title: string; // human-readable Indonesian, sentence case
  description?: string; // safe summary, e.g. "12 hasil"
  metadata?: Record<string, string | number | boolean>; // safe scalars only
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  visibility: ActivityVisibility;
  children?: ActivityEvent[]; // folding result (sub-agent/phase → tools)
};

// ── label catalogs (Indonesian, sentence case; default-deny on unknown) ──────

type Label = { running: string; completed: string; failed?: string };

const TOOL_LABELS: Record<string, Label> = {
  searchWeb: { running: "Mencari sumber web", completed: "Selesai mencari web" },
  searchArxiv: { running: "Mencari preprint arXiv", completed: "Selesai di arXiv" },
  lookupDoi: { running: "Memverifikasi DOI", completed: "DOI terverifikasi" },
  searchThreadDocuments: {
    running: "Mencari dokumen di thread",
    completed: "Selesai mencari dokumen",
  },
  verifyCitations: {
    running: "Memverifikasi kutipan",
    completed: "Kutipan diverifikasi",
  },
  verifyStatistics: {
    running: "Memverifikasi statistik",
    completed: "Statistik diperiksa",
  },
  runComputation: { running: "Menjalankan komputasi", completed: "Komputasi selesai" },
  proposeArtifact: { running: "Menyusun dokumen", completed: "Usulan dokumen siap" },
  executeArtifact: { running: "Menyimpan dokumen", completed: "Dokumen disimpan" },
  deleteArtifact: { running: "Menghapus dokumen", completed: "Dokumen dihapus" },
  createWorkspace: { running: "Membuat ruang kerja", completed: "Ruang kerja dibuat" },
  renameWorkspace: {
    running: "Mengganti nama ruang kerja",
    completed: "Nama ruang kerja diperbarui",
  },
  askUser: { running: "Menunggu jawaban Anda", completed: "Jawaban diterima" },
};

const FALLBACK_TOOL_LABEL: Label = {
  running: "Menjalankan langkah",
  completed: "Langkah selesai",
};

const PHASE_LABELS: Record<string, Label> = {
  plan: { running: "Merencanakan strategi", completed: "Strategi disusun" },
  literature: { running: "Mencari literatur", completed: "Literatur terkumpul" },
  counter_evidence: {
    running: "Mencari bukti pembanding",
    completed: "Bukti pembanding ditinjau",
  },
  citation_verify: {
    running: "Memverifikasi kutipan",
    completed: "Kutipan diverifikasi",
  },
  write: { running: "Menulis laporan", completed: "Laporan selesai" },
};

const FALLBACK_PHASE_LABEL: Label = {
  running: "Menjalankan fase",
  completed: "Fase selesai",
};

const SUBAGENT_LABELS: Record<string, Label> = {
  "literature-searcher": {
    running: "Agen pencari literatur bekerja",
    completed: "Agen pencari literatur selesai",
    failed: "Agen pencari literatur gagal",
  },
};

const FALLBACK_SUBAGENT_LABEL: Label = {
  running: "Sub-agen bekerja",
  completed: "Sub-agen selesai",
  failed: "Sub-agen gagal",
};

const APPROVAL_LABELS: Record<string, Label> = {
  askUser: { running: "Menunggu jawaban Anda", completed: "Jawaban diterima" },
  proposeArtifact: {
    running: "Menunggu persetujuan dokumen",
    completed: "Persetujuan diterima",
  },
  deleteArtifact: {
    running: "Menunggu persetujuan penghapusan",
    completed: "Persetujuan diterima",
  },
  createWorkspace: {
    running: "Menunggu persetujuan ruang kerja",
    completed: "Persetujuan diterima",
  },
  renameWorkspace: {
    running: "Menunggu persetujuan penggantian nama",
    completed: "Persetujuan diterima",
  },
  runComputation: {
    running: "Menunggu persetujuan komputasi",
    completed: "Persetujuan diterima",
  },
};

const FALLBACK_APPROVAL_LABEL: Label = {
  running: "Menunggu persetujuan",
  completed: "Persetujuan diterima",
};

const RUN_RUNNING_TITLE = { normal: "Menjalankan permintaan", deep: "Riset mendalam" };
const RUN_TERMINAL_TITLE: Record<string, string> = {
  completed: "Selesai",
  failed: "Berhenti sebelum selesai",
  canceled: "Dihentikan",
  waiting_hitl: "Menunggu persetujuan",
  waiting: "Menunggu",
};

/** Failed-state title: explicit `failed` form, else "Gagal " + the action verb. */
function failedTitle(label: Label): string {
  if (label.failed) return label.failed;
  const running = label.running;
  return `Gagal ${running.charAt(0).toLowerCase()}${running.slice(1)}`;
}

const MAX_ERROR_DESCRIPTION = 200;

// Cut at the FIRST line terminator of any kind (LF, CR, U+2028/U+2029, U+0085)
// so an interior break can't push a second line into the timeline — matches the
// source-side `safeLabel` clamp (apps/agents activitySanitizers.ts).
const LINE_TERMINATOR = /[\n\r\u0085\u2028\u2029]/;

/**
 * Defense-in-depth for error copy: keep only the first line and bound the
 * length so a stray multi-line / verbose backend error never floods or smuggles
 * detail into the timeline. Source-level sanitization is Fase 2 (plan §8).
 */
function safeErrorText(message: string | undefined): string | undefined {
  if (!message) return undefined;
  const firstLine = message.split(LINE_TERMINATOR, 1)[0]?.trim() ?? "";
  if (!firstLine) return undefined;
  return firstLine.length > MAX_ERROR_DESCRIPTION
    ? `${firstLine.slice(0, MAX_ERROR_DESCRIPTION - 1)}…`
    : firstLine;
}

// ── safe payload helpers ─────────────────────────────────────────────────────

function safeParse(json: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(json) as unknown;
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/**
 * Default-deny projection: keep only the explicitly allow-listed keys whose
 * value is a safe scalar. Raw tool_input / tool_response / queries / secrets can
 * never reach the view-model even if a future payload carries them.
 */
function pickScalars(
  payload: Record<string, unknown>,
  keys: readonly string[],
): Record<string, string | number | boolean> | undefined {
  const out: Record<string, string | number | boolean> = {};
  for (const key of keys) {
    const value = payload[key];
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      out[key] = value;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function stringOf(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberOf(payload: Record<string, unknown>, key: string): number | undefined {
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Keep only safe-scalar entries from a nested summary object (the Fase 2
 * `inputSummary` / `resultSummary` payloads). Normalizer-side default-deny:
 * mirrors the source sanitizer so a nested object/array/secret can never reach
 * the view-model even if a future payload smuggles one into a summary.
 */
function scalarsFrom(value: unknown): Record<string, string | number | boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string | number | boolean> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (
      typeof entry === "string" ||
      typeof entry === "number" ||
      typeof entry === "boolean"
    ) {
      out[key] = entry;
    }
  }
  return out;
}

// Statistical-verification verdict → sentence-case Indonesian.
const VERDICT_LABELS: Record<string, string> = {
  passed: "lolos",
  passed_with_notes: "lolos dengan catatan",
  needs_review: "perlu ditinjau",
  failed: "tidak lolos",
};

/**
 * Human-readable Indonesian summary derived from a tool's sanitized scalar
 * metadata (Fase 2 enrichment). Default-deny: an unknown tool or a missing key
 * yields no description (the node falls back to its label only). The keys read
 * here are the contract emitted by `activitySanitizers.ts` (apps/agents).
 */
function describeTool(
  tool: string,
  meta: Record<string, string | number | boolean>,
): string | undefined {
  switch (tool) {
    case "searchWeb":
    case "searchArxiv":
      return typeof meta.resultCount === "number" ? `${meta.resultCount} hasil` : undefined;
    case "lookupDoi":
      return typeof meta.doi === "string" ? meta.doi : undefined;
    case "searchThreadDocuments":
      return typeof meta.hasResults === "boolean"
        ? meta.hasResults
          ? "dokumen ditemukan"
          : "tidak ada dokumen"
        : undefined;
    case "verifyStatistics": {
      const parts: string[] = [];
      if (typeof meta.checksRun === "number") parts.push(`${meta.checksRun} pemeriksaan`);
      const verdict = typeof meta.verdict === "string" ? VERDICT_LABELS[meta.verdict] : undefined;
      if (verdict) parts.push(verdict);
      return parts.length > 0 ? parts.join(", ") : undefined;
    }
    case "proposeArtifact":
    case "executeArtifact":
      return typeof meta.title === "string" ? meta.title : undefined;
    case "createWorkspace":
    case "renameWorkspace":
      return typeof meta.name === "string" ? meta.name : undefined;
    case "askUser":
      return typeof meta.questionCount === "number"
        ? `${meta.questionCount} pertanyaan`
        : undefined;
    default:
      return undefined;
  }
}

// ── internal working node (carries seq window for coarse nesting) ────────────

const OPEN_SEQ = Number.MAX_SAFE_INTEGER;

type WorkingNode = ActivityEvent & {
  _startSeq: number;
  _endSeq: number;
  _interval: boolean; // phase | subagent own a [start, end] window
  // Fase 3 precise nesting: the sub-agent (agent_id) a tool ran in, when the
  // SDK supplied it. Present → nest under that sub-agent exactly; absent →
  // fall back to the Fase 1 seq-window heuristic.
  _parentAgentId?: string;
};

function close(node: WorkingNode, endSeq: number, endedAt: number): void {
  node._endSeq = endSeq;
  node.endedAt = endedAt;
  node.durationMs = Math.max(0, endedAt - node.startedAt);
}

/** Resolve the label catalog for a node so a late close can pick the right
 *  completed/failed title (the node carries its key in metadata). */
function labelForNode(node: WorkingNode): Label | undefined {
  const meta = node.metadata;
  if (node.type === "tool" && typeof meta?.tool === "string") {
    return TOOL_LABELS[meta.tool] ?? FALLBACK_TOOL_LABEL;
  }
  if (node.type === "phase") {
    return PHASE_LABELS[typeof meta?.phase === "string" ? meta.phase : ""] ??
      FALLBACK_PHASE_LABEL;
  }
  if (node.type === "subagent") {
    return SUBAGENT_LABELS[typeof meta?.agentType === "string" ? meta.agentType : ""] ??
      FALLBACK_SUBAGENT_LABEL;
  }
  return undefined;
}

/** Innermost interval whose seq window contains `seq` (latest opener wins). */
function innermostContainer(
  seq: number,
  intervals: WorkingNode[],
  excludeId?: string,
): WorkingNode | undefined {
  let best: WorkingNode | undefined;
  for (const interval of intervals) {
    if (interval.id === excludeId) continue;
    if (interval._startSeq <= seq && seq <= interval._endSeq) {
      if (!best || interval._startSeq > best._startSeq) {
        best = interval;
      }
    }
  }
  return best;
}

function toClean(node: WorkingNode): ActivityEvent {
  const {
    _startSeq: _s,
    _endSeq: _e,
    _interval: _i,
    _parentAgentId: _p,
    children,
    ...rest
  } = node;
  const clean: ActivityEvent = { ...rest };
  if (children && children.length > 0) {
    clean.children = (children as WorkingNode[]).map(toClean);
  }
  return clean;
}

/**
 * Filter an activity tree by viewer visibility (render-side, pure). `user` nodes
 * always show; `developer` nodes show only in dev/debug mode; `hidden` nodes
 * never show. Recurses into children so a hidden/developer node is dropped at
 * every depth. Returns new nodes (input is never mutated).
 */
export function filterByVisibility(
  nodes: ActivityEvent[],
  options?: { developer?: boolean },
): ActivityEvent[] {
  const developer = options?.developer === true;
  const allow = (visibility: ActivityVisibility): boolean =>
    visibility === "user" || (developer && visibility === "developer");
  const walk = (list: ActivityEvent[]): ActivityEvent[] =>
    list
      .filter((node) => allow(node.visibility))
      .map((node) =>
        node.children ? { ...node, children: walk(node.children) } : node,
      );
  return walk(nodes);
}

/**
 * Derive the activity timeline for one run. Returns `[runNode, ...topLevel]`
 * where the run node is the header marker and the remaining top-level nodes are
 * tools / phases / sub-agents / approvals in seq order (sub-agents and phases
 * carry their folded `children`). Pure: no Date.now(), no mutation of input.
 */
export function activityEventsFromRun(run: AgentRunRow): ActivityEvent[] {
  const runId = run.runId;
  const isDeep = run.mode === "deep";

  // 1. Stable order by seq, then createdAt, then id (defensive on ties).
  const events = run.events.slice().sort((a, b) => {
    if (a.seq !== b.seq) return a.seq - b.seq;
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const leaves: WorkingNode[] = []; // tools, approvals, system
  const intervals: WorkingNode[] = []; // phases, subagents
  // Open-node bookkeeping for folding start→end pairs.
  const toolStacks = new Map<string, WorkingNode[]>(); // pairing per tool name
  const toolsByUseId = new Map<string, WorkingNode>(); // exact pairing by toolUseId (Fase 2)
  const subagentStack: WorkingNode[] = [];
  const subagentsById = new Map<string, WorkingNode>(); // exact pairing by agentId (Fase 2)
  // Stable agentId → sub-agent node (never deleted on stop): precise nesting in
  // step 3 attaches a tool to the sub-agent it ran in (Fase 3).
  const subagentNodeByAgentId = new Map<string, WorkingNode>();
  const phaseStack: WorkingNode[] = [];
  const approvalsById = new Map<string, WorkingNode>();
  const openToolOrder: WorkingNode[] = []; // most-recent open tool for error attribution
  let runErrorMessage: string | undefined;
  // Fase 3: a `run_status` event carrying status "canceled" is a terminal
  // marker in the stream itself (runManager emits it on cancel). Consumed so the
  // timeline reflects cancel even before the run row's status has propagated.
  let sawCanceledEvent = false;

  const makeNode = (
    seq: number,
    startedAt: number,
    fields: Omit<
      WorkingNode,
      "id" | "runId" | "seq" | "startedAt" | "_startSeq" | "_endSeq"
    >,
  ): WorkingNode => ({
    id: `${runId}:${seq}`,
    runId,
    seq,
    startedAt,
    _startSeq: seq,
    _endSeq: OPEN_SEQ,
    ...fields,
  });

  for (const event of events) {
    const payload = safeParse(event.payloadJson);
    const at = event.createdAt;

    switch (event.type) {
      case "tool_start": {
        const tool = stringOf(payload, "toolName") ?? "";
        const toolUseId = stringOf(payload, "toolUseId");
        const label = TOOL_LABELS[tool] ?? FALLBACK_TOOL_LABEL;
        // Merge the sanitized input summary (Fase 2) into metadata; a tool that
        // knows its detail up front (e.g. an artifact title) shows it while live.
        const metadata: Record<string, string | number | boolean> = {
          ...(tool ? { tool } : {}),
          ...scalarsFrom(payload.inputSummary),
        };
        const node = makeNode(event.seq, at, {
          type: "tool",
          actor: "tool",
          status: "running",
          title: label.running,
          description: describeTool(tool, metadata),
          visibility: "user",
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
          _interval: false,
          _parentAgentId: stringOf(payload, "parentAgentId"),
        });
        leaves.push(node);
        const stack = toolStacks.get(tool) ?? [];
        stack.push(node);
        toolStacks.set(tool, stack);
        if (toolUseId) toolsByUseId.set(toolUseId, node);
        openToolOrder.push(node);
        break;
      }
      case "tool_end": {
        const tool = stringOf(payload, "toolName") ?? "";
        const toolUseId = stringOf(payload, "toolUseId");
        const failed =
          stringOf(payload, "status") === "error" || payload.ok === false;
        const label = TOOL_LABELS[tool] ?? FALLBACK_TOOL_LABEL;
        const resultScalars = scalarsFrom(payload.resultSummary);
        // Prefer exact pairing by toolUseId (Fase 2); fall back to the per-name
        // LIFO stack for thin Fase 1 events that carry no id.
        let node: WorkingNode | undefined;
        if (toolUseId && toolsByUseId.has(toolUseId)) {
          node = toolsByUseId.get(toolUseId);
          toolsByUseId.delete(toolUseId);
          const stack = toolStacks.get(tool);
          if (stack && node) {
            const i = stack.indexOf(node);
            if (i >= 0) stack.splice(i, 1);
          }
        } else {
          node = toolStacks.get(tool)?.pop();
        }
        if (node) {
          node.status = failed ? "failed" : "completed";
          node.title = failed ? failedTitle(label) : label.completed;
          if (Object.keys(resultScalars).length > 0) {
            node.metadata = { ...(node.metadata ?? {}), ...resultScalars };
          }
          // A successful close refreshes the description from the merged
          // summary; a failed close lets the "Gagal …" title do the talking
          // (an error result carries no usable data).
          if (!failed) {
            const desc = describeTool(tool, node.metadata ?? {});
            if (desc) node.description = desc;
          }
          close(node, event.seq, at);
          const idx = openToolOrder.indexOf(node);
          if (idx >= 0) openToolOrder.splice(idx, 1);
        } else {
          // Orphan end (start never seen): surface a terminal point node.
          const metadata: Record<string, string | number | boolean> = {
            ...(tool ? { tool } : {}),
            ...resultScalars,
          };
          const orphan = makeNode(event.seq, at, {
            type: "tool",
            actor: "tool",
            status: failed ? "failed" : "completed",
            title: failed ? failedTitle(label) : label.completed,
            description: failed ? undefined : describeTool(tool, metadata),
            visibility: "user",
            metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
            _interval: false,
            _parentAgentId: stringOf(payload, "parentAgentId"),
          });
          close(orphan, event.seq, at);
          leaves.push(orphan);
        }
        break;
      }
      case "citation_check": {
        const checked = numberOf(payload, "checked");
        const flagged = numberOf(payload, "flagged");
        const parts: string[] = [];
        if (checked !== undefined) parts.push(`${checked} diperiksa`);
        if (flagged) parts.push(`${flagged} ditandai`);
        const node = makeNode(event.seq, at, {
          type: "tool",
          actor: "tool",
          status: "completed",
          title: "Kutipan diverifikasi",
          description: parts.length > 0 ? parts.join(", ") : undefined,
          visibility: "user",
          metadata: pickScalars(payload, ["checked", "verified", "flagged"]),
          _interval: false,
        });
        close(node, event.seq, at);
        leaves.push(node);
        break;
      }
      case "subagent_start": {
        const agentType = stringOf(payload, "agentType");
        const agentId = stringOf(payload, "agentId");
        const label = SUBAGENT_LABELS[agentType ?? ""] ?? FALLBACK_SUBAGENT_LABEL;
        const metadata: Record<string, string | number | boolean> = {};
        if (agentType) metadata.agentType = agentType;
        if (agentId) metadata.agentId = agentId;
        const node = makeNode(event.seq, at, {
          type: "subagent",
          actor: "subagent",
          status: "running",
          title: label.running,
          visibility: "user",
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
          _interval: true,
        });
        intervals.push(node);
        subagentStack.push(node);
        if (agentId) {
          subagentsById.set(agentId, node);
          subagentNodeByAgentId.set(agentId, node);
        }
        break;
      }
      case "subagent_stop": {
        const agentType = stringOf(payload, "agentType");
        const agentId = stringOf(payload, "agentId");
        const label = SUBAGENT_LABELS[agentType ?? ""] ?? FALLBACK_SUBAGENT_LABEL;
        // Prefer exact pairing by agentId (Fase 2) — correct even for parallel
        // sub-agents; fall back to LIFO for thin Fase 1 events.
        let node: WorkingNode | undefined;
        if (agentId && subagentsById.has(agentId)) {
          node = subagentsById.get(agentId);
          subagentsById.delete(agentId);
          if (node) {
            const i = subagentStack.indexOf(node);
            if (i >= 0) subagentStack.splice(i, 1);
          }
        } else {
          node = subagentStack.pop();
        }
        if (node) {
          node.status = "completed";
          node.title = label.completed;
          close(node, event.seq, at);
        }
        break;
      }
      case "phase_start": {
        const phase = stringOf(payload, "phase") ?? "";
        const label = PHASE_LABELS[phase] ?? FALLBACK_PHASE_LABEL;
        const node = makeNode(event.seq, at, {
          type: "phase",
          actor: "main",
          status: "running",
          title: label.running,
          visibility: "user",
          metadata: phase ? { phase } : undefined,
          _interval: true,
        });
        intervals.push(node);
        phaseStack.push(node);
        break;
      }
      case "phase_done": {
        const phase = stringOf(payload, "phase") ?? "";
        const label = PHASE_LABELS[phase] ?? FALLBACK_PHASE_LABEL;
        const node = phaseStack.pop();
        if (node) {
          node.status = "completed";
          node.title = label.completed;
          close(node, event.seq, at);
        }
        break;
      }
      case "interaction_pending": {
        const tool = stringOf(payload, "toolName") ?? "";
        const interactionId = stringOf(payload, "interactionId");
        const label = APPROVAL_LABELS[tool] ?? FALLBACK_APPROVAL_LABEL;
        const node = makeNode(event.seq, at, {
          type: "approval",
          actor: "system",
          status: "waiting_approval",
          title: label.running,
          visibility: "user",
          metadata: tool ? { tool } : undefined,
          _interval: false,
        });
        leaves.push(node);
        if (interactionId) approvalsById.set(interactionId, node);
        break;
      }
      case "interaction_resolved": {
        const tool = stringOf(payload, "toolName") ?? "";
        const interactionId = stringOf(payload, "interactionId");
        const label = APPROVAL_LABELS[tool] ?? FALLBACK_APPROVAL_LABEL;
        const node = interactionId ? approvalsById.get(interactionId) : undefined;
        if (node) {
          node.status = "completed";
          node.title = label.completed;
          close(node, event.seq, at);
        }
        break;
      }
      case "compaction": {
        // Internal housekeeping: not part of the user narrative, but useful for
        // debugging — surfaced only in dev/debug mode (Fase 3 visibility gate).
        const node = makeNode(event.seq, at, {
          type: "system",
          actor: "system",
          status: "completed",
          title: "Merapikan konteks",
          visibility: "developer",
          _interval: false,
        });
        close(node, event.seq, at);
        leaves.push(node);
        break;
      }
      case "error": {
        const message = safeErrorText(stringOf(payload, "message"));
        // Attribute to the most-recent still-open tool if any; otherwise the
        // error is run-level and surfaces on the run header.
        const openTool = openToolOrder.pop();
        if (openTool) {
          openTool.status = "failed";
          openTool.title = failedTitle(labelForNode(openTool) ?? FALLBACK_TOOL_LABEL);
          if (message) openTool.description = message;
          close(openTool, event.seq, at);
          const stack = toolStacks.get(
            typeof openTool.metadata?.tool === "string"
              ? openTool.metadata.tool
              : "",
          );
          if (stack) {
            const idx = stack.indexOf(openTool);
            if (idx >= 0) stack.splice(idx, 1);
          }
          // De-index from BOTH open-tool maps so a later tool_end can never
          // resurrect this failed node (parity with the toolStacks removal
          // above — Fase 2 added toolsByUseId, which must be evicted too).
          for (const [id, node] of toolsByUseId) {
            if (node === openTool) {
              toolsByUseId.delete(id);
              break;
            }
          }
        } else if (message) {
          runErrorMessage = message;
        }
        break;
      }
      // run_status is consumed by the run header (built from the run row), not
      // rendered as its own node. waiting_hitl is represented by the approval
      // node from interaction_pending; completed/running drive the header. A
      // `canceled` status is the one we also read here: it is a terminal marker
      // (runManager emits it on cancel) used below to close open nodes.
      case "run_status": {
        if (stringOf(payload, "status") === "canceled") sawCanceledEvent = true;
        break;
      }
      default:
        break;
    }
  }

  // Effective terminal status: the run row drives it, but a streamed
  // `run_status: canceled` event upgrades a not-yet-terminal row to canceled
  // (the emit and the row write both happen in cancelRun; this keeps the
  // timeline correct if the event is observed first).
  const rowTerminal = ["completed", "failed", "canceled"].includes(run.status);
  const effectiveRunStatus: AgentRunRow["status"] =
    !rowTerminal && sawCanceledEvent ? "canceled" : run.status;

  // 2. Terminal status: close anything still open. Set status/timing only —
  //    never shrink the seq window, so coarse nesting in step 3 still attributes
  //    later tools to a sub-agent/phase that the run ended inside of.
  const terminal = ["completed", "failed", "canceled"].includes(effectiveRunStatus);
  if (terminal) {
    const endedAt = run.updatedAt;
    const fallbackStatus: ActivityStatus =
      effectiveRunStatus === "completed"
        ? "completed"
        : effectiveRunStatus === "canceled"
          ? "cancelled"
          : "failed";
    const closeTerminal = (node: WorkingNode, status: ActivityStatus) => {
      node.status = status;
      node.endedAt = endedAt;
      node.durationMs = Math.max(0, endedAt - node.startedAt);
      // Keep the title consistent with the status the node inherits. A node left
      // "running" still carries its action label, so map it to the matching
      // completed/failed copy; a cancelled action keeps its action label (it was
      // interrupted mid-step), except an approval which becomes explicit.
      const label = labelForNode(node);
      if (status === "completed") {
        if (label) node.title = label.completed;
        else if (node.type === "approval") node.title = "Persetujuan diterima";
      } else if (status === "failed" && label) {
        node.title = failedTitle(label);
      } else if (status === "cancelled" && node.type === "approval") {
        node.title = "Persetujuan dibatalkan";
      }
    };
    for (const node of [...leaves, ...intervals]) {
      if (node.status === "running") {
        closeTerminal(node, fallbackStatus);
      } else if (node.status === "waiting_approval") {
        // A terminal run can no longer be blocked on the user: a completed run
        // implies the approval was granted (or became unnecessary); a failed or
        // canceled run cancels it. Either way the node must not hang on
        // "waiting_approval" — the in-turn interaction_resolved is the normal
        // close; this is the safety net when that event never arrives (model
        // approves but never retries, or the event was truncated).
        closeTerminal(
          node,
          effectiveRunStatus === "completed" ? "completed" : "cancelled",
        );
      }
    }
  }

  // 3. Nesting. Sub-agents nest into the innermost containing phase by seq
  //    window (phases never overlap, so this is exact). Leaves prefer PRECISE
  //    nesting: a tool whose hook fired inside a sub-agent carries that
  //    sub-agent's agent_id, so it attaches to exactly that sub-agent — correct
  //    even when sub-agents run in parallel, where a seq-window guess is not.
  //    Tools without an agent_id (main thread, or thin Fase 1 events) fall back
  //    to the innermost containing interval by seq window.
  // Sub-agents nest into the innermost containing PHASE only — never into one
  //   another. Parallel sub-agents overlap by seq window, so nesting by all
  //   intervals would wrongly make one the child of another; phases never
  //   overlap, so phase containment is exact. Their tools then attach by
  //   agent_id below, keeping parallel sub-agents as correct siblings.
  const phaseIntervals = intervals.filter((node) => node.type === "phase");
  // Seq-window container pool for leaves WITHOUT a parentAgentId (main-thread
  // tools, or thin pre-Fase-3 events). It includes every phase (a main-thread
  // tool belongs to its phase, open or closed) plus sub-agents that actually
  // CLOSED (a real _endSeq). A sub-agent whose subagent_stop was never observed
  // keeps an open window (OPEN_SEQ) that would otherwise swallow every later
  // main-thread tool in the phase — exclude it, so a stop-less worker's tools
  // attach ONLY via parentAgentId, never by an unbounded seq window.
  const leafContainers = intervals.filter(
    (node) => node.type === "phase" || node._endSeq !== OPEN_SEQ,
  );
  const topLevel: WorkingNode[] = [];
  for (const interval of intervals) {
    if (interval.type === "subagent") {
      const parent = innermostContainer(interval._startSeq, phaseIntervals);
      if (parent) {
        interval.parentId = parent.id;
        (parent.children ??= []).push(interval);
        continue;
      }
    }
    topLevel.push(interval);
  }
  for (const leaf of leaves) {
    const subagentParent = leaf._parentAgentId
      ? subagentNodeByAgentId.get(leaf._parentAgentId)
      : undefined;
    const parent =
      subagentParent ?? innermostContainer(leaf._startSeq, leafContainers);
    if (parent) {
      leaf.parentId = parent.id;
      (parent.children ??= []).push(leaf);
    } else {
      topLevel.push(leaf);
    }
  }

  // 4. Order siblings by seq everywhere.
  const orderBySeq = (a: ActivityEvent, b: ActivityEvent) => a.seq - b.seq;
  const sortTree = (node: WorkingNode) => {
    if (node.children) {
      (node.children as WorkingNode[]).forEach(sortTree);
      node.children.sort(orderBySeq);
    }
  };
  topLevel.forEach(sortTree);
  topLevel.sort((a, b) => a._startSeq - b._startSeq);

  // 5. Run header node (result[0]).
  const runActive = !terminal;
  const runStatus: ActivityStatus = runActive
    ? "running"
    : effectiveRunStatus === "completed"
      ? "completed"
      : effectiveRunStatus === "canceled"
        ? "cancelled"
        : "failed";
  const runTitle = runActive
    ? isDeep
      ? RUN_RUNNING_TITLE.deep
      : RUN_RUNNING_TITLE.normal
    : (RUN_TERMINAL_TITLE[effectiveRunStatus] ?? "Selesai");
  const runNode: ActivityEvent = {
    id: `${runId}:run`,
    runId,
    seq: -1,
    type: "run",
    actor: "main",
    status: runStatus,
    title: runTitle,
    // Only the error EVENT message reaches the header — it is sanitized at the
    // source (apps/agents `sanitizeRunErrorMessage`). The raw `run.errorMessage`
    // is kept for ops but is NOT rendered: it can carry a stack/path/secret and
    // is not allow-listed (no-leak invariant). When no event message exists the
    // header relies on its title ("Berhenti sebelum selesai") instead.
    description: effectiveRunStatus === "failed" ? runErrorMessage : undefined,
    visibility: "user",
    startedAt: run.createdAt,
    endedAt: terminal ? run.updatedAt : undefined,
    durationMs: terminal ? Math.max(0, run.updatedAt - run.createdAt) : undefined,
  };

  return [runNode, ...topLevel.map(toClean)];
}
