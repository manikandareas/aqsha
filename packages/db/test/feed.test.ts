import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createDb } from "../src/client";
import { decodeKeysetCursor } from "../src/cursor";
import { FeedInteractionRepo } from "../src/repositories/feedInteractionRepo";
import { FeedRepo, mergeBalancedLanes } from "../src/repositories/feedRepo";
import { PaperCacheRepo } from "../src/repositories/paperCacheRepo";
import type { NewExplorePaper } from "../src/schema/explorePapers";
import type { NewFeedItem } from "../src/schema/feedItems";
import { users } from "../src/schema/users";

// Integration: butuh Postgres live (DATABASE_URL). Tanpa env → skip supaya `bun test`
// tetap hijau. Data test di-prefix aman (`itest_feed_*` / `user_itest_feed_*`) + dibersihkan
// di before/afterAll, jadi tak menyentuh data nyata.
const DATABASE_URL = process.env.DATABASE_URL;
const itest = DATABASE_URL ? test : test.skip;

const SUFFIX = Math.floor(Math.random() * 1e9);
const OWNER = `user_itest_feed_${SUFFIX}`;
const DEDUPE = (s: string) => `itest_feed_${SUFFIX}:${s}`;
const PKEY = (s: string) => `itest_feed_${SUFFIX}:paper:${s}`;

const { db, client } = createDb(DATABASE_URL ?? "postgresql://x");

let nextId = 0;
function mkFeed(over: Partial<NewFeedItem> & { dedupeKey: string; orderAt: number }): NewFeedItem {
  const now = 1_700_000_000_000 + nextId++;
  return {
    id: crypto.randomUUID(),
    kind: "paper",
    title: "Untitled",
    summary: "",
    url: "https://example.org",
    provider: "openalex",
    sourceLabel: "OpenAlex",
    topics: [],
    trendScore: 0,
    lastSeenAt: now,
    createdAt: now,
    searchText: "",
    ...over,
  };
}

async function cleanup() {
  if (!DATABASE_URL) return;
  await client`delete from feed_interactions where owner_user_id = ${OWNER}`;
  await client`delete from saved_feed_items where owner_user_id = ${OWNER}`;
  await client`delete from hidden_feed_items where owner_user_id = ${OWNER}`;
  await client`delete from feed_items where dedupe_key like ${`itest_feed_${SUFFIX}:%`}`;
  await client`delete from explore_papers where key like ${`itest_feed_${SUFFIX}:%`}`;
  await client`delete from users where owner_user_id = ${OWNER}`;
}

beforeAll(async () => {
  if (!DATABASE_URL) return;
  await cleanup();
  await db.insert(users).values({
    ownerUserId: OWNER,
    clerkUserId: OWNER,
    createdAt: 1,
    updatedAt: 1,
  });
});
afterAll(async () => {
  await cleanup();
  await client.end();
});

describe("FeedRepo — upsert by dedupe_key", () => {
  itest("re-upsert dedupe yang sama meng-update (bukan duplikat), id preserved", async () => {
    const first = await FeedRepo.upsertByDedupeKey(
      db,
      mkFeed({ dedupeKey: DEDUPE("d1"), orderAt: 100, title: "Versi A", trendScore: 1 }),
    );
    const second = await FeedRepo.upsertByDedupeKey(
      db,
      mkFeed({ dedupeKey: DEDUPE("d1"), orderAt: 100, title: "Versi B", trendScore: 5 }),
    );
    expect(second.id).toBe(first.id); // id baris asli dipertahankan
    expect(second.title).toBe("Versi B");
    expect(second.trendScore).toBe(5);
    const found = await FeedRepo.findByDedupeKey(db, DEDUPE("d1"));
    expect(found?.title).toBe("Versi B");
  });
});

