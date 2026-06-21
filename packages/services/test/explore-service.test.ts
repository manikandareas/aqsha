import { FeedInteractionRepo, FeedRepo } from "@aqsha/db";
import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { ExploreService } from "../src/explore.service";
import { FeedService } from "../src/feed.service";
import { PaperCacheService } from "../src/paper-cache.service";

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
