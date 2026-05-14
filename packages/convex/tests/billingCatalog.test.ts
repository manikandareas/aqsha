import { describe, expect, it } from "vitest";
import {
  billingStatusAllowsUsage,
  currentMonthPeriod,
  estimateCredits,
  estimateProviderCostCents,
  isPlanAtLeast,
  PLAN_CATALOG,
  PUBLIC_PLAN_KEYS,
  planForProductKey,
} from "../convex/billing/catalog";
import { parseAdminEmails } from "../convex/billing/admin";

describe("billing catalog", () => {
  it("defines Free, Starter, Plus, and internal Admin credit limits", () => {
    expect(PLAN_CATALOG.free.monthlyCredits).toBe(50);
    expect(PLAN_CATALOG.starter.monthlyCredits).toBe(500);
    expect(PLAN_CATALOG.plus.monthlyCredits).toBe(1_500);
    expect(PLAN_CATALOG.admin.monthlyCredits).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("keeps Admin above Plus and out of public products", () => {
    expect(isPlanAtLeast("admin", "plus")).toBe(true);
    expect(PUBLIC_PLAN_KEYS).toEqual(["free", "starter", "plus"]);
  });

  it("maps Polar product keys to user-scoped plans", () => {
    expect(planForProductKey("starterMonthly")).toBe("starter");
    expect(planForProductKey("starterYearly")).toBe("starter");
    expect(planForProductKey("plusMonthly")).toBe("plus");
    expect(planForProductKey("plusYearly")).toBe("plus");
    expect(planForProductKey(undefined)).toBe("free");
  });

  it("keeps annual subscriptions on a monthly reset window", () => {
    const period = currentMonthPeriod(Date.UTC(2026, 4, 12));
    expect(period.key).toBe("2026-05");
    expect(period.resetAt).toBe(Date.UTC(2026, 5, 1));
  });

  it("requires paid entitlement for Deep Research", () => {
    expect(isPlanAtLeast("free", "starter")).toBe(false);
    expect(isPlanAtLeast("starter", "starter")).toBe(true);
    expect(isPlanAtLeast("plus", "starter")).toBe(true);
    expect(isPlanAtLeast("admin", "starter")).toBe(true);
  });

  it("parses admin emails case-insensitively", () => {
    const emails = parseAdminEmails(" VitoAndareas15@gmail.com,other@example.com ");
    expect(emails.has("vitoandareas15@gmail.com")).toBe(true);
  });

  it("converts token and provider usage into credits and estimated cost", () => {
    expect(estimateCredits({ feature: "normal_chat", totalTokens: 1_501 })).toBe(2);
    expect(estimateCredits({ feature: "deep_research" })).toBe(120);
    expect(estimateCredits({ feature: "external_search", provider: "jina_read" })).toBe(6);
    expect(
      estimateProviderCostCents({
        provider: "openai",
        model: "gpt-5.5",
        inputTokens: 1_000,
        outputTokens: 1_000,
      }),
    ).toBe(2);
  });

  it("allows canceled subscription grace until current period end", () => {
    expect(
      billingStatusAllowsUsage({
        planKey: "starter",
        status: "canceled",
        currentPeriodEnd: Date.UTC(2026, 5, 1),
        now: Date.UTC(2026, 4, 12),
      }),
    ).toBe(true);
    expect(
      billingStatusAllowsUsage({
        planKey: "starter",
        status: "canceled",
        currentPeriodEnd: Date.UTC(2026, 4, 1),
        now: Date.UTC(2026, 4, 12),
      }),
    ).toBe(false);
  });
});
