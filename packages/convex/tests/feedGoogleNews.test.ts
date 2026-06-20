/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { buildGoogleNewsFeedItems } from "../convex/feed/providers/googleNews";

const modules = import.meta.glob("../convex/**/*.ts");

describe("Google News feed lane (upsert + enrichment)", () => {
  it("upserts google_news items, then enriches with resolvedUrl + body", async () => {
    const t = convexTest(schema, modules);
    const now = 1_700_000_000_000;

    const items = buildGoogleNewsFeedItems(
      [
        {
          item: {
            title: "Uji vaksin fase tiga",
            redirectUrl: "https://news.google.com/rss/articles/CBMiAAAA?oc=5",
            guid: "CBMiAAAA",
            publisherName: "Kompas",
            publisherDomain: "kompas.com",
            pubDate: now,
          },
          topicLabel: "Kesehatan",
        },
      ],
      now,
    );

    // The new google_news provider literal + resolvedUrl field validate through
    // the upsert mutation (additive schema change).
    const result = await t.mutation(internal.feed.upsertFeedItems, { items });
    expect(result.inserted).toBe(1);

    const before = await t.query(
      internal.feed.sources.googleNewsItemsNeedingEnrichment,
      { limit: 10 },
    );
    expect(before).toHaveLength(1);
    expect(before[0].hasSummary).toBe(false);

    // Google News rows ingest with a blank summary, so searchText starts as
    // title + topics only — the body lead is not yet searchable.
    const initialRow = await t.run((ctx) =>
      ctx.db.get("feedItems", before[0].feedItemId),
    );
    expect(initialRow?.searchText).toContain("vaksin");
    expect(initialRow?.searchText ?? "").not.toContain("peneliti");

    const resolvedUrl = "https://www.kompas.com/sains/read/uji-vaksin";
    const body = "Para peneliti memulai uji klinis fase tiga di Jakarta. ".repeat(8);
    const patchResult = await t.mutation(
      internal.feed.sources.patchGoogleNewsEnrichment,
      {
        patches: [
          {
            feedItemId: before[0].feedItemId,
            resolvedUrl,
            articleText: body,
            summary: "Para peneliti memulai uji klinis fase tiga.",
            tldr: "Para peneliti memulai uji klinis fase tiga.",
          },
        ],
      },
    );
    expect(patchResult.patched).toBe(1);

    // Once articleText is set, the item is no longer a candidate for enrichment.
    const after = await t.query(
      internal.feed.sources.googleNewsItemsNeedingEnrichment,
      { limit: 10 },
    );
    expect(after).toHaveLength(0);

    const row = await t.run((ctx) =>
      ctx.db.get("feedItems", before[0].feedItemId),
    );
    expect(row?.provider).toBe("google_news");
    expect(row?.resolvedUrl).toBe(resolvedUrl);
    expect((row?.articleText ?? "").length).toBeGreaterThan(0);
    expect(row?.summary).toBe("Para peneliti memulai uji klinis fase tiga.");
    // searchText is recomputed from the now-filled summary so the enriched body
    // lead becomes searchable via the search_text index.
    expect(row?.searchText).toContain("peneliti");
    expect(row?.searchText).toContain("klinis");
  });

  it("converges: a body-less item drops out after MAX_ENRICH_ATTEMPTS attempts", async () => {
    const t = convexTest(schema, modules);
    const now = 1_700_000_000_000;
    const items = buildGoogleNewsFeedItems(
      [
        {
          item: {
            title: "Tak bisa di-decode",
            redirectUrl: "https://news.google.com/rss/articles/CBMiZZZ?oc=5",
            guid: "CBMiZZZ",
            publisherName: "Antara",
            publisherDomain: "antaranews.com",
            pubDate: now,
          },
          topicLabel: "Sains",
        },
      ],
      now,
    );
    await t.mutation(internal.feed.upsertFeedItems, { items });

    const targets = await t.query(
      internal.feed.sources.googleNewsItemsNeedingEnrichment,
      { limit: 10 },
    );
    expect(targets).toHaveLength(1);
    const feedItemId = targets[0].feedItemId;

    // Simulate resolve-failure attempts (no body) — only the attempt is recorded.
    await t.mutation(internal.feed.sources.patchGoogleNewsEnrichment, {
      patches: [{ feedItemId }],
    });
    // After 1 attempt it is still a candidate (MAX_ENRICH_ATTEMPTS = 2).
    expect(
      await t.query(internal.feed.sources.googleNewsItemsNeedingEnrichment, {
        limit: 10,
      }),
    ).toHaveLength(1);

    await t.mutation(internal.feed.sources.patchGoogleNewsEnrichment, {
      patches: [{ feedItemId }],
    });
    // After the 2nd attempt it converges out of the sweep (no endless retries).
    expect(
      await t.query(internal.feed.sources.googleNewsItemsNeedingEnrichment, {
        limit: 10,
      }),
    ).toHaveLength(0);
  });
});
