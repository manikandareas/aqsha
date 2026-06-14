import {
  type ActivityEvent,
  subagentCurrentActivity,
  subagentSummary,
} from "@aqsha/agent-contracts";
import type { ChatMessage, ResearchArtifact, ResearchRun } from "../types";

// ── unified turn model (answer-stream redesign Fase 2) ───────────────────────
//
// Replaces `interleaveRunsWithMessages` (sibling run + message entries) with ONE
// `assistant-turn` per RUN. The run's interleaved reasoning ↔ tool ↔ text order
// comes from `run.orderedParts` (Fase 1 `orderedPartsFromRun`); the final answer
// body comes from the run's LAST assistant `message.text` (canonical, never
// truncated — segment events can be) — see `buildTurnParts`. Pure + unit-tested.

/** One renderable part of an assistant turn, in execution order. */
export type TurnPart =
  | { kind: "reasoning"; id: string; text: string; isThinking: boolean }
  | { kind: "tool"; id: string; node: ActivityEvent }
  // An `executeArtifact` tool call renders as a clickable artifact card (Fase 4)
  // instead of a plain tool row — opens the artifact's side panel / deep-link.
  | { kind: "artifact"; id: string; node: ActivityEvent }
  | { kind: "subagent"; id: string; node: ActivityEvent }
  | { kind: "phase"; id: string; node: ActivityEvent }
  | { kind: "approval"; id: string; node: ActivityEvent }
  | { kind: "system"; id: string; node: ActivityEvent }
  // Assistant prose emitted BETWEEN tool calls. Rare for this agent (it usually
  // calls tools, then writes one final answer). The trailing/final text segment
  // is NOT a part — it is rendered from the canonical `message.text`.
  | { kind: "intermediate-text"; id: string; text: string };

/** Transcript entries: a user bubble, or one assistant turn (per run). */
export type TurnEntry =
  | { kind: "user"; message: ChatMessage }
  | {
      kind: "assistant-turn";
      // The run's LAST assistant message (the canonical final answer). Undefined
      // while a run has started streaming but written no assistant text yet.
      message?: ChatMessage;
      run?: ResearchRun;
      // Pending HITL synthetic messages for this run (askUser / approval). Render
      // ONE card at the approval node's seq position — never double with the node.
      hitl?: ChatMessage[];
    };

function isAssistant(message: ChatMessage): boolean {
  return message.role === "assistant";
}

/**
 * Pair messages + runs into ordered transcript entries — ONE assistant turn per
 * RUN. A run is positioned right after its prompt user message (via
 * `promptMessageId`); a run with no prompt match surfaces when its assistant
 * message is reached, or as a trailing turn (orphan). HITL resume produces two
 * assistant messages for one run — both belong to the single turn, and the final
 * answer is the later one. `pendingHitlByRun` carries the synthetic HITL messages
 * (which have no message-level runId) keyed by their interaction's runId.
 */
