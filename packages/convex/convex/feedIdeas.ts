import { v } from "convex/values";
import { z } from "zod";
import { generateObject } from "ai";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { requireCurrentUser } from "./auth";
import { chatProvider, CHAT_PROVIDER_NAME } from "./agent/providers";
import { CHAT_LITE_MODEL } from "./agent/models";
import { candidatesToExplorePapers } from "./exploreModel";
import { fetchOpenAlexWorksService } from "./feedOpenAlex";
import type { FeedIdeaQuestion } from "./feedModel";

const GROUNDING_LIMIT = 8;
const MAX_QUESTIONS = 3;

const GAP_TYPES = [
  "geografis",
  "temporal",
  "populasi",
  "metodologis",
  "integrasi",
  "konteks",
] as const;

const ideaSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z
          .string()
          .describe("Pertanyaan riset spesifik & dapat diteliti, Bahasa Indonesia"),
        methodology: z
          .string()
          .describe("Ringkas: metode/data yang masuk akal untuk menjawabnya"),
        rationale: z
          .string()
          .describe("Kenapa ini celah riset yang berharga (1-2 kalimat)"),
        gapType: z.enum(GAP_TYPES).describe("Jenis celah riset"),
        noveltyScore: z
          .number()
          .min(0)
          .max(100)
          .describe("0-100, makin tinggi makin baru terhadap literatur grounding"),
        feasibilityScore: z
          .number()
          .min(0)
          .max(100)
          .describe("0-100, kelayakan FINER untuk peneliti pemula/skripsi"),
        finerNote: z
          .string()
          .describe("Catatan FINER 1 baris (mis. sempitkan populasi agar layak)"),
        supportingSourceNumbers: z
          .array(z.number())
          .describe("Nomor paper grounding yang relevan (boleh kosong)"),
      }),
    )
    .min(1)
    .max(MAX_QUESTIONS),
});

export type GenerateIdeasResult =
  | { ok: true; questions: FeedIdeaQuestion[] }
  | { ok: false; reason: "quota_exceeded" | "subscription_required" | "billing_inactive" | "empty" };

// Idea generator (RAG + gap-finder + FINER). User-triggered from a feed item.
// Grounds against global literature (service cache, no extra per-user charge),
// then asks the model for scored, researchable questions. The model is told
// NOT to rank itself — the UI presents all candidates with their scores.
export const generateIdeas = action({
  args: {
    title: v.string(),
    context: v.optional(v.string()),
    topics: v.optional(v.array(v.string())),
    feedItemId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<GenerateIdeasResult> => {
    const user = await requireCurrentUser(ctx);
    const title = args.title.trim();
    if (!title) return { ok: false, reason: "empty" };

    // Billing: one normal_chat unit (lite model, free-tier accessible).
    const promptChars = title.length + (args.context?.length ?? 0);
    const entitlement = await ctx.runMutation(
      internal.billing.entitlements.consumeCreditsInternal,
      {
        ownerUserId: user._id,
        ownerEmail: user.email,
        feature: "normal_chat",
        provider: CHAT_PROVIDER_NAME,
        model: CHAT_LITE_MODEL,
        inputTokens: Math.ceil(promptChars / 4) + 600,
      },
    );
    if (!entitlement.ok) {
      return { ok: false, reason: entitlement.reason };
    }

    // RAG grounding via OpenAlex (cached service path).
    let groundingKeys: string[] = [];
    let groundingText = "(tidak ada literatur grounding)";
    try {
      const { candidates } = await fetchOpenAlexWorksService(ctx, {
        query: title.slice(0, 240),
        limit: GROUNDING_LIMIT,
      });
      const papers = candidatesToExplorePapers(candidates, GROUNDING_LIMIT);
      if (papers.length > 0) {
        await ctx.runMutation(internal.explore.upsertPaperCache, {
          papers,
          lastSeenAt: Date.now(),
        });
        groundingKeys = papers.map((p) => p.key);
        groundingText = papers
          .map((p, i) => {
            const meta = [p.year, p.venue].filter(Boolean).join(", ");
            const abstract = (p.abstract ?? p.snippet ?? "")
              .replace(/\s+/g, " ")
              .slice(0, 320);
            return `[${i + 1}] ${p.title}${meta ? ` (${meta})` : ""}\n${abstract}`;
          })
          .join("\n\n");
      }
    } catch {
      // Grounding is best-effort; proceed with the item context alone.
    }

    const result = await generateObject({
      model: chatProvider.chat(CHAT_LITE_MODEL),
      maxOutputTokens: 1400,
      schema: ideaSchema,
      system: [
        "Kamu mentor riset yang membantu mahasiswa/peneliti pemula Indonesia menemukan celah riset yang konkret dan layak.",
        "Tugas: dari sebuah item (berita/paper/klaim) + literatur grounding, usulkan pertanyaan riset.",
        "GALI CELAH (gap-finder): cermati keterbatasan/future-work yang tersirat; tandai jenis celah (geografis/temporal/populasi/metodologis/integrasi/konteks).",
        "Dorong 'context gap' bila relevan: menerapkan studi global ke konteks/populasi Indonesia.",
        "FINER: nilai feasibility untuk skripsi/peneliti pemula; jika terlalu luas, beri finerNote untuk mempersempit (hindari 'perfect gap trap').",
        "Bahasa Indonesia, spesifik, hindari pertanyaan generik. Jangan mengarang sitasi; rujuk hanya nomor paper grounding yang diberikan.",
        "Jangan mengurutkan/menilai dirimu sebagai 'terbaik'; cukup beri skor jujur per pertanyaan.",
      ].join(" "),
      prompt: [
        `ITEM:\n${title}`,
        args.context ? `\nKONTEKS:\n${args.context.slice(0, 800)}` : "",
        args.topics && args.topics.length > 0
          ? `\nTOPIK: ${args.topics.join(", ")}`
          : "",
        `\nLITERATUR GROUNDING (rujuk dengan nomor):\n${groundingText}`,
        `\nHasilkan ${MAX_QUESTIONS} pertanyaan riset yang berbeda sudut.`,
      ]
        .filter(Boolean)
        .join("\n"),
    });

    const questions: FeedIdeaQuestion[] = result.object.questions.map((q) => ({
      question: q.question,
      methodology: q.methodology,
      rationale: q.rationale,
      gapType: q.gapType,
      noveltyScore: clampScore(q.noveltyScore),
      feasibilityScore: clampScore(q.feasibilityScore),
      finerNote: q.finerNote,
      supportingSourceKeys: (q.supportingSourceNumbers ?? [])
        .map((n) => groundingKeys[n - 1])
        .filter((key): key is string => Boolean(key)),
    }));

    return { ok: true, questions };
  },
});

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.max(0, Math.min(100, Math.round(value)));
}
