import { afterEach, describe, expect, test } from "bun:test";
import { addInterval, productKeyForMayarId, statusForMayarEvent } from "../src/clients/mayar";

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

describe("productKeyForMayarId (reverse lookup env)", () => {
  const KEY = "MAYAR_STARTER_MONTHLY_PRODUCT_ID";
  const prev = process.env[KEY];
  afterEach(() => {
    if (prev === undefined) delete process.env[KEY];
    else process.env[KEY] = prev;
  });

  test("cocok → productKey; tak cocok → undefined", () => {
    process.env[KEY] = "prod_sm_123";
    expect(productKeyForMayarId("prod_sm_123")).toBe("starterMonthly");
    expect(productKeyForMayarId("prod_nope")).toBeUndefined();
  });
});