export function pairRunsWithTurns(
  messages: ChatMessage[],
  runs: ResearchRun[],
  pendingHitlByRun?: Map<string, ChatMessage[]>,
): TurnEntry[] {
  const hitlByRun = pendingHitlByRun ?? new Map<string, ChatMessage[]>();

  // Runs in start order — used both to assign each assistant message to its run
  // (by createdAt window) and to keep multiple runs per prompt in order.
  const sortedRuns = [...runs].sort(
    (a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0),
  );

  // Assign each assistant message to the run it belongs to: the latest run that
  // started at/before the message. Later messages overwrite, so the LAST message
  // of a run wins as its final answer.
  const runFinalMessage = new Map<string, ChatMessage>();
  const runIdByMessageId = new Map<string, string>();
  const assistantMessages = messages
    .filter(isAssistant)
    .sort((a, b) => a.order - b.order || a.stepOrder - b.stepOrder);
  for (const message of assistantMessages) {
    let owner: ResearchRun | undefined;
    for (const run of sortedRuns) {
      if ((run.createdAt ?? 0) <= message.order) owner = run;
      else break;
    }
    if (owner) {
      runFinalMessage.set(owner._id, message);
      runIdByMessageId.set(message.id, owner._id);
    }
  }

  // Runs bucketed by prompt message, preserving start order.
  const runsByPrompt = new Map<string, ResearchRun[]>();
  for (const run of sortedRuns) {
    if (!run.promptMessageId) continue;
    const bucket = runsByPrompt.get(run.promptMessageId) ?? [];
    bucket.push(run);
    runsByPrompt.set(run.promptMessageId, bucket);
  }

  const runById = new Map(runs.map((run) => [run._id, run] as const));
  const emitted = new Set<string>();
  const entries: TurnEntry[] = [];

  const emitRunTurn = (run: ResearchRun) => {
    if (emitted.has(run._id)) return;
    emitted.add(run._id);
    entries.push({
      kind: "assistant-turn",
      run,
      message: runFinalMessage.get(run._id),
      hitl: hitlByRun.get(run._id),
    });
  };

  for (const message of messages) {
    if (message.role === "user") {
      entries.push({ kind: "user", message });
      for (const run of runsByPrompt.get(message.id) ?? []) emitRunTurn(run);
      continue;
    }
    if (message.role === "assistant") {
      const runId = runIdByMessageId.get(message.id);
      const run = runId ? runById.get(runId) : undefined;
      if (run) {
        // Belongs to a run — emit that run's single turn (once); a run's later
        // messages (HITL resume) are absorbed, never a second turn.
        emitRunTurn(run);
      } else {
        // Runless assistant message (legacy, or no run row) → its own turn.
        entries.push({ kind: "assistant-turn", message });
      }
    }
    // system / tool roles are not rendered as turns.
  }

  // Trailing: runs never positioned (orphan — no prompt match, no assistant msg).
  for (const run of sortedRuns) emitRunTurn(run);

  // Pending HITL whose run has no turn at all → surface as a trailing turn so the
  // card is never lost.
  for (const [runId, hitl] of hitlByRun) {
    if (!runById.has(runId)) entries.push({ kind: "assistant-turn", hitl });
  }

  return entries;
}

export function turnEntryKey(entry: TurnEntry): string {
  if (entry.kind === "user") {
    return `user:${entry.message.key ?? entry.message.id}`;
  }
  if (entry.run) return `turn:run:${entry.run._id}`;
  if (entry.message) return `turn:msg:${entry.message.key ?? entry.message.id}`;
  return `turn:hitl:${entry.hitl?.[0]?.id ?? "pending"}`;
}

export function turnGapClass(
  previous: TurnEntry | undefined,
  current: TurnEntry,
): string {
  // Tighter gap between a user prompt and the assistant turn that answers it.
  if (previous?.kind === "user" && current.kind === "assistant-turn") {
    return "mt-4";
  }
  return "mt-7";
}

// ── turn parts ───────────────────────────────────────────────────────────────

function textOf(message: ChatMessage | undefined): string {
  if (!message) return "";
  const fromParts = message.parts
    ?.flatMap((part) => (part.type === "text" && part.text ? [part.text] : []))
    .join("");
  return fromParts || message.text || "";
}

function reasoningOf(message: ChatMessage | undefined): string {
  if (!message) return "";
  return (
    message.parts
      ?.flatMap((part) =>
        part.type === "reasoning" && part.text ? [part.text] : [],
      )
      .join("") ?? ""
  );
}

/**
 * Whether a node is the `executeArtifact` tool call that writes a document — the
 * one tool rendered as a clickable artifact card instead of a tool row. The
 * discriminator is the allow-listed logical tool name on `metadata.tool` (set at
 * the source for every tool node); never a brittle title match. `proposeArtifact`
 * stays a tool/approval row — it has no `artifactId` to open until executed.
 */
export function isArtifactToolNode(node: ActivityEvent): boolean {
  return node.type === "tool" && node.metadata?.tool === "executeArtifact";
}

function nodePart(
  node: ActivityEvent,
): Extract<
  TurnPart,
  { kind: "tool" | "artifact" | "subagent" | "phase" | "approval" | "system" }
> {
  if (isArtifactToolNode(node)) {
    return { kind: "artifact", id: node.id, node };
  }
  const kind =
    node.type === "subagent"
      ? "subagent"
      : node.type === "phase"
        ? "phase"
        : node.type === "approval"
          ? "approval"
          : node.type === "system"
            ? "system"
            : "tool";
  return { kind, id: node.id, node };
}

/**
 * Ordered renderable parts of a turn (everything BUT the final answer, which the
 * `AssistantTurn` sources from `message.text`). Primary path: `run.orderedParts`
 * (Fase 1, precise seq order). Fallback (legacy run with no segments, or a
 * runless message): the message's reasoning blob + the run's activity nodes.
 *
 * Final-answer handling: the LAST text segment is the final answer (rendered from
 * `message.text`), so it is dropped here; earlier text segments render inline as
 * `intermediate-text`. This is correct in the common no-intermediate case (one
 * trailing segment == `message.text`) and truncation-safe (the segment event may
 * be clamped; `message.text` is not).
 */
