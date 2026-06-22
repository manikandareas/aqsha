/**
 * Slice 6.9 — service-unit (repo-fake) untuk jalur Astra chat eve yang TIDAK
 * butuh proses eve / DB live: SendQuotaService.check return-union, TitleService
 * claim/finalize guard, dan ResearchService (Jina) cache hit/miss +
 * provider-failure sentinel.
 *
 * Leaf deps (Redis cache / HTTP / LLM / queue / rate-limiter) di-`spyOn` pada
 * namespace modul-nya (file-local, di-restore tiap afterEach lewat `mock.restore`)
 * — BUKAN `mock.module` global, supaya tak meng-clobber test sibling yang memakai
 * modul yang sama (queue → artifact-service, external-cache/http → feed/paper tests).
 *
 * `RagService.searchThreadDocuments` ada di rag-extract.test.ts (embeddings sudah
 * di-mock di sana). `consumeCredits` idempotency & `evaluateGate` sudah ter-cover
 * di billing.test.ts (A9) → tak diulang.
 */
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { ChatMessageRepo, ChatThreadRepo } from "@aqsha/db";
import { BillingService } from "../src/billing.service";
import * as llmMod from "../src/clients/llm";
import * as queueMod from "../src/clients/queue";
import * as cacheMod from "../src/papers/external-cache";
import * as httpMod from "../src/papers/http";
import { SendQuotaService } from "../src/quota/send-quota.service";
import * as rlMod from "../src/quota/rate-limits";
import { ResearchService } from "../src/research";
import { TitleService } from "../src/chat/title.service";

const fakeDb = { transaction: async (fn: (tx: unknown) => unknown) => fn(fakeDb) } as never;
const OWNER = "user_1";

afterEach(() => mock.restore());

// ── SendQuotaService.check (return-union) ────────────────────────────────────
describe("SendQuotaService.check", () => {
  type Limiter = { consume: (k: string) => Promise<unknown>; get: (k: string) => Promise<unknown> };
  let limiter: Limiter;
  beforeEach(() => {
    limiter = { consume: async () => ({}), get: async () => null };
    spyOn(rlMod, "getRateLimiter").mockReturnValue(limiter as never);
  });

  test("entitlement ok + cooldown lewat → ok", async () => {
    spyOn(BillingService, "requireEntitlement").mockResolvedValue({ ok: true } as never);
    const r = await SendQuotaService.check(fakeDb, { ownerUserId: OWNER });
    expect(r.ok).toBe(true);
  });

  test("entitlement blok (quota_exceeded) → propagate reason, tak sentuh cooldown", async () => {
    let consumed = false;
    limiter.consume = async () => {
      consumed = true;
      return {};
    };
    spyOn(BillingService, "requireEntitlement").mockResolvedValue({
      ok: false,
      reason: "quota_exceeded",
      resetAt: 9999,
    } as never);
    const r = await SendQuotaService.check(fakeDb, { ownerUserId: OWNER });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("quota_exceeded");
      expect(r.retryAt).toBe(9999);
    }
    expect(consumed).toBe(false); // billing blok tak membakar jatah cooldown
  });

  test("cooldown aktif (limiter reject RateLimiterRes) → reason cooldown", async () => {
    spyOn(BillingService, "requireEntitlement").mockResolvedValue({ ok: true } as never);
    limiter.consume = async () => Promise.reject({ msBeforeNext: 1500, remainingPoints: 0 });
    const r = await SendQuotaService.check(fakeDb, { ownerUserId: OWNER });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("cooldown");
  });

  test("store error (limiter reject Error) → fail-open (ok)", async () => {
    spyOn(BillingService, "requireEntitlement").mockResolvedValue({ ok: true } as never);
    limiter.consume = async () => Promise.reject(new Error("redis down"));
    const r = await SendQuotaService.check(fakeDb, { ownerUserId: OWNER });
    expect(r.ok).toBe(true);
  });
});

