import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  type ActionCtx,
} from "./_generated/server";
import { feedVerdictValidator } from "./feedValidators";
import { candidatesToExplorePapers } from "./exploreModel";
import { fetchOpenAlexWorksService } from "./feedOpenAlex";
import { fetchReviewPreview, type ReviewPreview } from "./feedArticlePreview";
import {
  deriveClaimTopics,
  searchFactCheckClaims,
  FACTCHECK_SEED_QUERIES,
  type FactCheckClaim,
} from "./agent/factCheckProvider";

const CLAIM_TOTAL_CAP = 28;
const SUPPORTING_PAPER_LOOKUPS = 12;
const SUPPORTING_PAPERS_PER_CLAIM = 4;

// ── Internal: upsert claim feed items + their verdict rows ────────────────
const claimInputValidator = v.object({
  // feed item shell (kind: "claim")
  title: v.string(),
  summary: v.string(),
  tldr: v.optional(v.string()),
  url: v.string(),
  imageUrl: v.optional(v.string()),
  articleText: v.optional(v.string()),
  sourceLabel: v.string(),
  topics: v.array(v.string()),
  trendScore: v.number(),
  publishedAt: v.optional(v.number()),
  dedupeKey: v.string(),
  // verdict row
  claim: v.string(),
  verdict: feedVerdictValidator,
  verdictSource: v.string(),
  verdictBy: v.union(v.literal("human"), v.literal("ai")),
  verdictLabelRaw: v.string(),
  publisher: v.optional(v.string()),
  reviewUrl: v.optional(v.string()),
  reviewedAt: v.optional(v.number()),
  evidence: v.optional(v.string()),
  confidence: v.optional(v.number()),
  severity: v.optional(
    v.union(v.literal("info"), v.literal("warning"), v.literal("high")),
  ),
  claimant: v.optional(v.string()),
  claimDate: v.optional(v.number()),
  claimReviewJson: v.optional(v.string()),
  supportingPaperKeys: v.optional(v.array(v.string())),
});

export const upsertClaimItems = internalMutation({
  args: { items: v.array(claimInputValidator) },
  returns: v.object({ inserted: v.number(), updated: v.number() }),
  handler: async (ctx, args) => {
    let inserted = 0;
    let updated = 0;
    const now = Date.now();

    for (const input of args.items) {
      const existing = await ctx.db
        .query("feedItems")
        .withIndex("by_dedupe_key", (q) => q.eq("dedupeKey", input.dedupeKey))
        .unique();

      const itemFields = {
        kind: "claim" as const,
        title: input.title,
        summary: input.summary,
        tldr: input.tldr,
        url: input.url,
        provider: "google_factcheck" as const,
        sourceLabel: input.sourceLabel,
        topics: input.topics,
        trendScore: input.trendScore,
        publishedAt: input.publishedAt,
        dedupeKey: input.dedupeKey,
        lastSeenAt: now,
        // Only set when present so a transient fetch failure never wipes the
        // thumbnail / article body captured on an earlier refresh.
        ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
        ...(input.articleText !== undefined
          ? { articleText: input.articleText }
          : {}),
      };
      const primaryClaim = {
        claim: input.claim,
        verdict: input.verdict,
        verdictSource: input.verdictSource,
        verdictBy: input.verdictBy,
        verdictLabelRaw: input.verdictLabelRaw,
        ...(input.publisher !== undefined ? { publisher: input.publisher } : {}),
        ...(input.reviewUrl !== undefined ? { reviewUrl: input.reviewUrl } : {}),
        ...(input.reviewedAt !== undefined ? { reviewedAt: input.reviewedAt } : {}),
        ...(input.evidence !== undefined ? { evidence: input.evidence } : {}),
        ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
        ...(input.severity !== undefined ? { severity: input.severity } : {}),
        ...(input.claimant !== undefined ? { claimant: input.claimant } : {}),
        ...(input.claimDate !== undefined ? { claimDate: input.claimDate } : {}),
        ...(input.supportingPaperKeys !== undefined
          ? { supportingPaperKeys: input.supportingPaperKeys }
          : {}),
      };

      let feedItemId;
      if (existing) {
        await ctx.db.patch("feedItems", existing._id, {
          ...itemFields,
          primaryClaim,
        });
        feedItemId = existing._id;
        updated += 1;
      } else {
        feedItemId = await ctx.db.insert("feedItems", {
          ...itemFields,
          primaryClaim,
          createdAt: now,
        });
        inserted += 1;
      }

      // One primary verdict row per feed item (latest from this source wins).
      const existingClaim = await ctx.db
        .query("feedItemClaims")
        .withIndex("by_feed_item", (q) => q.eq("feedItemId", feedItemId))
        .first();

      const claimFields = {
        feedItemId,
        claim: input.claim,
        verdict: input.verdict,
        verdictSource: input.verdictSource,
        verdictBy: input.verdictBy,
        verdictLabelRaw: input.verdictLabelRaw,
        publisher: input.publisher,
        reviewUrl: input.reviewUrl,
        reviewedAt: input.reviewedAt,
        evidence: input.evidence,
        confidence: input.confidence,
        severity: input.severity,
        claimReviewJson: input.claimReviewJson,
        supportingPaperKeys: input.supportingPaperKeys,
        updatedAt: now,
      };

      if (existingClaim) {
        await ctx.db.replace("feedItemClaims", existingClaim._id, {
          ...claimFields,
          createdAt: existingClaim.createdAt,
        });
      } else {
        await ctx.db.insert("feedItemClaims", {
          ...claimFields,
          createdAt: now,
        });
      }
    }

    return { inserted, updated };
  },
});

