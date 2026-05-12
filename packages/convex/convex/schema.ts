import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

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
    researchRuns: defineTable({
      ownerUserId: v.string(),
      threadId: v.string(),
      promptMessageId: v.string(),
      workflowId: v.optional(v.string()),
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
      activeArtifactId: v.optional(v.id("artifacts")),
      artifactCount: v.number(),
      sourceCount: v.number(),
      citationCheckCount: v.number(),
      retryOfRunId: v.optional(v.id("researchRuns")),
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
    researchRunSteps: defineTable({
      ownerUserId: v.string(),
      runId: v.id("researchRuns"),
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
      .index("by_owner_run", ["ownerUserId", "runId"]),
    artifacts: defineTable({
      ownerUserId: v.string(),
      threadId: v.string(),
      runId: v.optional(v.id("researchRuns")),
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
      runId: v.optional(v.id("researchRuns")),
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
      runId: v.id("researchRuns"),
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
      runId: v.optional(v.id("researchRuns")),
      artifactId: v.optional(v.id("artifacts")),
      artifactVersionId: v.optional(v.id("artifactVersions")),
      citationNumber: v.number(),
      origin: v.union(
        v.literal("corpus"),
        v.literal("web"),
        v.literal("arxiv"),
        v.literal("doi"),
      ),
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
      corpusSourceId: v.optional(v.id("corpusSources")),
      createdAt: v.number(),
    })
      .index("by_owner_thread", ["ownerUserId", "threadId"])
      .index("by_owner_message", ["ownerUserId", "messageId"])
      .index("by_owner_run", ["ownerUserId", "runId"])
      .index("by_owner_artifact", ["ownerUserId", "artifactId"])
      .index("by_owner_source", ["ownerUserId", "corpusSourceId"]),
    externalLookupCache: defineTable({
      provider: v.union(v.literal("crossref"), v.literal("arxiv"), v.literal("exa")),
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
