/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.ts");

const OWNER = "owner-paginated";
const IDENTITY = { tokenIdentifier: OWNER, subject: OWNER };
const BASE = 1_700_000_000_000;

type FeedKind = "paper" | "news" | "claim" | "topic" | "idea";

function feedRow(
  seq: number,
  o: {
    kind?: FeedKind;
    title?: string;
    topics?: string[];
    trendScore?: number;
    publishedAt?: number;
    orderAt?: number;
  } = {},
) {
  const orderAt = o.orderAt ?? BASE + seq;
  return {
    kind: o.kind ?? ("news" as const),
    title: o.title ?? `Item ${seq}`,
    summary: `Summary ${seq}`,
    url: `https://example.com/${seq}`,
    provider: "google_news" as const,
    sourceLabel: "Example",
    topics: o.topics ?? [],
    trendScore: o.trendScore ?? 0,
    ...(o.publishedAt !== undefined ? { publishedAt: o.publishedAt } : {}),
    dedupeKey: `feed:${seq}`,
    lastSeenAt: orderAt,
    createdAt: BASE,
    orderAt,
  };
}

async function collectPages(
  t: ReturnType<typeof convexTest>,
  opts: { kinds?: FeedKind[]; numItems?: number } = {},
) {
  const pages: Array<Array<{ _id: string; title: string; kind: string }>> = [];
  let cursor: string | null = null;
  for (let i = 0; i < 25; i += 1) {
    const res = await t.withIdentity(IDENTITY).query(api.feed.getFeedPaginated, {
      paginationOpts: { numItems: opts.numItems ?? 2, cursor },
      ...(opts.kinds ? { kinds: opts.kinds } : {}),
    });
    pages.push(res.page as typeof pages[number]);
    if (res.isDone) break;
    cursor = res.continueCursor;
  }
  return pages;
}

