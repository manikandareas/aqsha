import { FeedInteractionRepo, FeedRepo } from "@aqsha/db";
import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { ExploreService } from "../src/explore.service";
import * as openAlex from "../src/feed/openAlex";
import { FeedService } from "../src/feed.service";
import * as cache from "../src/papers/external-cache";
import { PaperCacheService } from "../src/paper-cache.service";
import { ResearchService } from "../src/research";
import type { ResearchCandidate } from "../src/research";

const fakeDb = {} as never;

const detail = {
  key: "doi:10.1/x",
  title: "Paper",
  snippet: "s",
  url: "u",
  provider: "OpenAlex",
  sourceLabel: "OpenAlex",
  authors: [],
  topics: [],
  lastSeenAt: 5,
} as never;

afterEach(() => {
  spyOn(PaperCacheService, "getByKey").mockRestore();
  spyOn(FeedRepo, "findById").mockRestore();
  spyOn(FeedRepo, "listByKindRecent").mockRestore();
  spyOn(FeedInteractionRepo, "hiddenItemIds").mockRestore();
  spyOn(FeedInteractionRepo, "savedItemIds").mockRestore();
});

describe("ExploreService.getOrFetchPaper", () => {
  test("cache hit → kembalikan tanpa fetch", async () => {
    const getByKey = spyOn(PaperCacheService, "getByKey").mockResolvedValue(detail);
    const res = await ExploreService.getOrFetchPaper(fakeDb, "doi:10.1/x");
    expect(res).toEqual(detail);
    expect(getByKey).toHaveBeenCalledTimes(1);
  });

  test("cache miss + fetchOnMiss=false → null (tanpa network)", async () => {
    spyOn(PaperCacheService, "getByKey").mockResolvedValue(null);
    const res = await ExploreService.getOrFetchPaper(fakeDb, "doi:none", { fetchOnMiss: false });
    expect(res).toBeNull();
  });
});

describe("FeedService.getRelatedFeedItems", () => {
  const feedRow = (id: string, topics: string[], publishedAt: number) =>
    ({
      id,
      kind: "paper",
      title: id,
      summary: "",
      tldr: null,
      tldrId: null,
      titleId: null,
      url: "u",
      resolvedUrl: null,
      imageUrl: null,
      articleText: null,
      enrichAttempts: null,
      provider: "openalex",
      sourceLabel: "OpenAlex",
      paperKey: null,
      doi: null,
      authors: null,
      year: null,
      venue: null,
      pdfUrl: null,
      citedByCount: null,
      isOpenAccess: null,
      topics,
      trendScore: 0,
      retractionStatus: null,
      primaryClaim: null,
      stanceSupporting: null,
      stanceContrasting: null,
      sparkline: null,
      publishedAt,
      dedupeKey: id,
      lastSeenAt: publishedAt,
      createdAt: 1,
      orderAt: publishedAt,
      searchText: "",
      searchTsv: null,
    }) as never;

  test("rank by topic overlap (desc) lalu recency", async () => {
    spyOn(FeedRepo, "findById").mockResolvedValue(feedRow("S", ["ml", "ai"], 100));
    spyOn(FeedRepo, "listByKindRecent").mockResolvedValue([
      feedRow("P2", ["bio"], 90), // overlap 0
      feedRow("P1", ["ml", "ai"], 80), // overlap 2
      feedRow("P3", ["ai"], 70), // overlap 1
    ] as never);
    spyOn(FeedInteractionRepo, "hiddenItemIds").mockResolvedValue([]);
    spyOn(FeedInteractionRepo, "savedItemIds").mockResolvedValue([]);

    const res = await FeedService.getRelatedFeedItems(fakeDb, "u", "S", 6);
    expect(res.map((r) => r._id)).toEqual(["P1", "P3", "P2"]);
  });

  test("self tak ditemukan → []", async () => {
    spyOn(FeedRepo, "findById").mockResolvedValue(null);
    const res = await FeedService.getRelatedFeedItems(fakeDb, "u", "missing");
    expect(res).toEqual([]);
  });
});

