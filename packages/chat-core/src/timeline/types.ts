// Timeline presentation types — runtime-neutral (not tied to a specific adapter). Shared by the
// render components (message-list, tool-row, chat-artifact-card) and the per-runtime adapter
// (mastra-timeline), so the render layer never needs to know the runtime chunk shape.

/** Display status of a single tool-call. */
export type ToolStatus =
  "running" | "pending" | "completed" | "failed" | "denied";

/** One scalar row (allow-by-type) in a tool-row body, grouped input/output. */
export type ToolRow = {
  key: string;
  label: string;
  value: string;
  group: "input" | "output";
};

/**
 * Source-as-card — neutral presentation contract (consistent favicon, no OG image). Filled from
 * `search_*` tool results (stream/rehydrate) OR `research_sources` rows (DB, with `citationNumber`).
 * Adapter in `lib/source-card.ts`.
 */
export type SourceCardData = {
  /** Dedup key + stable react-key (doi/url/arxivId/title or DB row id). */
  key: string;
  title: string;
  url: string | null;
  doi: string | null;
  /** Source class: "web" | "arxiv" | "doi" → icon + label. */
  origin: string;
  snippet?: string;
  /** Citation number `[n]` — DB-deep path only (normal/live chat = undefined). */
  citationNumber?: number | null;
};

/** One search sub-agent (`/deep` step `search-literature`) — one card per sub-question. */
export type DeepSubSearch = {
  index: number;
  subQuestion: string;
  /** "running" while the sub-agent works; "completed" when done. */
  status: ToolStatus;
  /** Live sources emitted by the step when the sub-agent finishes (`writer.write`). Fallback: DB. */
  sources?: SourceCardData[];
};

/** One column of a `profile_dataset` result (defensive parse of `aqsha_stats` `profile` output). */
export type DatasetProfileColumn = {
  name: string;
  /** Python-detected type ("numeric" | "categorical" | "text") — free string (defensive). */
  type: string;
  /** Count of empty cells in this column (0 when unreadable). */
  missing: number;
  /** Detected Likert range ("1-5"/"1-7") — undefined when not Likert. */
  likert?: string;
};

/** Dataset profile summary for the chat card — optional fields: unreadable ones are hidden by UI. */
export type DatasetProfileSummary = {
  /** Dataset row count (`meta.n`) — undefined when unreadable. */
  rowCount?: number;
  columns: DatasetProfileColumn[];
};

/**
 * Process detail for one `/deep` Workflow step (expandable "Process" tool-row body). Filled from
 * a `workflow-step-output` chunk (live), a step-output snapshot (refresh poll), or
 * `metadata.deepProcess` (history). `kind:"search"` (deep) carries live sources per sub-question +
 * DB fallback via `subQuestionIndex`; `kind:"search-flat"` (normal chat) = result cards of one
 * `search_*` tool. `kind:"analysis"`/`"dataset-profile"` (normal chat stats tools) = analysis run card /
 * run card / dataset card replacing the generic tool-row (union name is historical `/deep`, used
 * across chat).
 */
export type DeepStepDetail =
  | { kind: "plan"; plan: string; subQuestions: string[] }
  | { kind: "search"; subSearches: DeepSubSearch[] }
  | { kind: "search-flat"; sources: SourceCardData[] }
  | { kind: "text"; text: string }
  | { kind: "citations"; count: number }
  | {
      kind: "analysis";
      /** Catalog analysis id, or "custom" for run_python_analysis ("" while args stream). */
      analysis: string;
      /** Human run title — META label / custom title; card uses the DB group title if present. */
      title: string;
      /** Column-mapping args summary (e.g. "X1: X1.1–X1.5 · Y: Y.1–Y.4"), best-effort from input. */
      argsSummary?: string;
      artifactId?: string;
      credits: number;
      /** Sanitized runKey (`toRunKey`, same sanitizer as agent) — link to the run-scoped stats panel. */
      runKey: string;
      /** Tool settled with `ok:false` → error card (friendly note from the tool). */
      failed?: boolean;
      note?: string;
    }
  | {
      kind: "dataset-profile";
      artifactId: string;
      profile: DatasetProfileSummary;
    };

/** Presentation model of one tool-row (collapsible). Default-deny: only scalars pass. */
export type ToolRowModel = {
  toolCallId: string;
  /** Raw tool name (e.g. "search_web") — used to pick a semantic icon. */
  name: string;
  title: string;
  kind: "tool-call" | "subagent-call" | "load-skill" | "unknown";
  status: ToolStatus;
  isRunning: boolean;
  /** Inline summary (e.g. "12 results") from output. */
  description?: string;
  /** Curated body rows (scalars only). Empty → render header-only. */
  rows: ToolRow[];
  /** `/deep` process detail (plan, search sub-agent cards, counter-evidence, etc.). */
  detail?: DeepStepDetail;
  /** Epoch-ms step start (Workflow snapshot `steps[id].startedAt`) — timer anchor across refresh. */
  startedAt?: number;
  /** Accumulated streaming arg JSON text (`tool-call-delta`) — reducer-internal. */
  argsTextRaw?: string;
};

/** Artifact card model from a successful `propose_artifact` output. */
export type ArtifactCardModel = {
  toolCallId: string;
  artifactId: string;
  title: string;
  artifactType: string;
};

/** CTA model from a trusted successful `propose_document_edit` tool result. */
export type DocumentProposalCardModel = { proposalId: string; summary: string };

/** One ordered part in a single assistant message's timeline. */
export type TimelinePart =
  | { kind: "text"; id: string; text: string; streaming: boolean }
  | { kind: "reasoning"; id: string; text: string; thinking: boolean }
  | { kind: "tool"; id: string; model: ToolRowModel }
  | { kind: "artifact"; id: string; model: ArtifactCardModel }
  | { kind: "document-proposal"; id: string; model: DocumentProposalCardModel };

/** Normalized message for the renderer (user = bubble; assistant = ordered parts). */
export type TimelineMessage = {
  id: string;
  role: "assistant" | "user";
  /** True while this message's turn is still streaming. */
  streaming: boolean;
  /** Runtime turn id — used to map research sources (`research_sources.turnId`) to the turn. */
  turnId?: string;
  /** Epoch-ms the message was created — maps upload attachments (artifact `createdAt`) to a user
   * message (read-side join over the time window between messages). 0 when unknown. */
  createdAt: number;
  /** Attachment artifact ids SENT with this message (optimistic messages of this session only). When
   * present, used directly to show the live attachment card — EXACT, no time-window guessing (see
   * `bucketMessageAttachments`). Rehydrated messages lack this → use the server time window. */
  attachmentIds?: string[];
  /** Numbered report sources of a `/deep` report (from `metadata.deepProcess.sources`) — DB-independent
   * fallback for `[n]` pills + the "Sources" panel when the live `research_sources` fetch misses (see
   * `messageSourceCards`). Only `/deep` report messages on rehydrate. */
  reportSources?: SourceCardData[];
  parts: TimelinePart[];
};
