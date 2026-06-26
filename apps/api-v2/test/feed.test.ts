import { buildFeedItemRow, type FeedItemInput } from "@aqsha/services";
import { createDb, FeedRepo, PaperCacheRepo } from "@aqsha/db";
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";

// Mock Clerk token: `Bearer tok_<sub>` → { sub }. Token lain → null (401).
mock.module("../src/clients/clerkToken", () => ({
  verifyClerkToken: async (token: string) =>
    token.startsWith("tok_") ? { sub: token.slice(4), email: null } : null,
}));

const DATABASE_URL = process.env.DATABASE_URL;
const itest = DATABASE_URL ? test : test.skip;

// Prefix `feedtest_` di luar `user_itest_%`/`arttest_` agar cleanup test lain tak bentrok.
const suffix = Math.floor(Math.random() * 1e9);
const OWNER = `feedtest_${suffix}`;
const DEDUPE = (s: string) => `feedtest_${suffix}:${s}`;

const { app } = await import("../src/index");
const tok = (owner: string) => `tok_${owner}`;
function req(method: string, path: string, token?: string, body?: unknown) {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  return app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}
// biome-ignore lint/suspicious/noExplicitAny: test reads dynamic JSON bodies
function readJson(res: Response): Promise<any> {
  return res.json();
}

const ITEM_A = DEDUPE("a");
const ITEM_B = DEDUPE("b");
const ITEM_C = DEDUPE("c");
const PAPER_KEY = `feedtest_${suffix}:paper`;
let idA = "";
let idB = "";
let idC = "";

function input(dedupeKey: string, over: Partial<FeedItemInput>): FeedItemInput {
  return {
    kind: "paper",
    title: "Item",
    summary: "ringkasan",
    url: "https://example.org",
    provider: "openalex",
    sourceLabel: "OpenAlex",
    topics: ["physics"],
    trendScore: 1,
    dedupeKey,
    ...over,
  };
}

async function cleanup() {
  if (!DATABASE_URL) return;
  const { client } = createDb(DATABASE_URL);
  await client`delete from feed_interactions where owner_user_id = ${OWNER}`;
  await client`delete from saved_feed_items where owner_user_id = ${OWNER}`;
  await client`delete from hidden_feed_items where owner_user_id = ${OWNER}`;
  await client`delete from feed_items where dedupe_key like ${`feedtest_${suffix}:%`}`;
  await client`delete from explore_papers where key like ${`feedtest_${suffix}:%`}`;
  await client`delete from user_feed_interests where owner_user_id = ${OWNER}`;
  await client`delete from users where owner_user_id = ${OWNER}`;
  await client.end();
}

beforeAll(async () => {
  if (!DATABASE_URL) return;
  await cleanup();
  const { db, client } = createDb(DATABASE_URL);
  await client`insert into users (owner_user_id, clerk_user_id, created_at, updated_at) values (${OWNER}, ${OWNER}, 1, 1)`;
  const now = Date.now();
  const a = await FeedRepo.upsertByDedupeKey(db, buildFeedItemRow(input(ITEM_A, { title: "Alpha", publishedAt: now - 1000 }), now));
  const b = await FeedRepo.upsertByDedupeKey(db, buildFeedItemRow(input(ITEM_B, { title: "Beta", publishedAt: now }), now));
  const c = await FeedRepo.upsertByDedupeKey(
    db,
    buildFeedItemRow(input(ITEM_C, { title: "Gamma", publishedAt: now - 500, topics: ["physics"] }), now),
  );
  idA = a.id;
  idB = b.id;
  idC = c.id;
  await PaperCacheRepo.upsert(db, {
    key: PAPER_KEY,
    title: "Cached Paper",
    snippet: "snip",
    url: "https://example.org/p",
    provider: "OpenAlex",
    sourceLabel: "OpenAlex",
    authors: ["A"],
    topics: ["physics"],
    year: 2024,
    citedByCount: 9,
    lastSeenAt: now,
  });
  await client.end();
});
afterAll(cleanup);

