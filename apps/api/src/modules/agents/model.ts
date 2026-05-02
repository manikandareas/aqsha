import { t, type UnwrapSchema } from "elysia";
import type { UIMessage } from "ai";

export const agentsModel = {
  health: t.Object({
    ok: t.Boolean(),
    service: t.Literal("agents"),
    models: t.Array(t.String()),
  }),
};

export type AgentUsedSource = {
  kind: "url" | "document";
  title?: string | null;
  url?: string | null;
  filename?: string | null;
  mediaType?: string | null;
  providerSourceId?: string | null;
  metadata?: unknown;
  seenAt?: string;
};

export type CreateChatResponseInput = {
  requestId: string;
  userId: string;
  workspace?: string;
  threadId: string;
  runId: string;
  model?: string | null;
  messages: UIMessage[];
  abortSignal?: AbortSignal;
  onSource?: (source: AgentUsedSource) => Promise<void> | void;
};

export type AgentsModel = {
  [K in keyof typeof agentsModel]: UnwrapSchema<(typeof agentsModel)[K]>;
};
