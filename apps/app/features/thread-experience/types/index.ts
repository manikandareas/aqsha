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
        | "billing_inactive";
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

export type ChatMessage = {
  id: string;
  key: string;
  role: "system" | "user" | "assistant" | "tool";
  status: "pending" | "success" | "failed" | "streaming";
  order: number;
  stepOrder: number;
  text?: string;
  parts?: Array<{ type: string; text?: string }>;
  metadata?: {
    promptCommand?: PromptCommandMetadata;
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
  type:
    | "research_report"
    | "markdown_report"
    | "research_document"
    | "document"
    | "code"
    | "html"
    | "json"
    | "plain_text";
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

export type TranscriptEntry =
  | { kind: "message"; message: ChatMessage }
  | { kind: "run"; run: ResearchRun };

export type ResearchPanelState = {
  activeArtifactId: string | null;
  rightPanelOpen: boolean;
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
  mode: "normal" | "deep";
  commandId?: string;
};

export type ComposerCommand = PromptCommand | null;
