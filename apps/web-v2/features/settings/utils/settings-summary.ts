import { formatIdr } from "../lib/settings-format";
import type { BillingCurrent, Plan, ProductKey } from "../lib/types";

const planOrder: Record<BillingCurrent["planKey"], number> = {
  free: 0,
  starter: 1,
  plus: 2,
  ultra: 3,
  admin: 4,
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
  let upgradePlan: Plan | undefined;
  for (const plan of plans) {
    if (planOrder[plan.key] <= planOrder[currentKey]) {
      continue;
    }
    if (!upgradePlan || planOrder[plan.key] < planOrder[upgradePlan.key]) {
      upgradePlan = plan;
    }
  }
  return upgradePlan;
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

export type PlanBillingAction =
  | { kind: "active"; label: "Paket aktif"; productKey?: ProductKey }
  | { kind: "disabled"; label: "Belum dikonfigurasi"; productKey?: ProductKey }
  | { kind: "blocked"; label: "Tidak tersedia"; productKey?: ProductKey }
  | { kind: "change"; label: "Ganti paket"; productKey: ProductKey }
  | { kind: "checkout"; label: "Checkout"; productKey: ProductKey };

export function getPlanBillingAction({
  plan,
  productKey,
  active,
  configured,
  current,
}: {
  plan: Pick<Plan, "key">;
  productKey: ProductKey | undefined;
  active: boolean;
  configured: boolean;
  current: Pick<BillingCurrent, "planKey" | "isAdmin" | "canChangeSubscription">;
}): PlanBillingAction {
  if (active) return { kind: "active", label: "Paket aktif", productKey };
  if (!configured) return { kind: "disabled", label: "Belum dikonfigurasi", productKey };
  if (!productKey || plan.key === "free" || current.isAdmin) {
    return { kind: "blocked", label: "Tidak tersedia", productKey };
  }
  if (current.canChangeSubscription && current.planKey !== "free") {
    return { kind: "change", label: "Ganti paket", productKey };
  }
  return { kind: "checkout", label: "Checkout", productKey };
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