describe("ExploreService.searchPapers — waterfall (Fase 8)", () => {
  const oaPaper = (key: string) =>
    ({
      key,
      title: key,
      snippet: "s",
      url: `https://oa/${key}`,
      provider: "OpenAlex",
      sourceLabel: "OpenAlex",
      authors: [],
      topics: [],
    }) as never;
  const candidate = (over: Partial<ResearchCandidate>): ResearchCandidate => ({
    origin: "web",
    evidenceStrength: "medium",
    title: "c",
    locator: over.url ?? "loc",
    snippet: "s",
    ...over,
  });

  afterEach(() => {
    mock.restore();
  });

  test("OpenAlex pendek → fill arXiv+Jina, dedupe by key, hormati limit; Crossref skipped (bukan DOI)", async () => {
    spyOn(cache, "getCache").mockResolvedValue(null);
    spyOn(cache, "putCache").mockResolvedValue(undefined);
    spyOn(PaperCacheService, "upsert").mockResolvedValue(undefined as never);
    spyOn(openAlex, "fetchOpenAlexWorks").mockResolvedValue({
      papers: [oaPaper("doi:10.1/a")],
    } as never);
    // arXiv mengembalikan dup-a (rank kalah OpenAlex) + c; masih < needed → Jina jalan.
    const arxiv = spyOn(ResearchService, "searchArxiv").mockResolvedValue([
      candidate({ origin: "arxiv", doi: "10.1/a" }),
      candidate({ url: "https://x/c" }),
    ]);
    const web = spyOn(ResearchService, "searchWeb").mockResolvedValue([candidate({ url: "https://x/d" })]);
    const cross = spyOn(ResearchService, "lookupDoi").mockResolvedValue([]);

    const res = await ExploreService.searchPapers(fakeDb, "u", {
      query: "graph neural networks",
      mode: "search",
      limit: 5,
    });

    expect(arxiv).toHaveBeenCalledTimes(1);
    expect(web).toHaveBeenCalledTimes(1);
    expect(cross).not.toHaveBeenCalled(); // query bukan DOI
    expect(res.items.map((p) => p.key).sort()).toEqual(["doi:10.1/a", "url:https://x/c", "url:https://x/d"]);
    // dup doi:10.1/a dimenangkan OpenAlex (provider rank).
    expect(res.items.find((p) => p.key === "doi:10.1/a")?.provider).toBe("OpenAlex");
    const statuses = Object.fromEntries(res.providerStatus.map((s) => [s.provider, s.status]));
    expect(statuses.OpenAlex).toBe("ready");
    expect(statuses.arXiv).toBe("ready");
    expect(statuses.Jina).toBe("ready");
    expect(statuses.Crossref).toBe("skipped");
  });

  test("OpenAlex sudah penuh (== limit) → provider lain skipped, tak dipanggil", async () => {
    spyOn(cache, "getCache").mockResolvedValue(null);
    spyOn(cache, "putCache").mockResolvedValue(undefined);
    spyOn(PaperCacheService, "upsert").mockResolvedValue(undefined as never);
    spyOn(openAlex, "fetchOpenAlexWorks").mockResolvedValue({
      papers: [oaPaper("doi:10.1/a"), oaPaper("doi:10.1/b")],
    } as never);
    const arxiv = spyOn(ResearchService, "searchArxiv").mockResolvedValue([]);

    const res = await ExploreService.searchPapers(fakeDb, "u", {
      query: "q",
      mode: "search",
      limit: 2,
    });

    expect(arxiv).not.toHaveBeenCalled();
    expect(res.items.length).toBe(2);
    const statuses = Object.fromEntries(res.providerStatus.map((s) => [s.provider, s.status]));
    expect(statuses.arXiv).toBe("skipped");
    expect(statuses.Jina).toBe("skipped");
    expect(statuses.Crossref).toBe("skipped");
  });
});
