export type PlanKey = "free" | "starter" | "plus";
export type BillingInterval = "month" | "year";
export type ProductKey =
  | "starterMonthly"
  | "starterYearly"
  | "plusMonthly"
  | "plusYearly";
export type BillingStatus =
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
  | "external_search"
  | "source_ingest"
  | "rag_embedding";

export const PLAN_ORDER: Record<PlanKey, number> = {
  free: 0,
  starter: 1,
  plus: 2,
};

export const PLAN_CATALOG: Record<
  PlanKey,
  {
    key: PlanKey;
    label: string;
    monthlyPriceIdr: number;
    annualPriceIdr: number;
    monthlyCredits: number;
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
    providerSpendCeilingCents: 0,
    features: [
      "50 credits per bulan",
      "Normal chat ringan",
      "Cited answer terbatas",
      "Deep Lite trial terbatas",
    ],
  },
  starter: {
    key: "starter",
    label: "Starter",
    monthlyPriceIdr: 69_000,
    annualPriceIdr: 690_000,
    monthlyCredits: 500,
    providerSpendCeilingCents: 125,
    features: [
      "500 credits per bulan",
      "Normal chat dan cited answer",
      "Deep Research kecil",
      "Provider cost guard sekitar $1.25/bulan",
    ],
  },
  plus: {
    key: "plus",
    label: "Plus",
    monthlyPriceIdr: 149_000,
    annualPriceIdr: 1_490_000,
    monthlyCredits: 1_500,
    providerSpendCeilingCents: 400,
    features: [
      "1.500 credits per bulan",
      "Deep Research lebih longgar",
      "Source reading lebih banyak",
      "Provider cost guard sekitar $4/bulan",
    ],
  },
};

export const PRODUCT_CATALOG: Record<
  ProductKey,
  {
    key: ProductKey;
    planKey: Exclude<PlanKey, "free">;
    interval: BillingInterval;
    displayPriceIdr: number;
  }
> = {
  starterMonthly: {
    key: "starterMonthly",
    planKey: "starter",
    interval: "month",
    displayPriceIdr: 69_000,
  },
  starterYearly: {
    key: "starterYearly",
    planKey: "starter",
    interval: "year",
    displayPriceIdr: 690_000,
  },
  plusMonthly: {
    key: "plusMonthly",
    planKey: "plus",
    interval: "month",
    displayPriceIdr: 149_000,
  },
  plusYearly: {
    key: "plusYearly",
    planKey: "plus",
    interval: "year",
    displayPriceIdr: 1_490_000,
  },
};

export const PRODUCT_KEYS = Object.keys(PRODUCT_CATALOG) as ProductKey[];

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

export function requiredPlanForFeature(feature: CreditFeature): PlanKey {
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
  if (args.feature === "source_ingest" || args.feature === "rag_embedding") {
    return 20;
  }
  if (args.feature === "external_search") {
    if (args.provider === "jina_read") return 6;
    if (args.provider === "jina_rerank") return 3;
    if (args.provider === "crossref" || args.provider === "arxiv") return 1;
    return 5;
  }
  if (args.feature === "cited_answer") {
    return Math.max(3, Math.ceil(totalTokens / 1_000));
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
  if (args.planKey === "free") {
    return true;
  }
  if (args.status === "active" || args.status === "trialing") {
    return true;
  }
  const now = args.now ?? Date.now();
  return args.status === "canceled" && Boolean(args.currentPeriodEnd && args.currentPeriodEnd > now);
}
