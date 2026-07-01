// Plan catalog + pricing SSOT (Fase 5 — billing penuh).
//
// Pure module (TANPA import db). Port lengkap dari V1
// `packages/convex/convex/billing/catalog.ts` → satu sumber kebenaran untuk
// plan, produk Mayar, estimasi kredit, dan status billing. Resolver plan
// admin-allowlist (env-only) tetap di sini; resolver db-aware (admin_entitlements +
// subscription mirror) hidup di `billing/snapshot.ts` (butuh db).

export type PlanKey = "free" | "starter" | "plus" | "ultra" | "admin";
export type PublicPlanKey = Exclude<PlanKey, "admin">;
export type PaidPlanKey = Exclude<PlanKey, "free" | "admin">;
export type BillingInterval = "month" | "year";
export type ProductKey =
  | "starterMonthly"
  | "starterYearly"
  | "plusMonthly"
  | "plusYearly"
  | "ultraMonthly"
  | "ultraYearly";
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
  | "sandbox_compute"
  | "citation_verify"
  | "doc_ai_edit";

export type PlanDefinition = {
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
};

/** Batas tak-terhingga (admin + Ultra non-credit) ditandai `Number.MAX_SAFE_INTEGER`. */
export const UNLIMITED = Number.MAX_SAFE_INTEGER;

export const PLAN_ORDER: Record<PlanKey, number> = {
  free: 0,
  starter: 1,
  plus: 2,
  ultra: 3,
  admin: 4,
};