describe("FeedRepo — paginateByOrder keyset", () => {
  itest("urut order_at desc + cursor lanjut tanpa overlap", async () => {
    for (const o of [310, 320, 330]) {
      await FeedRepo.upsertByDedupeKey(db, mkFeed({ dedupeKey: DEDUPE(`p${o}`), orderAt: o }));
    }
    // Hanya item milik suffix ini yang punya orderAt 310..330 (data lain orderAt berbeda).
    const page1 = await FeedRepo.paginateByOrder(db, { limit: 2, cursor: null });
    expect(page1.items.length).toBeGreaterThanOrEqual(2);
    // descending
    for (let i = 1; i < page1.items.length; i++) {
      expect(page1.items[i - 1]!.orderAt).toBeGreaterThanOrEqual(page1.items[i]!.orderAt);
    }
    expect(page1.nextCursor).toBeString();
    const cur = decodeKeysetCursor(page1.nextCursor);
    expect(cur).not.toBeNull();
    const page2 = await FeedRepo.paginateByOrder(db, { limit: 2, cursor: cur });
    const ids1 = new Set(page1.items.map((i) => i.id));
    for (const it of page2.items) expect(ids1.has(it.id)).toBe(false); // no overlap
  });
});

describe("mergeBalancedLanes (pure)", () => {
  test("interleave paper↔news 50/50", () => {
    const r = mergeBalancedLanes(["p1", "p2", "p3", "p4"], ["n1", "n2"], 4);
    expect(r.items).toEqual(["p1", "n1", "p2", "n2"]);
    expect(r.consumedPaper).toBe(2);
    expect(r.consumedNews).toBe(2);
  });
  test("backfill dari lane lain saat satu kosong", () => {
    const r = mergeBalancedLanes(["p1", "p2", "p3"], [], 2);
    expect(r.items).toEqual(["p1", "p2"]);
    expect(r.consumedNews).toBe(0);
  });
  test("kedua kind tetap muncul walau papers minoritas", () => {
    const r = mergeBalancedLanes(["p1"], ["n1", "n2", "n3", "n4"], 4);
    expect(r.items).toContain("p1");
    expect(r.items.filter((x) => x.startsWith("n")).length).toBe(3);
  });
});

describe("FeedRepo — paginateBalanced (paper↔news seimbang)", () => {
  itest("page memuat paper & news walau news jauh lebih baru (fix bug paper hilang)", async () => {
    for (const o of [9000, 9001, 9002, 9003]) {
      await FeedRepo.upsertByDedupeKey(
        db,
        mkFeed({ dedupeKey: DEDUPE(`bn${o}`), orderAt: o, kind: "news", provider: "gdelt" }),
      );
    }
    for (const o of [100, 101, 102, 103]) {
      await FeedRepo.upsertByDedupeKey(db, mkFeed({ dedupeKey: DEDUPE(`bp${o}`), orderAt: o, kind: "paper" }));
    }
    const page = await FeedRepo.paginateBalanced(db, { limit: 4, cursor: null });
    const kinds = new Set(page.items.map((i) => i.kind));
    expect(kinds.has("paper")).toBe(true);
    expect(kinds.has("news")).toBe(true);
  });
});

describe("PaperCacheRepo", () => {
  itest("upsert replace-by-key + getByKey + findByKeys + bump lastSeenAt", async () => {
    const base: NewExplorePaper = {
      key: PKEY("k1"),
      title: "Paper One",
      snippet: "snip",
      url: "https://doi.org/x",
      provider: "OpenAlex",
      sourceLabel: "OpenAlex",
      authors: ["A. Author"],
      topics: ["ml"],
      lastSeenAt: 1000,
    };
    await PaperCacheRepo.upsert(db, base);
    await PaperCacheRepo.upsert(db, { ...base, title: "Paper One v2", lastSeenAt: 2000 });
    const got = await PaperCacheRepo.getByKey(db, PKEY("k1"));
    expect(got?.title).toBe("Paper One v2");
    expect(got?.lastSeenAt).toBe(2000);

    await PaperCacheRepo.upsert(db, { ...base, key: PKEY("k2"), title: "Paper Two" });
    const many = await PaperCacheRepo.findByKeys(db, [PKEY("k1"), PKEY("k2"), PKEY("nope")]);
    expect(many.map((p) => p.key).sort()).toEqual([PKEY("k1"), PKEY("k2")].sort());
  });
});