describe("getFeedPaginated", () => {
  it("paginates the cross-kind feed by orderAt without dropping or duplicating items", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      // seq 1..5 → orderAt BASE+1..BASE+5. Mix in items WITHOUT publishedAt to
      // prove they still appear via the non-optional orderAt index.
      for (let seq = 1; seq <= 5; seq += 1) {
        await ctx.db.insert(
          "feedItems",
          feedRow(seq, seq === 4 ? { publishedAt: BASE + 4 } : {}),
        );
      }
    });

    const pages = await collectPages(t, { numItems: 2 });
    const flat = pages.flat();

    // Completeness + no duplicates across the cursor walk.
    const ids = flat.map((item) => item._id);
    expect(new Set(ids).size).toBe(5);
    expect(flat.map((item) => item.title).sort()).toEqual([
      "Item 1",
      "Item 2",
      "Item 3",
      "Item 4",
      "Item 5",
    ]);

    // orderAt-desc pagination: the newest items land on the first page, the
    // oldest on the last — page membership follows orderAt even though items are
    // re-ranked *within* a page.
    const firstPageTitles = pages[0].map((item) => item.title);
    expect(firstPageTitles).toContain("Item 5");
    expect(firstPageTitles).toContain("Item 4");
    const lastPageTitles = pages[pages.length - 1].map((item) => item.title);
    expect(lastPageTitles).toContain("Item 1");
  });

  it("filters by kind across pages", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("feedItems", feedRow(1, { kind: "news", title: "News A" }));
      await ctx.db.insert("feedItems", feedRow(2, { kind: "paper", title: "Paper A" }));
      await ctx.db.insert("feedItems", feedRow(3, { kind: "news", title: "News B" }));
      await ctx.db.insert("feedItems", feedRow(4, { kind: "paper", title: "Paper B" }));
      await ctx.db.insert("feedItems", feedRow(5, { kind: "claim", title: "Claim A" }));
    });

    const papers = (await collectPages(t, { kinds: ["paper"], numItems: 2 })).flat();
    expect(papers.every((item) => item.kind === "paper")).toBe(true);
    expect(papers.map((item) => item.title).sort()).toEqual(["Paper A", "Paper B"]);
  });

  it("excludes hidden items", async () => {
    const t = convexTest(schema, modules);
    const hiddenId = await t.run(async (ctx) => {
      const a = await ctx.db.insert("feedItems", feedRow(1, { title: "Keep A" }));
      const hidden = await ctx.db.insert("feedItems", feedRow(2, { title: "Hidden" }));
      await ctx.db.insert("feedItems", feedRow(3, { title: "Keep B" }));
      await ctx.db.insert("hiddenFeedItems", {
        ownerUserId: OWNER,
        feedItemId: hidden,
        createdAt: BASE,
      });
      void a;
      return hidden;
    });

    const flat = (await collectPages(t, { numItems: 5 })).flat();
    expect(flat.map((item) => item.title).sort()).toEqual(["Keep A", "Keep B"]);
    expect(flat.some((item) => item._id === hiddenId)).toBe(false);
  });

  it("refreshes orderAt on re-upsert so a re-seen no-publishedAt item bubbles up", async () => {
    const t = convexTest(schema, modules);
    // Exercises the real write path (upsertFeedItems), not a direct insert, so a
    // regression dropping orderAt from the patch spread would surface here.
    const newsBase = {
      kind: "news" as const,
      summary: "s",
      provider: "google_news" as const,
      sourceLabel: "Example",
      topics: [] as string[],
      trendScore: 0,
      createdAt: BASE,
    };
    // Anchor: a fixed, newer item the re-seen one must overtake.
    await t.mutation(internal.feed.upsertFeedItems, {
      items: [
        {
          ...newsBase,
          title: "Anchor",
          url: "https://example.com/anchor",
          dedupeKey: "feed:anchor",
          lastSeenAt: BASE + 100,
        },
      ],
    });
    // First sighting: stale lastSeenAt, no publishedAt.
    const first = await t.mutation(internal.feed.upsertFeedItems, {
      items: [
        {
          ...newsBase,
          title: "Reseen",
          url: "https://example.com/reseen",
          dedupeKey: "feed:reseen",
          lastSeenAt: BASE + 50,
        },
      ],
    });
    expect(first.inserted).toBe(1);
    // Re-seen later: lastSeenAt advances, still no publishedAt → orderAt must move.
    const second = await t.mutation(internal.feed.upsertFeedItems, {
      items: [
        {
          ...newsBase,
          title: "Reseen",
          url: "https://example.com/reseen",
          dedupeKey: "feed:reseen",
          lastSeenAt: BASE + 200,
        },
      ],
    });
    expect(second.updated).toBe(1);

    const row = await t.run((ctx) =>
      ctx.db
        .query("feedItems")
        .withIndex("by_dedupe_key", (q) => q.eq("dedupeKey", "feed:reseen"))
        .unique(),
    );
    // Refreshed to the new lastSeenAt, not stranded at the stale BASE + 50.
    expect(row?.orderAt).toBe(BASE + 200);

    // And it now pages ahead of the anchor (orderAt desc).
    const res = await t.withIdentity(IDENTITY).query(api.feed.getFeedPaginated, {
      paginationOpts: { numItems: 2, cursor: null },
    });
    const titles = res.page.map((item) => item.title);
    expect(titles.indexOf("Reseen")).toBeLessThan(titles.indexOf("Anchor"));
  });

  it("re-ranks within a page by interest (best-match first)", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      // Item A has the higher orderAt, so without interest it would sort first.
      await ctx.db.insert(
        "feedItems",
        feedRow(2, { title: "Physics item", topics: ["physics"] }),
      );
      await ctx.db.insert(
        "feedItems",
        feedRow(1, { title: "Medicine item", topics: ["medicine"] }),
      );
      // A strong interest in "medicine" should lift the lower-orderAt item above
      // the newer one within the same page.
      await ctx.db.insert("userFeedInterests", {
        ownerUserId: OWNER,
        topic: "medicine",
        weight: 10,
        updatedAt: BASE,
      });
    });

    const [page] = await collectPages(t, { numItems: 10 });
    expect(page.map((item) => item.title)).toEqual([
      "Medicine item",
      "Physics item",
    ]);
  });
});
