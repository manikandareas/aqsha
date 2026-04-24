import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import {
  agentEvents,
  agentMessages,
  agentResearchCandidateSources,
  agentResearchClaims,
  agentResearchEvidenceItems,
  agentResearchSessions,
  agentRuns,
  agentSessions,
  exports,
  journalVersions,
  journals,
  subscriptions,
  users,
  workspaceMembers,
  workspaces,
  type JsonValue,
} from "./schema";

export type UserRecord = InferSelectModel<typeof users>;
export type WorkspaceRecord = InferSelectModel<typeof workspaces>;
export type SubscriptionRecord = InferSelectModel<typeof subscriptions>;
export type WorkspaceMemberRecord = InferSelectModel<typeof workspaceMembers>;
export type JournalRecord = InferSelectModel<typeof journals>;
export type JournalVersionRecord = InferSelectModel<typeof journalVersions>;
export type ExportRecord = InferSelectModel<typeof exports>;
export type AgentSessionRecord = InferSelectModel<typeof agentSessions>;
export type AgentMessageRecord = InferSelectModel<typeof agentMessages>;
export type AgentRunRecord = InferSelectModel<typeof agentRuns>;
export type AgentEventRecord = InferSelectModel<typeof agentEvents>;
export type AgentResearchSessionRecord = InferSelectModel<
  typeof agentResearchSessions
>;
export type AgentResearchCandidateSourceRecord = InferSelectModel<
  typeof agentResearchCandidateSources
>;
export type AgentResearchEvidenceItemRecord = InferSelectModel<
  typeof agentResearchEvidenceItems
>;
export type AgentResearchClaimRecord = InferSelectModel<
  typeof agentResearchClaims
>;

export type NewUser = InferInsertModel<typeof users>;
export type NewWorkspace = InferInsertModel<typeof workspaces>;
export type NewSubscription = InferInsertModel<typeof subscriptions>;
export type NewWorkspaceMember = InferInsertModel<typeof workspaceMembers>;
export type NewJournal = InferInsertModel<typeof journals>;
export type NewJournalVersion = InferInsertModel<typeof journalVersions>;
export type NewExport = InferInsertModel<typeof exports>;
export type NewAgentSession = InferInsertModel<typeof agentSessions>;
export type NewAgentMessage = InferInsertModel<typeof agentMessages>;
export type NewAgentRun = InferInsertModel<typeof agentRuns>;
export type NewAgentEvent = InferInsertModel<typeof agentEvents>;
export type NewAgentResearchSession = InferInsertModel<
  typeof agentResearchSessions
>;
export type NewAgentResearchCandidateSource = InferInsertModel<
  typeof agentResearchCandidateSources
>;
export type NewAgentResearchEvidenceItem = InferInsertModel<
  typeof agentResearchEvidenceItems
>;
export type NewAgentResearchClaim = InferInsertModel<
  typeof agentResearchClaims
>;

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
