export type RateStatus = {
  ok: boolean;
  serverTime: number;
  canSend?: boolean;
  reason?: string;
  retryAt?: number;
};

export type ResearchRun = {
  _id: string;
  status: string;
  activity?: unknown[];
};

export type ResearchArtifact = {
  _id: string;
  title: string;
  artifactType?: string;
};

export type ResearchSource = {
  _id: string;
  runId: string;
  title: string;
  url?: string | null;
};

export type SendResult = {
  ok: boolean;
  reason?: string;
  threadId?: string;
};

// Activity-timeline view-model. The eve timeline adapter
// (`features/threads/lib/eve-timeline.ts`) derives `ActivityEvent[]` from eve
// parts; the run-progress / subagent-detail components render it.
export type ActivityStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "waiting_approval";

export type ActivityActor = "main" | "subagent" | "tool" | "system";

export type ActivityVisibility = "user" | "developer" | "hidden";

export type ActivityType =
  | "run"
  | "tool"
  | "subagent"
  | "phase"
  | "approval"
  | "system";

export type ActivityEvent = {
  id: string;
  runId: string;
  parentId?: string;
  seq: number;
  type: ActivityType;
  status: ActivityStatus;
  actor: ActivityActor;
  title: string;
  description?: string;
  summary?: string;
  metadata?: Record<string, string | number | boolean>;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  visibility: ActivityVisibility;
  children?: ActivityEvent[];
};
