import { formatIdr } from "../lib/settings-format";
import type { BillingCurrent, Plan } from "../lib/types";

const planOrder: Record<BillingCurrent["planKey"], number> = {
  free: 0,
  starter: 1,
  plus: 2,
  admin: 3,
};

export function usagePercentage(
  current: Pick<BillingCurrent, "creditsUsed" | "creditsLimit"> &
    Partial<Pick<BillingCurrent, "isUnlimitedCredits">>,
) {
  if (current.isUnlimitedCredits) {
    return 0;
  }
  const raw = Math.round((current.creditsUsed / Math.max(1, current.creditsLimit)) * 100);
  return Math.min(100, Math.max(0, raw));
}

export function findUpgradePlan(plans: Plan[], currentKey: BillingCurrent["planKey"]) {
  return plans
    .filter((plan) => planOrder[plan.key] > planOrder[currentKey])
    .sort((a, b) => planOrder[a.key] - planOrder[b.key])[0];
}

export function formatPlanPrice(plans: Plan[], planKey: BillingCurrent["planKey"]) {
  if (planKey === "admin") return "Internal";
  const plan = plans.find((item) => item.key === planKey);
  if (!plan) return "";
  return `${formatIdr(plan.monthlyPriceIdr)}/bulan`;
}

export function formatProviderSpend(current: Pick<BillingCurrent, "estimatedCostCents" | "providerSpendCeilingCents">) {
  return `${formatUsdCents(current.estimatedCostCents)} / ${formatUsdCents(current.providerSpendCeilingCents)}`;
}

export function getSetupCompletion({
  threadCount,
  planKey,
}: {
  threadCount: number;
  planKey: BillingCurrent["planKey"];
}) {
  const items = [threadCount > 0, planKey !== "free"];

  return {
    completedCount: items.filter(Boolean).length,
    totalCount: items.length,
    hasThreads: threadCount > 0,
    hasPaidPlan: planKey !== "free",
  };
}

function formatUsdCents(value: number) {
  return `$${(value / 100).toFixed(2)}`;
}
