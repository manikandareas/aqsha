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
const SID = `astra:itest-${suffix}`;

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
  // Seed langsung (mirror proyeksi tipis `threadProjectionProcessor` Mastra): baris metadata
  // `chat_threads` milik OWNER. Isi pesan = Mastra Memory (`mastra_*`), tak di-seed di sini.
  await client`insert into chat_threads
      (id, owner_user_id, status, agent_kind, last_message_preview, last_activity_at, created_at, updated_at)
    values (${SID}, ${OWNER}, 'idle', 'lite', 'Halo! Ada yang bisa kubantu?', ${now}, ${now}, ${now})`;
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

  itest("PATCH rename → title applied; cross-owner → 404", async () => {
    const ok = await req("PATCH", `/threads/${SID}`, tok(OWNER), { title: "Diskusi metode" });
    expect(ok.status).toBe(200);
    const w = await readJson(await get(`/threads/${SID}`, tok(OWNER)));
    expect(w.title).toBe("Diskusi metode");
    expect(w.titleStatus).toBe("ready");

    const hijack = await req("PATCH", `/threads/${SID}`, tok(OTHER), { title: "Hijack" });
    expect(hijack.status).toBe(404);
  });

  itest("DELETE thread → row gone; cross-owner → 404 first", async () => {
    const hijack = await req("DELETE", `/threads/${SID}`, tok(OTHER));
    expect(hijack.status).toBe(404);

    const del = await req("DELETE", `/threads/${SID}`, tok(OWNER));
    expect(del.status).toBe(200);
    // Thread hilang → GET detail mengembalikan null.
    const after = await get(`/threads/${SID}`, tok(OWNER));
    expect(after.status).toBe(200);
    const afterText = await after.text();
    expect(afterText === "" || afterText === "null").toBe(true);
  });
});

describe("api threads — pin/sematkan", () => {
  const PID = `astra:itest-pin-${suffix}`;

  beforeAll(async () => {
    if (!DATABASE_URL) return;
    const { client } = createDb(DATABASE_URL);
    const now = Date.now();
    await client`insert into chat_threads
        (id, owner_user_id, status, agent_kind, last_activity_at, created_at, updated_at)
      values (${PID}, ${OWNER}, 'idle', 'lite', ${now}, ${now}, ${now})
      on conflict (id) do nothing`;
    await client.end();
  });

  itest("pin → keluar list utama, muncul di grup pinned", async () => {
    const res = await req("PATCH", `/threads/${PID}/pin`, tok(OWNER), { pinned: true });
    expect(res.status).toBe(200);
    expect((await readJson(res)).pinnedAt).toBeGreaterThan(0);

    const pinned = await readJson(await get("/threads/pinned", tok(OWNER)));
    expect(pinned.items.some((t: { id: string }) => t.id === PID)).toBe(true);

    const list = await readJson(await get("/threads", tok(OWNER)));
    expect(list.items.some((t: { id: string }) => t.id === PID)).toBe(false);
  });

  itest("unpin → balik ke list utama, hilang dari pinned", async () => {
    const res = await req("PATCH", `/threads/${PID}/pin`, tok(OWNER), { pinned: false });
    expect(res.status).toBe(200);
    expect((await readJson(res)).pinnedAt).toBeNull();

    const pinned = await readJson(await get("/threads/pinned", tok(OWNER)));
    expect(pinned.items.some((t: { id: string }) => t.id === PID)).toBe(false);
    const list = await readJson(await get("/threads", tok(OWNER)));
    expect(list.items.some((t: { id: string }) => t.id === PID)).toBe(true);
  });

  itest("cross-owner pin → 404", async () => {
    const res = await req("PATCH", `/threads/${PID}/pin`, tok(OTHER), { pinned: true });
    expect(res.status).toBe(404);
  });

  itest("soft-cap 10 → pin ke-11 ditolak (pin_limit_reached)", async () => {
    if (!DATABASE_URL) return;
    const { client } = createDb(DATABASE_URL);
    const now = Date.now();
    // 10 thread sudah tersemat langsung di DB (bypass API) → cap tercapai.
    for (let i = 0; i < 10; i++) {
      const id = `astra:itest-cap-${suffix}-${i}`;
      await client`insert into chat_threads
          (id, owner_user_id, status, agent_kind, last_activity_at, pinned_at, created_at, updated_at)
        values (${id}, ${OWNER}, 'idle', 'lite', ${now}, ${now + i}, ${now}, ${now})
        on conflict (id) do nothing`;
    }
    const capId = `astra:itest-cap-${suffix}-extra`;
    await client`insert into chat_threads
        (id, owner_user_id, status, agent_kind, last_activity_at, created_at, updated_at)
      values (${capId}, ${OWNER}, 'idle', 'lite', ${now}, ${now}, ${now})
      on conflict (id) do nothing`;
    await client.end();

    const res = await req("PATCH", `/threads/${capId}/pin`, tok(OWNER), { pinned: true });
    expect(res.status).toBe(400);
    expect((await readJson(res)).code).toBe("pin_limit_reached");
  });
});
