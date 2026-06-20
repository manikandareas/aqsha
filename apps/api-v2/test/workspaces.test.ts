import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { createDb } from "@aqsha/db";

// Mock Clerk token verification: `Bearer tok_<sub>` → { sub }. Token lain → null (401).
mock.module("../src/clients/clerkToken", () => ({
  verifyClerkToken: async (token: string) =>
    token.startsWith("tok_") ? { sub: token.slice(4), email: null } : null,
}));

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;
const itest = DATABASE_URL ? test : test.skip;
// Rate-limit butuh Redis live; tanpa REDIS_URL macro fail-open (tak ada 429) → skip.
const rltest = DATABASE_URL && REDIS_URL ? test : test.skip;

const suffix = Math.floor(Math.random() * 1e9);
const OWNER_CRUD = `user_itest_ws_crud_${suffix}`;
const OWNER_FREE = `user_itest_ws_free_${suffix}`;
const OWNER_RL = `user_itest_ws_rl_${suffix}`;
// Nama-validation memakai owner tersendiri: rate-limit `workspaces:create` (3/jam)
// dikonsumsi SEBELUM validasi, jadi attempt invalid tak boleh memakan budget owner CRUD.
const OWNER_NAME = `user_itest_ws_name_${suffix}`;

// CRUD + rate-limit owner di-admin-kan (unlimited) supaya capacity tak mengganggu;
// rate-limit (3/jam) tetap berlaku lintas plan.
process.env.AQSHA_ADMIN_OWNER_USER_IDS = `${OWNER_CRUD},${OWNER_RL}`;

// Import app SETELAH mock.module + set env supaya authMacro/plan memakai nilai ini.
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
  await client`delete from workspace_folders where owner_user_id like 'user_itest_ws_%'`;
  await client`delete from workspaces where owner_user_id like 'user_itest_ws_%'`;
  await client`delete from user_onboarding where owner_user_id like 'user_itest_ws_%'`;
  await client`delete from user_feed_interests where owner_user_id like 'user_itest_ws_%'`;
  await client`delete from users where owner_user_id like 'user_itest_ws_%'`;
  await client.end();
}

beforeAll(cleanup);
afterAll(cleanup);

describe("api-v2 workspaces — auth + ownership", () => {
  itest("401 tanpa Bearer", async () => {
    const res = await get("/workspaces");
    expect(res.status).toBe(401);
    expect((await readJson(res)).code).toBe("unauthenticated");
  });
});

