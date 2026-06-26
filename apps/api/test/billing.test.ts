import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { createDb } from "@aqsha/db";

// Mock Clerk token verification: `tok_<sub>` → { sub, email:null }.
mock.module("../src/clients/clerkToken", () => ({
  verifyClerkToken: async (token: string) =>
    token.startsWith("tok_") ? { sub: token.slice(4), email: null } : null,
}));

const DATABASE_URL = process.env.DATABASE_URL;
const itest = DATABASE_URL ? test : test.skip;

// Webhook + checkout tests baca env Mayar saat call → kontrol determinstik di sini
// (jangan bergantung pada .env developer yang mungkin sudah meng-isi product id).
delete process.env.MAYAR_WEBHOOK_SECRET;
for (const key of Object.keys(process.env)) {
  if (key.startsWith("MAYAR_") && key.endsWith("_PRODUCT_ID")) delete process.env[key];
}

const suffix = Math.floor(Math.random() * 1e9);
const OWNER = `itbillapi_${suffix}`;

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
  const like = "itbillapi_%";
  await client`delete from provider_usage_ledger where owner_user_id like ${like}`;
  await client`delete from usage_daily_rollup where owner_user_id like ${like}`;
  await client`delete from billing_credit_periods where owner_user_id like ${like}`;
  await client`delete from billing_subscriptions where owner_user_id like ${like}`;
  await client`delete from workspaces where owner_user_id like ${like}`;
  await client`delete from users where owner_user_id like ${like}`;
  await client.end();
}

beforeAll(cleanup);
afterAll(cleanup);

describe("api billing — plans (public)", () => {
  test("GET /billing/plans tanpa auth → 200, 4 plan", async () => {
    const res = await get("/billing/plans");
    expect(res.status).toBe(200);
    const plans = await readJson(res);
    expect(plans.map((p: { key: string }) => p.key)).toEqual(["free", "starter", "plus", "ultra"]);
  });
});

describe("api billing — auth gate", () => {
  test("GET /billing/current tanpa Bearer → 401", async () => {
    const res = await get("/billing/current");
    expect(res.status).toBe(401);
    expect((await readJson(res)).code).toBe("unauthenticated");
  });
});

describe("api billing — read surface (free user)", () => {
  itest("GET /billing/current → free, limit 50", async () => {
    await req("POST", "/users/me/sync", tok(OWNER));
    const res = await get("/billing/current", tok(OWNER));
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.planKey).toBe("free");
    expect(body.creditsLimit).toBe(50);
    expect(body.creditsRemaining).toBe(50);
  });

  itest("GET /billing/usage/activity?days=7 → 7 zero-filled days", async () => {
    const res = await get("/billing/usage/activity?days=7", tok(OWNER));
    expect(res.status).toBe(200);
    const days = await readJson(res);
    expect(days.length).toBe(7);
    expect(days.every((d: { eventCount: number }) => d.eventCount === 0)).toBe(true);
  });

  itest("GET /billing/usage/current-period → free", async () => {
    const res = await get("/billing/usage/current-period", tok(OWNER));
    expect(res.status).toBe(200);
    expect((await readJson(res)).planKey).toBe("free");
  });
});

describe("api billing — checkout/portal gates", () => {
  itest("POST /billing/checkout tanpa product env → 400 billing_product_not_configured", async () => {
    const res = await req("POST", "/billing/checkout", tok(OWNER), {
      productKey: "starterMonthly",
      origin: "http://localhost:3000",
      successUrl: "http://localhost:3000/app/settings",
    });
    expect(res.status).toBe(400);
    expect((await readJson(res)).code).toBe("billing_product_not_configured");
  });

  itest("POST /billing/portal tanpa email → 400 billing_email_required", async () => {
    const res = await req("POST", "/billing/portal", tok(OWNER));
    expect(res.status).toBe(400);
    expect((await readJson(res)).code).toBe("billing_email_required");
  });
});

describe("api billing — webhook mayar", () => {
  test("POST /webhooks/mayar/<secret> tanpa env secret → 500 billing_webhook_secret_missing", async () => {
    delete process.env.MAYAR_WEBHOOK_SECRET;
    const res = await req("POST", "/webhooks/mayar/anything", undefined, {
      event: "membership.newMemberRegistered",
      data: {},
    });
    expect(res.status).toBe(500);
    expect((await readJson(res)).code).toBe("billing_webhook_secret_missing");
  });

  test("POST /webhooks/mayar/<wrong> secret salah → 400 signature invalid", async () => {
    process.env.MAYAR_WEBHOOK_SECRET = "real_secret";
    try {
      const res = await req("POST", "/webhooks/mayar/wrong_secret", undefined, {
        event: "membership.newMemberRegistered",
        data: { id: "tx_x" },
      });
      expect(res.status).toBe(400);
      expect((await readJson(res)).code).toBe("billing_webhook_signature_invalid");
    } finally {
      delete process.env.MAYAR_WEBHOOK_SECRET;
    }
  });

  test("POST /webhooks/mayar/<secret> event tak relevan → 200 ignored", async () => {
    process.env.MAYAR_WEBHOOK_SECRET = "real_secret";
    try {
      const res = await req("POST", "/webhooks/mayar/real_secret", undefined, {
        event: "payment.reminder",
        data: { id: "tx_y", customerEmail: "x@y.test", productId: "prod_unknown" },
      });
      expect(res.status).toBe(200);
      expect((await readJson(res)).ignored).toBe(true);
    } finally {
      delete process.env.MAYAR_WEBHOOK_SECRET;
    }
  });
});
