import { collapse } from "../../lib/text";

// R3.2: single source of truth for context-assembly budgets, replacing the
// formerly scattered per-file constants (threadContext + ragContext) so the
// prompt's total char/count budget is auditable in one place. Shared by the
// thread, workspace, and RAG context builders. Pure → no Convex deps.
export const CONTEXT_BUDGET = {
  /** Total char budget for inlined prompt-context artifact bodies. */
  promptTotalChars: 16_000,
  /** Per-artifact char cap before clipping (one doc can't eat the whole budget). */
  perArtifactChars: 4_000,
  /** Max thread-uploaded documents inlined into the prompt. */
  threadDocuments: 4,
  /** Recent thread artifacts scanned when selecting thread docs. */
  threadDocumentScan: 12,
  /** Max explicitly-selected context artifacts. */
  selectedArtifacts: 12,
  /** Max workspaces summarized in the workspace manifest. */
  workspaceManifestWorkspaces: 5,
  /** Max items listed per workspace in the manifest. */
  workspaceManifestItems: 40,
  /** Char budget for the retrieved RAG block. */
  ragTotalChars: 6_000,
} as const;

// Collapse whitespace and clip to a char budget, reporting whether content was
// dropped (the clip report). One shared implementation for every context builder.
export function clipText(
  value: string,
  limit: number,
): { text: string; clipped: boolean } {
  const compact = collapse(value);
  if (compact.length <= limit) {
    return { text: compact, clipped: false };
  }
  return {
    text: `${compact.slice(0, Math.max(0, limit - 3)).trimEnd()}...`,
    clipped: true,
  };
}
