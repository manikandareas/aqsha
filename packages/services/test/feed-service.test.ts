import { FeedInteractionRepo, FeedRepo } from "@aqsha/db";
import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { FeedService } from "../src/feed.service";
import { InterestService } from "../src/interest.service";

const fakeDb = {} as never;

// Row feed_items minimal (field yang dibaca scoring + shaping). Sisanya null/undefined.
function mkRow(over: Record<string, unknown>): never {
  return {
    id: "x",
    kind: "paper",
    title: "T",
    summary: "S",
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
    topics: [],
    trendScore: 0,
    retractionStatus: null,
    primaryClaim: null,
    stanceSupporting: null,
    stanceContrasting: null,
    sparkline: null,
    publishedAt: null,
    dedupeKey: "d",
    lastSeenAt: 1,
    createdAt: 1,
    orderAt: 1,
    searchText: "",
    searchTsv: null,
    ...over,
  } as never;
}

const NOW = Date.now();
const OLD = NOW - 400 * 86_400_000; // ~13 bulan lalu → recency rendah

// A: sitasi tinggi, lama, tanpa minat → menang di "top".
const A = mkRow({ id: "A", trendScore: 100_000, publishedAt: OLD, topics: ["climate"] });
// B: sitasi 0, baru, cocok minat → menang di "foryou".
const B = mkRow({ id: "B", trendScore: 0, publishedAt: NOW, topics: ["machine learning"] });

afterEach(() => {
  spyOn(FeedRepo, "paginateBalanced").mockRestore();
  spyOn(FeedRepo, "searchByTsvector").mockRestore();
  spyOn(FeedInteractionRepo, "hiddenItemIds").mockRestore();
  spyOn(InterestService, "loadWeights").mockRestore();
});

function stub(page: unknown[], hidden: string[], weights: Map<string, number>) {
  spyOn(FeedRepo, "paginateBalanced").mockResolvedValue({
    items: page as never,
    nextCursor: null,
  });
  spyOn(FeedInteractionRepo, "hiddenItemIds").mockResolvedValue(hidden);
  spyOn(InterestService, "loadWeights").mockResolvedValue(weights);
}

describe("FeedService.getFeedPaginated re-rank", () => {
  test("mode top ≠ mode foryou (popularity vs interest)", async () => {
    const weights = new Map([["machine learning", 5]]);

    stub([A, B], [], weights);
    const top = await FeedService.getFeedPaginated(fakeDb, "u", { mode: "top" });
    expect(top.items[0]!._id).toBe("A");

    stub([A, B], [], weights);
    const foryou = await FeedService.getFeedPaginated(fakeDb, "u", { mode: "foryou" });
    expect(foryou.items[0]!._id).toBe("B");
  });

  test("item hidden tersaring", async () => {
    stub([A, B], ["A"], new Map());
    const res = await FeedService.getFeedPaginated(fakeDb, "u", { mode: "foryou" });
    expect(res.items.map((i) => i._id)).toEqual(["B"]);
  });

  test("nextCursor diteruskan dari repo (page boleh menyusut)", async () => {
    spyOn(FeedRepo, "paginateBalanced").mockResolvedValue({
      items: [A, B] as never,
      nextCursor: "CURSOR",
    });
    spyOn(FeedInteractionRepo, "hiddenItemIds").mockResolvedValue(["A", "B"]);
    spyOn(InterestService, "loadWeights").mockResolvedValue(new Map());
    const res = await FeedService.getFeedPaginated(fakeDb, "u", {});
    expect(res.items.length).toBe(0); // semua ter-hide
    expect(res.nextCursor).toBe("CURSOR"); // cursor tetap (bukan dari item terakhir yang lolos)
  });
});

describe("FeedService.searchDiscovery", () => {
  test("q kosong → page kosong tanpa hit repo", async () => {
    const spy = spyOn(FeedRepo, "searchByTsvector");
    const res = await FeedService.searchDiscovery(fakeDb, "u", { q: "   " });
    expect(res).toEqual({ items: [], nextCursor: null });
    expect(spy).not.toHaveBeenCalled();
  });

  test("filter hidden + teruskan nextCursor", async () => {
    spyOn(FeedRepo, "searchByTsvector").mockResolvedValue({
      items: [A, B] as never,
      nextCursor: "C2",
    });
    spyOn(FeedInteractionRepo, "hiddenItemIds").mockResolvedValue(["A"]);
    spyOn(InterestService, "loadWeights").mockResolvedValue(new Map());
    const res = await FeedService.searchDiscovery(fakeDb, "u", { q: "quantum" });
    expect(res.items.map((i) => i._id)).toEqual(["B"]);
    expect(res.nextCursor).toBe("C2");
  });
});