describe("api-v2 feed routes", () => {
  itest("GET /feed tanpa token → 401", async () => {
    const r = await req("GET", "/feed");
    expect(r.status).toBe(401);
  });

  itest("GET /feed mengembalikan item ter-seed (foryou)", async () => {
    const r = await req("GET", "/feed?mode=foryou&limit=40", tok(OWNER));
    expect(r.status).toBe(200);
    const body = await readJson(r);
    const ids = body.items.map((i: { _id: string }) => i._id);
    expect(ids).toContain(idA);
    expect(ids).toContain(idB);
  });

  itest("GET /feed/:id ada → 200, tak ada → 404", async () => {
    const ok = await req("GET", `/feed/${idA}`, tok(OWNER));
    expect(ok.status).toBe(200);
    const missing = await req("GET", "/feed/00000000-0000-0000-0000-000000000000", tok(OWNER));
    expect(missing.status).toBe(404);
  });

  itest("POST /feed/discovery/hide → item hilang dari /feed", async () => {
    const h = await req("POST", "/feed/discovery/hide", tok(OWNER), {
      itemRef: { kind: "feed", feedItemId: idA },
    });
    expect(h.status).toBe(200);
    expect(await readJson(h)).toEqual({ ok: true });

    const r = await req("GET", "/feed?mode=foryou&limit=40", tok(OWNER));
    const ids = (await readJson(r)).items.map((i: { _id: string }) => i._id);
    expect(ids).not.toContain(idA);
    expect(ids).toContain(idB);
  });

  itest("POST /feed/discovery/save → muncul di /feed/saved-refs", async () => {
    const s = await req("POST", "/feed/discovery/save", tok(OWNER), {
      itemRef: { kind: "feed", feedItemId: idB },
    });
    expect(s.status).toBe(200);
    expect(await readJson(s)).toEqual({ saved: true });

    const refsRes = await req("GET", "/feed/saved-refs?limit=200", tok(OWNER));
    const refs = (await readJson(refsRes)).refs as Array<{ kind: string; feedItemId?: string }>;
    expect(refs.some((ref) => ref.kind === "feed" && ref.feedItemId === idB)).toBe(true);
  });

  itest("POST /feed/discovery/save paper key tak ada → saved:false", async () => {
    const s = await req("POST", "/feed/discovery/save", tok(OWNER), {
      itemRef: { kind: "paper", paperKey: `feedtest_${suffix}:missing` },
    });
    expect(s.status).toBe(200);
    expect(await readJson(s)).toEqual({ saved: false });
  });

  itest("GET /feed/:id/related → same-kind, exclude self + hidden", async () => {
    // idA di-hide di test sebelumnya → related(idB) hanya berisi idC (paper, tak hidden).
    const r = await req("GET", `/feed/${idB}/related`, tok(OWNER));
    expect(r.status).toBe(200);
    const ids = (await readJson(r)).items.map((i: { _id: string }) => i._id);
    expect(ids).toContain(idC);
    expect(ids).not.toContain(idB); // exclude self
    expect(ids).not.toContain(idA); // hidden
  });

  itest("GET /feed/search (tsvector) → match judul; q kosong → kosong", async () => {
    const r = await req("GET", "/feed/search?q=gamma&limit=40", tok(OWNER));
    expect(r.status).toBe(200);
    const ids = (await readJson(r)).items.map((i: { _id: string }) => i._id);
    expect(ids).toContain(idC); // judul "Gamma" → match

    const empty = await req("GET", "/feed/search?q=%20%20", tok(OWNER));
    expect(empty.status).toBe(200);
    const emptyBody = await readJson(empty);
    expect(emptyBody.items).toEqual([]);
    expect(emptyBody.nextCursor).toBeNull();
  });

  itest("GET /papers/:key cache-only (fetchOnMiss=false) → paper ter-cache", async () => {
    const r = await req(
      "GET",
      `/papers/${encodeURIComponent(PAPER_KEY)}?fetchOnMiss=false`,
      tok(OWNER),
    );
    expect(r.status).toBe(200);
    const paper = await readJson(r);
    expect(paper?.key).toBe(PAPER_KEY);
    expect(paper?.title).toBe("Cached Paper");
  });
});
