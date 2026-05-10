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
    researchSources: defineTable({
      ownerUserId: v.string(),
      threadId: v.string(),
      messageId: v.string(),
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
