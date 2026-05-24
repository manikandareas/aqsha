import { v } from "convex/values";
import { internalMutation, query } from "../_generated/server";
import { requireCurrentUser } from "../auth";
import { sourceCandidateValidator, type SourceCandidate } from "./sourceCandidates";
import { canonicalSourceKey } from "./sourceQuality";
import { tryAssertThreadOwner } from "./threads";

type SourceUsage = "candidate" | "cited" | "accepted" | "rejected";

export function sourceKeyForCandidate(candidate: Pick<SourceCandidate, "title" | "locator" | "url" | "doi" | "arxivId" | "sourceKey">) {
  return candidate.sourceKey ?? canonicalSourceKey(candidate);
}

export function usageForCandidate(candidate: SourceCandidate, citedNumbers: Set<number>): SourceUsage {
  if (candidate.usage) {
    return candidate.usage;
  }
  return citedNumbers.has(candidate.citationNumber) ? "cited" : "candidate";
}

export function dedupeCandidatesForPersistence(candidates: SourceCandidate[]) {
  const unique = new Map<string, SourceCandidate>();
  for (const candidate of candidates) {
    unique.set(sourceKeyForCandidate(candidate), candidate);
  }
  return [...unique.values()];
}

export const listForThread = query({
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    if (!(await tryAssertThreadOwner(ctx, args.threadId))) {
      return [];
    }
    const rows = await ctx.db
      .query("researchSources")
      .withIndex("by_owner_thread", (q) =>
        q.eq("ownerUserId", user._id).eq("threadId", args.threadId),
      )
      .order("asc")
      .take(500);

    return rows.map((row) => ({
      _id: row._id,
      messageId: row.messageId,
      runId: row.runId,
      usage: row.usage ?? "cited",
      origin: row.origin,
      provider: row.provider,
      title: row.title,
      locator: row.locator,
      url: row.url,
      doi: row.doi,
      arxivId: row.arxivId,
      snippet: row.snippet,
      evidenceStrength: row.evidenceStrength,
      readStatus: row.readStatus,
      qualityReason: row.qualityReason,
      bucketName: row.bucketName,
      discoveryQuery: row.discoveryQuery,
      createdAt: row.createdAt,
    }));
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
    const candidates = dedupeCandidatesForPersistence(args.candidates);
    if (candidates.length === 0) {
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
      candidates.map((candidate) =>
        ctx.db.insert("researchSources", {
          ownerUserId: args.ownerUserId,
          threadId: args.threadId,
          messageId: args.messageId,
          sourceKey: sourceKeyForCandidate(candidate),
          usage: usageForCandidate(candidate, cited),
          citationNumber: candidate.citationNumber,
          origin: candidate.origin,
          provider: candidate.provider,
          providerRequestId: candidate.providerRequestId,
          evidenceStrength: candidate.evidenceStrength,
          title: candidate.title,
          locator: candidate.locator,
          url: candidate.url,
          doi: candidate.doi,
          arxivId: candidate.arxivId,
          snippet: candidate.snippet,
          readStatus: candidate.readStatus,
          readError: candidate.readError,
          qualityReason: candidate.qualityReason,
          bucketName: candidate.bucketName,
          discoveryQuery: candidate.discoveryQuery,
          rerankScore: candidate.rerankScore,
          metadataJson: candidate.metadataJson,
          createdAt: now,
          lastSeenAt: now,
        }),
      ),
    );
  },
});

export const upsertRunCandidates = internalMutation({
  args: {
    ownerUserId: v.string(),
    threadId: v.string(),
    runId: v.id("agentRuns"),
    candidates: v.array(sourceCandidateValidator),
    usage: v.union(
      v.literal("candidate"),
      v.literal("accepted"),
      v.literal("rejected"),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const candidate of dedupeCandidatesForPersistence(args.candidates)) {
      const sourceKey = sourceKeyForCandidate(candidate);
      const existing = await ctx.db
        .query("researchSources")
        .withIndex("by_owner_run_source_key", (q) =>
          q
            .eq("ownerUserId", args.ownerUserId)
            .eq("runId", args.runId)
            .eq("sourceKey", sourceKey),
        )
        .unique();
      const value = {
        ownerUserId: args.ownerUserId,
        threadId: args.threadId,
        runId: args.runId,
        sourceKey,
        usage: args.usage,
        citationNumber: candidate.citationNumber,
        origin: candidate.origin,
        provider: candidate.provider,
        providerRequestId: candidate.providerRequestId,
        evidenceStrength: candidate.evidenceStrength,
        title: candidate.title,
        locator: candidate.locator,
        url: candidate.url,
        doi: candidate.doi,
        arxivId: candidate.arxivId,
        snippet: candidate.snippet,
        readStatus: candidate.readStatus,
        readError: candidate.readError,
        qualityReason: candidate.qualityReason,
        bucketName: candidate.bucketName,
        discoveryQuery: candidate.discoveryQuery,
        rerankScore: candidate.rerankScore,
        metadataJson: candidate.metadataJson,
        lastSeenAt: now,
      };
      if (existing) {
        await ctx.db.patch("researchSources", existing._id, value);
      } else {
        await ctx.db.insert("researchSources", {
          ...value,
          createdAt: now,
        });
      }
    }
  },
});
