import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const runId = v.union(v.id("agentRuns"), v.id("researchRuns"));

export default defineSchema(
  {
    threadMetadata: defineTable({
      ownerUserId: v.string(),
      threadId: v.string(),
      workspaceId: v.optional(v.id("workspaces")),
      lastActivityAt: v.number(),
      lastMessagePreview: v.string(),
      messageCount: v.number(),
      status: v.union(v.literal("idle"), v.literal("streaming"), v.literal("failed")),
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
    workspaces: defineTable({
      ownerUserId: v.string(),
      name: v.string(),
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
        v.literal("cited_answer"),
        v.literal("deep_research"),
        v.literal("external_search"),
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
      type: v.optional(v.union(
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
      )),
      kind: v.optional(v.union(v.literal("document"), v.literal("url"))),
      title: v.string(),
      contentFormat: v.optional(v.union(
        v.literal("blocks_json"),
        v.literal("markdown"),
        v.literal("html"),
        v.literal("plain"),
        v.literal("code"),
        v.literal("json"),
      )),
      body: v.optional(v.string()),
      storageId: v.optional(v.id("_storage")),
      plainTextPreview: v.optional(v.string()),
      contextText: v.optional(v.string()),
      status: v.optional(v.union(v.literal("active"), v.literal("deleted"))),
      deletedAt: v.optional(v.number()),
      currentVersionId: v.optional(v.id("artifactVersions")),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_owner_thread_created", ["ownerUserId", "threadId", "createdAt"])
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
    artifactDocuments: defineTable({
      ownerUserId: v.string(),
      workspaceId: v.id("workspaces"),
      artifactId: v.id("artifacts"),
      blocksJson: v.optional(v.string()),
      markdown: v.optional(v.string()),
      plainText: v.optional(v.string()),
      storageId: v.optional(v.id("_storage")),
      blocksStorageId: v.optional(v.id("_storage")),
      markdownStorageId: v.optional(v.id("_storage")),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_owner_artifact", ["ownerUserId", "artifactId"])
      .index("by_owner_workspace_updated", ["ownerUserId", "workspaceId", "updatedAt"]),
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

    domainReliability: defineTable({
      domain: v.string(),
      successCount: v.number(),
      failureCount: v.number(),
      lastFailureReason: v.optional(v.string()),
      lastSeenAt: v.number(),
      updatedAt: v.number(),
    }).index("by_domain", ["domain"]),
  },
  { schemaValidation: true },
);
