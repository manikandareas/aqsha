import type { ActivityEvent, OrderedPart } from "@aqsha/agent-contracts";
import type { PromptCommand } from "@aqsha/convex/prompt-commands";

export type SendResult =
  | {
      ok: true;
      threadId?: string;
      messageId: string;
      runId?: string;
      workflowId?: string;
    }
  | {
      ok: false;
      reason:
        | "rate_limited"
        | "quota_exceeded"
        | "subscription_required"
        | "billing_inactive"
        | "reply_in_progress";
      retryAt?: number;
      resetAt?: number;
      requiredPlan?: "free" | "starter" | "plus";
      creditsRemaining?: number;
    };

export type RateStatus = {
  ok: boolean;
  retryAt: number | null;
  serverTime: number;
};

export type ChatMessage = {
  id: string;
  key: string;
  role: "system" | "user" | "assistant" | "tool";
  status: "pending" | "success" | "failed" | "streaming";
  order: number;
  stepOrder: number;
  text?: string;
  parts?: Array<{
    type: string;
    text?: string;
    // AI SDK tool-part fields (present on `tool-<name>` / `dynamic-tool` parts).
    toolCallId?: string;
    toolName?: string;
    state?: string;
    input?: unknown;
    output?: unknown;
    errorText?: string;
    approval?: { id: string; isAutomatic?: boolean; approved?: boolean; reason?: string };
  }>;
};

export type ResearchRun = {
  _id: string;
  promptMessageId?: string;
  mode: "normal" | "deep";
  executionKind: "inline" | "workflow";
  status:
    | "queued"
    | "running"
    | "waiting"
    | "waiting_hitl"
    | "completed"
    | "failed"
    | "canceled";
  currentStep?: string;
  sufficiencyStatus?:
    | "unknown"
    | "insufficient"
    | "partial"
    | "sufficient"
    | "budget_exhausted";
  verificationStatus?:
    | "not_started"
    | "checking"
    | "passed"
    | "revised"
    | "partial"
    | "failed";
  activeArtifactId?: string;
  // Unified statistical verification summary (serialized VerificationReport),
  // written by the sandbox stat path (Track 2B / on-demand sandbox_compute).
  // Null for citation-only runs until a stat pass runs.
  verificationReportJson?: string;
  retryable: boolean;
  errorMessage?: string;
  createdAt?: number;
  completedAt?: number;
  canceledAt?: number;
  // Normalized activity timeline rendered by the run header / fallback path
  // (plan §3). The orphaned `steps`/`events` mirror (unread by any component)
  // was removed in the Fase-3 cleanup (plan §12).
  activity: ActivityEvent[];
  // Ordered answer parts (Fase 1/2) precomputed by `uiRunFromRow`: reasoning/text
  // segments merged with the top-level activity nodes by seq. `null` for a legacy
  // run with no segment events → `buildTurnParts` falls back to the two-blob
  // message rendering.
  orderedParts?: OrderedPart[] | null;
};

export type ResearchArtifact = {
  _id: string;
  runId?: string;
  artifactType?:
    | "markdown"
    | "plain_text"
    | "pdf"
    | "docx"
    | "html"
    | "svg"
    | "mermaid"
    | "json"
    | "csv"
    | "code"
    | "url";
  title: string;
  // Projected by `api.agent.queries.listArtifacts` — drive the in-chat artifact
  // card: provenance chip (`source`), "Diperbarui" timestamp (`updatedAt`), and
  // the compact deep-link target (`workspaceId`, the artifact's own workspace).
  source?: "manual" | "upload" | "agent" | "url";
  updatedAt?: number;
  workspaceId?: string;
  createdAt: number;
};

export type ResearchSource = {
  _id: string;
  messageId?: string;
  runId?: string;
  usage: "candidate" | "cited" | "accepted" | "rejected";
  origin: "web" | "arxiv" | "doi";
  provider?: string;
  title: string;
  locator: string;
  url?: string;
  doi?: string;
  arxivId?: string;
  snippet: string;
  evidenceStrength: "strong" | "medium" | "weak";
  // 4-step citation integrity verdict (Track 2A). Unset until the auto-verify
  // pass completes after the run (the panel shows a pending state meanwhile).
  integrityStatus?:
    | "verified"
    | "metadata_mismatch"
    | "identifier_invalid"
    | "not_found"
    | "unverifiable";
  integrityCheckedAt?: number;
  readStatus?: "not_needed" | "ready" | "failed";
  qualityReason?: string;
  bucketName?: string;
  discoveryQuery?: string;
  createdAt: number;
};

export type SourceFocus =
  | { type: "message"; messageId: string }
  | { type: "run"; runId: string };

export type ResearchPanelState = {
  activeArtifactId: string | null;
  rightPanelOpen: boolean;
  activeTab: "artifacts" | "sources";
  sourceFocus: SourceFocus | null;
  seenArtifactCount: number;
};

export type ThreadExperienceState = {
  threadId?: string;
  panel: ResearchPanelState;
  activeRun?: ResearchRun;
};

export type ThreadExperienceAction =
  | { type: "openArtifact"; artifactId: string }
  | { type: "setPanelOpen"; open: boolean }
  | { type: "markArtifactsSeen" };

export type ComposerSubmission = {
  content: string;
  agentKind: "lite" | "pro";
  commandId?: string;
};

export type ComposerCommand = PromptCommand | null;