export function buildTurnParts(
  message: ChatMessage | undefined,
  run: ResearchRun | undefined,
): TurnPart[] {
  const isStreaming = message?.status === "streaming";
  const hasAnswerText = Boolean(textOf(message).trim());
  const ordered = run?.orderedParts;

  // ── fallback: legacy run (no segments) or runless message ──────────────────
  if (!ordered) {
    const parts: TurnPart[] = [];
    const reasoning = reasoningOf(message);
    if (reasoning.trim()) {
      parts.push({
        kind: "reasoning",
        id: `${message?.id ?? "msg"}:reasoning`,
        text: reasoning,
        isThinking: Boolean(isStreaming && !hasAnswerText),
      });
    }
    // Activity nodes from the tree (drop the run header), in seq order.
    const nodes = (run?.activity ?? []).filter((node) => node.type !== "run");
    for (const node of [...nodes].sort((a, b) => a.seq - b.seq)) {
      parts.push(nodePart(node));
    }
    return parts;
  }

  // ── primary: ordered segments + nodes by seq ───────────────────────────────
  const lastTextSeq = ordered.reduce<number | undefined>(
    (max, part) =>
      part.kind === "text" ? (max === undefined ? part.seq : Math.max(max, part.seq)) : max,
    undefined,
  );
  // The last reasoning segment is the one that may still be "thinking".
  const lastReasoningSeq = ordered.reduce<number | undefined>(
    (max, part) =>
      part.kind === "reasoning"
        ? max === undefined
          ? part.seq
          : Math.max(max, part.seq)
        : max,
    undefined,
  );

  const parts: TurnPart[] = [];
  for (const part of ordered) {
    if (part.kind === "reasoning") {
      if (!part.text.trim()) continue;
      parts.push({
        kind: "reasoning",
        id: `${run!._id}:reasoning:${part.seq}`,
        text: part.text,
        isThinking: Boolean(
          isStreaming && !hasAnswerText && part.seq === lastReasoningSeq,
        ),
      });
    } else if (part.kind === "text") {
      // The final answer is sourced from message.text — skip the last text
      // segment; render only earlier (intermediate) prose inline.
      if (part.seq === lastTextSeq) continue;
      if (!part.text.trim()) continue;
      parts.push({
        kind: "intermediate-text",
        id: `${run!._id}:text:${part.seq}`,
        text: part.text,
      });
    } else {
      parts.push(nodePart(part.node));
    }
  }
  return parts;
}

// ── tool row presentation (Fase 2 §6) ────────────────────────────────────────

// Statistical-verification verdict → sentence-case Indonesian (mirrors the
// contract catalog; kept local so the view layer needs no contract coupling).
const VERDICT_LABELS: Record<string, string> = {
  passed: "Lolos",
  passed_with_notes: "Lolos dengan catatan",
  needs_review: "Perlu ditinjau",
  failed: "Tidak lolos",
};

// Allow-list of safe scalar metadata keys → sentence-case Indonesian labels.
// DEFAULT-DENY: any key NOT listed here (e.g. `tool`, `agentId`, `agentType`,
// `phase`, `artifactId`, `action`) is never surfaced in the tool-row body, so
// internal identifiers / future payload fields can't leak into the UI.
const METADATA_LABELS: Record<string, string> = {
  query: "Kueri",
  resultCount: "Jumlah hasil",
  doi: "DOI",
  checksRun: "Pemeriksaan",
  verdict: "Hasil",
  checked: "Kutipan diperiksa",
  verified: "Terverifikasi",
  flagged: "Ditandai",
  questionCount: "Pertanyaan",
  hasResults: "Dokumen ditemukan",
  title: "Judul",
  name: "Nama",
};

const METADATA_ORDER = Object.keys(METADATA_LABELS);

export type ToolRowModel = {
  title: string;
  isRunning: boolean;
  /** Inline summary chip from the node description (e.g. "12 hasil"). */
  description?: string;
  /** Curated body rows (allow-listed scalars only). Empty → header-only row. */
  rows: Array<{ key: string; label: string; value: string }>;
};

function formatScalar(key: string, value: string | number | boolean): string {
  if (key === "verdict" && typeof value === "string") {
    return VERDICT_LABELS[value] ?? value;
  }
  if (typeof value === "boolean") return value ? "Ya" : "Tidak";
  return String(value);
}

