import { Elysia, status } from "elysia";
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
    return (await getRedis().ping()) === "PONG";
  } catch {
    return false;
  }
}

/** Public API needs only its persistence and rate-limit store to accept waitlist requests. */
export const publicHealth = new Elysia()
  .get("/ping", () => ({ pong: true, serverTime: Date.now() }))
  .get("/healthz", async () => {
    const [db, redis] = await Promise.all([checkDb(), checkRedis()]);
    const body = { ok: db && redis, db, redis };
    return body.ok ? body : status(503, body);
  })
  .get("/health/ready", async () => {
    const [db, redis] = await Promise.all([checkDb(), checkRedis()]);
    const body = { ok: db && redis, db, redis };
    return body.ok ? body : status(503, body);
  });