export const PLAN_CATALOG: Record<PlanKey, PlanDefinition> = {
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
  ultra: {
    key: "ultra",
    label: "Ultra",
    monthlyPriceIdr: 349_000,
    annualPriceIdr: 3_490_000,
    monthlyCredits: 10_000,
    deepResearchRuns: UNLIMITED,
    workspaceLimit: UNLIMITED,
    libraryItemLimit: UNLIMITED,
    // Tunable: ceiling spend provider naik dari Plus (400). Retune setelah ukur usage Ultra.
    providerSpendCeilingCents: 2_000,
    features: [
      "Astra Lite + Astra Pro",
      "10.000 credits per bulan",
      "Deep Research tanpa batas (fair-use)",
      "Workspace tanpa batas",
      "Library tanpa batas",
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
  { key: ProductKey; planKey: PaidPlanKey; interval: BillingInterval; displayPriceIdr: number }
> = {
  starterMonthly: { key: "starterMonthly", planKey: "starter", interval: "month", displayPriceIdr: 49_000 },
  starterYearly: { key: "starterYearly", planKey: "starter", interval: "year", displayPriceIdr: 490_000 },
  plusMonthly: { key: "plusMonthly", planKey: "plus", interval: "month", displayPriceIdr: 99_000 },
  plusYearly: { key: "plusYearly", planKey: "plus", interval: "year", displayPriceIdr: 990_000 },
  ultraMonthly: { key: "ultraMonthly", planKey: "ultra", interval: "month", displayPriceIdr: 349_000 },
  ultraYearly: { key: "ultraYearly", planKey: "ultra", interval: "year", displayPriceIdr: 3_490_000 },
};

export const PRODUCT_KEYS = Object.keys(PRODUCT_CATALOG) as ProductKey[];
export const PUBLIC_PLAN_KEYS: PublicPlanKey[] = ["free", "starter", "plus", "ultra"];

export function planForProductKey(productKey: string | undefined): PlanKey {
  if (!productKey) return "free";
  return PRODUCT_CATALOG[productKey as ProductKey]?.planKey ?? "free";
}

export function intervalForProductKey(productKey: string | undefined): BillingInterval | null {
  if (!productKey) return null;
  return PRODUCT_CATALOG[productKey as ProductKey]?.interval ?? null;
}

export function isPlanAtLeast(current: PlanKey, required: PlanKey): boolean {
  return PLAN_ORDER[current] >= PLAN_ORDER[required];
}

export function requiredPlanForFeature(feature: CreditFeature): PublicPlanKey {
  // pro_chat selalu butuh plan berbayar. deep_research default fallback "starter",
  // tapi send-path mengirim requiredPlan eksplisit agent-aware (Lite-deep → "free"
  // agar Free pakai kuota bulanannya; Pro-deep → "starter"). sandbox_compute
  // (verification engine) hanya di Astra Pro → butuh plan berbayar yang sama.
  if (feature === "pro_chat" || feature === "deep_research" || feature === "sandbox_compute") {
    return "starter";
  }
  return "free";
}

export function currentMonthPeriod(now = Date.now()): { key: string; startAt: number; resetAt: number } {
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

// Tunable credit rates. Satu saldo "credits" user-facing dikonsumsi pada rate
// per-feature ini; multiplier sengaja disembunyikan dari user.
const NORMAL_CHAT_TOKENS_PER_CREDIT = 1_500;
const PRO_CHAT_TOKENS_PER_CREDIT = 250;
const DEEP_PRO_CREDITS = 120;
const DEEP_LITE_CREDITS = 60;
const SANDBOX_COMPUTE_CREDITS = 10;

export function estimateCredits(args: {
  feature: CreditFeature;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  provider?: string;
  agentKind?: "lite" | "pro";
}): number {
  const totalTokens = args.totalTokens ?? (args.inputTokens ?? 0) + (args.outputTokens ?? 0);

  if (args.feature === "deep_research") {
    return args.agentKind === "lite" ? DEEP_LITE_CREDITS : DEEP_PRO_CREDITS;
  }
  if (args.feature === "sandbox_compute") return SANDBOX_COMPUTE_CREDITS;
  // Usage-tracked, NOT charged: citation_verify menyusun provider yang sudah
  // di-cache + rate-limit (tanpa charge per-user). Direkam di ledger/rollup untuk
  // observability saja; revisit pricing setelah ukur usage nyata.
  if (args.feature === "citation_verify") return 0;
  if (args.feature === "external_search") return 2;
  if (args.feature === "pro_chat") return Math.max(1, Math.ceil(totalTokens / PRO_CHAT_TOKENS_PER_CREDIT));
  // normal_chat + doc_ai_edit (edit dokumen AI native BlockNote → model Lite Astra) → rate Lite
  // berbasis token aktual. Gate plan-nya juga = Lite (requiredPlanForFeature default "free").
  return Math.max(1, Math.ceil(totalTokens / NORMAL_CHAT_TOKENS_PER_CREDIT));
}

// Billing feature untuk chat usage event. agentKind = source of truth; model
// string hanya fallback untuk run legacy/in-flight yang predate agentKind.
export function featureForUsage(args: {
  agentKind?: "lite" | "pro";
  isProModel: boolean;
}): Extract<CreditFeature, "normal_chat" | "pro_chat"> {
  if (args.agentKind === "pro") return "pro_chat";
  if (args.agentKind === "lite") return "normal_chat";
  return args.isProModel ? "pro_chat" : "normal_chat";
}

export function estimateProviderCostCents(args: {
  provider: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  feature?: CreditFeature;
}): number {
  // NOTE: heuristik cents = OBSERVABILITY-only (bukan gerbang). Port verbatim V1
  // (string "gpt-5.5"); retune ke pricing Claude = follow-up P6/P9.
  if (args.feature === "external_search") {
    // Provider akademik/web (openalex/arxiv/crossref/firecrawl_search) tak dipatok
    // biaya per-call di sini — usage direkam ledger, cents observability = 0.
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

/**
 * Langganan one-time (single payment) sudah lewat masa berlaku → akses efektif
 * free. Dipakai snapshot entitlement + UI agar pembayar one-time tidak dapat akses
 * permanen (Mayar tak mengirim event expired untuk single payment). `end` null =
 * tak ada batas (admin/free) → tak pernah expired.
 */
export function isSubscriptionExpired(currentPeriodEnd: number | null | undefined, now = Date.now()): boolean {
  return currentPeriodEnd != null && currentPeriodEnd <= now;
}

export function billingStatusAllowsUsage(args: {
  planKey: PlanKey;
  status: BillingStatus;
  currentPeriodEnd?: number | null;
  now?: number;
}): boolean {
  if (args.planKey === "admin" || args.status === "admin") return true;
  if (args.planKey === "free") return true;
  if (args.status === "active" || args.status === "trialing") return true;
  const now = args.now ?? Date.now();
  return args.status === "canceled" && Boolean(args.currentPeriodEnd && args.currentPeriodEnd > now);
}

// ── Admin allowlist (env-only, pure). Resolver db-aware ada di billing/snapshot.ts ──

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function parseAdminEmails(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((email) => normalizeEmail(email))
      .filter(Boolean),
  );
}

function parseAdminIdentifiers(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((identifier) => identifier.trim())
      .filter(Boolean),
  );
}

export function isAdminOwnerUserId(ownerUserId: string | null | undefined): boolean {
  if (!ownerUserId) return false;
  return parseAdminIdentifiers(process.env.AQSHA_ADMIN_OWNER_USER_IDS).has(ownerUserId.trim());
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return parseAdminEmails(process.env.AQSHA_ADMIN_EMAILS).has(normalizeEmail(email));
}

/**
 * Plan efektif owner via admin allowlist env saja (pure). Di V2 `ownerUserId ==
 * clerkUserId == sub`, jadi satu daftar owner-id mencakup keduanya. Selain admin
 * → 'free'. Untuk plan efektif penuh (admin_entitlements table + subscription
 * mirror) pakai `resolveEffectivePlanKey` (billing/snapshot.ts).
 */
export function resolvePlanKey(args: { ownerUserId: string; email?: string | null }): PlanKey {
  if (isAdminOwnerUserId(args.ownerUserId)) return "admin";
  if (isAdminEmail(args.email)) return "admin";
  return "free";
}
