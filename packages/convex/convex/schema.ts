import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const runId = v.union(v.id("agentRuns"), v.id("researchRuns"));

export default defineSchema(
  {
    threadMetadata: defineTable({
      ownerUserId: v.string(),
      threadId: v.string(),
      lastActivityAt: v.number(),
      lastMessagePreview: v.string(),
      messageCount: v.number(),
      status: v.union(v.literal("idle"), v.literal("streaming"), v.literal("failed")),
    })
      .index("by_thread", ["threadId"])
      .index("by_owner_activity", ["ownerUserId", "lastActivityAt"]),
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
    messageCommands: defineTable({
      ownerUserId: v.string(),
      threadId: v.string(),
      messageId: v.string(),
      commandId: v.string(),
      commandLabel: v.string(),
      commandSlug: v.string(),
      mode: v.union(v.literal("normal"), v.literal("deep")),
      argumentPreview: v.string(),
      expandedPromptSnapshot: v.string(),
      createdAt: v.number(),
    })
      .index("by_owner_message", ["ownerUserId", "messageId"])
      .index("by_owner_thread_created", ["ownerUserId", "threadId", "createdAt"]),
    corpusSources: defineTable({
      ownerUserId: v.string(),
      sourceType: v.union(
        v.literal("manual_text"),
        v.literal("url"),
        v.literal("doi"),
        v.literal("arxiv"),
        v.literal("uploaded_text"),
      ),
      status: v.union(
        v.literal("ready"),
        v.literal("indexing"),
        v.literal("metadata_only"),
        v.literal("failed"),
      ),
      title: v.string(),
      locator: v.string(),
      url: v.optional(v.string()),
      doi: v.optional(v.string()),
      arxivId: v.optional(v.string()),
      snippet: v.optional(v.string()),
      textPreview: v.optional(v.string()),
      ragEntryId: v.optional(v.string()),
      failureReason: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_owner_created", ["ownerUserId", "createdAt"])
      .index("by_owner_type", ["ownerUserId", "sourceType"])
      .index("by_owner_locator", ["ownerUserId", "locator"]),
    agentRuns: defineTable({
      ownerUserId: v.string(),
      threadId: v.string(),
      promptMessageId: v.string(),
      mode: v.union(v.literal("normal"), v.literal("deep")),
      executionKind: v.union(v.literal("inline"), v.literal("workflow")),
      workflowId: v.optional(v.string()),
      promptSnapshot: v.optional(v.string()),
      status: v.union(
        v.literal("queued"),
        v.literal("running"),
        v.literal("waiting"),
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
      createdAt: v.number(),
      updatedAt: v.number(),
      completedAt: v.optional(v.number()),
    })
      .index("by_owner_thread_created", ["ownerUserId", "threadId", "createdAt"])
      .index("by_owner_status", ["ownerUserId", "status"])
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
      ),
      round: v.optional(v.number()),
      title: v.string(),
      summary: v.string(),
      metadataJson: v.optional(v.string()),
      createdAt: v.number(),
    })
      .index("by_owner_run_created", ["ownerUserId", "runId", "createdAt"])
      .index("by_run_created", ["runId", "createdAt"]),
    artifacts: defineTable({
      ownerUserId: v.string(),
      threadId: v.string(),
      runId: v.optional(runId),
      type: v.union(
        v.literal("research_report"),
        v.literal("markdown_report"),
        v.literal("research_document"),
        v.literal("source_bundle"),
        v.literal("citation_evidence_view"),
        v.literal("document"),
        v.literal("code"),
        v.literal("html"),
        v.literal("json"),
        v.literal("plain_text"),
      ),
      title: v.string(),
      currentVersionId: v.optional(v.id("artifactVersions")),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_owner_thread_created", ["ownerUserId", "threadId", "createdAt"])
      .index("by_owner_run", ["ownerUserId", "runId"]),
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
        v.literal("partial"),
        v.literal("unsupported"),
      ),
      sourceIds: v.array(v.id("researchSources")),
      evidence: v.string(),
      createdAt: v.number(),
    })
      .index("by_owner_artifact", ["ownerUserId", "artifactId"])
      .index("by_owner_run", ["ownerUserId", "runId"]),
    researchSources: defineTable({
      ownerUserId: v.string(),
      threadId: v.string(),
      messageId: v.optional(v.string()),
      runId: v.optional(runId),
      artifactId: v.optional(v.id("artifacts")),
      artifactVersionId: v.optional(v.id("artifactVersions")),
      citationNumber: v.number(),
      origin: v.union(
        v.literal("corpus"),
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
      rerankScore: v.optional(v.number()),
      metadataJson: v.optional(v.string()),
      corpusSourceId: v.optional(v.id("corpusSources")),
      createdAt: v.number(),
    })
      .index("by_owner_thread", ["ownerUserId", "threadId"])
      .index("by_owner_message", ["ownerUserId", "messageId"])
      .index("by_owner_run", ["ownerUserId", "runId"])
      .index("by_owner_artifact", ["ownerUserId", "artifactId"])
      .index("by_owner_source", ["ownerUserId", "corpusSourceId"]),
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
        v.literal("crossref"),
        v.literal("arxiv"),
        v.literal("exa"),
        v.literal("jina_search"),
        v.literal("jina_read"),
        v.literal("jina_rerank"),
      ),
      cacheKey: v.string(),
      status: v.union(v.literal("ready"), v.literal("empty"), v.literal("failed")),
      valueJson: v.string(),
      failureReason: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
      expiresAt: v.number(),
    }).index("by_provider_key", ["provider", "cacheKey"]),
  },
  { schemaValidation: true },
);
