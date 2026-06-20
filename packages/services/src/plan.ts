// Plan catalog + resolver plan (stub P2 sampai billing penuh P5).
//
// Pure module (tanpa import db). `PLAN_CATALOG` di-port lengkap dari V1
// `packages/convex/convex/billing/catalog.ts` supaya jadi SSOT yang P5 tinggal
// extend (live Polar + admin_entitlements table). Di P2, plan diturunkan dari
// admin allowlist env saja: admin → unlimited, selain itu 'free'.

export type PlanKey = "free" | "starter" | "plus" | "admin";
export type PublicPlanKey = Exclude<PlanKey, "admin">;

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

/** Batas tak-terhingga (admin) ditandai `Number.MAX_SAFE_INTEGER`. */
export const UNLIMITED = Number.MAX_SAFE_INTEGER;

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

/**
 * Plan efektif owner (P2 stub). Admin allowlist via env (port V1 `billing/admin.ts`):
 * `AQSHA_ADMIN_OWNER_USER_IDS` + `AQSHA_ADMIN_EMAILS`. Di V2 `ownerUserId == clerkUserId
 * == sub`, jadi satu daftar owner-id mencakup keduanya. Selain admin → 'free'
 * (langganan berbayar nyata baru aktif di P5).
 */
export function resolvePlanKey(args: { ownerUserId: string; email?: string | null }): PlanKey {
  if (parseAdminIdentifiers(process.env.AQSHA_ADMIN_OWNER_USER_IDS).has(args.ownerUserId.trim())) {
    return "admin";
  }
  if (args.email && parseAdminEmails(process.env.AQSHA_ADMIN_EMAILS).has(normalizeEmail(args.email))) {
    return "admin";
  }
  return "free";
}
