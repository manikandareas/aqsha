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
  | "pro_chat"
  | "cited_answer"
  | "deep_research"
  | "external_search"
  | "sandbox_compute";

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
    deepResearchRuns: 2,
    workspaceLimit: 1,
    libraryItemLimit: 25,
    providerSpendCeilingCents: 0,
    features: [
      "Astra Lite",
      "50 credits per bulan",
      "2 Deep Research (Lite) per bulan",
      "1 workspace",
      "25 library items",
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
      "Astra Lite + Astra Pro",
      "500 credits per bulan",
      "3 Deep Research (Pro) per bulan",
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
      "Astra Lite + Astra Pro",
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
  // pro_chat always requires a paid plan. deep_research keeps "starter" as a
  // fallback default, but the send path passes an explicit requiredPlan that is
  // agent-aware (Lite-deep → "free" so Free can use its monthly quota; Pro-deep
  // → "starter"). sandbox_compute (the verification engine) is exposed only on
  // the Astra Pro agent, so it requires the same paid plan as pro_chat.
  if (
    feature === "pro_chat" ||
    feature === "deep_research" ||
    feature === "sandbox_compute"
  ) {
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

// Tunable credit rates. A single user-facing "credits" balance is consumed at
// these per-feature rates; the multipliers are intentionally hidden from users.
const NORMAL_CHAT_TOKENS_PER_CREDIT = 1_500;
const PRO_CHAT_TOKENS_PER_CREDIT = 250; // ~6x normal_chat (gpt-5.5 is far costlier)
const DEEP_PRO_CREDITS = 120;
const DEEP_LITE_CREDITS = 60;
// Flat per-run charge for an ephemeral sandbox compute job (Daytona, billed
// per-second). Priced above external_search (2) to reflect provisioning +
// runtime cost, but well below a deep-research run since it is a single bounded
// recompute rather than a multi-round LLM loop.
const SANDBOX_COMPUTE_CREDITS = 10;

export function estimateCredits(args: {
  feature: CreditFeature;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  provider?: string;
  agentKind?: "lite" | "pro";
}) {
  const totalTokens =
    args.totalTokens ?? (args.inputTokens ?? 0) + (args.outputTokens ?? 0);

  if (args.feature === "deep_research") {
    return args.agentKind === "lite" ? DEEP_LITE_CREDITS : DEEP_PRO_CREDITS;
  }
  if (args.feature === "sandbox_compute") {
    return SANDBOX_COMPUTE_CREDITS;
  }
  if (args.feature === "external_search") {
    return 2;
  }
  if (args.feature === "pro_chat") {
    return Math.max(1, Math.ceil(totalTokens / PRO_CHAT_TOKENS_PER_CREDIT));
  }
  return Math.max(1, Math.ceil(totalTokens / NORMAL_CHAT_TOKENS_PER_CREDIT));
}

// Billing feature for a chat usage event. The run's agent tier (agentKind) is the
// source of truth; the model string is only a fallback for legacy/in-flight runs
// that predate agentKind being threaded through (AUD-02), preserving the prior
// model-string behavior in that case.
export function featureForUsage(args: {
  agentKind?: "lite" | "pro";
  isProModel: boolean;
}): Extract<CreditFeature, "normal_chat" | "pro_chat"> {
  if (args.agentKind === "pro") {
    return "pro_chat";
  }
  if (args.agentKind === "lite") {
    return "normal_chat";
  }
  return args.isProModel ? "pro_chat" : "normal_chat";
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
