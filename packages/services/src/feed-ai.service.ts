/**
 * FeedAiService (Fase 8) — AI augmentation discovery, credit-gated (return-union).
 * Scope owner-trim: HANYA `generateIdeas` (explainRelevance/consensus/explainTerm
 * di-drop). Pakai LLM provider bersama (`clients/llm`) + konteks OpenAlex
 * (`research`) + cache Redis (`papers/external-cache`).
 */
import type { Db } from "@aqsha/db";
import { BillingService } from "./billing.service";
import { generateResearchIdeas } from "./clients/llm";
import { getCache, putCache } from "./papers/external-cache";
import { ResearchService } from "./research";
import { collapse } from "./lib/text";

export type IdeaSeed = { title: string; context?: string; topics?: string[] };

export type GenerateIdeasResult =
  | { ok: true; ideas: string[]; cached: boolean }
  | { ok: false; reason: "quota_exceeded" | "subscription_required" | "billing_inactive"; resetAt: number };

function ideasCacheKey(seed: IdeaSeed): string {
  const topics = (seed.topics ?? []).map((t) => t.trim().toLowerCase()).sort().join(",");
  return `ideas:v1:${collapse(seed.title).toLowerCase()}:${topics}`;
}

// FINER = Feasible, Interesting, Novel, Ethical, Relevant.
function buildPrompt(seed: IdeaSeed, literature: string): string {
  const topics = seed.topics?.length ? `\nTopik: ${seed.topics.join(", ")}` : "";
  const context = seed.context ? `\nKonteks: ${seed.context}` : "";
  return [
    "Kamu peneliti senior. Dari materi berikut, usulkan 1–3 PERTANYAAN RISET yang memenuhi",
    "kriteria FINER (Feasible, Interesting, Novel, Ethical, Relevant). Tiap pertanyaan satu",
    "kalimat ringkas dalam Bahasa Indonesia, spesifik dan dapat diteliti — bukan topik umum.",
    "",
    `Judul: ${seed.title}${topics}${context}`,
    literature ? `\n${literature}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// Cold-start fallback bila model gagal (tetap mengembalikan sesuatu yang berguna).
function cannedIdeas(seed: IdeaSeed): string[] {
  return [
    `Bagaimana temuan pada "${seed.title}" direplikasi pada populasi atau konteks yang berbeda?`,
    `Faktor apa yang memoderasi efek yang dilaporkan dalam "${seed.title}"?`,
  ];
}

export const FeedAiService = {
  /**
   * 1–3 pertanyaan riset FINER dari sebuah seed (paper/klaim/topik). Cache Redis
   * (sama seed → sama ide). Gate `consumeCredits('normal_chat')` return-union —
   * cache-hit TIDAK men-debit. Model gagal → canned cold-start.
   */
  async generateIdeas(
    db: Db,
    ownerUserId: string,
    ownerEmail: string | null | undefined,
    seed: IdeaSeed,
  ): Promise<GenerateIdeasResult> {
    const cacheKey = ideasCacheKey(seed);
    const cached = await getCache("feed_ideas", cacheKey);
    if (cached) {
      try {
        return { ok: true, ideas: JSON.parse(cached.valueJson) as string[], cached: true };
      } catch {
        // korup → regenerate
      }
    }

    const credit = await BillingService.consumeCredits(db, {
      ownerUserId,
      ownerEmail,
      feature: "normal_chat",
      provider: "feed_ideas",
    });
    if (!credit.ok) {
      return { ok: false, reason: credit.reason, resetAt: credit.resetAt };
    }

    // Konteks literatur (best-effort) — kegagalan tak boleh menggagalkan ide.
    let literature = "";
    try {
      const papers = await ResearchService.searchOpenAlex({ query: seed.title, limit: 4 });
      if (papers.length > 0) {
        literature = `Literatur terkait:\n${papers.map((p) => `- ${p.title}`).join("\n")}`;
      }
    } catch {
      // abaikan
    }

    let ideas: string[];
    try {
      ideas = await generateResearchIdeas(buildPrompt(seed, literature));
      if (ideas.length === 0) ideas = cannedIdeas(seed);
    } catch {
      ideas = cannedIdeas(seed);
    }
    ideas = ideas.slice(0, 3);

    await putCache("feed_ideas", cacheKey, "ready", JSON.stringify(ideas));
    return { ok: true, ideas, cached: false };
  },
};
