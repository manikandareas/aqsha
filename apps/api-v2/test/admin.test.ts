import { afterAll, describe, expect, mock, test } from "bun:test";
import { Redis } from "ioredis";

mock.module("../src/clients/clerkToken", () => ({
  verifyClerkToken: async (token: string) =>
    token.startsWith("tok_") ? { sub: token.slice(4), email: null } : null,
}));

const REDIS_URL = process.env.REDIS_URL;
const rltest = REDIS_URL ? test : test.skip;

const suffix = Math.floor(Math.random() * 1e9);
const ADMIN = `feedadmin_${suffix}`;
const PLAIN = `feedplain_${suffix}`;

// resolvePlanKey membaca env saat request → set admin allowlist sebelum app dipakai.
process.env.AQSHA_ADMIN_OWNER_USER_IDS = `${process.env.AQSHA_ADMIN_OWNER_USER_IDS ?? ""},${ADMIN}`;

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

afterAll(async () => {
  if (!REDIS_URL) return;
  const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: true });
  try {
    await redis.del("admin:feed:hydrate:lock");
  } catch {
    // best-effort
  }
  redis.disconnect();
});

describe("api-v2 admin feed hydrate", () => {
  test("non-admin → 403", async () => {
    const r = await req("POST", "/admin/feed/hydrate", tok(PLAIN), {});
    expect(r.status).toBe(403);
    expect((await readJson(r)).code).toBe("admin_required");
  });

  test("tanpa token → 401", async () => {
    const r = await req("POST", "/admin/feed/hydrate", undefined, {});
    expect(r.status).toBe(401);
  });

  rltest("admin → 200 fan-out 3 lane; panggilan kedua → 409 (lock)", async () => {
    const r = await req("POST", "/admin/feed/hydrate", tok(ADMIN), {});
    expect(r.status).toBe(200);
    const body = await readJson(r);
    expect(body.scheduled).toBe(3);
    expect(body.jobs).toHaveLength(3);
    // kontrak: tiap job {lane, jobId, delayMs}
    for (const job of body.jobs) {
      expect(typeof job.jobId).toBe("string");
      expect(typeof job.delayMs).toBe("number");
    }

    const again = await req("POST", "/admin/feed/hydrate", tok(ADMIN), {});
    expect(again.status).toBe(409);
    expect((await readJson(again)).code).toBe("hydration_in_progress");
  });
});
