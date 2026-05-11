import { ConvexError, v } from "convex/values";
import { internalMutation, query } from "../_generated/server";
import { requireCurrentUser } from "../auth";
import { assertThreadOwner } from "./threads";
import { sourceCandidateValidator } from "./sourceCandidates";

const sourceSummaryValidator = v.object({
  _id: v.id("researchSources"),
  _creationTime: v.number(),
  ownerUserId: v.string(),
  threadId: v.string(),
  messageId: v.optional(v.string()),
  runId: v.optional(v.id("researchRuns")),
  artifactId: v.optional(v.id("researchArtifacts")),
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
});

export const list = query({
  args: {
    threadId: v.string(),
    messageId: v.optional(v.string()),
    runId: v.optional(v.id("researchRuns")),
    artifactId: v.optional(v.id("researchArtifacts")),
  },
  returns: v.array(sourceSummaryValidator),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    await assertThreadOwner(ctx, args.threadId);
    const rows = args.artifactId
      ? await ctx.db
          .query("researchSources")
          .withIndex("by_owner_artifact", (q) =>
            q.eq("ownerUserId", user._id).eq("artifactId", args.artifactId),
          )
          .collect()
      : args.runId
        ? await ctx.db
            .query("researchSources")
            .withIndex("by_owner_run", (q) =>
              q.eq("ownerUserId", user._id).eq("runId", args.runId),
            )
            .collect()
        : args.messageId
      ? await ctx.db
          .query("researchSources")
          .withIndex("by_owner_message", (q) =>
            q.eq("ownerUserId", user._id).eq("messageId", args.messageId),
          )
          .collect()
      : await ctx.db
          .query("researchSources")
          .withIndex("by_owner_thread", (q) =>
            q.eq("ownerUserId", user._id).eq("threadId", args.threadId),
          )
          .collect();
    return rows.sort((a, b) => a.citationNumber - b.citationNumber);
  },
});

export const get = query({
  args: { sourceId: v.id("researchSources") },
  returns: v.union(sourceSummaryValidator, v.null()),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const source = await ctx.db.get("researchSources", args.sourceId);
    return source?.ownerUserId === user._id ? source : null;
  },
});

export const persistCited = internalMutation({
  args: {
    ownerUserId: v.string(),
    threadId: v.string(),
    messageId: v.string(),
    candidates: v.array(sourceCandidateValidator),
    citedNumbers: v.array(v.number()),
  },
  handler: async (ctx, args) => {
    const cited = new Set(args.citedNumbers);
    const unique = new Map(
      args.candidates
        .filter((candidate) => cited.has(candidate.citationNumber))
        .map((candidate) => [candidate.citationNumber, candidate]),
    );
    if (unique.size === 0) {
      return;
    }

    const existing = await ctx.db
      .query("researchSources")
      .withIndex("by_owner_message", (q) =>
        q.eq("ownerUserId", args.ownerUserId).eq("messageId", args.messageId),
      )
      .collect();
    await Promise.all(
      existing.map((row) => ctx.db.delete("researchSources", row._id)),
    );

    const now = Date.now();
    await Promise.all(
      [...unique.values()].map((candidate) =>
        ctx.db.insert("researchSources", {
          ownerUserId: args.ownerUserId,
          threadId: args.threadId,
          messageId: args.messageId,
          citationNumber: candidate.citationNumber,
          origin: candidate.origin,
          evidenceStrength: candidate.evidenceStrength,
          title: candidate.title,
          locator: candidate.locator,
          url: candidate.url,
          doi: candidate.doi,
          arxivId: candidate.arxivId,
          snippet: candidate.snippet,
          corpusSourceId: candidate.corpusSourceId,
          createdAt: now,
        }),
      ),
    );
  },
});

export const assertCanReadSource = query({
  args: { sourceId: v.id("researchSources") },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const source = await ctx.db.get("researchSources", args.sourceId);
    if (!source || source.ownerUserId !== user._id) {
      throw new ConvexError("Source not found");
    }
    return { ok: true };
  },
});