describe("api-v2 workspaces — CRUD round-trip (admin owner, no capacity cap)", () => {
  const created: string[] = [];

  itest("sync provisions default workspace", async () => {
    const r = await req("POST", "/users/me/sync", tok(OWNER_CRUD));
    expect(r.status).toBe(200);
  });

  itest("POST /workspaces creates (×3 under rate cap)", async () => {
    for (const name of ["Riset A", "Riset B", "Riset C"]) {
      const r = await req("POST", "/workspaces", tok(OWNER_CRUD), { name });
      expect(r.status).toBe(200);
      const { id } = await readJson(r);
      expect(id).toBeString();
      created.push(id);
    }
  });

  itest("name validation: empty → name_required, >120 → name_too_long", async () => {
    // OWNER_NAME terpisah: validasi nama throw SEBELUM capacity/insert (user tak perlu ter-sync).
    expect((await req("POST", "/workspaces", tok(OWNER_NAME), { name: "   " })).status).toBe(400);
    const long = await req("POST", "/workspaces", tok(OWNER_NAME), { name: "x".repeat(121) });
    expect((await readJson(long)).code).toBe("name_too_long");
  });

  itest("GET /workspaces keyset pagination (limit=1) walks all 4 active", async () => {
    const ids: string[] = [];
    let cursor: string | null = null;
    let guard = 0;
    do {
      const q = `/workspaces?limit=1${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const body = await readJson(await get(q, tok(OWNER_CRUD)));
      expect(body.items.length).toBeLessThanOrEqual(1);
      for (const w of body.items) ids.push(w.id);
      cursor = body.nextCursor;
      guard += 1;
    } while (cursor && guard < 20);
    // 1 default + 3 created, semua unik
    expect(new Set(ids).size).toBe(4);
    for (const id of created) expect(ids).toContain(id);
  });

  itest("GET /workspaces/:id returns row; cross-owner → null", async () => {
    const mine = await readJson(await get(`/workspaces/${created[0]}`, tok(OWNER_CRUD)));
    expect(mine.id).toBe(created[0]);
    // owner lain (free) belum tentu ter-sync; soft ownership tetap null.
    // Elysia mengirim body kosong untuk return `null` → assert via text (bukan .json()).
    await req("POST", "/users/me/sync", tok(OWNER_FREE));
    const cross = await get(`/workspaces/${created[0]}`, tok(OWNER_FREE));
    expect(cross.status).toBe(200);
    const crossText = await cross.text();
    expect(crossText === "" || crossText === "null").toBe(true);
  });

  itest("PATCH /workspaces/:id rename + emoji", async () => {
    const ok = await req("PATCH", `/workspaces/${created[0]}`, tok(OWNER_CRUD), {
      name: "Riset Utama",
      emoji: "🚀",
    });
    expect(ok.status).toBe(200);
    const w = await readJson(await get(`/workspaces/${created[0]}`, tok(OWNER_CRUD)));
    expect(w.name).toBe("Riset Utama");
    expect(w.emoji).toBe("🚀");
  });

  itest("PATCH invalid emoji → 400 workspace_emoji_invalid", async () => {
    const r = await req("PATCH", `/workspaces/${created[0]}`, tok(OWNER_CRUD), { emoji: "ab" });
    expect(r.status).toBe(400);
    expect((await readJson(r)).code).toBe("workspace_emoji_invalid");
  });

  itest("PATCH no fields → 400 bad_request", async () => {
    const r = await req("PATCH", `/workspaces/${created[0]}`, tok(OWNER_CRUD), {});
    expect(r.status).toBe(400);
    expect((await readJson(r)).code).toBe("bad_request");
  });

  itest("PATCH cross-owner → 404 workspace_not_found", async () => {
    const r = await req("PATCH", `/workspaces/${created[0]}`, tok(OWNER_FREE), { name: "Hijack" });
    expect(r.status).toBe(404);
    expect((await readJson(r)).code).toBe("workspace_not_found");
  });

  itest("archive idempotent + includeArchived filter", async () => {
    const a1 = await req("POST", `/workspaces/${created[2]}/archive`, tok(OWNER_CRUD));
    expect(a1.status).toBe(200);
    const a2 = await req("POST", `/workspaces/${created[2]}/archive`, tok(OWNER_CRUD));
    expect(a2.status).toBe(200); // idempotent

    const active = await readJson(await get("/workspaces?limit=100", tok(OWNER_CRUD)));
    expect(active.items.some((w: { id: string }) => w.id === created[2])).toBe(false);
    const all = await readJson(
      await get("/workspaces?limit=100&includeArchived=true", tok(OWNER_CRUD)),
    );
    expect(all.items.some((w: { id: string }) => w.id === created[2])).toBe(true);
  });

  itest("folders: create/list/dedupe/rename/move/remove", async () => {
    const wsA = created[0];
    const wsB = created[1];

    // create
    const f1 = await req("POST", `/workspaces/${wsA}/folders`, tok(OWNER_CRUD), { name: "Bab 1" });
    expect(f1.status).toBe(200);
    const folderId = (await readJson(f1)).id;

    // dedupe aktif
    const dup = await req("POST", `/workspaces/${wsA}/folders`, tok(OWNER_CRUD), { name: "Bab 1" });
    expect(dup.status).toBe(409);
    expect((await readJson(dup)).code).toBe("folder_name_exists");

    // list
    const list = await readJson(await get(`/workspaces/${wsA}/folders`, tok(OWNER_CRUD)));
    expect(list.items.some((f: { id: string }) => f.id === folderId)).toBe(true);

    // rename
    const rn = await req("PATCH", `/folders/${folderId}`, tok(OWNER_CRUD), { name: "Bab Satu" });
    expect(rn.status).toBe(200);

    // create folder di workspace yang di-archive → 409 workspace_archived
    const arch = await req("POST", `/workspaces/${created[2]}/folders`, tok(OWNER_CRUD), {
      name: "Nope",
    });
    expect(arch.status).toBe(409);
    expect((await readJson(arch)).code).toBe("workspace_archived");

    // move ke workspace B (kosong) → ok
    const mv = await req("POST", `/folders/${folderId}/move`, tok(OWNER_CRUD), {
      targetWorkspaceId: wsB,
    });
    expect(mv.status).toBe(200);
    const inB = await readJson(await get(`/workspaces/${wsB}/folders`, tok(OWNER_CRUD)));
    expect(inB.items.some((f: { id: string }) => f.id === folderId)).toBe(true);

    // move dup: buat folder nama sama di A lalu move ke B (sudah ada di B) → 409
    const sameInA = await req("POST", `/workspaces/${wsA}/folders`, tok(OWNER_CRUD), {
      name: "Bab Satu",
    });
    const sameId = (await readJson(sameInA)).id;
    const mvDup = await req("POST", `/folders/${sameId}/move`, tok(OWNER_CRUD), {
      targetWorkspaceId: wsB,
    });
    expect(mvDup.status).toBe(409);
    expect((await readJson(mvDup)).code).toBe("folder_name_exists");

    // remove (soft) → 200; lalu hilang dari list
    const rm = await req("DELETE", `/folders/${folderId}`, tok(OWNER_CRUD));
    expect(rm.status).toBe(200);
    const afterRm = await readJson(await get(`/workspaces/${wsB}/folders`, tok(OWNER_CRUD)));
    expect(afterRm.items.some((f: { id: string }) => f.id === folderId)).toBe(false);

    // op pada folder tak dikenal → 404 folder_not_found
    const ghost = await req("PATCH", "/folders/missing-id", tok(OWNER_CRUD), { name: "X" });
    expect(ghost.status).toBe(404);
    expect((await readJson(ghost)).code).toBe("folder_not_found");
  });
});

describe("api-v2 workspaces — capacity (free plan)", () => {
  itest("free owner at cap (default ws) → POST 403 workspace_limit_reached", async () => {
    await req("POST", "/users/me/sync", tok(OWNER_FREE)); // idempotent: default ws = 1, free cap = 1
    const r = await req("POST", "/workspaces", tok(OWNER_FREE), { name: "Kelebihan" });
    expect(r.status).toBe(403);
    expect((await readJson(r)).code).toBe("workspace_limit_reached");
  });
});

describe("api-v2 workspaces — rate limit (3/jam)", () => {
  rltest("4th create within the hour → 429 rate_limited + retryAt", async () => {
    await req("POST", "/users/me/sync", tok(OWNER_RL));
    for (let i = 0; i < 3; i++) {
      const r = await req("POST", "/workspaces", tok(OWNER_RL), { name: `RL ${i}` });
      expect(r.status).toBe(200);
    }
    const limited = await req("POST", "/workspaces", tok(OWNER_RL), { name: "RL over" });
    expect(limited.status).toBe(429);
    const body = await readJson(limited);
    expect(body.code).toBe("rate_limited");
    expect(typeof body.retryAt).toBe("number");
    expect(body.retryAt).toBeGreaterThan(Date.now());
  });
});
