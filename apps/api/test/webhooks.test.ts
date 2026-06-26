import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { createDb } from "@aqsha/db";

// Secret test svix kanonik; set SEBELUM import app (dibaca verifyClerkWebhook saat call).
const TEST_SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
process.env.CLERK_WEBHOOK_SIGNING_SECRET = TEST_SECRET;

// Pakai verifyClerkWebhook ASLI (tanpa mock) — memvalidasi jalur raw-body
// (parse:"none") + verifikasi signature + dedupe end-to-end.
const { app } = await import("../src/index");

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;
const itest = DATABASE_URL && REDIS_URL ? test : test.skip;

// biome-ignore lint/suspicious/noExplicitAny: test reads dynamic JSON bodies
function readJson(res: Response): Promise<any> {
  return res.json();
}

function sign(id: string, ts: string, body: string): string {
  const key = Buffer.from(TEST_SECRET.replace(/^whsec_/, ""), "base64");
  return `v1,${createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64")}`;
}

function post(body: string, opts: { id?: string; ts?: string; sig?: string } = {}) {
  const id = opts.id ?? `msg_${Math.floor(Math.random() * 1e9)}`;
  const ts = opts.ts ?? Math.floor(Date.now() / 1000).toString();
  const sig = opts.sig ?? sign(id, ts, body);
  return app.handle(
    new Request("http://localhost/webhooks/clerk", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "svix-id": id,
        "svix-timestamp": ts,
        "svix-signature": sig,
      },
      body,
    }),
  );
}

async function emailOf(clerkUserId: string): Promise<string | null | undefined> {
  const { client } = createDb(DATABASE_URL!);
  const rows = await client`select email from users where clerk_user_id=${clerkUserId}`;
  await client.end();
  return rows.length ? (rows[0]!.email as string | null) : undefined;
}

async function cleanup() {
  if (!DATABASE_URL) return;
  const { client } = createDb(DATABASE_URL);
  await client`delete from workspaces where owner_user_id like 'user_whtest_%'`;
  await client`delete from users where owner_user_id like 'user_whtest_%'`;
  await client.end();
}

beforeAll(cleanup);
afterAll(cleanup);

describe("api POST /webhooks/clerk", () => {
  itest("user.created → 200 + upsert users (email primary)", async () => {
    const clerkId = `user_whtest_${Math.floor(Math.random() * 1e9)}`;
    const body = JSON.stringify({
      type: "user.created",
      object: "event",
      data: {
        id: clerkId,
        email_addresses: [
          { id: "ea1", email_address: "first@x.com" },
          { id: "ea2", email_address: "primary@x.com" },
        ],
        primary_email_address_id: "ea2",
      },
    });
    const res = await post(body);
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ ok: true });
    expect(await emailOf(clerkId)).toBe("primary@x.com");
  });

  itest("delivery duplikat (svix-id sama) → dedupe, tidak menimpa", async () => {
    const clerkId = `user_whtest_${Math.floor(Math.random() * 1e9)}`;
    const svixId = `msg_dupe_${Math.floor(Math.random() * 1e9)}`;
    const created = JSON.stringify({
      type: "user.created",
      object: "event",
      data: { id: clerkId, email_addresses: [{ id: "e", email_address: "a@x.com" }], primary_email_address_id: "e" },
    });
    const updated = JSON.stringify({
      type: "user.updated",
      object: "event",
      data: { id: clerkId, email_addresses: [{ id: "e", email_address: "b@x.com" }], primary_email_address_id: "e" },
    });
    expect((await post(created, { id: svixId })).status).toBe(200);
    // svix-id sama → di-dedupe sebelum menulis → email tetap a@x.com
    expect((await post(updated, { id: svixId })).status).toBe(200);
    expect(await emailOf(clerkId)).toBe("a@x.com");
  });

  itest("event non-user → 200 ignored", async () => {
    const body = JSON.stringify({ type: "session.created", object: "event", data: { id: "sess_1" } });
    const res = await post(body);
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ ok: true, ignored: true });
  });

  itest("user.* tanpa data.id → 400 missing_user_id", async () => {
    const body = JSON.stringify({ type: "user.created", object: "event", data: {} });
    const res = await post(body);
    expect(res.status).toBe(400);
    expect((await readJson(res)).code).toBe("clerk_webhook_missing_user_id");
  });

  itest("signature salah → 400 invalid_signature", async () => {
    const body = JSON.stringify({ type: "user.created", object: "event", data: { id: "user_whtest_x" } });
    const res = await post(body, { sig: "v1,not-a-valid-signature" });
    expect(res.status).toBe(400);
    expect((await readJson(res)).code).toBe("clerk_webhook_invalid_signature");
  });

  itest("user.deleted → tombstone deletionRequestedAt", async () => {
    const clerkId = `user_whtest_${Math.floor(Math.random() * 1e9)}`;
    // buat dulu via created
    await post(
      JSON.stringify({
        type: "user.created",
        object: "event",
        data: { id: clerkId, email_addresses: [{ id: "e", email_address: "d@x.com" }], primary_email_address_id: "e" },
      }),
    );
    const del = await post(
      JSON.stringify({ type: "user.deleted", object: "event", data: { id: clerkId, deleted: true } }),
    );
    expect(del.status).toBe(200);
    const { client } = createDb(DATABASE_URL!);
    const rows = await client`select deletion_requested_at from users where clerk_user_id=${clerkId}`;
    await client.end();
    expect(rows[0]!.deletion_requested_at).not.toBeNull();
  });
});
