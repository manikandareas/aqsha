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
export const chatThreadStatuses = ["active", "archived"] as const;
export const chatMessageRoles = ["system", "user", "assistant", "tool"] as const;
export const chatSourceKinds = ["url", "document"] as const;
export const chatArtifactKinds = ["visual_png"] as const;
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
export const agentEventScopes = [
  "run",
  "step",
  "reasoning",
  "tool",
  "source",
  "message",
  "error",
  "agent",
  "stream",
] as const;

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

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: idColumn("id"),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
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
    index("subscriptions_user_id_idx").on(table.userId),
    index("subscriptions_user_status_idx").on(
      table.userId,
      table.status,
    ),
    uniqueIndex("subscriptions_current_user_unique_idx")
      .on(table.userId)
      .where(sql`${table.endedAt} is null`),
  ],
);

export const journals = pgTable(
  "journals",
  {
    id: idColumn("id"),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
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
    index("journals_owner_archived_idx").on(
      table.ownerUserId,
      table.archivedAt,
    ),
    index("journals_owner_updated_idx").on(
      table.ownerUserId,
      table.updatedAt,
    ),
  ],
);

export const journalVersions = pgTable(
  "journal_versions",
  {
    id: idColumn("id"),
    journalId: uuid("journal_id")
      .notNull()
      .references(() => journals.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
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
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
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
    index("exports_owner_user_id_idx").on(table.ownerUserId),
    uniqueIndex("exports_journal_idempotency_unique_idx")
      .on(table.journalId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
  ],
);

export const chatThreads = pgTable(
  "chat_threads",
  {
    id: idColumn("id"),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New chat"),
    model: text("model"),
    status: text("status", { enum: chatThreadStatuses })
      .default("active")
      .notNull(),
    metadata: jsonb("metadata").$type<JsonValue>(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    check(
      "chat_threads_status_check",
      sql`${table.status} in ('active', 'archived')`,
    ),
    index("chat_threads_owner_last_message_idx").on(
      table.ownerUserId,
      table.lastMessageAt,
    ),
    index("chat_threads_owner_updated_idx").on(
      table.ownerUserId,
      table.updatedAt,
    ),
  ],
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: text("id").primaryKey(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => chatThreads.id, { onDelete: "cascade" }),
    role: text("role", { enum: chatMessageRoles }).notNull(),
    uiMessage: jsonb("ui_message").$type<JsonValue>().notNull(),
    clientMessageId: text("client_message_id"),
    model: text("model"),
    metadata: jsonb("metadata").$type<JsonValue>(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    check(
      "chat_messages_role_check",
      sql`${table.role} in ('system', 'user', 'assistant', 'tool')`,
    ),
    index("chat_messages_thread_created_idx").on(
      table.threadId,
      table.createdAt,
    ),
    uniqueIndex("chat_messages_thread_client_message_unique_idx")
      .on(table.threadId, table.clientMessageId)
      .where(sql`${table.clientMessageId} is not null`),
  ],
);

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: idColumn("id"),
    chatThreadId: uuid("chat_thread_id")
      .notNull()
      .references(() => chatThreads.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status", { enum: agentRunStatuses })
      .default("queued")
      .notNull(),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata").$type<JsonValue>(),
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
    index("agent_runs_thread_created_idx").on(
      table.chatThreadId,
      table.createdAt,
    ),
    uniqueIndex("agent_runs_active_thread_unique_idx")
      .on(table.chatThreadId)
      .where(sql`${table.status} in ('queued', 'running')`),
  ],
);

export const chatSources = pgTable(
  "chat_sources",
  {
    id: idColumn("id"),
    chatThreadId: uuid("chat_thread_id")
      .notNull()
      .references(() => chatThreads.id, { onDelete: "cascade" }),
    runId: uuid("run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    sourceKey: text("source_key").notNull(),
    kind: text("kind", { enum: chatSourceKinds }).notNull(),
    title: text("title"),
    url: text("url"),
    filename: text("filename"),
    mediaType: text("media_type"),
    providerSourceId: text("provider_source_id"),
    metadata: jsonb("metadata").$type<JsonValue>(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    check("chat_sources_kind_check", sql`${table.kind} in ('url', 'document')`),
    unique("chat_sources_thread_source_key_unique").on(
      table.chatThreadId,
      table.sourceKey,
    ),
    index("chat_sources_thread_last_seen_idx").on(
      table.chatThreadId,
      table.lastSeenAt,
    ),
    index("chat_sources_run_id_idx").on(table.runId),
  ],
);

export const chatArtifacts = pgTable(
  "chat_artifacts",
  {
    id: idColumn("id"),
    chatThreadId: uuid("chat_thread_id")
      .notNull()
      .references(() => chatThreads.id, { onDelete: "cascade" }),
    runId: uuid("run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: chatArtifactKinds }).notNull(),
    title: text("title").notNull(),
    caption: text("caption"),
    fileKey: text("file_key").notNull(),
    url: text("url").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size"),
    sourceIds: jsonb("source_ids").$type<string[]>(),
    metadata: jsonb("metadata").$type<JsonValue>(),
    createdAt: createdAtColumn(),
  },
  (table) => [
    check("chat_artifacts_kind_check", sql`${table.kind} in ('visual_png')`),
    index("chat_artifacts_thread_created_idx").on(
      table.chatThreadId,
      table.createdAt,
    ),
    index("chat_artifacts_run_id_idx").on(table.runId),
    uniqueIndex("chat_artifacts_file_key_unique_idx").on(table.fileKey),
  ],
);

export const agentEvents = pgTable(
  "agent_events",
  {
    id: idColumn("id"),
    runId: uuid("run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    chatThreadId: uuid("chat_thread_id")
      .notNull()
      .references(() => chatThreads.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    type: text("type").notNull(),
    scope: text("scope", { enum: agentEventScopes }).default("run").notNull(),
    status: text("status", { enum: agentEventStatuses }).notNull(),
    title: text("title").notNull(),
    summary: text("summary"),
    agentName: text("agent_name"),
    toolName: text("tool_name"),
    parentEventId: uuid("parent_event_id"),
    payload: jsonb("payload").$type<JsonValue>(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: createdAtColumn(),
  },
  (table) => [
    check(
      "agent_events_status_check",
      sql`${table.status} in ('pending', 'running', 'completed', 'failed')`,
    ),
    check(
      "agent_events_scope_check",
      sql`${table.scope} in ('run', 'step', 'reasoning', 'tool', 'source', 'message', 'error', 'agent', 'stream')`,
    ),
    unique("agent_events_run_sequence_unique").on(table.runId, table.sequence),
    index("agent_events_thread_created_idx").on(
      table.chatThreadId,
      table.createdAt,
    ),
    index("agent_events_run_occurred_idx").on(table.runId, table.occurredAt),
    index("agent_events_type_idx").on(table.type),
    index("agent_events_scope_idx").on(table.scope),
  ],
);

export const table = {
  users,
  sessions,
  accounts,
  verifications,
  subscriptions,
  journals,
  journalVersions,
  // sources,
  // sourceChunks,
  exports,
  chatThreads,
  chatMessages,
  chatSources,
  chatArtifacts,
  agentRuns,
  agentEvents,
} as const;

export type Table = typeof table;
