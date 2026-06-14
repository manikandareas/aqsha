/**
 * Shared model for inline `@mention` context references in the composer.
 *
 * A reference is either a whole workspace (`@penelitian`, retrieved via RAG) or
 * a specific paper/artifact inside a workspace (`@penelitian:RAG`). References
 * are rendered as inline pills in the composer (the same visual language as
 * slash commands) and pinned per-thread.
 */
import {
  MENTION_MARKER_OPEN,
  MENTION_MARKER_CLOSE,
} from "@aqsha/convex/mention-markers";

export const MAX_CONTEXT_WORKSPACES = 5;
export const MAX_CONTEXT_PAPERS = 12;

export type ContextRef =
  | { kind: "workspace"; workspaceId: string; label: string }
  | { kind: "paper"; workspaceId: string; artifactId: string; label: string };

/** Stable identity for dedupe + signature comparison. */
export function contextRefKey(ref: ContextRef) {
  return ref.kind === "paper"
    ? `${ref.workspaceId}:${ref.artifactId}`
    : `${ref.workspaceId}:`;
}

export function contextRefsSignature(refs: ContextRef[]) {
  return refs.map(contextRefKey).join("|");
}

/** Split refs into the id lists the send/start mutations expect. */
export function splitContextRefs(refs: ContextRef[]) {
  const workspaceIds: string[] = [];
  const artifactIds: string[] = [];
  for (const ref of refs) {
    if (ref.kind === "workspace") {
      workspaceIds.push(ref.workspaceId);
    } else {
      artifactIds.push(ref.artifactId);
    }
  }
  return { workspaceIds, artifactIds };
}

export function countContextRefs(refs: ContextRef[]) {
  let workspaces = 0;
  let papers = 0;
  for (const ref of refs) {
    if (ref.kind === "workspace") {
      workspaces += 1;
    } else {
      papers += 1;
    }
  }
  return { workspaces, papers };
}

/** Build the inline-pill display label, e.g. `@penelitian` or `@penelitian:RAG`. */
export function buildWorkspaceMentionLabel(workspaceName: string) {
  return `@${workspaceName}`;
}

export function buildPaperMentionLabel(workspaceName: string, paperTitle: string) {
  return `@${workspaceName}:${paperTitle}`;
}

export function wrapMentionLabel(label: string) {
  return `${MENTION_MARKER_OPEN}${label}${MENTION_MARKER_CLOSE}`;
}

export type MentionSegment =
  | { type: "text"; value: string }
  | { type: "mention"; label: string };

/** Split a message string into ordered text / mention segments. */
export function parseMentionSegments(text: string): MentionSegment[] {
  const segments: MentionSegment[] = [];
  let index = 0;
  while (index < text.length) {
    const open = text.indexOf(MENTION_MARKER_OPEN, index);
    if (open === -1) {
      if (index < text.length) {
        segments.push({ type: "text", value: text.slice(index) });
      }
      break;
    }
    if (open > index) {
      segments.push({ type: "text", value: text.slice(index, open) });
    }
    const close = text.indexOf(MENTION_MARKER_CLOSE, open + 1);
    if (close === -1) {
      segments.push({ type: "text", value: text.slice(open) });
      break;
    }
    segments.push({ type: "mention", label: text.slice(open + 1, close) });
    index = close + 1;
  }
  return segments;
}

function hasMentionMarkers(text: string) {
  return text.includes(MENTION_MARKER_OPEN);
}
