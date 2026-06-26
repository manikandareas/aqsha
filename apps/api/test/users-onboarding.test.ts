import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { createDb } from "@aqsha/db";

// Mock Clerk token verification: `Bearer tok_<sub>` → { sub }. Token lain → null (401).
mock.module("../src/clients/clerkToken", () => ({
  verifyClerkToken: async (token: string) =>
    token.startsWith("tok_") ? { sub: token.slice(4), email: null } : null,
}));

// Import app SETELAH mock.module supaya authMacro memakai verifyClerkToken yang di-mock.
const { app } = await import("../src/index");

// Butuh Postgres live; tanpa DATABASE_URL test di-skip supaya `bun test` hijau.
const DATABASE_URL = process.env.DATABASE_URL;
const itest = DATABASE_URL ? test : test.skip;

const OWNER = `user_itest_${Math.floor(Math.random() * 1e9)}`;
const TOKEN = `tok_${OWNER}`;

function get(path: string, token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  return app.handle(new Request(`http://localhost${path}`, { method: "GET", headers }));
}
function send(method: string, path: string, token?: string, body?: unknown) {
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

async function cleanup() {
  if (!DATABASE_URL) return;
  const { client } = createDb(DATABASE_URL);
  await client`delete from user_feed_interests where owner_user_id like 'user_itest_%'`;
  await client`delete from user_onboarding where owner_user_id like 'user_itest_%'`;
  await client`delete from workspaces where owner_user_id like 'user_itest_%'`;
  await client`delete from users where owner_user_id like 'user_itest_%'`;
  await client.end();
}

beforeAll(cleanup);
afterAll(cleanup);

// Response.json() bertipe unknown di strict mode; helper kecil agar test ringkas.
// biome-ignore lint/suspicious/noExplicitAny: test reads dynamic JSON bodies
function readJson(res: Response): Promise<any> {
  return res.json();
}

describe("api auth + users + onboarding", () => {
  itest("401 tanpa Bearer", async () => {
    const res = await get("/users/me");
    expect(res.status).toBe(401);
    expect((await readJson(res)).code).toBe("unauthenticated");
  });

  itest("GET /users/me sebelum sync → 409 user_not_synced", async () => {
    const res = await get("/users/me", TOKEN);
    expect(res.status).toBe(409);
    expect((await readJson(res)).code).toBe("user_not_synced");
  });

  itest("POST /users/me/sync insert users + default workspace, idempotent", async () => {
    const r1 = await send("POST", "/users/me/sync", TOKEN);
    expect(r1.status).toBe(200);
    expect(await readJson(r1)).toEqual({ id: OWNER, clerkUserId: OWNER });

    await send("POST", "/users/me/sync", TOKEN); // panggilan kedua

    const { client } = createDb(DATABASE_URL!);
    const rows = await client`select count(*)::int as n from workspaces where owner_user_id=${OWNER}`;
    expect(rows[0]!.n).toBe(1); // workspace dibuat sekali
    await client.end();
  });

  itest("GET /users/me setelah sync → profile", async () => {
    const res = await get("/users/me", TOKEN);
    expect(res.status).toBe(200);
    const b = await readJson(res);
    expect(b.id).toBe(OWNER);
    expect(b.emailVerified).toBe(false);
    expect(b.name).toBeNull();
  });

  itest("PATCH /users/me trim + reject kosong/>120", async () => {
    expect((await send("PATCH", "/users/me", TOKEN, { name: "   " })).status).toBe(400);
    expect((await send("PATCH", "/users/me", TOKEN, { name: "x".repeat(121) })).status).toBe(400);
    const ok = await send("PATCH", "/users/me", TOKEN, { name: "  Vito  " });
    expect(ok.status).toBe(200);
    const me = await readJson(await get("/users/me", TOKEN));
    expect(me.name).toBe("Vito");
  });

  itest("onboarding status false → complete → true", async () => {
    expect((await readJson(await get("/onboarding/status", TOKEN))).completed).toBe(false);
    const c = await send("POST", "/onboarding/complete", TOKEN, {
      background: "peneliti",
      interests: ["ai_cs", "biologi", "fisika"],
      heardAboutSource: "teman",
    });
    expect(c.status).toBe(200);
    expect((await readJson(await get("/onboarding/status", TOKEN))).completed).toBe(true);

    // seed feed interests ter-persist (weight 2)
    const { client } = createDb(DATABASE_URL!);
    const fi = await client`select count(*)::int as n from user_feed_interests where owner_user_id=${OWNER} and weight=2`;
    expect(fi[0]!.n).toBeGreaterThan(0);
    await client.end();
  });

  itest("complete menolak background/interests/source tidak valid", async () => {
    const base = { background: "peneliti", interests: ["ai_cs", "biologi", "fisika"], heardAboutSource: "teman" };
    const badBg = await send("POST", "/onboarding/complete", TOKEN, { ...base, background: "x" });
    expect(badBg.status).toBe(400);
    expect((await readJson(badBg)).code).toBe("onboarding_background_invalid");

    const fewInterests = await send("POST", "/onboarding/complete", TOKEN, { ...base, interests: ["ai_cs"] });
    expect((await readJson(fewInterests)).code).toBe("interests_too_few");

    const badSrc = await send("POST", "/onboarding/complete", TOKEN, { ...base, heardAboutSource: "koran" });
    expect((await readJson(badSrc)).code).toBe("source_invalid");

    const otherMissing = await send("POST", "/onboarding/complete", TOKEN, { ...base, heardAboutSource: "lainnya" });
    expect((await readJson(otherMissing)).code).toBe("source_other_required");
  });
});
