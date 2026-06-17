/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { seedFeedInterests } from "../convex/feed/interests";
import {
  INTEREST_FIELD_TOPICS,
  isInterestFieldId,
  normalizeInterestTopic,
  topicsForInterestFields,
} from "../convex/feed/interestKeywords";

const modules = import.meta.glob("../convex/**/*.ts");

describe("interest taxonomy (interestKeywords)", () => {
  it("maps every field id to at least one non-empty topic", () => {
    const ids = Object.keys(INTEREST_FIELD_TOPICS);
    expect(ids.length).toBe(15);
    for (const id of ids) {
      const topics = INTEREST_FIELD_TOPICS[id];
      expect(topics.length).toBeGreaterThan(0);
      for (const topic of topics) {
        // Stored values are already the normalized form (lowercase-trimmed) so
        // the feed's lowercase-exact interestMatch picks them up directly.
        expect(topic).toBe(normalizeInterestTopic(topic));
        expect(topic.length).toBeGreaterThan(0);
      }
      expect(isInterestFieldId(id)).toBe(true);
    }
  });

  it("rejects unknown field ids", () => {
    expect(isInterestFieldId("not_a_field")).toBe(false);
    expect(isInterestFieldId("")).toBe(false);
  });

  it("flattens picked fields into normalized, de-duplicated topics and drops unknown ids", () => {
    const topics = topicsForInterestFields([
      "ai_cs",
      "kesehatan",
      "ai_cs", // duplicate field → no duplicate topics
      "not_a_field", // unknown → dropped
    ]);
    expect(topics).toEqual([
      "artificial intelligence",
      "machine learning",
      "computer science",
      "medicine",
      "health",
    ]);
  });
});

describe("seedFeedInterests normalization", () => {
  it("stores lowercase-trimmed topics and dedupes case-insensitively", async () => {
    const t = convexTest(schema, modules);
    const owner = "user:seed";
    await t.run(async (ctx) => {
      await seedFeedInterests(
        ctx,
        owner,
        ["Machine Learning", "  Medicine  ", "machine learning", "  "],
        2,
      );
    });

    const rows = await t.run(async (ctx) =>
      ctx.db
        .query("userFeedInterests")
        .withIndex("by_owner_topic", (q) => q.eq("ownerUserId", owner))
        .collect(),
    );
    const topics = rows.map((row) => row.topic).sort();
    expect(topics).toEqual(["machine learning", "medicine"]);
    for (const row of rows) {
      expect(row.topic).toBe(normalizeInterestTopic(row.topic));
      expect(row.weight).toBe(2);
    }
  });

  it("raises weight idempotently without stacking", async () => {
    const t = convexTest(schema, modules);
    const owner = "user:idem";
    await t.run(async (ctx) => {
      await seedFeedInterests(ctx, owner, ["physics"], 2);
      await seedFeedInterests(ctx, owner, ["physics"], 5);
      await seedFeedInterests(ctx, owner, ["physics"], 3); // lower → no change
    });
    const rows = await t.run(async (ctx) =>
      ctx.db
        .query("userFeedInterests")
        .withIndex("by_owner_topic", (q) => q.eq("ownerUserId", owner))
        .collect(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].weight).toBe(5);
  });
});

describe("userInterestTopics", () => {
  it("returns positive-weight topics by weight desc, respecting the limit", async () => {
    const t = convexTest(schema, modules);
    const owner = "user:top";
    const now = 1_700_000_000_000;
    await t.run(async (ctx) => {
      await ctx.db.insert("userFeedInterests", {
        ownerUserId: owner,
        topic: "machine learning",
        weight: 5,
        updatedAt: now,
      });
      await ctx.db.insert("userFeedInterests", {
        ownerUserId: owner,
        topic: "medicine",
        weight: 9,
        updatedAt: now,
      });
      await ctx.db.insert("userFeedInterests", {
        ownerUserId: owner,
        topic: "physics",
        weight: 1,
        updatedAt: now,
      });
      // Non-positive weights are excluded (hidden/decayed signal).
      await ctx.db.insert("userFeedInterests", {
        ownerUserId: owner,
        topic: "law",
        weight: 0,
        updatedAt: now,
      });
      // A different owner's interests must not leak in.
      await ctx.db.insert("userFeedInterests", {
        ownerUserId: "user:other",
        topic: "chemistry",
        weight: 99,
        updatedAt: now,
      });
    });

    const top2 = await t.query(internal.feed.userInterestTopics, {
      ownerUserId: owner,
      limit: 2,
    });
    expect(top2).toEqual(["medicine", "machine learning"]);

    const all = await t.query(internal.feed.userInterestTopics, {
      ownerUserId: owner,
    });
    expect(all).toEqual(["medicine", "machine learning", "physics"]);
  });

  it("returns an empty list for a user with no interests (cold start)", async () => {
    const t = convexTest(schema, modules);
    const topics = await t.query(internal.feed.userInterestTopics, {
      ownerUserId: "user:cold",
    });
    expect(topics).toEqual([]);
  });

  it("normalizes topics on read and collapses case variants to the top weight", async () => {
    const t = convexTest(schema, modules);
    const owner = "user:variants";
    const now = 1_700_000_000_000;
    await t.run(async (ctx) => {
      // A case-variant pair (e.g. a GDELT topic-lane bump "Machine Learning" vs a
      // seeded "machine learning"): they must collapse to one normalized topic,
      // keeping the higher weight, not surface a mixed-case provider query.
      await ctx.db.insert("userFeedInterests", {
        ownerUserId: owner,
        topic: "Machine Learning",
        weight: 3,
        updatedAt: now,
      });
      await ctx.db.insert("userFeedInterests", {
        ownerUserId: owner,
        topic: "machine learning",
        weight: 7,
        updatedAt: now,
      });
      await ctx.db.insert("userFeedInterests", {
        ownerUserId: owner,
        topic: "  Medicine  ",
        weight: 5,
        updatedAt: now,
      });
    });

    const topics = await t.query(internal.feed.userInterestTopics, {
      ownerUserId: owner,
    });
    // "machine learning" (collapsed, weight 7) ranks above "medicine" (5); no
    // duplicate, no leading/trailing whitespace, all lowercase.
    expect(topics).toEqual(["machine learning", "medicine"]);
  });
});
