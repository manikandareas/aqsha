import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { featureCountValidator } from "./billing/usageShape";
import { explorePaperFields } from "./explore/validators";
import { feedItemFields, feedProviderValidator } from "./feed/validators";

// All run references point at `agentRuns`. (A former `researchRuns` table was
// never defined; the dangling `v.id("researchRuns")` union member was removed.)
const runId = v.id("agentRuns");

const artifactTypeValidator = v.union(
  v.literal("markdown"),
  v.literal("plain_text"),
  v.literal("pdf"),
  v.literal("docx"),
  v.literal("html"),
  v.literal("svg"),
  v.literal("mermaid"),
  v.literal("json"),
  v.literal("csv"),
  v.literal("code"),
  v.literal("url"),
);

const artifactFamilyValidator = v.union(
  v.literal("text"),
  v.literal("file"),
  v.literal("interactive"),
  v.literal("visual"),
  v.literal("data"),
  v.literal("link"),
);

const artifactSourceValidator = v.union(
  v.literal("manual"),
  v.literal("upload"),
  v.literal("agent"),
  v.literal("url"),
);

const indexingStatusValidator = v.union(
  v.literal("not_indexed"),
  v.literal("pending"),
  v.literal("ready"),
  v.literal("failed"),
);

const detectedDocumentKindValidator = v.union(
  v.literal("generic"),
  v.literal("scholarly_paper"),
);

const artifactExtractorValidator = v.union(
  v.literal("pdf_text"),
  v.literal("docx_text"),
  v.literal("url_reader"),
  v.literal("grobid"),
);

const extractionStatusValidator = v.union(
  v.literal("pending"),
  v.literal("running"),
  v.literal("ready"),
  v.literal("failed"),
);

const paperAuthorValidator = v.object({
  name: v.string(),
  affiliation: v.optional(v.string()),
});

const artifactContentFields = {
  ownerUserId: v.string(),
  workspaceId: v.optional(v.id("workspaces")),
  threadId: v.optional(v.string()),
  artifactId: v.id("artifacts"),
  blocksJson: v.optional(v.string()),
  markdown: v.optional(v.string()),
  plainText: v.optional(v.string()),
  contextText: v.optional(v.string()),
  storageId: v.optional(v.id("_storage")),
  blocksStorageId: v.optional(v.id("_storage")),
  markdownStorageId: v.optional(v.id("_storage")),
  uploadStorageId: v.optional(v.id("_storage")),
  uploadFileName: v.optional(v.string()),
  uploadMimeType: v.optional(v.string()),
  uploadSize: v.optional(v.number()),
  ingestionStatus: v.optional(v.union(
    v.literal("pending"),
    v.literal("ready"),
    v.literal("failed"),
  )),
  ingestionFailureReason: v.optional(v.string()),
  ragEntryId: v.optional(v.string()),
  indexedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
};

