import { FeedInteractionRepo, FeedRepo } from "@aqsha/db";
import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { FeedService } from "../src/feed.service";
import { shapeFeedItem } from "../src/feed/model";
import { InterestService } from "../src/interest.service";

const fakeDb = {} as never;

// Row feed_items minimal (field yang dibaca scoring + shaping). Sisanya null/default.
function mkRow(over: Record<string, unknown>): never {
  return {
    id: "x",
    kind: "paper",
    key: "doi:10.1/x",
    title: "T",
    snippet: null,
    doi: null,
    url: null,
    pdfUrl: null,
    hasPdf: false,
    authors: [],
    year: null,
    publicationDate: null,
    venue: null,
    citedByCount: null,
    isOpenAccess: false,
    oaStatus: null,
    workType: null,
    language: null,
    isRetracted: false,
    topics: [],
    trendScore: 0,
    publishedAt: null,
    dedupeKey: "d",
    lastSeenAt: 1,
    createdAt: 1,
    orderAt: 1,
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
  spyOn(FeedRepo, "paginateByOrder").mockRestore();
  spyOn(FeedInteractionRepo, "hiddenItemIds").mockRestore();
  spyOn(InterestService, "loadWeights").mockRestore();
});

function stub(page: unknown[], hidden: string[], weights: Map<string, number>) {
  spyOn(FeedRepo, "paginateByOrder").mockResolvedValue({
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
    expect(top.items[0]!.feedItemId).toBe("A");

    stub([A, B], [], weights);
    const foryou = await FeedService.getFeedPaginated(fakeDb, "u", { mode: "foryou" });
    expect(foryou.items[0]!.feedItemId).toBe("B");
  });

  test("item hidden tersaring", async () => {
    stub([A, B], ["A"], new Map());
    const res = await FeedService.getFeedPaginated(fakeDb, "u", { mode: "foryou" });
    expect(res.items.map((i) => i.feedItemId)).toEqual(["B"]);
  });

  test("nextCursor diteruskan dari repo (page boleh menyusut)", async () => {
    spyOn(FeedRepo, "paginateByOrder").mockResolvedValue({
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

describe("bentuk respons feed", () => {
  test("item feed adalah paper + feedItemId, tanpa field mesin", () => {
    const shaped = shapeFeedItem({
      id: "feed_1",
      key: "doi:10.1/a",
      title: "T",
      snippet: null,
      doi: "10.1/a",
      url: null,
      pdfUrl: null,
      hasPdf: false,
      authors: [],
      year: null,
      publicationDate: null,
      venue: null,
      citedByCount: null,
      isOpenAccess: false,
      oaStatus: null,
      workType: null,
      language: null,
      isRetracted: false,
      topics: [],
    });
    expect(Object.keys(shaped).sort()).toEqual(
      [
        "authors",
        "citedByCount",
        "doi",
        "feedItemId",
        "hasPdf",
        "isOpenAccess",
        "isRetracted",
        "key",
        "language",
        "oaStatus",
        "pdfUrl",
        "publicationDate",
        "snippet",
        "title",
        "topics",
        "url",
        "venue",
        "workType",
        "year",
      ].sort(),
    );
  });
});
