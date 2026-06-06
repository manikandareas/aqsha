import type { ChatMessage } from "../types";

type MessagePart = NonNullable<ChatMessage["parts"]>[number];

// Native HITL tool names (must match agent/hitlTools.ts). executeArtifact is not
// a HITL surface — it runs after approval and is rendered via provenance chips.
const HITL_TOOL_NAMES = new Set([
  "askUser",
  "proposeArtifact",
  "deleteArtifact",
  "createWorkspace",
  "renameWorkspace",
  "startDeepResearch",
]);

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

export function asHitlToolPart(part: MessagePart): HitlToolPart | null {
  const toolName = toolNameForPart(part);
  if (!toolName || !HITL_TOOL_NAMES.has(toolName)) return null;
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

export function isPendingHitlPart(part: HitlToolPart): boolean {
  if (part.state === "approval-requested") return true;
  if (part.toolName === "askUser" && part.state === "input-available") return true;
  return false;
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