export default defineSchema(
  {
    users: defineTable({
      ownerUserId: v.string(),
      clerkUserId: v.string(),
      email: v.optional(v.union(v.string(), v.null())),
      emailVerified: v.optional(v.boolean()),
      name: v.optional(v.union(v.string(), v.null())),
      image: v.optional(v.union(v.string(), v.null())),
      deletedAt: v.optional(v.number()),
      deletionStatus: v.optional(
        v.union(
          v.literal("deleting"),
          v.literal("deleted"),
          v.literal("failed"),
        ),
      ),
      deletionRequestedAt: v.optional(v.number()),
      deletionCompletedAt: v.optional(v.number()),
      deletionFailedAt: v.optional(v.number()),
      deletionFailureReason: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_owner_user_id", ["ownerUserId"])
      .index("by_clerk_user_id", ["clerkUserId"]),
    authEvents: defineTable({
      eventKey: v.string(),
      eventType: v.string(),
      clerkUserId: v.optional(v.string()),
      processedAt: v.number(),
    }).index("by_event_key", ["eventKey"]),
    threadMetadata: defineTable({
      ownerUserId: v.string(),
      threadId: v.string(),
      workspaceId: v.optional(v.id("workspaces")),
      lastActivityAt: v.number(),
      lastMessagePreview: v.string(),
      messageCount: v.number(),
      status: v.union(v.literal("idle"), v.literal("streaming"), v.literal("failed")),
      // Sticky per-thread selected agent for the composer. Optional for legacy
      // rows; defaults to "lite" at read time.
      lastAgentKind: v.optional(v.union(v.literal("lite"), v.literal("pro"))),
    })
      .index("by_thread", ["threadId"])
      .index("by_owner_activity", ["ownerUserId", "lastActivityAt"])
      .index("by_owner_workspace_activity", ["ownerUserId", "workspaceId", "lastActivityAt"]),
    threadContextArtifacts: defineTable({
      ownerUserId: v.string(),
      threadId: v.string(),
      workspaceId: v.optional(v.id("workspaces")),
      artifactId: v.id("artifacts"),
      createdAt: v.number(),
    })
      .index("by_owner_thread_created", ["ownerUserId", "threadId", "createdAt"])
      .index("by_owner_thread_artifact", ["ownerUserId", "threadId", "artifactId"])
      .index("by_owner_workspace_artifact", ["ownerUserId", "workspaceId", "artifactId"]),
    // Whole-workspace context references pinned to a thread. Additive to
    // threadMetadata.workspaceId ("filed under"): a thread can reference many
    // workspaces as RAG context sources. Mirrors threadContextArtifacts.
    threadContextWorkspaces: defineTable({
      ownerUserId: v.string(),
      threadId: v.string(),
      workspaceId: v.id("workspaces"),
      createdAt: v.number(),
    })
      .index("by_owner_thread_created", ["ownerUserId", "threadId", "createdAt"])
      .index("by_owner_thread_workspace", ["ownerUserId", "threadId", "workspaceId"]),
    workspaces: defineTable({
      ownerUserId: v.string(),
      name: v.string(),
      emoji: v.optional(v.string()),
      description: v.optional(v.string()),
      status: v.union(v.literal("active"), v.literal("archived")),
      archivedAt: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_owner_status_updated", ["ownerUserId", "status", "updatedAt"])
      .index("by_owner_updated", ["ownerUserId", "updatedAt"]),
    workspaceFolders: defineTable({
      ownerUserId: v.string(),
      workspaceId: v.id("workspaces"),
      name: v.string(),
      status: v.union(v.literal("active"), v.literal("deleted")),
      createdAt: v.number(),
      updatedAt: v.number(),
      deletedAt: v.optional(v.number()),
    })
      .index("by_owner_workspace_status_updated", [
        "ownerUserId",
        "workspaceId",
        "status",
        "updatedAt",
      ])
      .index("by_owner_workspace_name", ["ownerUserId", "workspaceId", "name"]),
    usageLedger: defineTable({
      ownerUserId: v.string(),
      threadId: v.string(),
      messageId: v.optional(v.string()),
      provider: v.string(),
      model: v.string(),
      inputTokens: v.number(),
      outputTokens: v.number(),
      totalTokens: v.number(),
      createdAt: v.number(),
    })
      .index("by_owner_created", ["ownerUserId", "createdAt"])
      .index("by_thread_created", ["threadId", "createdAt"]),
    billingSubscriptions: defineTable({
      ownerUserId: v.string(),
      polarSubscriptionId: v.string(),
      polarProductId: v.string(),
      productKey: v.optional(v.string()),
      planKey: v.union(v.literal("starter"), v.literal("plus")),
      billingInterval: v.union(v.literal("month"), v.literal("year")),
      status: v.string(),
      currentPeriodStart: v.optional(v.number()),
      currentPeriodEnd: v.optional(v.number()),
      cancelAtPeriodEnd: v.optional(v.boolean()),
      canceledAt: v.optional(v.number()),
      rawJson: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_owner_updated", ["ownerUserId", "updatedAt"])
      .index("by_subscription", ["polarSubscriptionId"]),
    billingEvents: defineTable({
      eventKey: v.string(),
      eventType: v.string(),
      processedAt: v.number(),
    }).index("by_event_key", ["eventKey"]),
    adminEntitlements: defineTable({
      ownerUserId: v.string(),
      email: v.string(),
      enabled: v.boolean(),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_owner", ["ownerUserId"])
      .index("by_email", ["email"]),
    billingCreditPeriods: defineTable({
      ownerUserId: v.string(),
      periodKey: v.string(),
      planKey: v.union(
        v.literal("free"),
        v.literal("starter"),
        v.literal("plus"),
        v.literal("admin"),
      ),
      status: v.string(),
      creditsLimit: v.number(),
      creditsUsed: v.number(),
      estimatedCostCents: v.number(),
      spendCeilingCents: v.number(),
      startedAt: v.number(),
      resetAt: v.number(),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_owner_period", ["ownerUserId", "periodKey"]),
    providerUsageLedger: defineTable({
      ownerUserId: v.string(),
      threadId: v.optional(v.string()),
      runId: v.optional(runId),
      feature: v.union(
        v.literal("normal_chat"),
        v.literal("pro_chat"),
        v.literal("cited_answer"),
        v.literal("deep_research"),
        v.literal("external_search"),
        v.literal("sandbox_compute"),
        v.literal("citation_verify"),
      ),
      provider: v.string(),
      model: v.optional(v.string()),
      inputTokens: v.optional(v.number()),
      outputTokens: v.optional(v.number()),
      totalTokens: v.optional(v.number()),
      credits: v.number(),
      estimatedCostCents: v.number(),
      metadataJson: v.optional(v.string()),
      createdAt: v.number(),
    })
      .index("by_owner_created", ["ownerUserId", "createdAt"])
      .index("by_owner_feature_created", ["ownerUserId", "feature", "createdAt"]),
    // Denormalized per-(owner, UTC day) usage rollup. Maintained atomically in
    // the same transaction as each `providerUsageLedger` insert (see
    // `bumpUsageDailyRollup`) so the usage `activity` query reads a bounded set
    // of rows instead of scanning the full ledger. `date` is "YYYY-MM-DD" (UTC)
    // which sorts lexicographically == chronologically, enabling string-range
    // window reads on the `by_owner_date` index.
    usageDailyRollup: defineTable({
      ownerUserId: v.string(),
      date: v.string(),
      credits: v.number(),
      estimatedCostCents: v.number(),
      eventCount: v.number(),
      featureCounts: featureCountValidator,
    }).index("by_owner_date", ["ownerUserId", "date"]),
    messageCommands: defineTable({
      ownerUserId: v.string(),
      threadId: v.string(),
      messageId: v.string(),
      commandId: v.string(),
      commandLabel: v.string(),
      commandSlug: v.string(),
      // Legacy execution mode; retained for read tolerance of existing rows.
      mode: v.union(v.literal("normal"), v.literal("deep")),
      // Which agent produced this command run. Optional for legacy rows.
      agentKind: v.optional(v.union(v.literal("lite"), v.literal("pro"))),
      argumentPreview: v.string(),
      expandedPromptSnapshot: v.string(),
      createdAt: v.number(),
    })
      .index("by_owner_message", ["ownerUserId", "messageId"])
      .index("by_owner_thread_created", ["ownerUserId", "threadId", "createdAt"]),
    messageWorkspaceArtifacts: defineTable({
      ownerUserId: v.string(),
      threadId: v.string(),
      messageId: v.string(),
      artifactId: v.id("artifacts"),
      relation: v.union(
        v.literal("created"),
        v.literal("updated"),
        v.literal("deleted"),
        v.literal("referenced"),
      ),
      createdAt: v.number(),
    })
      .index("by_owner_message", ["ownerUserId", "messageId"])
      .index("by_owner_artifact", ["ownerUserId", "artifactId"])
      .index("by_owner_thread_created", ["ownerUserId", "threadId", "createdAt"]),
    messageWorkspaceActions: defineTable({
      ownerUserId: v.string(),
      threadId: v.string(),
      messageId: v.string(),
      workspaceId: v.id("workspaces"),
      action: v.union(v.literal("created"), v.literal("renamed")),
      createdAt: v.number(),
    })
      .index("by_owner_message", ["ownerUserId", "messageId"])
      .index("by_owner_thread_created", ["ownerUserId", "threadId", "createdAt"]),
    messageContextArtifacts: defineTable({
      ownerUserId: v.string(),
      threadId: v.string(),
      messageId: v.string(),
      artifactId: v.id("artifacts"),
      title: v.string(),
      artifactType: v.optional(artifactTypeValidator),
      source: v.optional(v.union(v.literal("upload"), v.literal("workspace"))),
      kind: v.optional(v.union(v.literal("document"), v.literal("url"))),
      createdAt: v.number(),
    }).index("by_owner_message", ["ownerUserId", "messageId"]),
    // Per-message snapshot of the workspaces that were active context when the
    // message was sent (filed-under + @mentioned). Drives the message bubble's
    // workspace badges.
    messageContextWorkspaces: defineTable({
      ownerUserId: v.string(),
      threadId: v.string(),
      messageId: v.string(),
      workspaceId: v.id("workspaces"),
      name: v.string(),
      createdAt: v.number(),
    }).index("by_owner_message", ["ownerUserId", "messageId"]),
    // The user message text WITH inline mention markers, kept separate from the
    // agent message (which is stored clean) so the bubble can render mention
    // pills at the exact position the user typed them.
    messageRichContent: defineTable({
      ownerUserId: v.string(),
      threadId: v.string(),
      messageId: v.string(),
      content: v.string(),
      createdAt: v.number(),
    }).index("by_owner_message", ["ownerUserId", "messageId"]),
    agentRuns: defineTable({
      ownerUserId: v.string(),
      threadId: v.string(),
      promptMessageId: v.string(),
      // Legacy execution mode; retained for read tolerance of existing rows.
      mode: v.union(v.literal("normal"), v.literal("deep")),
      // Selected agent for this run (modulates chat model/steps and deep
      // research model/round cap). Optional for legacy rows; defaults at read
      // time to mode === "deep" ? "pro" : "lite".
      agentKind: v.optional(v.union(v.literal("lite"), v.literal("pro"))),
      executionKind: v.union(v.literal("inline"), v.literal("workflow")),
      workflowId: v.optional(v.string()),
      promptSnapshot: v.optional(v.string()),
      commandId: v.optional(v.string()),
      status: v.union(
        v.literal("queued"),
        v.literal("running"),
        // `waiting` = paused for plan approval; `waiting_hitl` = paused for an
        // in-thread askUser/needsApproval tool (AUD-16). Both count as active.
        v.literal("waiting"),
        v.literal("waiting_hitl"),
        v.literal("completed"),
        v.literal("failed"),
        v.literal("canceled"),
      ),
      currentStep: v.optional(v.string()),
      failedStep: v.optional(v.string()),
      roundCount: v.optional(v.number()),
      maxRounds: v.optional(v.number()),
      sufficiencyStatus: v.optional(
        v.union(
          v.literal("unknown"),
          v.literal("insufficient"),
          v.literal("partial"),
          v.literal("sufficient"),
          v.literal("budget_exhausted"),
        ),
      ),
      verificationStatus: v.optional(
        v.union(
          v.literal("not_started"),
          v.literal("checking"),
          v.literal("passed"),
          v.literal("revised"),
          v.literal("partial"),
          v.literal("failed"),
        ),
      ),
      budgetJson: v.optional(v.string()),
      activeArtifactId: v.optional(v.id("artifacts")),
      artifactCount: v.number(),
      sourceCount: v.number(),
      citationCheckCount: v.number(),
      retryOfRunId: v.optional(runId),
      retryable: v.boolean(),
      canceledAt: v.optional(v.number()),
      errorCode: v.optional(v.string()),
      errorMessage: v.optional(v.string()),
      // Per-artifact statistical verification summary (sandbox compute path),
      // serialized VerificationReport. Optional — only set on runs that ran a
      // verification. See agent/sandbox/verificationReport.ts.
      verificationReportJson: v.optional(v.string()),
      // Phase 3 (Slice 3.1) writer->auditor->finalize staging slot for the report
      // markdown, so subagent steps pass a tiny runId ref instead of the full
      // report through the workflow journal (1 MB/step). Point-read by runId.
      draftMarkdown: v.optional(v.string()),
      // Phase 3 (Slice R1a) planned source buckets, serialized once per run so the
      // decomposed v2 literatureRoundAgent rehydrates them per round instead of
      // re-planning. Optional/greenfield-safe; written by researchLoop/v2 start.
      bucketsJson: v.optional(v.string()),
      // Phase 3 (Slice R1c/R1d) verification degradation markers — a JSON array of
      // { marker, reason } appended whenever a non-fatal verifier (citation /
      // statistical / semantic) fails or is rate-limited. The finalizer reads these
      // to ship a "verification incomplete" section instead of failing the run.
      verificationMarkersJson: v.optional(v.string()),
      // Phase 3 (Slice R2 / AUD-08) the user-visible recall query + pinned
      // attachment ids captured at run start, so a HITL resume can rebuild the RAG
      // document context and re-inject it via contextHandler (the resume turn has
      // no string prompt to prepend to). Additive; absent on pre-R2 runs (resume
      // then proceeds without RAG, the prior behavior).
      visiblePromptSnapshot: v.optional(v.string()),
      attachmentArtifactIds: v.optional(v.array(v.id("artifacts"))),
      // Phase 3 (Slice R3 / AUD-17) artifacts whose FULL content was placed in the
      // prompt context block at run start. Excluded from RAG retrieval (no
      // duplicate text) on both the initial turn and the HITL resume rebuild.
      includedArtifactIds: v.optional(v.array(v.id("artifacts"))),
      createdAt: v.number(),
      updatedAt: v.number(),
      completedAt: v.optional(v.number()),
    })
      .index("by_owner_thread_created", ["ownerUserId", "threadId", "createdAt"])
      .index("by_owner_status", ["ownerUserId", "status"])
      // AUD-07: reliable per-thread active/waiting lookup (replaces the take(8)
      // ring-buffer scan that silently dropped older active runs).
      .index("by_owner_thread_status", ["ownerUserId", "threadId", "status"])
      .index("by_workflow", ["workflowId"]),
    agentRunSteps: defineTable({
      ownerUserId: v.string(),
      runId,
      stepKey: v.string(),
      label: v.string(),
      order: v.number(),
      status: v.union(
        v.literal("pending"),
        v.literal("running"),
        v.literal("completed"),
        v.literal("failed"),
        v.literal("canceled"),
      ),
      summary: v.optional(v.string()),
      sourceCount: v.optional(v.number()),
      artifactCount: v.optional(v.number()),
      failureReason: v.optional(v.string()),
      startedAt: v.optional(v.number()),
      completedAt: v.optional(v.number()),
      updatedAt: v.number(),
    })
      .index("by_run_order", ["runId", "order"])
      .index("by_owner_run", ["ownerUserId", "runId"])
      .index("by_owner_run_and_step", ["ownerUserId", "runId", "stepKey"]),
    agentRunEvents: defineTable({
      ownerUserId: v.string(),
      runId,
      threadId: v.string(),
      stepKey: v.optional(v.string()),
      eventType: v.union(
        v.literal("plan"),
        v.literal("gap"),
        v.literal("query"),
        v.literal("search"),
        v.literal("read"),
        v.literal("rerank"),
        v.literal("audit"),
        v.literal("tool"),
        v.literal("artifact"),
        v.literal("status"),
        v.literal("failure"),
        v.literal("compute"),
        v.literal("citation_check"),
        v.literal("skill_activated"),
      ),
      round: v.optional(v.number()),
      title: v.string(),
      summary: v.string(),
      metadataJson: v.optional(v.string()),
      createdAt: v.number(),
    })
      .index("by_owner_run_created", ["ownerUserId", "runId", "createdAt"])
      .index("by_run_created", ["runId", "createdAt"]),
    researchRoundStates: defineTable({
      ownerUserId: v.string(),
      threadId: v.string(),
      runId,
      round: v.number(),
      status: v.union(
        v.literal("planned"),
        v.literal("discovering"),
        v.literal("reading"),
        v.literal("assessing"),
        v.literal("completed"),
        v.literal("failed"),
      ),
      query: v.string(),
      gapAssessment: v.string(),
      sufficiencyStatus: v.union(
        v.literal("unknown"),
        v.literal("insufficient"),
        v.literal("partial"),
        v.literal("sufficient"),
        v.literal("budget_exhausted"),
      ),
      sourceCount: v.number(),
      extractCount: v.number(),
      stateJson: v.string(),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_owner_run_round", ["ownerUserId", "runId", "round"])
      .index("by_run_round", ["runId", "round"]),
    artifacts: defineTable({
      ownerUserId: v.string(),
      workspaceId: v.optional(v.id("workspaces")),
      folderId: v.optional(v.id("workspaceFolders")),
      threadId: v.optional(v.string()),
      runId: v.optional(runId),
      artifactType: v.optional(artifactTypeValidator),
      artifactFamily: v.optional(artifactFamilyValidator),
      source: v.optional(artifactSourceValidator),
      kind: v.optional(v.union(v.literal("document"), v.literal("url"))),
      type: v.optional(v.string()),
      contentFormat: v.optional(v.string()),
      title: v.string(),
      language: v.optional(v.string()),
      mimeType: v.optional(v.string()),
      fileName: v.optional(v.string()),
      byteSize: v.optional(v.number()),
      indexingStatus: v.optional(indexingStatusValidator),
      indexingFailureReason: v.optional(v.string()),
      detectedDocumentKind: v.optional(detectedDocumentKindValidator),
      ragEntryId: v.optional(v.string()),
      indexedAt: v.optional(v.number()),
      storageId: v.optional(v.id("_storage")),
      plainTextPreview: v.optional(v.string()),
      status: v.optional(v.union(v.literal("active"), v.literal("deleted"))),
      deletedAt: v.optional(v.number()),
      currentVersionId: v.optional(v.id("artifactVersions")),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_owner_thread_created", ["ownerUserId", "threadId", "createdAt"])
      .index("by_owner_thread_source_status_created", [
        "ownerUserId",
        "threadId",
        "source",
        "status",
        "createdAt",
      ])
      .index("by_owner_run", ["ownerUserId", "runId"])
      .index("by_owner_status_updated", ["ownerUserId", "status", "updatedAt"])
      .index("by_owner_workspace_status_updated", [
        "ownerUserId",
        "workspaceId",
        "status",
        "updatedAt",
      ])
      .index("by_owner_workspace_folder_status_updated", [
        "ownerUserId",
        "workspaceId",
        "folderId",
        "status",
        "updatedAt",
      ]),
    artifactContents: defineTable(artifactContentFields)
      .index("by_owner_artifact", ["ownerUserId", "artifactId"])
      .index("by_owner_thread", ["ownerUserId", "threadId"])
      .index("by_owner_workspace_updated", ["ownerUserId", "workspaceId", "updatedAt"]),
    artifactExtractions: defineTable({
      ownerUserId: v.string(),
      artifactId: v.id("artifacts"),
      workspaceId: v.optional(v.id("workspaces")),
      extractor: artifactExtractorValidator,
      status: extractionStatusValidator,
      attemptId: v.optional(v.string()),
      inputStorageId: v.optional(v.id("_storage")),
      outputStorageId: v.optional(v.id("_storage")),
      outputMimeType: v.optional(v.string()),
      failureReason: v.optional(v.string()),
      startedAt: v.optional(v.number()),
      completedAt: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_owner_artifact_extractor", [
        "ownerUserId",
        "artifactId",
        "extractor",
      ])
      .index("by_owner_workspace_status_updated", [
        "ownerUserId",
        "workspaceId",
        "status",
        "updatedAt",
      ]),
    artifactPaperMetadata: defineTable({
      ownerUserId: v.string(),
      artifactId: v.id("artifacts"),
      workspaceId: v.id("workspaces"),
      title: v.optional(v.string()),
      abstract: v.optional(v.string()),
      doi: v.optional(v.string()),
      authors: v.optional(v.array(paperAuthorValidator)),
      affiliations: v.optional(v.array(v.string())),
      journal: v.optional(v.string()),
      publisher: v.optional(v.string()),
      publishedYear: v.optional(v.number()),
      keywords: v.optional(v.array(v.string())),
      referencesStorageId: v.optional(v.id("_storage")),
      sectionsStorageId: v.optional(v.id("_storage")),
      teiStorageId: v.optional(v.id("_storage")),
      metadataSource: v.union(
        v.literal("grobid"),
        v.literal("crossref"),
        v.literal("openalex"),
        v.literal("arxiv"),
        v.literal("datacite"),
        v.literal("semantic_scholar"),
        v.literal("manual"),
        v.literal("llm"),
      ),
      // Provenance for URL/identifier-sourced papers (vs. uploaded PDFs).
      // When set, the artifact was ingested from a DOI/arXiv/URL.
      arxivId: v.optional(v.string()),
      sourceUrl: v.optional(v.string()),
      oaStatus: v.optional(v.string()),
      pdfStatus: v.optional(
        v.union(
          v.literal("downloaded"),
          v.literal("no_oa_available"),
        ),
      ),
      confidence: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_owner_artifact", ["ownerUserId", "artifactId"])
      .index("by_owner_workspace_updated", ["ownerUserId", "workspaceId", "updatedAt"])
      .index("by_owner_doi", ["ownerUserId", "doi"]),
    artifactUrls: defineTable({
      ownerUserId: v.string(),
      workspaceId: v.id("workspaces"),
      artifactId: v.id("artifacts"),
      originalUrl: v.string(),
      normalizedUrl: v.string(),
      status: v.union(v.literal("pending"), v.literal("ready"), v.literal("failed")),
      title: v.optional(v.string()),
      description: v.optional(v.string()),
      siteName: v.optional(v.string()),
      readableText: v.optional(v.string()),
      contextText: v.optional(v.string()),
      storageId: v.optional(v.id("_storage")),
      failureReason: v.optional(v.string()),
      extractedAt: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_owner_artifact", ["ownerUserId", "artifactId"])
      .index("by_owner_workspace_normalized_url", [
        "ownerUserId",
        "workspaceId",
        "normalizedUrl",
      ])
      .index("by_owner_workspace_status_updated", [
        "ownerUserId",
        "workspaceId",
        "status",
        "updatedAt",
      ]),
    artifactVersions: defineTable({
      ownerUserId: v.string(),
      threadId: v.string(),
      artifactId: v.id("artifacts"),
      runId: v.optional(runId),
      versionNumber: v.number(),
      contentFormat: v.union(
        v.literal("markdown"),
        v.literal("html"),
        v.literal("plain"),
        v.literal("code"),
        v.literal("json"),
      ),
      title: v.string(),
      body: v.optional(v.string()),
      storageId: v.optional(v.id("_storage")),
      createdByMessageId: v.optional(v.string()),
      changeSummary: v.optional(v.string()),
      createdAt: v.number(),
    })
      .index("by_owner_artifact_version", ["ownerUserId", "artifactId", "versionNumber"])
      .index("by_owner_artifact_created", ["ownerUserId", "artifactId", "createdAt"]),
    messageArtifacts: defineTable({
      ownerUserId: v.string(),
      threadId: v.string(),
      messageId: v.string(),
      artifactId: v.id("artifacts"),
      versionId: v.id("artifactVersions"),
      relation: v.union(
        v.literal("created"),
        v.literal("updated"),
        v.literal("referenced"),
      ),
      createdAt: v.number(),
    })
      .index("by_owner_message", ["ownerUserId", "messageId"])
      .index("by_owner_artifact", ["ownerUserId", "artifactId"])
      .index("by_owner_thread_created", ["ownerUserId", "threadId", "createdAt"]),
    citationChecks: defineTable({
      ownerUserId: v.string(),
      threadId: v.string(),
      runId,
      artifactId: v.id("artifacts"),
      artifactVersionId: v.id("artifactVersions"),
      claim: v.string(),
      support: v.union(
        v.literal("supported"),
        v.literal("partially_supported"),
        v.literal("contradicted"),
        v.literal("partial"),
        v.literal("unsupported"),
      ),
      sourceIds: v.array(v.id("researchSources")),
      verifierModel: v.optional(v.string()),
      confidence: v.optional(v.number()),
      failureReason: v.optional(v.string()),
      extractIds: v.optional(v.array(v.id("researchExtracts"))),
      revisionAction: v.optional(
        v.union(
          v.literal("none"),
          v.literal("caveated"),
          v.literal("removed_or_rewritten"),
        ),
      ),
      evidence: v.string(),
      // Module-3 auditor (Phase 3, Slice 3.2): provenance of the claim's evidence.
      // textual = backed by a cited extract only; computational = backed by a
      // deterministic sandbox recompute; mixed = both. computationCheckIds links
      // the backing computationChecks; claimSpan is the matched NHST span (for UI
      // highlight). All optional/greenfield-safe — populated from the first audit.
      evidenceKind: v.optional(
        v.union(
          v.literal("textual"),
          v.literal("computational"),
          v.literal("mixed"),
        ),
      ),
      computationCheckIds: v.optional(v.array(v.id("computationChecks"))),
      claimSpan: v.optional(v.string()),
      createdAt: v.number(),
    })
      .index("by_owner_artifact", ["ownerUserId", "artifactId"])
      .index("by_owner_artifact_version", [
        "ownerUserId",
        "artifactId",
        "artifactVersionId",
      ])
      .index("by_owner_run", ["ownerUserId", "runId"]),
    // Provenance for a single ephemeral sandbox execution (Daytona). Owner-scoped,
    // mirroring the citationChecks conventions (ownerUserId partition, by_owner_*
    // indexes, v.id("agentRuns") for runId — never the union). This row is the run
    // envelope; the raw recomputed numbers live in `computationChecks`.
    sandboxRuns: defineTable({
      ownerUserId: v.string(),
      threadId: v.optional(v.string()),
      runId: v.optional(runId),
      taskKind: v.union(
        v.literal("stat_verification"),
        v.literal("replication"),
        v.literal("meta_analysis"),
        v.literal("custom_analysis"),
      ),
      status: v.union(
        v.literal("provisioning"),
        v.literal("running"),
        v.literal("completed"),
        v.literal("failed"),
        v.literal("canceled"),
        v.literal("timeout"),
      ),
      // Versioned snapshot name (e.g. "aqsha-statverify-v1") for reproducibility.
      snapshotVersion: v.string(),
      command: v.string(),
      // sha256 of each uploaded input file, for replay/determinism auditing.
      inputFileHashes: v.array(v.string()),
      exitCode: v.optional(v.number()),
      stdoutClipped: v.optional(v.string()),
      errorMessage: v.optional(v.string()),
      outputArtifactIds: v.optional(v.array(v.id("artifacts"))),
      durationMs: v.optional(v.number()),
      creditsCharged: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
      completedAt: v.optional(v.number()),
    })
      .index("by_owner_created", ["ownerUserId", "createdAt"])
      .index("by_owner_run", ["ownerUserId", "runId"]),
    // Deterministic per-check result produced by a sandboxRun. Raw reported vs
    // recomputed numbers (reportedJson/recomputedJson) are stored as-is; the
    // consistent/discrepant interpretation lives in `outcome` with explicit
    // `toleranceJson` — never mixed (determinism invariant). `by_owner_sandbox_run`
    // is the replay read path (all checks for a run); `by_owner_artifact` powers
    // the per-artifact verification report.
    computationChecks: defineTable({
      ownerUserId: v.string(),
      sandboxRunId: v.id("sandboxRuns"),
      artifactId: v.id("artifacts"),
      checkKind: v.union(
        v.literal("statcheck"),
        v.literal("grim"),
        v.literal("grimmer"),
        v.literal("power"),
      ),
      claimText: v.string(),
      // Raw matched span (e.g. the NHST string statcheck flagged) for UI
      // highlighting and replay. Absent when the check is span-less.
      claimSpan: v.optional(v.string()),
      reportedJson: v.string(),
      recomputedJson: v.string(),
      outcome: v.union(
        v.literal("consistent"),
        v.literal("discrepant"),
        v.literal("decision_error"),
        v.literal("not_computable"),
      ),
      toleranceJson: v.string(),
      createdAt: v.number(),
    })
      .index("by_owner_artifact", ["ownerUserId", "artifactId"])
      .index("by_owner_sandbox_run", ["ownerUserId", "sandboxRunId"]),
    researchSources: defineTable({
      ownerUserId: v.string(),
      threadId: v.string(),
      messageId: v.optional(v.string()),
      runId: v.optional(runId),
      artifactId: v.optional(v.id("artifacts")),
      artifactVersionId: v.optional(v.id("artifactVersions")),
      sourceKey: v.optional(v.string()),
      usage: v.optional(
        v.union(
          v.literal("candidate"),
          v.literal("cited"),
          v.literal("accepted"),
          v.literal("rejected"),
        ),
      ),
      citationNumber: v.number(),
      origin: v.union(
        v.literal("web"),
        v.literal("arxiv"),
        v.literal("doi"),
      ),
      provider: v.optional(v.string()),
      providerRequestId: v.optional(v.string()),
      evidenceStrength: v.union(
        v.literal("strong"),
        v.literal("medium"),
        v.literal("weak"),
      ),
      title: v.string(),
      locator: v.string(),
      url: v.optional(v.string()),
      doi: v.optional(v.string()),
      arxivId: v.optional(v.string()),
      snippet: v.string(),
      readStatus: v.optional(
        v.union(
          v.literal("not_needed"),
          v.literal("ready"),
          v.literal("failed"),
        ),
      ),
      readError: v.optional(v.string()),
      qualityReason: v.optional(v.string()),
      bucketName: v.optional(v.string()),
      discoveryQuery: v.optional(v.string()),
      rerankScore: v.optional(v.number()),
      metadataJson: v.optional(v.string()),
      // Citation Integrity (4-step) result — written after sources persist
      // (agent/research/citationIntegrity.ts). All optional/greenfield-safe.
      integrityStatus: v.optional(
        v.union(
          v.literal("verified"),
          v.literal("metadata_mismatch"),
          v.literal("identifier_invalid"),
          v.literal("not_found"),
          v.literal("unverifiable"),
        ),
      ),
      integrityDetailJson: v.optional(v.string()),
      integrityCheckedAt: v.optional(v.number()),
      createdAt: v.number(),
      lastSeenAt: v.optional(v.number()),
    })
      .index("by_owner_thread", ["ownerUserId", "threadId"])
      .index("by_owner_message", ["ownerUserId", "messageId"])
      .index("by_owner_run", ["ownerUserId", "runId"])
      .index("by_owner_run_source_key", ["ownerUserId", "runId", "sourceKey"])
      .index("by_owner_artifact", ["ownerUserId", "artifactId"]),
    researchExtracts: defineTable({
      ownerUserId: v.string(),
      runId,
      threadId: v.string(),
      sourceKey: v.string(),
      citationNumber: v.number(),
      title: v.string(),
      locator: v.string(),
      quote: v.string(),
      relevance: v.union(
        v.literal("high"),
        v.literal("medium"),
        v.literal("low"),
      ),
      notes: v.optional(v.string()),
      createdAt: v.number(),
    })
      .index("by_owner_run", ["ownerUserId", "runId"])
      .index("by_run_citation", ["runId", "citationNumber"]),
    externalLookupCache: defineTable({
      provider: v.union(
        v.literal("openalex"),
        v.literal("crossref"),
        v.literal("arxiv"),
        v.literal("exa"),
        v.literal("jina_search"),
        v.literal("jina_read"),
        v.literal("jina_rerank"),
        v.literal("explore"),
        v.literal("paper_ingest"),
        v.literal("google_factcheck"),
        v.literal("gdelt"),
      ),
      cacheKey: v.string(),
      status: v.union(v.literal("ready"), v.literal("empty"), v.literal("failed")),
      valueJson: v.string(),
      failureReason: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
      expiresAt: v.number(),
    }).index("by_provider_key", ["provider", "cacheKey"]),

    explorePapers: defineTable({
      ...explorePaperFields,
      lastSeenAt: v.number(),
    }).index("by_key", ["key"]),

    domainReliability: defineTable({
      domain: v.string(),
      successCount: v.number(),
      failureCount: v.number(),
      unreliable: v.optional(v.boolean()),
      lastFailureReason: v.optional(v.string()),
      lastSeenAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_domain", ["domain"])
      .index("by_unreliable", ["unreliable"]),

    // ── Feed surface ──────────────────────────────────────────────────────
    feedItems: defineTable({
      ...feedItemFields,
    })
      .index("by_dedupe_key", ["dedupeKey"])
      .index("by_kind_trend", ["kind", "trendScore"])
      .index("by_kind_published", ["kind", "publishedAt"]),
    feedSources: defineTable({
      provider: feedProviderValidator,
      label: v.string(),
      enabled: v.boolean(),
      cadenceMinutes: v.number(),
      queryParamsJson: v.optional(v.string()),
      lastRunAt: v.optional(v.number()),
      lastStatus: v.optional(
        v.union(v.literal("ready"), v.literal("empty"), v.literal("failed")),
      ),
      lastFailureReason: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_provider", ["provider"]),
    feedCollections: defineTable({
      ownerUserId: v.string(),
      name: v.string(),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_owner_updated", ["ownerUserId", "updatedAt"]),
    savedFeedItems: defineTable({
      ownerUserId: v.string(),
      feedItemId: v.id("feedItems"),
      collectionId: v.optional(v.id("feedCollections")),
      createdAt: v.number(),
    })
      .index("by_owner_created", ["ownerUserId", "createdAt"])
      .index("by_owner_item", ["ownerUserId", "feedItemId"]),
    userFeedInterests: defineTable({
      ownerUserId: v.string(),
      topic: v.string(),
      // Signed active-learning weight (+ save, − hide/not-relevant).
      weight: v.number(),
      updatedAt: v.number(),
    }).index("by_owner_topic", ["ownerUserId", "topic"]),
    // First-run onboarding answers. Write-once stable profile data, keyed by
    // ownerUserId (= identity.tokenIdentifier, same owner key as the feed
    // tables). Presence of a row with `completedAt` gates the onboarding flow.
    userOnboarding: defineTable({
      ownerUserId: v.string(),
      // Canonical id, e.g. "mahasiswa_s2" (see features/onboarding options).
      background: v.string(),
      // Snapshot of the interest field ids the user picked at onboarding.
      interests: v.array(v.string()),
      // Self-reported attribution source, e.g. "instagram".
      heardAboutSource: v.string(),
      heardAboutOther: v.optional(v.string()),
      completedAt: v.number(),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_owner", ["ownerUserId"]),
    hiddenFeedItems: defineTable({
      ownerUserId: v.string(),
      feedItemId: v.id("feedItems"),
      createdAt: v.number(),
    })
      .index("by_owner_item", ["ownerUserId", "feedItemId"])
      .index("by_owner_created", ["ownerUserId", "createdAt"]),
    feedInteractions: defineTable({
      ownerUserId: v.string(),
      feedItemId: v.id("feedItems"),
      kind: v.union(
        v.literal("save"),
        v.literal("hide"),
        v.literal("research"),
        v.literal("open_evidence"),
      ),
      createdAt: v.number(),
    })
      .index("by_owner_item_kind", ["ownerUserId", "feedItemId", "kind"])
      .index("by_owner_created", ["ownerUserId", "createdAt"]),
    // Cached consensus-meter results for yes/no science questions. Keyed by a
    // normalized question hash so the (expensive) OpenAlex + stance-classify
    // pass is shared across users and re-used until it expires.
    feedConsensus: defineTable({
      questionKey: v.string(),
      question: v.string(),
      yes: v.number(),
      no: v.number(),
      possibly: v.number(),
      total: v.number(),
      // JSON array of { key, title, stance, year?, url, sourceLabel } papers.
      papersJson: v.string(),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_question_key", ["questionKey"]),
    // Agent Skills registry (open standard, agentskills.io) — builtin / user /
    // workspace. The SKILL.md body is stored INLINE (bodyText, frontmatter
    // stripped) so the per-turn context assembler (buildPromptContextForThread,
    // a MutationCtx where blob reads are unavailable) can re-inject activated
    // skill bodies; only larger references/assets live in _storage.
    skills: defineTable({
      ownerUserId: v.optional(v.string()), // null for builtin
      scope: v.union(
        v.literal("builtin"),
        v.literal("user"),
        v.literal("workspace"),
      ),
      workspaceId: v.optional(v.id("workspaces")),
      name: v.string(), // lowercase-hyphen, <=64, == folder name
      description: v.string(), // <=1024; tier-1 catalog material
      version: v.string(),
      checksum: v.string(),
      enabled: v.boolean(),
      bodyText: v.string(),
      resourcesJson: v.string(), // manifest: [{ path, storageId, kind }]
      hasScripts: v.boolean(),
      metadataJson: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_scope_name", ["scope", "name"])
      .index("by_owner_enabled", ["ownerUserId", "enabled"])
      .index("by_owner_workspace", ["ownerUserId", "workspaceId"]),
    // Per-thread skill activation trail (dedup + provenance + the source the
    // context assembler re-materializes <skill_content> from each turn).
    skillActivations: defineTable({
      ownerUserId: v.string(),
      threadId: v.string(),
      runId: v.optional(v.id("agentRuns")),
      skillId: v.id("skills"),
      skillVersion: v.string(),
      activatedBy: v.union(v.literal("model"), v.literal("user")),
      createdAt: v.number(),
    }).index("by_owner_thread", ["ownerUserId", "threadId"]),
  },
  { schemaValidation: true },
);
