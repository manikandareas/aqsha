import { describe, expect, it } from "vitest";
import {
  findUpgradePlan,
  formatPlanPrice,
  formatProviderSpend,
  getSetupCompletion,
  usagePercentage,
} from "./settings-summary";
import type { Plan } from "../lib/types";

const plans: Plan[] = [
  {
    key: "free",
    label: "Free",
    monthlyPriceIdr: 0,
    annualPriceIdr: 0,
    monthlyCredits: 100,
    providerSpendCeilingCents: 100,
    features: [],
    products: [],
  },
  {
    key: "starter",
    label: "Starter",
    monthlyPriceIdr: 99000,
    annualPriceIdr: 990000,
    monthlyCredits: 1000,
    providerSpendCeilingCents: 1000,
    features: [],
    products: [],
  },
  {
    key: "plus",
    label: "Plus",
    monthlyPriceIdr: 199000,
    annualPriceIdr: 1990000,
    monthlyCredits: 3000,
    providerSpendCeilingCents: 3000,
    features: [],
    products: [],
  },
];

describe("settings summary helpers", () => {
  it("clamps usage percentage to the display range", () => {
    expect(usagePercentage({ creditsUsed: 25, creditsLimit: 100 })).toBe(25);
    expect(usagePercentage({ creditsUsed: 150, creditsLimit: 100 })).toBe(100);
    expect(usagePercentage({ creditsUsed: -10, creditsLimit: 100 })).toBe(0);
    expect(usagePercentage({ creditsUsed: 4, creditsLimit: 0 })).toBe(100);
  });

  it("selects the next available upgrade plan", () => {
    expect(findUpgradePlan(plans, "free")?.key).toBe("starter");
    expect(findUpgradePlan(plans, "starter")?.key).toBe("plus");
    expect(findUpgradePlan(plans, "plus")).toBeUndefined();
    expect(findUpgradePlan(plans, "admin")).toBeUndefined();
  });

  it("formats monthly plan prices", () => {
    expect(formatPlanPrice(plans, "free")).toBe("Rp0/bulan");
    expect(formatPlanPrice(plans, "starter")).toContain("99.000");
    expect(formatPlanPrice(plans, "starter")).toMatch(/\/bulan$/);
    expect(formatPlanPrice(plans, "admin")).toBe("Internal");
  });

  it("formats provider spend labels", () => {
    expect(formatProviderSpend({ estimatedCostCents: 123, providerSpendCeilingCents: 5000 })).toBe("$1.23 / $50.00");
  });

  it("counts setup completion", () => {
    expect(getSetupCompletion({ threadCount: 0, planKey: "free" })).toMatchObject({
      completedCount: 0,
      totalCount: 2,
      hasThreads: false,
      hasPaidPlan: false,
    });
    expect(getSetupCompletion({ threadCount: 3, planKey: "starter" })).toMatchObject({
      completedCount: 2,
      totalCount: 2,
      hasThreads: true,
      hasPaidPlan: true,
    });
  });
});
