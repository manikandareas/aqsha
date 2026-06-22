import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { BillingService } from "../src/billing.service";
import * as llm from "../src/clients/llm";
import { FeedAiService } from "../src/feed-ai.service";
import * as cache from "../src/papers/external-cache";
import { ResearchService } from "../src/research";

const fakeDb = {} as never;
const seed = { title: "Efek kopi pada tidur", context: "studi observasional", topics: ["kesehatan"] };

const okCredit = {
  ok: true,
  planKey: "free",
  periodKey: "2026-06",
  resetAt: 0,
  creditsLimit: 50,
  creditsUsed: 1,
  creditsRemaining: 49,
} as never;
const blockedCredit = {
  ok: false,
  reason: "quota_exceeded",
  planKey: "free",
  requiredPlan: "starter",
  resetAt: 123,
  creditsLimit: 50,
  creditsUsed: 50,
  creditsRemaining: 0,
} as never;

afterEach(() => {
  mock.restore();
});

describe("FeedAiService.generateIdeas", () => {
  test("cache hit → kembalikan tanpa debit / tanpa LLM", async () => {
    spyOn(cache, "getCache").mockResolvedValue({ status: "ready", valueJson: JSON.stringify(["q lama"]) } as never);
    const consume = spyOn(BillingService, "consumeCredits");
    const gen = spyOn(llm, "generateResearchIdeas");

    const res = await FeedAiService.generateIdeas(fakeDb, "u", "e@x", seed);

    expect(res).toEqual({ ok: true, ideas: ["q lama"], cached: true });
    expect(consume).not.toHaveBeenCalled();
    expect(gen).not.toHaveBeenCalled();
  });

  test("fresh ok → debit normal_chat, generate, cache; ideas dipakai", async () => {
    spyOn(cache, "getCache").mockResolvedValue(null);
    const put = spyOn(cache, "putCache").mockResolvedValue(undefined);
    spyOn(BillingService, "consumeCredits").mockResolvedValue(okCredit);
    spyOn(ResearchService, "searchOpenAlex").mockResolvedValue([]);
    spyOn(llm, "generateResearchIdeas").mockResolvedValue(["q1", "q2"]);

    const res = await FeedAiService.generateIdeas(fakeDb, "u", "e@x", seed);

    expect(res).toEqual({ ok: true, ideas: ["q1", "q2"], cached: false });
    expect(put).toHaveBeenCalledTimes(1);
  });

  test("kuota habis → return-union ok:false, LLM tak dipanggil", async () => {
    spyOn(cache, "getCache").mockResolvedValue(null);
    spyOn(BillingService, "consumeCredits").mockResolvedValue(blockedCredit);
    const gen = spyOn(llm, "generateResearchIdeas");

    const res = await FeedAiService.generateIdeas(fakeDb, "u", "e@x", seed);

    expect(res).toEqual({ ok: false, reason: "quota_exceeded", resetAt: 123 });
    expect(gen).not.toHaveBeenCalled();
  });

  test("LLM gagal → canned cold-start (tetap ok, 1..3 ide)", async () => {
    spyOn(cache, "getCache").mockResolvedValue(null);
    spyOn(cache, "putCache").mockResolvedValue(undefined);
    spyOn(BillingService, "consumeCredits").mockResolvedValue(okCredit);
    spyOn(ResearchService, "searchOpenAlex").mockResolvedValue([]);
    spyOn(llm, "generateResearchIdeas").mockRejectedValue(new Error("model down"));

    const res = await FeedAiService.generateIdeas(fakeDb, "u", "e@x", seed);

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.ideas.length).toBeGreaterThanOrEqual(1);
      expect(res.ideas.length).toBeLessThanOrEqual(3);
    }
  });

  test("model balas >3 → di-clamp ke 3", async () => {
    spyOn(cache, "getCache").mockResolvedValue(null);
    spyOn(cache, "putCache").mockResolvedValue(undefined);
    spyOn(BillingService, "consumeCredits").mockResolvedValue(okCredit);
    spyOn(ResearchService, "searchOpenAlex").mockResolvedValue([]);
    spyOn(llm, "generateResearchIdeas").mockResolvedValue(["a", "b", "c", "d"]);

    const res = await FeedAiService.generateIdeas(fakeDb, "u", "e@x", seed);

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.ideas).toEqual(["a", "b", "c"]);
  });
});
