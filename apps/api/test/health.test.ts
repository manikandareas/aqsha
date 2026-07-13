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
  const noInfraTest = hasInfra ? test.skip : test;

  infraTest("GET /healthz: 200 + ok:true saat db + redis sehat", async () => {
    const res = await app.handle(new Request("http://localhost/healthz"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; db: boolean; redis: boolean };
    expect(body).toEqual({ ok: true, db: true, redis: true });
  });

  // Kontrak uptime: dependency down → 503 (bukan 200), body tetap membawa rincian.
  noInfraTest("GET /healthz: 503 + ok:false saat dependency down", async () => {
    const res = await app.handle(new Request("http://localhost/healthz"));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { ok: boolean; db: boolean; redis: boolean };
    expect(body.ok).toBe(false);
  });

  // Status HTTP MENGIKUTI readiness: 200 saat semua sehat, 503 saat ada yang down.
  // Berlaku dengan/ tanpa infra karena expect di-derivasi dari body.ok.
  test("GET /health/ready: status code mengikuti ok (200/503) + shape", async () => {
    const res = await app.handle(new Request("http://localhost/health/ready"));
    const b = (await res.json()) as { ok: boolean; db: boolean; redis: boolean; storage: boolean };
    expect(typeof b.db).toBe("boolean");
    expect(typeof b.redis).toBe("boolean");
    expect(typeof b.storage).toBe("boolean");
    expect(b.ok).toBe(b.db && b.redis && b.storage);
    expect(res.status).toBe(b.ok ? 200 : 503);
  });
});
