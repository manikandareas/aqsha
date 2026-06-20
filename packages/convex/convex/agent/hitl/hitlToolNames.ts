// Single source of truth for the human-in-the-loop (HITL) tool-name sets, shared
// by the Convex backend (agent/messages.ts) and the web client
// (apps/web/features/thread-experience/utils/hitl-parts.ts) via the
// `@aqsha/convex/hitl-tool-names` export. Keeping these in one isomorphic module
// prevents the historical drift where the same `HITL_TOOL_NAMES` name held
// different members on each side.

// Tools offered on the initial turn. `executeArtifact` is intentionally excluded
// so the model cannot write an artifact without first going through an approved
// `proposeArtifact` (it is only offered on resume).
export const HITL_INITIAL_TOOL_NAMES = [
  "askUser",
  "proposeArtifact",
  "deleteArtifact",
  "createWorkspace",
  "renameWorkspace",
] as const;

// Every tool whose call can hold a turn pending a user action (approval or
// answer): the initial set plus the resume-only `executeArtifact` write and the
// `needsApproval` `proposeResearchPlan` (deep-research plan gate) / `runComputation`.
export const PENDING_HITL_TOOL_NAMES = [
  ...HITL_INITIAL_TOOL_NAMES,
  "executeArtifact",
  "proposeResearchPlan",
  "runComputation",
] as const;

// Tool parts the web client renders as HITL cards: the pending set minus
// `executeArtifact`, which surfaces as a provenance chip (it runs post-approval).
// `proposeResearchPlan` renders the editable research-plan review card;
// `runComputation` renders via the generic Review-Plan fallback card.
export const HITL_CARD_TOOL_NAMES = [
  ...HITL_INITIAL_TOOL_NAMES,
  "proposeResearchPlan",
  "runComputation",
] as const;

export const PENDING_HITL_TOOL_NAME_SET: ReadonlySet<string> = new Set(
  PENDING_HITL_TOOL_NAMES,
);
export const HITL_CARD_TOOL_NAME_SET: ReadonlySet<string> = new Set(
  HITL_CARD_TOOL_NAMES,
);
