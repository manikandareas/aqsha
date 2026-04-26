import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const planCodes = ["free", "pro"] as const;
export const subscriptionStatuses = [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "expired",
] as const;
export const workspaceMemberRoles = ["owner", "member"] as const;
export const journalTypes = ["general", "proposal", "thesis"] as const;
export const journalStatuses = ["active", "archived"] as const;
export const journalVersionTriggers = [
  "journal_create",
  "outline_apply",
  "ai_proposal_apply",
  "manual_save",
] as const;
export const journalProposalActionTypes = ["replace", "insert_below"] as const;
export const journalProposalStatuses = [
  "pending",
  "applied",
  "dismissed",
  "invalidated",
  "failed",
] as const;
export const sourceStatuses = [
  "queued",
  "processing",
  "ready",
  "failed",
] as const;
export const embeddingStatuses = ["pending", "ready", "skipped"] as const;
export const exportTypes = ["docx"] as const;
export const exportStatuses = [
  "queued",
  "processing",
  "ready",
  "failed",
] as const;
export const agentDepthModes = ["standard", "deep"] as const;
export const agentThreadStatuses = ["active", "archived"] as const;
export const agentMessageRoles = ["user", "assistant", "system"] as const;
export const agentRunStatuses = [
  "queued",
  "running",
  "completed",
  "failed",
  "cancel_requested",
] as const;
export const agentEventStatuses = [
  "pending",
  "running",
  "completed",
  "failed",
] as const;
export const agentEventVisibilities = ["public", "internal"] as const;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | { [key: string]: JsonValue }
  | JsonValue[];

const idColumn = (name: string) =>
  uuid(name)
    .$defaultFn(() => crypto.randomUUID())
    .primaryKey();

const createdAtColumn = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

const updatedAtColumn = () =>
  timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();

