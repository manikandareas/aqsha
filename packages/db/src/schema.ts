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
export const agentWorkflowTypes = ["research"] as const;
export const agentSessionStatuses = [
  "queued",
  "running",
  "completed",
  "failed",
] as const;
export const agentMessageRoles = ["user", "assistant"] as const;
export const agentMessageStatuses = ["pending", "completed", "failed"] as const;
export const agentRunStatuses = ["running", "completed", "failed"] as const;
export const agentResearchPhases = [
  "planner",
  "researcher",
  "critic",
  "synthesizer",
  "citation_audit",
  "synthesizer_revision",
  "final",
] as const;
export const agentDepthModes = ["standard", "deep"] as const;
export const agentCandidateSourceStatuses = [
  "candidate",
  "accepted",
  "rejected",
] as const;
export const agentCandidateSourceOrigins = [
  "qdrant",
  "websets",
  "model",
] as const;
export const agentEvidenceSources = ["qdrant", "websets", "manual"] as const;
export const agentEvidenceProvenances = [
  "retrieved",
  "model_cited",
  "audited",
] as const;
export const agentClaimConfidences = ["low", "medium", "high"] as const;

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
  clerkUserId: text("clerk_user_id").notNull().unique(),
  authTokenIdentifier: text("auth_token_identifier").notNull().unique(),
  email: text("email").notNull(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  onboardingCompletedAt: timestamp("onboarding_completed_at", {
    withTimezone: true,
  }),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
});

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

export const agentSessions = pgTable(
  "agent_sessions",
  {
    id: idColumn("id"),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    workflowType: text("workflow_type", { enum: agentWorkflowTypes }).notNull(),
    prompt: text("prompt").notNull(),
    depthMode: text("depth_mode", { enum: agentDepthModes }).notNull(),
    status: text("status", { enum: agentSessionStatuses })
      .notNull()
      .default("queued"),
    finalAnswer: text("final_answer"),
    auditWarnings: jsonb("audit_warnings").$type<JsonValue>(),
    auditFailures: jsonb("audit_failures").$type<JsonValue>(),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    check(
      "agent_sessions_workflow_type_check",
      sql`${table.workflowType} in ('research')`,
    ),
    check(
      "agent_sessions_depth_mode_check",
      sql`${table.depthMode} in ('standard', 'deep')`,
    ),
    check(
      "agent_sessions_status_check",
      sql`${table.status} in ('queued', 'running', 'completed', 'failed')`,
    ),
    index("agent_sessions_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt,
    ),
    index("agent_sessions_user_id_idx").on(table.userId),
  ],
);

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: idColumn("id"),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => agentSessions.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    phase: text("phase", { enum: agentResearchPhases }).notNull(),
    status: text("status", { enum: agentRunStatuses })
      .notNull()
      .default("running"),
    model: text("model").notNull(),
    maxTurns: integer("max_turns").notNull(),
    maxBudgetUsd: text("max_budget_usd"),
    sdkSessionId: text("sdk_session_id"),
    sdkResultSubtype: text("sdk_result_subtype"),
    usage: jsonb("usage").$type<JsonValue>(),
    modelUsage: jsonb("model_usage").$type<JsonValue>(),
    totalCostUsd: text("total_cost_usd"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    check(
      "agent_runs_phase_check",
      sql`${table.phase} in ('planner', 'researcher', 'critic', 'synthesizer', 'citation_audit', 'synthesizer_revision', 'final')`,
    ),
    check(
      "agent_runs_status_check",
      sql`${table.status} in ('running', 'completed', 'failed')`,
    ),
    index("agent_runs_session_phase_idx").on(table.sessionId, table.phase),
    index("agent_runs_workspace_started_idx").on(
      table.workspaceId,
      table.startedAt,
    ),
  ],
);

export const agentMessages = pgTable(
  "agent_messages",
  {
    id: idColumn("id"),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => agentSessions.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role", { enum: agentMessageRoles }).notNull(),
    status: text("status", { enum: agentMessageStatuses })
      .notNull()
      .default("pending"),
    content: text("content").notNull(),
    turnNumber: integer("turn_number").notNull(),
    depthMode: text("depth_mode", { enum: agentDepthModes }).notNull(),
    runId: uuid("run_id").references(() => agentRuns.id, {
      onDelete: "set null",
    }),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata").$type<JsonValue>(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    check(
      "agent_messages_role_check",
      sql`${table.role} in ('user', 'assistant')`,
    ),
    check(
      "agent_messages_status_check",
      sql`${table.status} in ('pending', 'completed', 'failed')`,
    ),
    check(
      "agent_messages_depth_mode_check",
      sql`${table.depthMode} in ('standard', 'deep')`,
    ),
    unique("agent_messages_session_turn_role_unique").on(
      table.sessionId,
      table.turnNumber,
      table.role,
    ),
    index("agent_messages_session_created_idx").on(
      table.sessionId,
      table.createdAt,
    ),
  ],
);

