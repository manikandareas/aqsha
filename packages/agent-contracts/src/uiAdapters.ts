// Adapters from the SDK-backend Convex rows to the shapes the existing
// apps/web thread-experience components consume (plan §9.4 Step 2: data-hooks
// change, UI components do not). Structural copies of the web types — kept
// minimal and assignable to features/thread-experience/types.
import { activityEventsFromRun, type ActivityEvent } from "./activity";

export type AgentMessageRow = {
  messageId: string;
  role: "user" | "assistant" | "system";
  text: string;
  /** Captured extended-thinking/reasoning stream (assistant messages only). */
  reasoning?: string;
  runId?: string;
  status: "streaming" | "complete" | "error";
  createdAt: number;
};

export type AgentInteractionRow = {
  id: string;
  runId: string;
  type: "ask_user" | "tool_approval";
  toolName: string;
  payloadJson: string;
  createdAt: number;
};

export type AgentRunRow = {
  runId: string;
  promptMessageId?: string;
  status:
    | "queued"
    | "running"
    | "waiting"
    | "waiting_hitl"
    | "completed"
    | "failed"
    | "canceled";
  mode: "normal" | "deep";
  agentKind: "lite" | "pro";
  costUsd?: number;
  numTurns?: number;
  errorMessage?: string;
  verificationReportJson?: string;
  createdAt: number;
  updatedAt: number;
  events: Array<{
    id: string;
    seq: number;
    type: string;
    payloadJson: string;
    createdAt: number;
  }>;
};

export type UiMessagePart = {
  type: string;
  text?: string;
  toolCallId?: string;
  toolName?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  approval?: { id: string; isAutomatic?: boolean; approved?: boolean; reason?: string };
};

export type UiChatMessage = {
  id: string;
  key: string;
  role: "system" | "user" | "assistant" | "tool";
  status: "pending" | "success" | "failed" | "streaming";
  order: number;
  stepOrder: number;
  text?: string;
  parts?: UiMessagePart[];
};

const MESSAGE_STATUS_MAP = {
  streaming: "streaming",
  complete: "success",
  error: "failed",
} as const;

export function uiMessageFromRow(row: AgentMessageRow): UiChatMessage {
  // Reasoning renders as a collapsible block ABOVE the answer, so it must come
  // first in `parts`. getMessageText (apps/web) only reads `type === "text"`,
  // so the reasoning part never leaks into the copied/rendered answer body.
  const parts: UiMessagePart[] = [];
  if (row.reasoning) {
    parts.push({ type: "reasoning", text: row.reasoning });
  }
  if (row.text) {
    parts.push({ type: "text", text: row.text });
  }
  return {
    id: row.messageId,
    key: row.messageId,
    role: row.role,
    status: MESSAGE_STATUS_MAP[row.status],
    order: row.createdAt,
    stepOrder: 0,
    text: row.text,
    parts,
  };
}

function parsePayload(json: string): Record<string, unknown> {
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
 * A pending interaction renders as a synthetic assistant message whose single
 * tool part matches what utils/hitl-parts.ts expects:
 * - ask_user → state "input-available" on tool-askUser;
 * - tool_approval → state "approval-requested" + approval.id = interaction id.
 * The card callbacks then carry the interaction id back as toolCallId /
 * approvalId, which the respond mutation accepts directly.
 */
export function uiHitlMessageFromInteraction(row: AgentInteractionRow): UiChatMessage {
  const part: UiMessagePart =
    row.type === "ask_user"
      ? {
          type: "tool-askUser",
          toolCallId: row.id,
          state: "input-available",
          input: parsePayload(row.payloadJson),
        }
      : {
          type: `tool-${row.toolName}`,
          toolCallId: row.id,
          state: "approval-requested",
          input: parsePayload(row.payloadJson),
          approval: { id: row.id },
        };
  return {
    id: `hitl_${row.id}`,
    key: `hitl_${row.id}`,
    role: "assistant",
    status: "success",
    order: row.createdAt,
    stepOrder: 1,
    parts: [part],
  };
}

export type UiResearchRun = {
  _id: string;
  promptMessageId?: string;
  mode: "normal" | "deep";
  executionKind: "inline" | "workflow";
  status: AgentRunRow["status"];
  verificationReportJson?: string;
  retryable: boolean;
  errorMessage?: string;
  createdAt?: number;
  completedAt?: number;
  // Normalized activity timeline (plan §3) — the single rendered representation,
  // derived from the run's events. The earlier orphaned `steps`/`events` mirror
  // (never read by any component) was removed in the Fase-3 cleanup (plan §12).
  activity: ActivityEvent[];
};

/** Only deep runs render a progress block in the legacy UI; map both anyway. */
export function uiRunFromRow(row: AgentRunRow): UiResearchRun {
  return {
    _id: row.runId,
    promptMessageId: row.promptMessageId,
    mode: row.mode,
    // The agent service runs everything in-process; "workflow" only signals the
    // richer deep-progress UI.
    executionKind: row.mode === "deep" ? "workflow" : "inline",
    status: row.status,
    verificationReportJson: row.verificationReportJson,
    retryable: row.status === "failed",
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
    completedAt: ["completed", "failed", "canceled"].includes(row.status)
      ? row.updatedAt
      : undefined,
    activity: activityEventsFromRun(row),
  };
}