export const users = pgTable("users", {
  id: idColumn("id"),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  onboardingCompletedAt: timestamp("onboarding_completed_at", {
    withTimezone: true,
  }),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: idColumn("id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: idColumn("id"),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [index("accounts_user_id_idx").on(table.userId)],
);

export const verifications = pgTable(
  "verifications",
  {
    id: idColumn("id"),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [index("verifications_identifier_idx").on(table.identifier)],
);

export const workspaces = pgTable(
  "workspaces",
  {
    id: idColumn("id"),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    slug: text("slug"),
    activeJournalCount: integer("active_journal_count").default(0).notNull(),
    archivedJournalCount: integer("archived_journal_count")
      .default(0)
      .notNull(),
    aiActionsUsed: integer("ai_actions_used").default(0).notNull(),
    aiActionsReserved: integer("ai_actions_reserved").default(0).notNull(),
    exportsUsed: integer("exports_used").default(0).notNull(),
    sourceUploadsUsed: integer("source_uploads_used").default(0).notNull(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    index("workspaces_owner_user_id_idx").on(table.ownerUserId),
    uniqueIndex("workspaces_slug_unique_idx")
      .on(table.slug)
      .where(sql`${table.slug} is not null`),
  ],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: idColumn("id"),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerCustomerId: text("provider_customer_id"),
    providerSubscriptionId: text("provider_subscription_id").notNull(),
    providerPriceId: text("provider_price_id"),
    planCode: text("plan_code", { enum: planCodes }).notNull(),
    status: text("status", { enum: subscriptionStatuses }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    currentPeriodStartAt: timestamp("current_period_start_at", {
      withTimezone: true,
    }),
    currentPeriodEndAt: timestamp("current_period_end_at", {
      withTimezone: true,
    }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    providerMetadata: jsonb("provider_metadata").$type<JsonValue>(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    check(
      "subscriptions_plan_code_check",
      sql`${table.planCode} in ('free', 'pro')`,
    ),
    check(
      "subscriptions_status_check",
      sql`${table.status} in ('trialing', 'active', 'past_due', 'canceled', 'expired')`,
    ),
    uniqueIndex("subscriptions_provider_subscription_unique_idx").on(
      table.provider,
      table.providerSubscriptionId,
    ),
    index("subscriptions_workspace_id_idx").on(table.workspaceId),
    index("subscriptions_workspace_status_idx").on(
      table.workspaceId,
      table.status,
    ),
    uniqueIndex("subscriptions_current_workspace_unique_idx")
      .on(table.workspaceId)
      .where(sql`${table.endedAt} is null`),
  ],
);

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    id: idColumn("id"),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: workspaceMemberRoles }).notNull(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    check(
      "workspace_members_role_check",
      sql`${table.role} in ('owner', 'member')`,
    ),
    unique("workspace_members_workspace_id_user_id_unique").on(
      table.workspaceId,
      table.userId,
    ),
    index("workspace_members_user_id_idx").on(table.userId),
  ],
);

export const journals = pgTable(
  "journals",
  {
    id: idColumn("id"),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    type: text("type", { enum: journalTypes }).notNull(),
    status: text("status", { enum: journalStatuses })
      .notNull()
      .default("active"),
    contentJson: jsonb("content_json").$type<JsonValue>().notNull(),
    outlineJson: jsonb("outline_json").$type<JsonValue>(),
    plainText: text("plain_text"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    lastOpenedAt: timestamp("last_opened_at", { withTimezone: true }),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    check(
      "journals_type_check",
      sql`${table.type} in ('general', 'proposal', 'thesis')`,
    ),
    check(
      "journals_status_check",
      sql`${table.status} in ('active', 'archived')`,
    ),
    index("journals_workspace_archived_idx").on(
      table.workspaceId,
      table.archivedAt,
    ),
    index("journals_workspace_updated_idx").on(
      table.workspaceId,
      table.updatedAt,
    ),
    index("journals_owner_user_id_idx").on(table.ownerUserId),
  ],
);

export const journalVersions = pgTable(
  "journal_versions",
  {
    id: idColumn("id"),
    journalId: uuid("journal_id")
      .notNull()
      .references(() => journals.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    versionNumber: integer("version_number").notNull(),
    contentJson: jsonb("content_json").$type<JsonValue>().notNull(),
    plainText: text("plain_text"),
    trigger: text("trigger", { enum: journalVersionTriggers }).notNull(),
    snapshotLabel: text("snapshot_label"),
    createdAt: createdAtColumn(),
  },
  (table) => [
    check(
      "journal_versions_trigger_check",
      sql`${table.trigger} in ('journal_create', 'outline_apply', 'ai_proposal_apply', 'manual_save')`,
    ),
    unique("journal_versions_journal_id_version_number_unique").on(
      table.journalId,
      table.versionNumber,
    ),
    index("journal_versions_journal_created_idx").on(
      table.journalId,
      table.createdAt,
    ),
  ],
);

// !
// export const sources = pgTable(
//   "sources",
//   {
//     id: idColumn("id"),
//     journalId: uuid("journal_id")
//       .notNull()
//       .references(() => journals.id, { onDelete: "cascade" }),
//     workspaceId: uuid("workspace_id")
//       .notNull()
//       .references(() => workspaces.id, { onDelete: "cascade" }),
//     ownerUserId: uuid("owner_user_id")
//       .notNull()
//       .references(() => users.id),
//     storageKey: text("storage_key").notNull(),
//     fileName: text("file_name").notNull(),
//     mimeType: text("mime_type").notNull(),
//     checksum: text("checksum").notNull(),
//     status: text("status", { enum: sourceStatuses }).notNull(),
//     retryCount: integer("retry_count").default(0).notNull(),
//     pageCount: integer("page_count"),
//     ocrStatus: text("ocr_status"),
//     extractedTextSummary: text("extracted_text_summary"),
//     errorMessage: text("error_message"),
//     errorCode: text("error_code"),
//     deletedAt: timestamp("deleted_at", { withTimezone: true }),
//     processingStartedAt: timestamp("processing_started_at", {
//       withTimezone: true,
//     }),
//     readyAt: timestamp("ready_at", { withTimezone: true }),
//     parsedTextStorageKey: text("parsed_text_storage_key"),
//     parsedTextSizeBytes: integer("parsed_text_size_bytes"),
//     idempotencyKey: text("idempotency_key"),
//     createdAt: createdAtColumn(),
//     updatedAt: updatedAtColumn(),
//   },
//   (table) => [
//     check(
//       "sources_status_check",
//       sql`${table.status} in ('queued', 'processing', 'ready', 'failed')`,
//     ),
//     index("sources_journal_id_idx").on(table.journalId),
//     index("sources_workspace_checksum_idx").on(
//       table.workspaceId,
//       table.checksum,
//     ),
//     index("sources_checksum_idx").on(table.checksum),
//   ],
// );

// !
// export const sourceChunks = pgTable(
//   "source_chunks",
//   {
//     id: idColumn("id"),
//     sourceId: uuid("source_id")
//       .notNull()
//       .references(() => sources.id, { onDelete: "cascade" }),
//     journalId: uuid("journal_id")
//       .notNull()
//       .references(() => journals.id, { onDelete: "cascade" }),
//     workspaceId: uuid("workspace_id")
//       .notNull()
//       .references(() => workspaces.id, { onDelete: "cascade" }),
//     chunkIndex: integer("chunk_index").notNull(),
//     text: text("text").notNull(),
//     citationMetadata: jsonb("citation_metadata").$type<JsonValue>().notNull(),
//     embeddingStatus: text("embedding_status", {
//       enum: embeddingStatuses,
//     }).notNull(),
//     createdAt: createdAtColumn(),
//     updatedAt: updatedAtColumn(),
//   },
//   (table) => [
//     check(
//       "source_chunks_embedding_status_check",
//       sql`${table.embeddingStatus} in ('pending', 'ready', 'skipped')`,
//     ),
//     unique("source_chunks_source_id_chunk_index_unique").on(
//       table.sourceId,
//       table.chunkIndex,
//     ),
//     index("source_chunks_journal_id_idx").on(table.journalId),
//   ],
// );

export const exports = pgTable(
  "exports",
  {
    id: idColumn("id"),
    journalId: uuid("journal_id")
      .notNull()
      .references(() => journals.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id),
    exportType: text("export_type", { enum: exportTypes }).notNull(),
    status: text("status", { enum: exportStatuses }).notNull(),
    storageKey: text("storage_key"),
    warningsSnapshot: jsonb("warnings_snapshot").$type<JsonValue>(),
    idempotencyKey: text("idempotency_key"),
    retryCount: integer("retry_count").default(0).notNull(),
    errorMessage: text("error_message"),
    errorCode: text("error_code"),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    check("exports_export_type_check", sql`${table.exportType} in ('docx')`),
    check(
      "exports_status_check",
      sql`${table.status} in ('queued', 'processing', 'ready', 'failed')`,
    ),
    index("exports_journal_status_idx").on(table.journalId, table.status),
    index("exports_workspace_id_idx").on(table.workspaceId),
    uniqueIndex("exports_journal_idempotency_unique_idx")
      .on(table.journalId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
  ],
);

export const agentThreads = pgTable(
  "agent_threads",
  {
    id: idColumn("id"),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    depthMode: text("depth_mode", { enum: agentDepthModes })
      .default("standard")
      .notNull(),
    status: text("status", { enum: agentThreadStatuses })
      .default("active")
      .notNull(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    check(
      "agent_threads_depth_mode_check",
      sql`${table.depthMode} in ('standard', 'deep')`,
    ),
    check(
      "agent_threads_status_check",
      sql`${table.status} in ('active', 'archived')`,
    ),
    index("agent_threads_workspace_updated_idx").on(
      table.workspaceId,
      table.updatedAt,
    ),
    index("agent_threads_user_id_idx").on(table.userId),
  ],
);

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: idColumn("id"),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => agentThreads.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status", { enum: agentRunStatuses })
      .default("queued")
      .notNull(),
    depthMode: text("depth_mode", { enum: agentDepthModes })
      .default("standard")
      .notNull(),
    errorMessage: text("error_message"),
    errorMetadata: jsonb("error_metadata").$type<JsonValue>(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    check(
      "agent_runs_status_check",
      sql`${table.status} in ('queued', 'running', 'completed', 'failed', 'cancel_requested')`,
    ),
    check(
      "agent_runs_depth_mode_check",
      sql`${table.depthMode} in ('standard', 'deep')`,
    ),
    index("agent_runs_thread_created_idx").on(table.threadId, table.createdAt),
    uniqueIndex("agent_runs_active_thread_unique_idx")
      .on(table.threadId)
      .where(sql`${table.status} in ('queued', 'running')`),
  ],
);

export const agentMessages = pgTable(
  "agent_messages",
  {
    id: idColumn("id"),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => agentThreads.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    runId: uuid("run_id").references(() => agentRuns.id, {
      onDelete: "set null",
    }),
    role: text("role", { enum: agentMessageRoles }).notNull(),
    content: text("content").notNull(),
    metadata: jsonb("metadata").$type<JsonValue>(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    check(
      "agent_messages_role_check",
      sql`${table.role} in ('user', 'assistant', 'system')`,
    ),
    index("agent_messages_thread_created_idx").on(
      table.threadId,
      table.createdAt,
    ),
    index("agent_messages_run_id_idx").on(table.runId),
  ],
);

export const agentEvents = pgTable(
  "agent_events",
  {
    id: idColumn("id"),
    runId: uuid("run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => agentThreads.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    type: text("type").notNull(),
    status: text("status", { enum: agentEventStatuses }).notNull(),
    title: text("title").notNull(),
    visibility: text("visibility", { enum: agentEventVisibilities })
      .default("public")
      .notNull(),
    payload: jsonb("payload").$type<JsonValue>(),
    createdAt: createdAtColumn(),
  },
  (table) => [
    check(
      "agent_events_status_check",
      sql`${table.status} in ('pending', 'running', 'completed', 'failed')`,
    ),
    check(
      "agent_events_visibility_check",
      sql`${table.visibility} in ('public', 'internal')`,
    ),
    unique("agent_events_run_sequence_unique").on(table.runId, table.sequence),
    index("agent_events_thread_created_idx").on(
      table.threadId,
      table.createdAt,
    ),
  ],
);

export const table = {
  users,
  sessions,
  accounts,
  verifications,
  workspaces,
  subscriptions,
  workspaceMembers,
  journals,
  journalVersions,
  // sources,
  // sourceChunks,
  exports,
  agentThreads,
  agentMessages,
  agentRuns,
  agentEvents,
} as const;

export type Table = typeof table;