export const agentEvents = pgTable(
  "agent_events",
  {
    id: idColumn("id"),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => agentSessions.id, { onDelete: "cascade" }),
    runId: uuid("run_id").references(() => agentRuns.id, {
      onDelete: "cascade",
    }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    phase: text("phase", { enum: agentResearchPhases }),
    sequence: integer("sequence").notNull(),
    eventType: text("event_type").notNull(),
    rawMessage: jsonb("raw_message").$type<JsonValue>(),
    curated: jsonb("curated").$type<JsonValue>(),
    createdAt: createdAtColumn(),
  },
  (table) => [
    unique("agent_events_session_sequence_unique").on(
      table.sessionId,
      table.sequence,
    ),
    index("agent_events_session_created_idx").on(
      table.sessionId,
      table.createdAt,
    ),
    index("agent_events_run_id_idx").on(table.runId),
  ],
);

export const agentResearchSessions = pgTable(
  "agent_research_sessions",
  {
    id: idColumn("id"),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => agentSessions.id, { onDelete: "cascade" })
      .unique(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    researchIterations: integer("research_iterations").default(0).notNull(),
    maxResearchIterations: integer("max_research_iterations").notNull(),
    plan: jsonb("plan").$type<JsonValue>(),
    synthesis: jsonb("synthesis").$type<JsonValue>(),
    audit: jsonb("audit").$type<JsonValue>(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    index("agent_research_sessions_workspace_idx").on(table.workspaceId),
  ],
);

export const agentResearchCandidateSources = pgTable(
  "agent_research_candidate_sources",
  {
    id: idColumn("id"),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => agentSessions.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    origin: text("origin", { enum: agentCandidateSourceOrigins }).notNull(),
    status: text("status", { enum: agentCandidateSourceStatuses })
      .notNull()
      .default("candidate"),
    title: text("title").notNull(),
    url: text("url"),
    externalId: text("external_id"),
    metadata: jsonb("metadata").$type<JsonValue>(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    check(
      "agent_research_candidate_sources_origin_check",
      sql`${table.origin} in ('qdrant', 'websets', 'model')`,
    ),
    check(
      "agent_research_candidate_sources_status_check",
      sql`${table.status} in ('candidate', 'accepted', 'rejected')`,
    ),
    index("agent_research_candidate_sources_session_idx").on(table.sessionId),
  ],
);

export const agentResearchEvidenceItems = pgTable(
  "agent_research_evidence_items",
  {
    id: idColumn("id"),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => agentSessions.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    candidateSourceId: uuid("candidate_source_id").references(
      () => agentResearchCandidateSources.id,
      { onDelete: "set null" },
    ),
    source: text("source", { enum: agentEvidenceSources }).notNull(),
    provenance: text("provenance", { enum: agentEvidenceProvenances })
      .notNull(),
    citationKey: text("citation_key").notNull(),
    title: text("title"),
    url: text("url"),
    quote: text("quote").notNull(),
    metadata: jsonb("metadata").$type<JsonValue>(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    check(
      "agent_research_evidence_items_source_check",
      sql`${table.source} in ('qdrant', 'websets', 'manual')`,
    ),
    check(
      "agent_research_evidence_items_provenance_check",
      sql`${table.provenance} in ('retrieved', 'model_cited', 'audited')`,
    ),
    index("agent_research_evidence_items_session_idx").on(table.sessionId),
  ],
);

export const agentResearchClaims = pgTable(
  "agent_research_claims",
  {
    id: idColumn("id"),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => agentSessions.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    evidenceItemId: uuid("evidence_item_id").references(
      () => agentResearchEvidenceItems.id,
      { onDelete: "set null" },
    ),
    text: text("text").notNull(),
    confidence: text("confidence", { enum: agentClaimConfidences }).notNull(),
    supported: boolean("supported").default(false).notNull(),
    citationKeys: jsonb("citation_keys").$type<JsonValue>(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    check(
      "agent_research_claims_confidence_check",
      sql`${table.confidence} in ('low', 'medium', 'high')`,
    ),
    index("agent_research_claims_session_idx").on(table.sessionId),
    index("agent_research_claims_supported_idx").on(table.supported),
  ],
);

export const table = {
  users,
  workspaces,
  subscriptions,
  workspaceMembers,
  journals,
  journalVersions,
  // sources,
  // sourceChunks,
  exports,
  agentSessions,
  agentMessages,
  agentRuns,
  agentEvents,
  agentResearchSessions,
  agentResearchCandidateSources,
  agentResearchEvidenceItems,
  agentResearchClaims,
} as const;

export type Table = typeof table;
