import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { sourceCandidateValidator } from "./sourceCandidates";

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
          rerankScore: candidate.rerankScore,
          metadataJson: candidate.metadataJson,
          createdAt: now,
        }),
      ),
    );
  },
});
