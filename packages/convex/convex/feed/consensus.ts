import { v } from "convex/values";
import { z } from "zod";
import { generateObject } from "ai";
import { internal } from "../_generated/api";
import {
  action,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { requireCurrentUser } from "../auth";
import { chatProvider, CHAT_PROVIDER_NAME } from "../agent/providers/providers";
import { CHAT_LITE_MODEL } from "../agent/models";
import { candidatesToExplorePapers } from "../explore/model";
import { fetchOpenAlexWorksService } from "./openAlex";
import type { FeedConsensus, FeedConsensusPaper } from "./model";

const CONSENSUS_PAPER_LIMIT = 10;
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

const stanceEnum = z.enum(["yes", "no", "possibly", "neutral"]);

function questionKeyFor(question: string): string {
  return question.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 200);
}

// ── Internal cache accessors ──────────────────────────────────────────────
export const getConsensusCache = internalQuery({
  args: { questionKey: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("feedConsensus")
      .withIndex("by_question_key", (q) =>
        q.eq("questionKey", args.questionKey),
      )
      .unique();
  },
});

export const putConsensusCache = internalMutation({
  args: {
    questionKey: v.string(),
    question: v.string(),
    yes: v.number(),
    no: v.number(),
    possibly: v.number(),
    total: v.number(),
    papersJson: v.string(),
    feedItemId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("feedConsensus")
      .withIndex("by_question_key", (q) =>
        q.eq("questionKey", args.questionKey),
      )
      .unique();
    const fields = {
      questionKey: args.questionKey,
      question: args.question,
      yes: args.yes,
      no: args.no,
      possibly: args.possibly,
      total: args.total,
      papersJson: args.papersJson,
      updatedAt: now,
    };
    if (existing) {
      await ctx.db.patch("feedConsensus", existing._id, fields);
    } else {
      await ctx.db.insert("feedConsensus", { ...fields, createdAt: now });
    }

    // Tie the meter back to the claim item's stance tally when applicable.
    if (args.feedItemId) {
      const feedItemId = ctx.db.normalizeId("feedItems", args.feedItemId);
      if (feedItemId) {
        const item = await ctx.db.get("feedItems", feedItemId);
        if (item) {
          await ctx.db.patch("feedItems", feedItemId, {
            stanceSupporting: args.yes,
            stanceContrasting: args.no,
          });
        }
      }
    }
    return null;
  },
});

type BillingReason = "quota_exceeded" | "subscription_required" | "billing_inactive";

// Consensus meter (Ya/Tidak/Mungkin). Aggregates paper stance for a yes/no
// science question. Papers are ALWAYS returned with the meter — stance
// classification is noisy, so we show the receipts rather than a bare gauge.
export const getConsensus = action({
  args: { question: v.string(), feedItemId: v.optional(v.string()) },
  handler: async (
    ctx,
    args,
  ): Promise<
    { ok: true; consensus: FeedConsensus } | { ok: false; reason: BillingReason | "empty" }
  > => {
    const user = await requireCurrentUser(ctx);
    const question = args.question.trim();
    if (!question) return { ok: false, reason: "empty" };
    const questionKey = questionKeyFor(question);

    const cached = await ctx.runQuery(internal.feed.consensus.getConsensusCache, {
      questionKey,
    });
    if (cached && Date.now() - cached.updatedAt < CACHE_TTL_MS) {
      return {
        ok: true,
        consensus: {
          question: cached.question,
          yes: cached.yes,
          no: cached.no,
          possibly: cached.possibly,
          total: cached.total,
          papers: safeParsePapers(cached.papersJson),
          cached: true,
        },
      };
    }

    const entitlement = await ctx.runMutation(
      internal.billing.entitlements.consumeCreditsInternal,
      {
        ownerUserId: user._id,
        ownerEmail: user.email,
        feature: "normal_chat",
        provider: CHAT_PROVIDER_NAME,
        model: CHAT_LITE_MODEL,
        inputTokens: 900,
      },
    );
    if (!entitlement.ok) return { ok: false, reason: entitlement.reason };

    let papers: ReturnType<typeof candidatesToExplorePapers> = [];
    try {
      const { candidates } = await fetchOpenAlexWorksService(ctx, {
        query: question.slice(0, 240),
        limit: CONSENSUS_PAPER_LIMIT,
      });
      papers = candidatesToExplorePapers(candidates, CONSENSUS_PAPER_LIMIT);
    } catch {
      papers = [];
    }
    if (papers.length === 0) {
      // Guardrail: never show a bare meter. If we couldn't gather papers (no
      // results / rate limit / network), report empty rather than a 0/0/0 gauge.
      return { ok: false, reason: "empty" };
    }

    const numbered = papers
      .map((p, i) => {
        const abstract = (p.abstract ?? p.snippet ?? "")
          .replace(/\s+/g, " ")
          .slice(0, 360);
        return `[${i + 1}] ${p.title}\n${abstract}`;
      })
      .join("\n\n");

    const classification = await generateObject({
      model: chatProvider.chat(CHAT_LITE_MODEL),
      maxOutputTokens: 600,
      schema: z.object({
        stances: z.array(
          z.object({
            number: z.number(),
            stance: stanceEnum,
          }),
        ),
      }),
      system: [
        "Kamu mengklasifikasikan sikap (stance) tiap paper terhadap sebuah pertanyaan ilmiah ya/tidak.",
        "yes = temuan paper mendukung jawaban YA; no = mendukung TIDAK; possibly = campuran/tergantung; neutral = tidak relevan/tidak menjawab.",
        "Dasarkan HANYA pada judul+abstrak yang diberikan. Jangan mengarang.",
      ].join(" "),
      prompt: `PERTANYAAN: ${question}\n\nPAPER:\n${numbered}`,
    });

    const stanceByNumber = new Map<number, string>();
    for (const s of classification.object.stances) {
      stanceByNumber.set(s.number, s.stance);
    }

    let yes = 0;
    let no = 0;
    let possibly = 0;
    const outPapers: FeedConsensusPaper[] = papers.map((p, i) => {
      const stance = (stanceByNumber.get(i + 1) ?? "neutral") as
        | "yes"
        | "no"
        | "possibly"
        | "neutral";
      if (stance === "yes") yes += 1;
      else if (stance === "no") no += 1;
      else if (stance === "possibly") possibly += 1;
      return {
        key: p.key,
        title: p.title,
        stance,
        year: p.year,
        url: p.url,
        sourceLabel: p.sourceLabel,
      };
    });
    const total = yes + no + possibly;

    await ctx.runMutation(internal.explore.upsertPaperCache, {
      papers,
      lastSeenAt: Date.now(),
    });
    await ctx.runMutation(internal.feed.consensus.putConsensusCache, {
      questionKey,
      question,
      yes,
      no,
      possibly,
      total,
      papersJson: JSON.stringify(outPapers),
      feedItemId: args.feedItemId,
    });

    return {
      ok: true,
      consensus: { question, yes, no, possibly, total, papers: outPapers, cached: false },
    };
  },
});

function safeParsePapers(json: string): FeedConsensusPaper[] {
  try {
    return JSON.parse(json) as FeedConsensusPaper[];
  } catch {
    return [];
  }
}
