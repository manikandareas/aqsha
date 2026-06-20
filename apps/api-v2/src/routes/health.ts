import { Elysia } from "elysia";
import { getDb } from "../clients/db";
import { getRedis } from "../clients/redis";

async function checkDb(): Promise<boolean> {
  try {
    const { client } = getDb();
    await client`select 1`;
    return true;
  } catch {
    return false;
  }
}

async function checkRedis(): Promise<boolean> {
  try {
    const pong = await getRedis().ping();
    return pong === "PONG";
  } catch {
    return false;
  }
}

/**
 * Rail health P0:
 * - GET /ping    → bukti api hidup + jam server untuk web-v2 (tanpa dependency).
 * - GET /healthz → real-check db (SELECT 1) + redis (PING). `ok = db && redis`.
 *   (GET /health/ready dengan cek R2 menyusul saat R2 ada — P3/P9.)
 */
export const health = new Elysia()
  .get("/ping", () => ({ pong: true, serverTime: Date.now() }))
  .get("/healthz", async () => {
    const [db, redis] = await Promise.all([checkDb(), checkRedis()]);
    return { ok: db && redis, db, redis };
  });
