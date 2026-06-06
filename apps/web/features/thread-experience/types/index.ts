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

export type PromptCommandMetadata = {
  commandId: string;
  commandLabel: string;
  commandSlug: string;
  mode: "normal" | "deep";
  argumentPreview: string;
};

export type MessageContextArtifactMetadata = {
  artifactId: string;
  title: string;
  artifactType?: string;
  source?: "upload" | "workspace";
  savedWorkspaceId?: string;
  savedWorkspaceName?: string;
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
  metadata?: {
    promptCommand?: PromptCommandMetadata;
    contextArtifacts?: MessageContextArtifactMetadata[];
  };
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
  retryable: boolean;
  errorMessage?: string;
  createdAt?: number;
  completedAt?: number;
  canceledAt?: number;
  steps: Array<{
    stepKey: string;
    label: string;
    order: number;
    status: "pending" | "running" | "completed" | "failed" | "canceled";
    summary?: string;
    sourceCount?: number;
    artifactCount?: number;
    failureReason?: string;
    startedAt?: number;
    completedAt?: number;
  }>;
  events: Array<{
    _id: string;
    stepKey?: string;
    eventType:
      | "plan"
      | "gap"
      | "query"
      | "search"
      | "read"
      | "rerank"
      | "audit"
      | "tool"
      | "artifact"
      | "status"
      | "failure";
    round?: number;
    title: string;
    summary: string;
    metadataJson?: string;
    createdAt: number;
  }>;
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
  currentVersionId?: string;
  version?: {
    _id: string;
    versionNumber: number;
    contentFormat: "markdown" | "html" | "plain" | "code" | "json";
    title: string;
    body?: string;
    changeSummary?: string;
    createdAt: number;
  } | null;
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
  readStatus?: "not_needed" | "ready" | "failed";
  qualityReason?: string;
  bucketName?: string;
  discoveryQuery?: string;
  createdAt: number;
};

export type SourceFocus =
  | { type: "message"; messageId: string }
  | { type: "run"; runId: string };

export type TranscriptEntry =
  | { kind: "message"; message: ChatMessage; assistantRun?: ResearchRun }
  | { kind: "run"; run: ResearchRun };

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
