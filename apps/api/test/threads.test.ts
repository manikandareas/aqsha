import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { createDb } from "@aqsha/db";

// Mock Clerk token verification: `Bearer tok_<sub>` → { sub }. Token lain → null (401).
mock.module("../src/clients/clerkToken", () => ({
  verifyClerkToken: async (token: string) =>
    token.startsWith("tok_") ? { sub: token.slice(4), email: null } : null,
}));

const DATABASE_URL = process.env.DATABASE_URL;
const itest = DATABASE_URL ? test : test.skip;

const suffix = Math.floor(Math.random() * 1e9);
const OWNER = `user_itest_thr_${suffix}`;
const OTHER = `user_itest_thr_other_${suffix}`;
const SID = `eve:itest-${suffix}`;

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
const get = (path: string, token?: string) => req("GET", path, token);
// biome-ignore lint/suspicious/noExplicitAny: test reads dynamic JSON bodies
function readJson(res: Response): Promise<any> {
  return res.json();
}

async function cleanup() {
  if (!DATABASE_URL) return;
  const { client } = createDb(DATABASE_URL);
  await client`delete from chat_messages where owner_user_id like 'user_itest_thr_%'`;
  await client`delete from chat_threads where owner_user_id like 'user_itest_thr_%'`;
  await client`delete from users where owner_user_id like 'user_itest_thr_%'`;
  await client.end();
}

async function seed() {
  if (!DATABASE_URL) return;
  const { client } = createDb(DATABASE_URL);
  const now = Date.now();
  for (const owner of [OWNER, OTHER]) {
    await client`insert into users (owner_user_id, clerk_user_id, created_at, updated_at)
      values (${owner}, ${owner}, ${now}, ${now}) on conflict do nothing`;
  }
  // Seed langsung (mirror proyeksi hook eve `agent/lib/store.ts`): thread (id == eve
  // session id) milik OWNER + transkrip user+assistant.
  await client`insert into chat_threads
      (id, owner_user_id, status, agent_kind, last_message_preview, last_activity_at, created_at, updated_at)
    values (${SID}, ${OWNER}, 'idle', 'lite', 'Halo! Ada yang bisa kubantu?', ${now}, ${now}, ${now})`;
  await client`insert into chat_messages
      (id, thread_id, owner_user_id, role, text, status, turn_id, created_at)
    values (${`${SID}:t1:user`}, ${SID}, ${OWNER}, 'user', 'Halo Astra', 'complete', 't1', ${now})`;
  await client`insert into chat_messages
      (id, thread_id, owner_user_id, role, text, status, turn_id, created_at)
    values (${`${SID}:t1:0:assistant`}, ${SID}, ${OWNER}, 'assistant', 'Halo! Ada yang bisa kubantu?', 'complete', 't1', ${now + 1})`;
  await client.end();
}

beforeAll(async () => {
  await cleanup();
  await seed();
});
afterAll(cleanup);

describe("api threads — auth + ownership", () => {
  itest("401 tanpa Bearer", async () => {
    const res = await get("/threads");
    expect(res.status).toBe(401);
    expect((await readJson(res)).code).toBe("unauthenticated");
  });

  itest("GET /threads lists owner threads", async () => {
    const body = await readJson(await get("/threads", tok(OWNER)));
    expect(body.items.some((t: { id: string }) => t.id === SID)).toBe(true);
  });

  itest("GET /threads/:id returns row; cross-owner → null", async () => {
    const mine = await readJson(await get(`/threads/${SID}`, tok(OWNER)));
    expect(mine.id).toBe(SID);
    const cross = await get(`/threads/${SID}`, tok(OTHER));
    expect(cross.status).toBe(200);
    const crossText = await cross.text();
    expect(crossText === "" || crossText === "null").toBe(true);
  });

  itest("GET /threads/:id/messages returns chronological transcript", async () => {
    const body = await readJson(await get(`/threads/${SID}/messages`, tok(OWNER)));
    expect(body.items.length).toBe(2);
    expect(body.items[0].role).toBe("user");
    expect(body.items[1].role).toBe("assistant");
  });

  itest("GET messages cross-owner → 404 thread_not_found", async () => {
    const r = await get(`/threads/${SID}/messages`, tok(OTHER));
    expect(r.status).toBe(404);
    expect((await readJson(r)).code).toBe("thread_not_found");
  });

  itest("PATCH rename → title applied; cross-owner → 404", async () => {
    const ok = await req("PATCH", `/threads/${SID}`, tok(OWNER), { title: "Diskusi metode" });
    expect(ok.status).toBe(200);
    const w = await readJson(await get(`/threads/${SID}`, tok(OWNER)));
    expect(w.title).toBe("Diskusi metode");
    expect(w.titleStatus).toBe("ready");

    const hijack = await req("PATCH", `/threads/${SID}`, tok(OTHER), { title: "Hijack" });
    expect(hijack.status).toBe(404);
  });

  itest("DELETE thread → cascade removes messages; cross-owner → 404 first", async () => {
    const hijack = await req("DELETE", `/threads/${SID}`, tok(OTHER));
    expect(hijack.status).toBe(404);

    const del = await req("DELETE", `/threads/${SID}`, tok(OWNER));
    expect(del.status).toBe(200);
    const after = await get(`/threads/${SID}/messages`, tok(OWNER));
    expect(after.status).toBe(404); // thread gone → assertOwner 404
  });
});
