import { afterEach, describe, expect, mock, test } from "bun:test";
import {
  addInterval,
  deriveMayarMembershipEvent,
  isCheckoutConfigured,
  MayarClient,
  productKeyForAmount,
  productKeyForMayarTierId,
  resolveWebhookProductKey,
  statusForMayarEvent,
} from "../src/clients/mayar";

describe("statusForMayarEvent", () => {
  test("active untuk join/changeTier/payment.received", () => {
    expect(statusForMayarEvent("membership.newMemberRegistered")).toBe("active");
    expect(statusForMayarEvent("membership.changeTierMemberRegistered")).toBe("active");
    expect(statusForMayarEvent("payment.received")).toBe("active");
  });
  test("canceled untuk unsubscribe/expired", () => {
    expect(statusForMayarEvent("membership.memberUnsubscribed")).toBe("canceled");
    expect(statusForMayarEvent("membership.memberExpired")).toBe("canceled");
  });
  test("null untuk event tak relevan langganan", () => {
    expect(statusForMayarEvent("payment.reminder")).toBeNull();
    expect(statusForMayarEvent("shipper.status")).toBeNull();
    expect(statusForMayarEvent("unknown.event")).toBeNull();
  });
});

describe("addInterval (UTC, bukan +30d)", () => {
  test("+1 bulan", () => {
    expect(addInterval(Date.UTC(2026, 0, 15), "month")).toBe(Date.UTC(2026, 1, 15));
  });
  test("+1 bulan lintas tahun (Des → Jan)", () => {
    expect(addInterval(Date.UTC(2026, 11, 15), "month")).toBe(Date.UTC(2027, 0, 15));
  });
  test("+1 tahun", () => {
    expect(addInterval(Date.UTC(2026, 0, 15), "year")).toBe(Date.UTC(2027, 0, 15));
  });
});

describe("productKeyForMayarTierId (reverse lookup env tier-id)", () => {
  const KEY = "MAYAR_STARTER_MONTHLY_TIER_ID";
  const prev = process.env[KEY];
  afterEach(() => {
    if (prev === undefined) delete process.env[KEY];
    else process.env[KEY] = prev;
  });

  test("cocok → productKey; tak cocok → undefined", () => {
    process.env[KEY] = "tier_sm_123";
    expect(productKeyForMayarTierId("tier_sm_123")).toBe("starterMonthly");
    expect(productKeyForMayarTierId("tier_nope")).toBeUndefined();
  });
});

describe("productKeyForAmount (harga unik → tier)", () => {
  test("tiap harga katalog memetakan ke satu productKey", () => {
    expect(productKeyForAmount(49_000)).toBe("starterMonthly");
    expect(productKeyForAmount(490_000)).toBe("starterYearly");
    expect(productKeyForAmount(99_000)).toBe("plusMonthly");
    expect(productKeyForAmount(990_000)).toBe("plusYearly");
    expect(productKeyForAmount(349_000)).toBe("ultraMonthly");
    expect(productKeyForAmount(3_490_000)).toBe("ultraYearly");
    expect(productKeyForAmount(12_345)).toBeUndefined();
  });
});

describe("resolveWebhookProductKey (amount-primary utk single payment)", () => {
  const TIER = "MAYAR_PLUS_MONTHLY_TIER_ID";
  const prevTier = process.env[TIER];
  afterEach(() => {
    if (prevTier === undefined) delete process.env[TIER];
    else process.env[TIER] = prevTier;
  });

  test("single payment (tanpa productId) → tier dari amount", () => {
    expect(resolveWebhookProductKey(undefined, 49_000)).toBe("starterMonthly");
    expect(resolveWebhookProductKey(undefined, 990_000)).toBe("plusYearly");
  });
  test("tier id cocok diutamakan (mis. event membership lama)", () => {
    process.env[TIER] = "tier_pm";
    expect(resolveWebhookProductKey("tier_pm", 3_490_000)).toBe("plusMonthly"); // tier menang atas amount
  });
  test("productId tak dikenal → jatuh ke amount", () => {
    expect(resolveWebhookProductKey("nope", 349_000)).toBe("ultraMonthly");
  });
  test("amount bukan harga plan mana pun → undefined", () => {
    expect(resolveWebhookProductKey(undefined, 12_345)).toBeUndefined();
    expect(resolveWebhookProductKey("nope", undefined)).toBeUndefined();
  });
});

