import { describe, expect, test } from "bun:test";
import { app } from "../src/index";

describe("api health", () => {
  test("GET /ping mengembalikan pong + serverTime", async () => {
    const res = await app.handle(new Request("http://localhost/ping"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { pong: boolean; serverTime: number };
    expect(body.pong).toBe(true);
    expect(typeof body.serverTime).toBe("number");
    expect(body.serverTime).toBeGreaterThan(0);
  });

  // /healthz butuh PG + Redis live; di-skip tanpa env supaya `bun test` hijau.
  const hasInfra = Boolean(process.env.DATABASE_URL && process.env.REDIS_URL);
  const infraTest = hasInfra ? test : test.skip;
  infraTest("GET /healthz melaporkan db + redis sehat", async () => {
    const res = await app.handle(new Request("http://localhost/healthz"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; db: boolean; redis: boolean };
    expect(body).toEqual({ ok: true, db: true, redis: true });
  });

  // Tanpa infra tetap 200 (semua false) — uji shape + derivasi `ok`.
  test("GET /health/ready melaporkan db+redis+storage + ok terderivasi", async () => {
    const res = await app.handle(new Request("http://localhost/health/ready"));
    expect(res.status).toBe(200);
    const b = (await res.json()) as { ok: boolean; db: boolean; redis: boolean; storage: boolean };
    expect(typeof b.db).toBe("boolean");
    expect(typeof b.redis).toBe("boolean");
    expect(typeof b.storage).toBe("boolean");
    expect(b.ok).toBe(b.db && b.redis && b.storage);
  });
});
