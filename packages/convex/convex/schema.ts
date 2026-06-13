import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { featureCountValidator } from "./billing/usageShape";
import { explorePaperFields } from "./explore/validators";
import { feedItemFields, feedProviderValidator } from "./feed/validators";

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
    artifacts: defineTable({
      ownerUserId: v.string(),
      workspaceId: v.optional(v.id("workspaces")),
      folderId: v.optional(v.id("workspaceFolders")),
      threadId: v.optional(v.string()),
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

    // ── SDK agent backend (plan docs/claude-agent-sdk-app-plan.md §4.5) ──────
    // First-party chat storage for the apps/agents service. Thread/run/message
    // ids are SERVICE-GENERATED strings (thr_*/run_*), not Convex ids, so the
    // service stays storage-agnostic; every table indexes that external id.
    chatThreads: defineTable({
      threadId: v.string(),
      ownerUserId: v.string(),
      title: v.optional(v.string()),
      // Claim for the auto-title generator (agent/threadTitles.ts). Absent =
      // never attempted; "generating" = claimed + action in flight (set inside
      // finalizeRun's transaction so the schedule fires at most once per
      // thread); "ready" = terminal (title set, or attempt finished unusable).
      titleStatus: v.optional(v.union(v.literal("generating"), v.literal("ready"))),
      workspaceId: v.optional(v.id("workspaces")),
      status: v.union(v.literal("idle"), v.literal("streaming"), v.literal("failed")),
      sdkSessionId: v.optional(v.string()),
      agentKind: v.union(v.literal("lite"), v.literal("pro")),
      lastActivityAt: v.number(),
      messageCount: v.number(),
      lastMessagePreview: v.optional(v.string()),
    })
      .index("by_thread_id", ["threadId"])
      .index("by_owner_activity", ["ownerUserId", "lastActivityAt"]),
    chatMessages: defineTable({
      threadId: v.string(),
      ownerUserId: v.string(),
      role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
      text: v.string(),
      runId: v.optional(v.string()),
      status: v.union(
        v.literal("streaming"),
        v.literal("complete"),
        v.literal("error"),
      ),
      createdAt: v.number(),
    }).index("by_thread_created", ["threadId", "createdAt"]),
    agentRuns: defineTable({
      runId: v.string(),
      threadId: v.string(),
      ownerUserId: v.string(),
      promptMessageId: v.optional(v.string()),
      status: v.union(
        v.literal("queued"),
        v.literal("running"),
        v.literal("waiting"),
        v.literal("waiting_hitl"),
        v.literal("completed"),
        v.literal("failed"),
        v.literal("canceled"),
      ),
      mode: v.union(v.literal("normal"), v.literal("deep")),
      agentKind: v.union(v.literal("lite"), v.literal("pro")),
      sdkSessionId: v.optional(v.string()),
      costUsd: v.optional(v.number()),
      usageJson: v.optional(v.string()),
      numTurns: v.optional(v.number()),
      errorMessage: v.optional(v.string()),
      verificationReportJson: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_run_id", ["runId"])
      .index("by_thread_created", ["threadId", "createdAt"])
      // Watchdog sweep: active statuses ordered by staleness.
      .index("by_status_updated", ["status", "updatedAt"]),
    agentRunEvents: defineTable({
      runId: v.string(),
      seq: v.number(),
      type: v.string(),
      payloadJson: v.string(),
      createdAt: v.number(),
    }).index("by_run_seq", ["runId", "seq"]),
    // Durable deep-research phase state (plan §5.5 / §9.4 Step 4): one row per
    // run×phase; the service skips phases already `done` when a run is
    // re-dispatched after a service restart or a user retry.
    researchPhaseStates: defineTable({
      runId: v.string(),
      phase: v.union(
        v.literal("plan"),
        v.literal("literature"),
        v.literal("counter_evidence"),
        v.literal("citation_verify"),
        v.literal("write"),
      ),
      status: v.union(v.literal("running"), v.literal("done"), v.literal("failed")),
      output: v.optional(v.string()),
      sdkSessionId: v.optional(v.string()),
      costUsd: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_run_phase", ["runId", "phase"]),
    pendingInteractions: defineTable({
      ownerUserId: v.string(),
      threadId: v.string(),
      runId: v.string(),
      type: v.union(v.literal("ask_user"), v.literal("tool_approval")),
      toolName: v.string(),
      toolUseId: v.optional(v.string()),
      payloadJson: v.string(),
      status: v.union(
        v.literal("pending"),
        v.literal("responded"),
        v.literal("expired"),
        v.literal("superseded"),
      ),
      responseJson: v.optional(v.string()),
      createdAt: v.number(),
      respondedAt: v.optional(v.number()),
    })
      .index("by_thread_created", ["threadId", "createdAt"])
      .index("by_run_status", ["runId", "status"]),
  },
  { schemaValidation: true },
);
