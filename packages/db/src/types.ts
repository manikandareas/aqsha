import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import {
  accounts,
  chatMessages,
  chatThreads,
  exports,
  journalVersions,
  journals,
  agentEvents,
  agentMessages,
  agentRunOutputs,
  agentRuns,
  agentThreads,
  sessions,
  subscriptions,
  users,
  verifications,
  workspaceMembers,
  workspaces,
  type JsonValue,
} from "./schema";

export type UserRecord = InferSelectModel<typeof users>;
export type SessionRecord = InferSelectModel<typeof sessions>;
export type AccountRecord = InferSelectModel<typeof accounts>;
export type VerificationRecord = InferSelectModel<typeof verifications>;
export type WorkspaceRecord = InferSelectModel<typeof workspaces>;
export type SubscriptionRecord = InferSelectModel<typeof subscriptions>;
export type WorkspaceMemberRecord = InferSelectModel<typeof workspaceMembers>;
export type JournalRecord = InferSelectModel<typeof journals>;
export type JournalVersionRecord = InferSelectModel<typeof journalVersions>;
export type ExportRecord = InferSelectModel<typeof exports>;
export type ChatThreadRecord = InferSelectModel<typeof chatThreads>;
export type ChatMessageRecord = InferSelectModel<typeof chatMessages>;
export type AgentThreadRecord = InferSelectModel<typeof agentThreads>;
export type AgentMessageRecord = InferSelectModel<typeof agentMessages>;
export type AgentRunRecord = InferSelectModel<typeof agentRuns>;
export type AgentEventRecord = InferSelectModel<typeof agentEvents>;
export type AgentRunOutputRecord = InferSelectModel<typeof agentRunOutputs>;

export type NewUser = InferInsertModel<typeof users>;
export type NewSession = InferInsertModel<typeof sessions>;
export type NewAccount = InferInsertModel<typeof accounts>;
export type NewVerification = InferInsertModel<typeof verifications>;
export type NewWorkspace = InferInsertModel<typeof workspaces>;
export type NewSubscription = InferInsertModel<typeof subscriptions>;
export type NewWorkspaceMember = InferInsertModel<typeof workspaceMembers>;
export type NewJournal = InferInsertModel<typeof journals>;
export type NewJournalVersion = InferInsertModel<typeof journalVersions>;
export type NewExport = InferInsertModel<typeof exports>;
export type NewChatThread = InferInsertModel<typeof chatThreads>;
export type NewChatMessage = InferInsertModel<typeof chatMessages>;
export type NewAgentThread = InferInsertModel<typeof agentThreads>;
export type NewAgentMessage = InferInsertModel<typeof agentMessages>;
export type NewAgentRun = InferInsertModel<typeof agentRuns>;
export type NewAgentEvent = InferInsertModel<typeof agentEvents>;
export type NewAgentRunOutput = InferInsertModel<typeof agentRunOutputs>;

export type CreateJournalInput = Pick<
  NewJournal,
  "workspaceId" | "ownerUserId" | "title" | "type"
> &
  Partial<
    Pick<
      NewJournal,
      "contentJson" | "outlineJson" | "plainText" | "lastOpenedAt"
    >
  >;

export type UpdateJournalInput = Partial<Pick<NewJournal, "title" | "type">>;

export interface SaveJournalContentInput {
  baseUpdatedAt: Date;
  title: string;
  contentJson: JsonValue;
  plainText?: string | null;
}
