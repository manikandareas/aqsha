import { v } from "convex/values";
import { z } from "zod";
import { generateObject } from "ai";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { requireCurrentUser } from "./auth";
import { chatProvider, CHAT_PROVIDER_NAME } from "./agent/providers";
import { CHAT_LITE_MODEL } from "./agent/models";

type BillingReason = "quota_exceeded" | "subscription_required" | "billing_inactive";

// ── "Kenapa relevan untukmu" — context-aware relevance note (PaperWeaver) ──
export const explainRelevance = action({
  args: {
    title: v.string(),
    context: v.optional(v.string()),
    topics: v.optional(v.array(v.string())),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    { ok: true; reason: string } | { ok: false; reason: BillingReason }
  > => {
    const user = await requireCurrentUser(ctx);
    const interests: string[] = await ctx.runQuery(
      internal.feed.userInterestTopics,
      { ownerUserId: user._id, limit: 8 },
    );

    // Cold start: no saved interests yet → skip the LLM, nudge to personalize.
    if (interests.length === 0) {
      return {
        ok: true,
        reason:
          "Belum ada minat tersimpan. Simpan atau teliti beberapa item agar Feed makin relevan untukmu.",
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
        inputTokens: 300,
      },
    );
    if (!entitlement.ok) return { ok: false, reason: entitlement.reason };

    const result = await generateObject({
      model: chatProvider.chat(CHAT_LITE_MODEL),
      maxOutputTokens: 160,
      schema: z.object({
        reason: z
          .string()
          .max(320)
          .describe("Penjelasan singkat Bahasa Indonesia kenapa item ini relevan"),
      }),
      system: [
        "Kamu menjelaskan ke peneliti kenapa sebuah item feed relevan dengan minat mereka.",
        "Kaitkan SPESIFIK ke minat tersimpan mereka, bukan ringkasan abstrak umum.",
        "1-2 kalimat, Bahasa Indonesia, jujur. Jika kaitannya lemah, katakan apa adanya.",
      ].join(" "),
      prompt: [
        `MINAT TERSIMPAN: ${interests.join(", ")}`,
        `ITEM: ${args.title}`,
        args.context ? `KONTEKS: ${args.context.slice(0, 500)}` : "",
        args.topics?.length ? `TOPIK ITEM: ${args.topics.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    });

    return { ok: true, reason: result.object.reason };
  },
});

// ── Glossary: explain an academic term in plain Bahasa Indonesia ──────────
export const explainTerm = action({
  args: { term: v.string(), context: v.optional(v.string()) },
  handler: async (
    ctx,
    args,
  ): Promise<
    { ok: true; definition: string } | { ok: false; reason: BillingReason }
  > => {
    const user = await requireCurrentUser(ctx);
    const term = args.term.trim().slice(0, 120);
    if (!term) return { ok: true, definition: "" };

    const entitlement = await ctx.runMutation(
      internal.billing.entitlements.consumeCreditsInternal,
      {
        ownerUserId: user._id,
        ownerEmail: user.email,
        feature: "normal_chat",
        provider: CHAT_PROVIDER_NAME,
        model: CHAT_LITE_MODEL,
        inputTokens: 120,
      },
    );
    if (!entitlement.ok) return { ok: false, reason: entitlement.reason };

    const result = await generateObject({
      model: chatProvider.chat(CHAT_LITE_MODEL),
      maxOutputTokens: 140,
      schema: z.object({
        definition: z
          .string()
          .max(320)
          .describe("Definisi singkat istilah dalam Bahasa Indonesia awam"),
      }),
      system:
        "Jelaskan istilah akademik secara singkat dan mudah dalam Bahasa Indonesia (1-2 kalimat), tanpa jargon berlebih.",
      prompt: args.context
        ? `Istilah: ${term}\nKonteks: ${args.context.slice(0, 300)}`
        : `Istilah: ${term}`,
    });

    return { ok: true, definition: result.object.definition };
  },
});
