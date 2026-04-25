import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import {
  accounts,
  exports,
  journalVersions,
  journals,
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