describe("FeedInteractionRepo — saved/hidden refs", () => {
  itest("insertSaved idempotent + savedRefs membawa paperKey + hiddenItemIds", async () => {
    const paperFeed = await FeedRepo.upsertByDedupeKey(
      db,
      mkFeed({ dedupeKey: DEDUPE("ix1"), orderAt: 500, paperKey: PKEY("k1") }),
    );
    const newsFeed = await FeedRepo.upsertByDedupeKey(
      db,
      mkFeed({ dedupeKey: DEDUPE("ix2"), orderAt: 501, kind: "news", provider: "gdelt" }),
    );

    await FeedInteractionRepo.insertSaved(db, {
      id: crypto.randomUUID(),
      ownerUserId: OWNER,
      feedItemId: paperFeed.id,
      createdAt: 1,
    });
    await FeedInteractionRepo.insertSaved(db, {
      id: crypto.randomUUID(),
      ownerUserId: OWNER,
      feedItemId: paperFeed.id,
      createdAt: 2,
    }); // idempotent (unique owner+item)
    const saved = await FeedInteractionRepo.findSaved(db, OWNER, paperFeed.id);
    expect(saved).not.toBeNull();

    const refs = await FeedInteractionRepo.savedRefs(db, OWNER, null, 100);
    const mine = refs.filter((r) => r.feedItemId === paperFeed.id);
    expect(mine.length).toBe(1); // tidak terduplikasi
    expect(mine[0]!.paperKey).toBe(PKEY("k1"));

    await FeedInteractionRepo.insertHidden(db, {
      id: crypto.randomUUID(),
      ownerUserId: OWNER,
      feedItemId: newsFeed.id,
      createdAt: 1,
    });
    const hidden = await FeedInteractionRepo.hiddenItemIds(db, OWNER, 100);
    expect(hidden).toContain(newsFeed.id);
  });
});

describe("explore_papers literature fields", () => {
  itest("menyimpan dan membaca kembali oaStatus/workType/language/isRetracted", async () => {
    const key = PKEY("lit1");
    await PaperCacheRepo.upsertMany(db, [
      {
        key,
        title: "Paper uji",
        snippet: null,
        url: "https://example.org/a",
        provider: "OpenAlex",
        sourceLabel: "OpenAlex",
        authors: ["A"],
        topics: [],
        oaStatus: "gold",
        workType: "article",
        language: "en",
        isRetracted: true,
        lastSeenAt: Date.now(),
      },
    ]);
    const row = await PaperCacheRepo.getByKey(db, key);
    expect(row?.oaStatus).toBe("gold");
    expect(row?.workType).toBe("article");
    expect(row?.language).toBe("en");
    expect(row?.isRetracted).toBe(true);
    expect(row?.snippet).toBeNull();
  });
});

describe("FeedRepo — news enrichment", () => {
  itest("listNewsNeedingEnrichment menemukan gdelt tanpa articleText; patch mengeluarkannya", async () => {
    const news = await FeedRepo.upsertByDedupeKey(
      db,
      mkFeed({
        dedupeKey: DEDUPE("enrich1"),
        orderAt: 600,
        kind: "news",
        provider: "gdelt",
        publishedAt: 600,
      }),
    );
    const before = await FeedRepo.listNewsNeedingEnrichment(db, 50);
    expect(before.some((t) => t.id === news.id)).toBe(true);

    await FeedRepo.applyEnrichmentPatch(db, news.id, {
      enrichAttempts: 1,
      articleText: "Body artikel ter-ekstrak.",
    });
    const after = await FeedRepo.listNewsNeedingEnrichment(db, 50);
    expect(after.some((t) => t.id === news.id)).toBe(false); // articleText terisi → keluar dari sweep
  });
});

