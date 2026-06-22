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