describe("deriveMayarMembershipEvent (single payment via amount)", () => {
  test("payment.received + amount → tier, active 1 periode, cancelAtPeriodEnd", () => {
    const now = Date.UTC(2026, 0, 15);
    const ev = deriveMayarMembershipEvent("payment.received", undefined, 349_000, now);
    expect(ev?.productKey).toBe("ultraMonthly");
    expect(ev?.status).toBe("active");
    expect(ev?.currentPeriodStart).toBe(now);
    expect(ev?.currentPeriodEnd).toBe(addInterval(now, "month"));
    expect(ev?.cancelAtPeriodEnd).toBe(true); // one-time: tak auto-renew
  });
  test("amount tahunan → period +1 tahun", () => {
    const now = Date.UTC(2026, 5, 1);
    const ev = deriveMayarMembershipEvent("payment.received", undefined, 3_490_000, now);
    expect(ev?.productKey).toBe("ultraYearly");
    expect(ev?.currentPeriodEnd).toBe(addInterval(now, "year"));
  });
  test("amount tak dikenal → null (diabaikan)", () => {
    expect(deriveMayarMembershipEvent("payment.received", undefined, 12_345, Date.UTC(2026, 0, 1))).toBeNull();
  });
});

describe("isCheckoutConfigured (gate UI = MAYAR_API_KEY)", () => {
  const KEY = "MAYAR_API_KEY";
  const prev = process.env[KEY];
  afterEach(() => {
    if (prev === undefined) delete process.env[KEY];
    else process.env[KEY] = prev;
  });
  test("ada key → true; tak ada → false", () => {
    process.env[KEY] = "eyJ.test";
    expect(isCheckoutConfigured()).toBe(true);
    delete process.env[KEY];
    expect(isCheckoutConfigured()).toBe(false);
  });
});

describe("MayarClient.createPaymentLink (single payment)", () => {
  const KEY = "MAYAR_API_KEY";
  const prevKey = process.env[KEY];
  const realFetch = globalThis.fetch;
  afterEach(() => {
    if (prevKey === undefined) delete process.env[KEY];
    else process.env[KEY] = prevKey;
    globalThis.fetch = realFetch;
  });

  test("kirim amount+email+description+redirectUrl → kembalikan link Mayar", async () => {
    process.env[KEY] = "eyJ.test";
    let sentBody: Record<string, string | number> = {};
    globalThis.fetch = mock(async (_url: string, init: { body: string }) => {
      sentBody = JSON.parse(init.body) as Record<string, string | number>;
      return new Response(JSON.stringify({ statusCode: 200, data: { link: "https://m.mayar.shop/invoices/abc" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const { url } = await MayarClient.createPaymentLink({
      email: "u@x.test",
      amountIdr: 49_000,
      description: "Langganan Aqsha Starter — Bulanan",
      redirectUrl: "https://aqsha.app/back?cb=1",
    });
    expect(url).toBe("https://m.mayar.shop/invoices/abc");
    expect(sentBody.amount).toBe(49_000);
    expect(sentBody.email).toBe("u@x.test");
    expect(sentBody.redirectUrl).toBe("https://aqsha.app/back?cb=1");
  });

  test("tanpa MAYAR_API_KEY → throw billing_not_configured", async () => {
    delete process.env[KEY];
    await expect(
      MayarClient.createPaymentLink({ email: "u@x.test", amountIdr: 49_000, description: "x y z" }),
    ).rejects.toThrow(/MAYAR_API_KEY/);
  });
});
