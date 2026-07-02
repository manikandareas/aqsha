/**
 * Service-unit (repo-fake) untuk jalur Astra chat yang TIDAK butuh runtime
 * agent / DB live: SendQuotaService.check return-union, TitleService
 * claim/finalize guard, ResearchService (Firecrawl search + Crossref keyword) cache
 * hit/miss + provider-failure sentinel, dan Firecrawl reader (scrapeUrlFirecrawl).
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
import { ChatThreadRepo } from "@aqsha/db";
import { BillingService } from "../src/billing.service";
import * as llmMod from "../src/clients/llm";
import * as queueMod from "../src/clients/queue";
import * as cacheMod from "../src/papers/external-cache";
import * as httpMod from "../src/papers/http";
import { SendQuotaService } from "../src/quota/send-quota.service";
import * as rlMod from "../src/quota/rate-limits";
import { ResearchService } from "../src/research";
import { scrapeUrlFirecrawl } from "../src/papers/firecrawl-reader";
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

  test("requestTitle: klaim menang → enqueue threadTitle jobId=threadId (+seed), true", async () => {
    spyOn(ChatThreadRepo, "claimTitleGeneration").mockResolvedValue(true as never);
    const ok = await TitleService.requestTitle(fakeDb, "t1", "Tolong jelaskan riset ini");
    expect(ok).toBe(true);
    expect(enqueueSpy).toHaveBeenCalledWith(
      queueMod.CHAT_QUEUES.threadTitle,
      { threadId: "t1", titleSeed: "Tolong jelaskan riset ini" },
      { jobId: "t1" },
    );
  });

  test("requestTitle: klaim kalah (bukan turn pertama / sudah rename) → no enqueue, false", async () => {
    spyOn(ChatThreadRepo, "claimTitleGeneration").mockResolvedValue(false as never);
    expect(await TitleService.requestTitle(fakeDb, "t1")).toBe(false);
    expect(enqueueSpy).not.toHaveBeenCalled();
  });

  test("generate: ada seed → finalizeTitle (ber-guard) judul collapsed+unquoted", async () => {
    spyOn(llmMod, "generateThreadTitle").mockResolvedValue('  "Riset Energi"  ' as never);
    const fin = spyOn(ChatThreadRepo, "finalizeTitle").mockResolvedValue(undefined as never);
    await TitleService.generate(fakeDb, { threadId: "t1", titleSeed: "Tolong jelaskan riset ini" });
    expect(fin).toHaveBeenCalledTimes(1);
    expect((fin.mock.calls[0] as unknown[])[2]).toBe("Riset Energi");
  });

  test("generate: tanpa seed → finalizeTitle TIDAK dipanggil (status tetap generating)", async () => {
    spyOn(llmMod, "generateThreadTitle").mockResolvedValue("apa pun" as never);
    const fin = spyOn(ChatThreadRepo, "finalizeTitle").mockResolvedValue(undefined as never);
    await TitleService.generate(fakeDb, { threadId: "t1" });
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
      status: "ready",
      valueJson: JSON.stringify([{ origin: "web", provider: "firecrawl_search", title: "Cached" }]),
    } as never);
    const r = await ResearchService.searchWeb({ query: "energi surya" });
    expect(r.ok).toBe(true);
    expect(r.ok ? r.candidates[0]?.title : null).toBe("Cached");
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
    expect(r.ok ? r.candidates[0]?.title : null).toBe("Hasil A");
    // putCache(provider, cacheKey, status, valueJson) — status[2] = 'ready' karena ada hasil
    expect((putCache.mock.calls[0] as unknown[])[2]).toBe("ready");
  });

  test("provider error (HTTP !ok) → ok:false (CTX-2) + tulis cache 'failed'", async () => {
    fetchSpy.mockResolvedValue(new Response("nope", { status: 503 }) as never);
    const r = await ResearchService.searchWeb({ query: "energi surya" });
    expect(r.ok).toBe(false);
    expect((putCache.mock.calls[0] as unknown[])[2]).toBe("failed");
  });

  test("tanpa FIRECRAWL_API_KEY → ok:false (misconfig eksplisit), tak fetch, TAK cache 'failed'", async () => {
    delete process.env.FIRECRAWL_API_KEY;
    const r = await ResearchService.searchWeb({ query: "energi surya" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("FIRECRAWL_API_KEY");
    expect(fetchSpy).not.toHaveBeenCalled();
    // Misconfig tak di-cache 'failed' → pulih instan begitu key diset.
    expect(putCache).not.toHaveBeenCalled();
  });

  test("cache status 'failed' → ok:false TANPA fetch (backoff jujur, CTX-2)", async () => {
    getCache.mockResolvedValue({ status: "failed", valueJson: "[]" } as never);
    const r = await ResearchService.searchWeb({ query: "energi surya" });
    expect(r.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("query kosong → ok+[] tanpa fetch/cache", async () => {
    expect(await ResearchService.searchWeb({ query: "   " })).toEqual({ ok: true, candidates: [] });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getCache).not.toHaveBeenCalled();
  });
});

// ── ResearchService.searchCrossref (keyword search, cache + map) ──────────────
describe("ResearchService.searchCrossref (keyword, cache + map)", () => {
  let getCache: ReturnType<typeof spyOn>;
  let putCache: ReturnType<typeof spyOn>;
  let fetchSpy: ReturnType<typeof spyOn>;
  beforeEach(() => {
    getCache = spyOn(cacheMod, "getCache").mockResolvedValue(null as never);
    putCache = spyOn(cacheMod, "putCache").mockResolvedValue(undefined as never);
    fetchSpy = spyOn(httpMod, "fetchWithTimeout").mockResolvedValue(
      new Response(
        JSON.stringify({
          message: {
            items: [
              {
                DOI: "10.1/a",
                title: ["Judul A"],
                abstract: "abstrak",
                author: [{ given: "J", family: "Doe" }],
                published: { "date-parts": [[2023]] },
                "container-title": ["Jurnal X"],
                URL: "https://doi.org/10.1/a",
              },
            ],
          },
        }),
        { status: 200 },
      ) as never,
    );
  });

  test("map message.items → kandidat crossref + kirim query/rows/sort=relevance", async () => {
    const r = await ResearchService.searchCrossref({ query: "graph neural", limit: 5 });
    expect(r.ok).toBe(true);
    const items = r.ok ? r.candidates : [];
    expect(items).toHaveLength(1);
    expect(items[0]?.provider).toBe("crossref");
    expect(items[0]?.doi).toBe("10.1/a");
    const url = String((fetchSpy.mock.calls[0] as unknown[])[0]);
    expect(url).toContain("query=graph+neural");
    expect(url).toContain("sort=relevance");
    expect(url).toContain("rows=5");
    expect((putCache.mock.calls[0] as unknown[])[2]).toBe("ready");
  });

  test("query kosong → ok+[] tanpa fetch/cache", async () => {
    expect(await ResearchService.searchCrossref({ query: "  " })).toEqual({
      ok: true,
      candidates: [],
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getCache).not.toHaveBeenCalled();
  });

  test("provider error (HTTP !ok) → ok:false (CTX-2, bukan menyaru []) + cache 'failed'", async () => {
    fetchSpy.mockResolvedValue(new Response("nope", { status: 500 }) as never);
    const r = await ResearchService.searchCrossref({ query: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("provider_error");
    expect((putCache.mock.calls[0] as unknown[])[2]).toBe("failed");
  });

  test("cache status 'failed' → ok:false TANPA fetch (backoff jujur, CTX-2)", async () => {
    getCache.mockResolvedValue({ status: "failed", valueJson: "[]" } as never);
    const r = await ResearchService.searchCrossref({ query: "x" });
    expect(r.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ── scrapeUrlFirecrawl (Firecrawl /v2/scrape → markdown) ─────────────────────
describe("scrapeUrlFirecrawl (Firecrawl /v2/scrape, cache + map)", () => {
  let putCache: ReturnType<typeof spyOn>;
  let fetchSpy: ReturnType<typeof spyOn>;
  beforeEach(() => {
    process.env.FIRECRAWL_API_KEY = "fc-test";
    spyOn(cacheMod, "getCache").mockResolvedValue(null as never);
    putCache = spyOn(cacheMod, "putCache").mockResolvedValue(undefined as never);
    fetchSpy = spyOn(httpMod, "fetchWithTimeout").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            url: "https://a.test",
            markdown: "# Judul\n\nisi konten",
            metadata: { title: "Judul Halaman", description: "ringkas" },
          },
        }),
        { status: 200 },
      ) as never,
    );
  });

  test("scrape sukses → UrlReadResult (markdown+title+snippet), cache 'ready'", async () => {
    const r = await scrapeUrlFirecrawl({ url: "https://a.test" });
    expect(r.ok).toBe(true);
    expect(r.title).toBe("Judul Halaman");
    expect(r.markdown).toContain("isi konten");
    expect(r.snippet).toBe("ringkas");
    expect((putCache.mock.calls[0] as unknown[])[2]).toBe("ready");
  });

  test("tanpa FIRECRAWL_API_KEY → ok=false + cache 'failed', tak fetch", async () => {
    delete process.env.FIRECRAWL_API_KEY;
    const r = await scrapeUrlFirecrawl({ url: "https://a.test" });
    expect(r.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect((putCache.mock.calls[0] as unknown[])[2]).toBe("failed");
  });

  test("respons tanpa markdown → ok=false + cache 'failed'", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: {} }), { status: 200 }) as never,
    );
    const r = await scrapeUrlFirecrawl({ url: "https://a.test" });
    expect(r.ok).toBe(false);
    expect((putCache.mock.calls[0] as unknown[])[2]).toBe("failed");
  });
});