// ── sub-agent card presentation (Fase 3 §8) ──────────────────────────────────

export type SubagentCardModel = {
  title: string;
  isRunning: boolean;
  /** Dynamic summary line: running → current tool activity; terminal → roll-up.
   *  Undefined only while running with no tool child yet (card uses title). */
  summary?: string;
  /** Tool children rendered when expanded (or always, in dev-mode). */
  children: ActivityEvent[];
  /** Dev-mode reveals the tool children without the user having to expand. */
  forceExpanded: boolean;
};

/**
 * Pure presentation model for one sub-agent card (§8). Title stays the sub-agent
 * label; the summary line is dynamic — `subagentCurrentActivity` while running
 * (rendered via Shimmer), `subagentSummary` once terminal. The tool children are
 * hidden behind an expand unless `devMode` forces them open. No-leak: all copy is
 * derived through the contract's allow-listed helpers.
 */
export function subagentCardModel(
  node: ActivityEvent,
  options?: { devMode?: boolean },
): SubagentCardModel {
  const isRunning = node.status === "running";
  return {
    title: node.title,
    isRunning,
    summary: isRunning ? subagentCurrentActivity(node) : subagentSummary(node),
    children: node.children ?? [],
    forceExpanded: options?.devMode === true,
  };
}

/** Count the sub-agents still running among a node list (for the "N berjalan"
 *  chip at the phase/group level). Pure. */
export function runningSubagentCount(nodes: ActivityEvent[]): number {
  return nodes.filter(
    (node) => node.type === "subagent" && node.status === "running",
  ).length;
}

// ── chat artifact card presentation (Fase 4 §7) ──────────────────────────────

export type ChatArtifactCardModel = {
  /** Opaque artifact id (allow-listed `safeId`) — resolves the row, the side
   *  panel, and the compact deep-link. Absent while the write is still running. */
  artifactId?: string;
  title: string;
  artifactType?: string;
  /** "create" → "Dibuat", "update" → "Diperbarui". Defaults to create. */
  action: "create" | "update";
  /** The write is still in flight (no id yet) → show a "Menulis/Memperbarui
   *  dokumen…" shimmer instead of a clickable card. */
  live: boolean;
  /** Whether `artifactId` resolved to a row in the per-thread artifact list. */
  found: boolean;
  source?: ResearchArtifact["source"];
  createdAt?: number;
  updatedAt?: number;
  /** The artifact's OWN workspace — the compact deep-link target. */
  workspaceId?: string;
};

function artifactAction(value: string | number | boolean | undefined): "create" | "update" {
  return value === "update" ? "update" : "create";
}

/**
 * Pure presentation model for one in-chat artifact card (§7). Resolves the
 * `executeArtifact` node's `metadata.artifactId` against the per-thread artifact
 * list (`artifactById`) for the authoritative title / type / timestamps;
 * otherwise falls back to the node's own (allow-listed) title. While the node is
 * still `running` there is no id yet → `live`, so the card shows a writing
 * shimmer. No-leak: every field is an allow-listed scalar (`artifactId`/`action`/
 * `title`) or comes from the resolved row — never raw payload. Pure.
 */
export function chatArtifactCardModel(
  node: ActivityEvent,
  artifactById: Map<string, ResearchArtifact>,
): ChatArtifactCardModel {
  const meta = node.metadata ?? {};
  const artifactId = typeof meta.artifactId === "string" ? meta.artifactId : undefined;
  const action = artifactAction(meta.action);
  const live = node.status === "running" || (node.status === "pending" && !artifactId);
  const row = artifactId ? artifactById.get(artifactId) : undefined;
  const metaTitle = typeof meta.title === "string" ? meta.title : undefined;

  return {
    artifactId,
    title: row?.title ?? metaTitle ?? "Dokumen",
    artifactType: row?.artifactType,
    action,
    live,
    found: Boolean(row),
    source: row?.source,
    createdAt: row?.createdAt,
    updatedAt: row?.updatedAt,
    workspaceId: row?.workspaceId,
  };
}

/** Pure presentation model for a tool node's collapsible row (§6). */
export function toolRowModel(node: ActivityEvent): ToolRowModel {
  const meta = node.metadata ?? {};
  const rows: ToolRowModel["rows"] = [];
  for (const key of METADATA_ORDER) {
    const value = meta[key];
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      rows.push({ key, label: METADATA_LABELS[key], value: formatScalar(key, value) });
    }
  }
  return {
    title: node.title,
    isRunning: node.status === "running",
    description: node.description,
    rows,
  };
}
