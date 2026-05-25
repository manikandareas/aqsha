export type PlanKey = "free" | "starter" | "plus" | "admin";
export type PublicPlanKey = Exclude<PlanKey, "admin">;
export type PaidPlanKey = Exclude<PlanKey, "free" | "admin">;
export type BillingInterval = "month" | "year";
export type ProductKey =
  | "starterMonthly"
  | "starterYearly"
  | "plusMonthly"
  | "plusYearly";
export type BillingStatus =
  | "admin"
  | "free"
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "unpaid"
  | "paused"
  | "unknown";
export type CreditFeature =
  | "normal_chat"
  | "cited_answer"
  | "deep_research"
  | "external_search";

export const PLAN_ORDER: Record<PlanKey, number> = {
  free: 0,
  starter: 1,
  plus: 2,
  admin: 3,
};

export const PLAN_CATALOG: Record<
  PlanKey,
  {
    key: PlanKey;
    label: string;
    monthlyPriceIdr: number;
    annualPriceIdr: number;
    monthlyCredits: number;
    deepResearchRuns: number;
    workspaceLimit: number;
    libraryItemLimit: number;
    providerSpendCeilingCents: number;
    features: string[];
  }
> = {
  free: {
    key: "free",
    label: "Free",
    monthlyPriceIdr: 0,
    annualPriceIdr: 0,
    monthlyCredits: 50,
    deepResearchRuns: 0,
    workspaceLimit: 1,
    libraryItemLimit: 25,
    providerSpendCeilingCents: 0,
    features: [
      "50 credits per bulan",
      "1 workspace",
      "25 library items",
      "Deep Research tidak termasuk",
    ],
  },
  starter: {
    key: "starter",
    label: "Starter",
    monthlyPriceIdr: 49_000,
    annualPriceIdr: 490_000,
    monthlyCredits: 500,
    deepResearchRuns: 3,
    workspaceLimit: 5,
    libraryItemLimit: 250,
    providerSpendCeilingCents: 125,
    features: [
      "500 credits per bulan",
      "3 Deep Research per bulan",
      "5 workspaces",
      "250 library items",
    ],
  },
  plus: {
    key: "plus",
    label: "Plus",
    monthlyPriceIdr: 99_000,
    annualPriceIdr: 990_000,
    monthlyCredits: 1_500,
    deepResearchRuns: 12,
    workspaceLimit: 20,
    libraryItemLimit: 1_000,
    providerSpendCeilingCents: 400,
    features: [
      "1.500 credits per bulan",
      "12 Deep Research per bulan",
      "20 workspaces",
      "1.000 library items",
    ],
  },
  admin: {
    key: "admin",
    label: "Admin",
    monthlyPriceIdr: 0,
    annualPriceIdr: 0,
    monthlyCredits: Number.MAX_SAFE_INTEGER,
    deepResearchRuns: Number.MAX_SAFE_INTEGER,
    workspaceLimit: Number.MAX_SAFE_INTEGER,
    libraryItemLimit: Number.MAX_SAFE_INTEGER,
    providerSpendCeilingCents: Number.MAX_SAFE_INTEGER,
    features: [
      "Unlimited internal credits",
      "Unlimited Deep Research",
      "Unlimited workspace dan library",
      "Usage tetap tercatat",
      "Global/provider rate limit tetap aktif",
    ],
  },
};

export const PRODUCT_CATALOG: Record<
  ProductKey,
  {
    key: ProductKey;
    planKey: PaidPlanKey;
    interval: BillingInterval;
    displayPriceIdr: number;
  }
> = {
  starterMonthly: {
    key: "starterMonthly",
    planKey: "starter",
    interval: "month",
    displayPriceIdr: 49_000,
  },
  starterYearly: {
    key: "starterYearly",
    planKey: "starter",
    interval: "year",
    displayPriceIdr: 490_000,
  },
  plusMonthly: {
    key: "plusMonthly",
    planKey: "plus",
    interval: "month",
    displayPriceIdr: 99_000,
  },
  plusYearly: {
    key: "plusYearly",
    planKey: "plus",
    interval: "year",
    displayPriceIdr: 990_000,
  },
};

export const PRODUCT_KEYS = Object.keys(PRODUCT_CATALOG) as ProductKey[];
export const PUBLIC_PLAN_KEYS: PublicPlanKey[] = ["free", "starter", "plus"];

export function planForProductKey(productKey: string | undefined): PlanKey {
  if (!productKey) {
    return "free";
  }
  return PRODUCT_CATALOG[productKey as ProductKey]?.planKey ?? "free";
}

export function intervalForProductKey(productKey: string | undefined) {
  if (!productKey) {
    return null;
  }
  return PRODUCT_CATALOG[productKey as ProductKey]?.interval ?? null;
}

export function isPlanAtLeast(current: PlanKey, required: PlanKey) {
  return PLAN_ORDER[current] >= PLAN_ORDER[required];
}

export function requiredPlanForFeature(feature: CreditFeature): PublicPlanKey {
  if (feature === "deep_research") {
    return "starter";
  }
  return "free";
}

export function currentMonthPeriod(now = Date.now()) {
  const date = new Date(now);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const start = Date.UTC(year, month, 1, 0, 0, 0, 0);
  const end = Date.UTC(year, month + 1, 1, 0, 0, 0, 0);
  return {
    key: `${year}-${String(month + 1).padStart(2, "0")}`,
    startAt: start,
    resetAt: end,
  };
}

export function estimateCredits(args: {
  feature: CreditFeature;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  provider?: string;
}) {
  const totalTokens =
    args.totalTokens ?? (args.inputTokens ?? 0) + (args.outputTokens ?? 0);

  if (args.feature === "deep_research") {
    return 120;
  }
  if (args.feature === "external_search") {
    return 2;
  }
  return Math.max(1, Math.ceil(totalTokens / 1_500));
}

export function estimateProviderCostCents(args: {
  provider: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  feature?: CreditFeature;
}) {
  if (args.feature === "external_search") {
    if (args.provider === "exa") return 3;
    if (args.provider === "jina_read") return 2;
    if (args.provider === "jina_search" || args.provider === "jina_rerank") {
      return 1;
    }
    return 0;
  }

  const input = args.inputTokens ?? 0;
  const output = args.outputTokens ?? 0;
  const model = args.model ?? "";
  const inputPerMillion = model.includes("gpt-5.5") && !model.includes("mini") ? 125 : 15;
  const outputPerMillion = model.includes("gpt-5.5") && !model.includes("mini") ? 1_000 : 60;
  return Math.ceil((input * inputPerMillion + output * outputPerMillion) / 1_000_000);
}

export function normalizeBillingStatus(status: string | undefined): BillingStatus {
  if (
    status === "active" ||
    status === "trialing" ||
    status === "past_due" ||
    status === "canceled" ||
    status === "incomplete" ||
    status === "incomplete_expired" ||
    status === "unpaid" ||
    status === "paused"
  ) {
    return status;
  }
  return status ? "unknown" : "free";
}

export function billingStatusAllowsUsage(args: {
  planKey: PlanKey;
  status: BillingStatus;
  currentPeriodEnd?: number | null;
  now?: number;
}) {
  if (args.planKey === "admin" || args.status === "admin") {
    return true;
  }
  if (args.planKey === "free") {
    return true;
  }
  if (args.status === "active" || args.status === "trialing") {
    return true;
  }
  const now = args.now ?? Date.now();
  return args.status === "canceled" && Boolean(args.currentPeriodEnd && args.currentPeriodEnd > now);
}
