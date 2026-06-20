import { describe, expect, test } from "bun:test";
import { app } from "../src/index";

describe("api-v2 health", () => {
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
});
