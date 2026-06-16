import { HITL_CARD_TOOL_NAME_SET } from "@aqsha/convex/hitl-tool-names";
import type { ChatMessage } from "../types";

type MessagePart = NonNullable<ChatMessage["parts"]>[number];

export type HitlToolPart = {
  toolName: string;
  toolCallId: string;
  state: string;
  input: Record<string, unknown>;
  approvalId?: string;
};

// A tool part is either a static `tool-<name>` part or a `dynamic-tool` part
// (the agent registers tools at runtime, so either shape can appear).
function toolNameForPart(part: MessagePart): string | null {
  if (typeof part.type !== "string") return null;
  if (part.type === "dynamic-tool") {
    return typeof part.toolName === "string" ? part.toolName : null;
  }
  if (part.type.startsWith("tool-")) {
    return part.type.slice("tool-".length);
  }
  return null;
}

function asHitlToolPart(part: MessagePart): HitlToolPart | null {
  const toolName = toolNameForPart(part);
  if (!toolName || !HITL_CARD_TOOL_NAME_SET.has(toolName)) return null;
  return {
    toolName,
    toolCallId: typeof part.toolCallId === "string" ? part.toolCallId : "",
    state: typeof part.state === "string" ? part.state : "",
    input:
      part.input && typeof part.input === "object"
        ? (part.input as Record<string, unknown>)
        : {},
    approvalId: part.approval?.id,
  };
}

function isPendingHitlPart(part: HitlToolPart): boolean {
  if (part.state === "approval-requested") return true;
  if (part.toolName === "askUser" && part.state === "input-available") return true;
  return false;
}

/** An interaction the user already answered — rendered read-only (the question
 *  stays visible; the answer is shown as a user bubble below it). */
export function isAnsweredHitlPart(part: HitlToolPart): boolean {
  return part.state === "answered";
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

/**
 * The question text(s) of a HITL part, for read-only rendering once answered.
 * askUser → each question prompt; approval tools → the action title/name.
 */
export function hitlQuestionLines(part: HitlToolPart): string[] {
  if (part.toolName === "askUser") {
    const questions = Array.isArray(part.input.questions) ? part.input.questions : [];
    return questions
      .map((question) => asString((question as { prompt?: unknown }).prompt))
      .filter((prompt): prompt is string => Boolean(prompt));
  }
  const title =
    asString(part.input.title) ?? asString(part.input.name) ?? "Tindakan disetujui";
  const summary = asString(part.input.summary) ?? asString(part.input.message);
  return summary ? [title, summary] : [title];
}

export function messageHitlParts(message: ChatMessage): HitlToolPart[] {
  const parts: HitlToolPart[] = [];
  for (const part of message.parts ?? []) {
    const hitl = asHitlToolPart(part);
    if (hitl) parts.push(hitl);
  }
  return parts;
}

export function hasPendingHitl(messages: ChatMessage[]): boolean {
  for (const message of messages) {
    for (const part of messageHitlParts(message)) {
      if (isPendingHitlPart(part)) return true;
    }
  }
  return false;
}
