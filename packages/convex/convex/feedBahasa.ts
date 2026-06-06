import { v } from "convex/values";
import { z } from "zod";
import { generateObject } from "ai";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { chatProvider } from "./agent/providers";
import { CHAT_LITE_MODEL } from "./agent/models";

const SCAN_LIMIT = 80;
const TRANSLATE_BATCH = 16;

// Indonesian-native providers — already in Bahasa Indonesia, just mirror.
const ID_NATIVE_PROVIDERS = new Set(["google_factcheck", "gdelt", "turnbackhoax"]);

// ── Internal: find feed items still missing an Indonesian rendition ───────
export const itemsMissingIndonesian = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const recent = await ctx.db.query("feedItems").order("desc").take(SCAN_LIMIT);
    const missing = recent.filter(
      (item) => item.titleId === undefined || (item.tldr && item.tldrId === undefined),
    );
    return missing.slice(0, args.limit ?? TRANSLATE_BATCH).map((item) => ({
      _id: item._id,
      title: item.title,
      tldr: item.tldr,
      provider: item.provider,
    }));
  },
});

// ── Internal: persist Indonesian title/tldr ───────────────────────────────
export const patchItemIndonesian = internalMutation({
  args: {
    items: v.array(
      v.object({
        feedItemId: v.string(),
        titleId: v.string(),
        tldrId: v.optional(v.string()),
      }),
    ),
  },
  returns: v.object({ patched: v.number() }),
  handler: async (ctx, args) => {
    let patched = 0;
    for (const item of args.items) {
      const feedItemId = ctx.db.normalizeId("feedItems", item.feedItemId);
      if (!feedItemId) continue;
      const existing = await ctx.db.get("feedItems", feedItemId);
      if (!existing) continue;
      await ctx.db.patch("feedItems", feedItemId, {
        titleId: item.titleId,
        tldrId: item.tldrId ?? existing.tldrId,
      });
      patched += 1;
    }
    return { patched };
  },
});

// ── Internal: backfill Bahasa Indonesia layer (cron) ──────────────────────
// Translations are shared across all users, so this runs on the service path
// (no per-user credits) like the trending-papers cron.
export const backfillIndonesian = internalAction({
  args: { limit: v.optional(v.number()) },
  returns: v.object({ scanned: v.number(), patched: v.number() }),
  handler: async (
    ctx,
    args,
  ): Promise<{ scanned: number; patched: number }> => {
    const missing: Array<{
      _id: string;
      title: string;
      tldr?: string;
      provider: string;
    }> = await ctx.runQuery(internal.feedBahasa.itemsMissingIndonesian, {
      limit: args.limit ?? TRANSLATE_BATCH,
    });
    if (missing.length === 0) {
      return { scanned: 0, patched: 0 };
    }

    const patches: Array<{ feedItemId: string; titleId: string; tldrId?: string }> =
      [];
    const toTranslate: typeof missing = [];

    for (const item of missing) {
      if (ID_NATIVE_PROVIDERS.has(item.provider)) {
        // Already Indonesian — mirror without paying for translation.
        patches.push({
          feedItemId: item._id,
          titleId: item.title,
          tldrId: item.tldr,
        });
      } else {
        toTranslate.push(item);
      }
    }

    if (toTranslate.length > 0) {
      const numbered = toTranslate
        .map(
          (item, i) =>
            `[${i + 1}] JUDUL: ${item.title}${item.tldr ? `\nRINGKAS: ${item.tldr}` : ""}`,
        )
        .join("\n\n");

      try {
        const result = await generateObject({
          model: chatProvider.chat(CHAT_LITE_MODEL),
          maxOutputTokens: 1400,
          schema: z.object({
            items: z.array(
              z.object({
                number: z.number(),
                titleId: z.string(),
                tldrId: z.string().optional(),
              }),
            ),
          }),
          system:
            "Terjemahkan judul & ringkasan paper/berita sains ke Bahasa Indonesia yang akurat dan natural untuk peneliti. Pertahankan istilah teknis baku. Jangan menambah informasi.",
          prompt: `Terjemahkan tiap item (rujuk nomor):\n\n${numbered}`,
        });

        const byNumber = new Map(result.object.items.map((r) => [r.number, r]));
        toTranslate.forEach((item, i) => {
          const translated = byNumber.get(i + 1);
          if (translated && translated.titleId.trim()) {
            patches.push({
              feedItemId: item._id,
              titleId: translated.titleId.trim(),
              // Only store a real Indonesian translation. If the model omitted
              // tldrId, leave it unset (display falls back to the English tldr)
              // rather than corrupting the ID field — and it retries next run.
              tldrId: translated.tldrId?.trim() || undefined,
            });
          }
        });
      } catch {
        // Translation failed this run; native mirrors (if any) still persist.
      }
    }

    if (patches.length === 0) {
      return { scanned: missing.length, patched: 0 };
    }
    const { patched }: { patched: number } = await ctx.runMutation(
      internal.feedBahasa.patchItemIndonesian,
      { items: patches },
    );
    return { scanned: missing.length, patched };
  },
});