// ── Internal: refresh the fact-check (fakta/hoax) lane ────────────────────
export const refreshFactCheckClaims = internalAction({
  args: {
    maxAgeDays: v.optional(v.number()),
    pageSize: v.optional(v.number()),
  },
  returns: v.object({
    fetched: v.number(),
    inserted: v.number(),
    updated: v.number(),
    withImage: v.number(),
    withText: v.number(),
  }),
  handler: async (ctx, args) => {
    const maxAgeDays = args.maxAgeDays ?? 30;
    const pageSize = args.pageSize ?? 20;

    // Harvest ClaimReviews across the science/health seed topics.
    const seen = new Set<string>();
    const claims: FactCheckClaim[] = [];
    for (const query of FACTCHECK_SEED_QUERIES) {
      const batch = await searchFactCheckClaims(ctx, {
        query,
        languageCode: "id",
        maxAgeDays,
        pageSize,
      });
      for (const claim of batch) {
        const key = (claim.reviewUrl ?? claim.text).trim().toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        claims.push(claim);
        if (claims.length >= CLAIM_TOTAL_CAP) break;
      }
      if (claims.length >= CLAIM_TOTAL_CAP) break;
    }

    if (claims.length === 0) {
      return { fetched: 0, inserted: 0, updated: 0, withImage: 0, withText: 0 };
    }

    // Read each publisher's review page once to derive both a thumbnail and the
    // full reasoning text (the fact-check API gives neither). Concurrent +
    // best-effort; misses fall back to the verdict panel / review-title.
    const previews = await Promise.all(
      claims.map((claim) =>
        claim.reviewUrl
          ? fetchReviewPreview(claim.reviewUrl)
          : Promise.resolve({} as ReviewPreview),
      ),
    );

    // Ground a bounded subset against global academic literature so the
    // evidence drawer can show supporting papers next to the human verdict.
    const inputs = [];
    for (let i = 0; i < claims.length; i += 1) {
      const claim = claims[i];
      let supportingPaperKeys: string[] | undefined;
      if (i < SUPPORTING_PAPER_LOOKUPS) {
        supportingPaperKeys = await collectSupportingPapers(ctx, claim.text);
      }

      const publishedAt =
        claim.reviewedAt ?? parseDateMs(claim.claimDate) ?? Date.now();
      const reviewUrl =
        claim.reviewUrl ??
        `https://toolbox.google.com/factcheck/explorer/search/${encodeURIComponent(claim.text)}`;
      const tldr = firstSentence(claim.reviewTitle ?? claim.text);

      inputs.push({
        title: claim.text,
        summary: claim.reviewTitle ?? claim.text,
        tldr,
        url: reviewUrl,
        imageUrl: previews[i].imageUrl,
        articleText: previews[i].articleText,
        sourceLabel: claim.publisher ?? "Cek Fakta",
        topics: deriveClaimTopics(claim.text),
        // Claims are ranked by recency in getFeed; keep trendScore at 0.
        trendScore: 0,
        publishedAt,
        dedupeKey: `claim:${(claim.reviewUrl ?? claim.text).trim().toLowerCase().slice(0, 200)}`,
        claim: claim.text,
        verdict: claim.verdict,
        verdictSource: "google_factcheck",
        verdictBy: "human" as const,
        verdictLabelRaw: claim.verdictLabelRaw,
        publisher: claim.publisher,
        reviewUrl: claim.reviewUrl,
        reviewedAt: claim.reviewedAt,
        evidence: claim.reviewTitle,
        severity: claim.severity,
        claimant: claim.claimant,
        claimDate: parseDateMs(claim.claimDate),
        claimReviewJson: claim.claimReviewJson,
        supportingPaperKeys,
      });
    }

    const result: { inserted: number; updated: number } = await ctx.runMutation(
      internal.feedClaims.upsertClaimItems,
      { items: inputs },
    );

    const withImage = previews.filter((preview) => preview.imageUrl).length;
    const withText = previews.filter((preview) => preview.articleText).length;
    return { fetched: claims.length, ...result, withImage, withText };
  },
});

async function collectSupportingPapers(
  ctx: ActionCtx,
  claimText: string,
): Promise<string[] | undefined> {
  try {
    const { candidates } = await fetchOpenAlexWorksService(ctx, {
      query: claimText.slice(0, 240),
      limit: SUPPORTING_PAPERS_PER_CLAIM,
    });
    if (candidates.length === 0) return undefined;
    const papers = candidatesToExplorePapers(
      candidates,
      SUPPORTING_PAPERS_PER_CLAIM,
    );
    if (papers.length === 0) return undefined;
    await ctx.runMutation(internal.explore.upsertPaperCache, {
      papers,
      lastSeenAt: Date.now(),
    });
    return papers.map((paper) => paper.key);
  } catch {
    return undefined;
  }
}

function firstSentence(text: string): string | undefined {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return undefined;
  const match = clean.match(/^.*?[.!?](?=\s|$)/);
  const value = match ? match[0] : clean;
  return value.length > 200 ? `${value.slice(0, 199).trimEnd()}…` : value;
}

function parseDateMs(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : undefined;
}
