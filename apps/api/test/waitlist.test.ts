import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createDb, runMigrations, WaitlistRepo } from "@aqsha/db";
import { app } from "../src/index";

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;
const dbTest = DATABASE_URL ? test : test.skip;
const rlTest = DATABASE_URL && REDIS_URL ? test : test.skip;

const suffix = Math.floor(Math.random() * 1e9);
const emailNew = `wl_api_${suffix}@example.com`;
const emailDup = `wl_api_dup_${suffix}@example.com`;
const emailVerify = `wl_api_verify_${suffix}@example.com`;

const sentBodies: Array<{ to: string[]; subject: string; html: string }> = [];

beforeAll(async () => {
  process.env.RESEND_API_KEY = "re_test";
  process.env.WAITLIST_FROM_EMAIL = "Aqsha <hello@aqshara.com>";
  process.env.PUBLIC_SITE_URL = "http://localhost:4321";

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("api.resend.com")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        to: string[];
        subject: string;
        html: string;
      };
      sentBodies.push(body);
      return new Response(JSON.stringify({ id: "email_test" }), { status: 200 });
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  if (DATABASE_URL) await runMigrations(DATABASE_URL);
});

afterAll(async () => {
  if (!DATABASE_URL) return;
  const { client } = createDb(DATABASE_URL);
  await client`delete from waitlist_entries where email like ${`wl_api_%${suffix}@example.com`}`;
  await client.end();
});

function postJson(path: string, body: unknown, headers?: Record<string, string>) {
  return app.handle(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /waitlist — validation & honeypot", () => {
  test("POST /waitlist menolak email invalid tanpa auth", async () => {
    const response = await postJson("/waitlist", { email: "not-an-email" });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe("waitlist_email_invalid");
  });

  test("honeypot website non-empty returns ok tanpa persist", async () => {
    const response = await postJson("/waitlist", {
      email: `honeypot_${suffix}@example.com`,
      website: "https://spam.example",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });

    if (!DATABASE_URL) return;
    const { db, client } = createDb(DATABASE_URL);
    expect(await WaitlistRepo.findByEmail(db, `honeypot_${suffix}@example.com`)).toBeNull();
    await client.end();
  });
});

describe("POST /waitlist — happy path (DB)", () => {
  dbTest("valid submission returns { ok: true } dan mengirim email", async () => {
    sentBodies.length = 0;
    const response = await postJson("/waitlist", {
      email: emailNew,
      companyOrUniversity: "ITB",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(sentBodies.length).toBeGreaterThanOrEqual(1);

    const { db, client } = createDb(DATABASE_URL!);
    const row = await WaitlistRepo.findByEmail(db, emailNew);
    expect(row?.status).toBe("pending");
    expect(row?.companyOrUniversity).toBe("ITB");
    await client.end();
  });

  dbTest("duplicate confirmed returns the same response shape", async () => {
    sentBodies.length = 0;
    const first = await postJson("/waitlist", { email: emailDup });
    expect(first.status).toBe(200);
    const tokenMatch = sentBodies.at(-1)?.html.match(/token=([^"&]+)/);
    expect(tokenMatch?.[1]).toBeTruthy();
    const token = decodeURIComponent(tokenMatch![1]!);

    const verify = await postJson("/waitlist/verify", { token });
    expect(verify.status).toBe(200);

    sentBodies.length = 0;
    const second = await postJson("/waitlist", { email: emailDup });
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ ok: true });
    expect(sentBodies).toHaveLength(0);
  });

  dbTest("verification changes the row to confirmed; reuse rejected", async () => {
    sentBodies.length = 0;
    await postJson("/waitlist", { email: emailVerify });
    const tokenMatch = sentBodies.at(-1)?.html.match(/token=([^"&]+)/);
    const token = decodeURIComponent(tokenMatch![1]!);

    const ok = await postJson("/waitlist/verify", { token });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true });

    const { db, client } = createDb(DATABASE_URL!);
    expect((await WaitlistRepo.findByEmail(db, emailVerify))?.status).toBe("confirmed");
    await client.end();

    const reuse = await postJson("/waitlist/verify", { token });
    expect(reuse.status).toBe(400);
    const reuseBody = (await reuse.json()) as { code: string };
    expect(reuseBody.code).toBe("waitlist_token_invalid");
  });
});

describe("POST /waitlist — rate limit", () => {
  rlTest("IP submit limiter returns safe 429 payload", async () => {
    const ip = `203.0.113.${suffix % 200}`;
    let saw429 = false;
    for (let i = 0; i < 8; i++) {
      const res = await postJson(
        "/waitlist",
        { email: `wl_rl_${suffix}_${i}@example.com` },
        { "cf-connecting-ip": ip },
      );
      if (res.status === 429) {
        saw429 = true;
        const body = (await res.json()) as {
          code: string;
          severity: string;
          retryAt: number;
        };
        expect(body.code).toBe("rate_limited");
        expect(body.severity).toBe("info");
        expect(typeof body.retryAt).toBe("number");
        break;
      }
    }
    expect(saw429).toBe(true);
  });
});