// ── TitleService claim/finalize guards ───────────────────────────────────────
describe("TitleService", () => {
  let enqueueSpy: ReturnType<typeof spyOn>;
  beforeEach(() => {
    enqueueSpy = spyOn(queueMod, "enqueue").mockResolvedValue(undefined as never);
  });

  test("requestTitle: klaim menang → enqueue threadTitle jobId=threadId, true", async () => {
    spyOn(ChatThreadRepo, "claimTitleGeneration").mockResolvedValue(true as never);
    const ok = await TitleService.requestTitle(fakeDb, "t1");
    expect(ok).toBe(true);
    expect(enqueueSpy).toHaveBeenCalledWith(
      queueMod.CHAT_QUEUES.threadTitle,
      { threadId: "t1" },
      { jobId: "t1" },
    );
  });

  test("requestTitle: klaim kalah (bukan turn pertama / sudah rename) → no enqueue, false", async () => {
    spyOn(ChatThreadRepo, "claimTitleGeneration").mockResolvedValue(false as never);
    expect(await TitleService.requestTitle(fakeDb, "t1")).toBe(false);
    expect(enqueueSpy).not.toHaveBeenCalled();
  });

  test("generate: ada pesan user → finalizeTitle (ber-guard) judul collapsed+unquoted", async () => {
    spyOn(ChatMessageRepo, "listByThread").mockResolvedValue([
      { role: "assistant", text: "halo" },
      { role: "user", text: "Tolong jelaskan riset ini" },
    ] as never);
    spyOn(llmMod, "generateThreadTitle").mockResolvedValue('  "Riset Energi"  ' as never);
    const fin = spyOn(ChatThreadRepo, "finalizeTitle").mockResolvedValue(undefined as never);
    await TitleService.generate(fakeDb, "t1");
    expect(fin).toHaveBeenCalledTimes(1);
    expect((fin.mock.calls[0] as unknown[])[2]).toBe("Riset Energi");
  });

  test("generate: tanpa pesan user → finalizeTitle TIDAK dipanggil (status tetap generating)", async () => {
    spyOn(ChatMessageRepo, "listByThread").mockResolvedValue([
      { role: "assistant", text: "halo" },
    ] as never);
    spyOn(llmMod, "generateThreadTitle").mockResolvedValue("apa pun" as never);
    const fin = spyOn(ChatThreadRepo, "finalizeTitle").mockResolvedValue(undefined as never);
    await TitleService.generate(fakeDb, "t1");
    expect(fin).not.toHaveBeenCalled();
  });
});

// ── ResearchService (Firecrawl) cache hit/miss + failure sentinel ────────────
describe("ResearchService.searchWeb (Firecrawl, cache + failure)", () => {
  let getCache: ReturnType<typeof spyOn>;
  let putCache: ReturnType<typeof spyOn>;
  let fetchSpy: ReturnType<typeof spyOn>;
  beforeEach(() => {
    process.env.FIRECRAWL_API_KEY = "fc-test";
    getCache = spyOn(cacheMod, "getCache").mockResolvedValue(null as never);
    putCache = spyOn(cacheMod, "putCache").mockResolvedValue(undefined as never);
    fetchSpy = spyOn(httpMod, "fetchWithTimeout").mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { web: [] } }), { status: 200 }) as never,
    );
  });

  test("cache HIT → kembalikan cached, tak fetch / tak tulis cache", async () => {
    getCache.mockResolvedValue({
      valueJson: JSON.stringify([{ origin: "web", provider: "firecrawl_search", title: "Cached" }]),
    } as never);
    const r = await ResearchService.searchWeb({ query: "energi surya" });
    expect(r[0]?.title).toBe("Cached");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(putCache).not.toHaveBeenCalled();
  });

  test("cache MISS + fetch sukses → parse + tulis cache 'ready'", async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { web: [{ title: "Hasil A", url: "https://a.test", description: "isi" }] },
        }),
        { status: 200 },
      ) as never,
    );
    const r = await ResearchService.searchWeb({ query: "energi surya" });
    expect(r[0]?.title).toBe("Hasil A");
    // putCache(provider, cacheKey, status, valueJson) — status[2] = 'ready' karena ada hasil
    expect((putCache.mock.calls[0] as unknown[])[2]).toBe("ready");
  });

  test("provider error (HTTP !ok) → sentinel: [] + tulis cache 'failed'", async () => {
    fetchSpy.mockResolvedValue(new Response("nope", { status: 503 }) as never);
    const r = await ResearchService.searchWeb({ query: "energi surya" });
    expect(r).toEqual([]);
    expect((putCache.mock.calls[0] as unknown[])[2]).toBe("failed");
  });

  test("tanpa FIRECRAWL_API_KEY → [] + cache 'failed', tak fetch", async () => {
    delete process.env.FIRECRAWL_API_KEY;
    const r = await ResearchService.searchWeb({ query: "energi surya" });
    expect(r).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect((putCache.mock.calls[0] as unknown[])[2]).toBe("failed");
  });

  test("query kosong → [] tanpa fetch/cache", async () => {
    expect(await ResearchService.searchWeb({ query: "   " })).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getCache).not.toHaveBeenCalled();
  });
});
