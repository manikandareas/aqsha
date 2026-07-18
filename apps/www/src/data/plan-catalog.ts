/**
 * Snapshot of public plan catalog for marketing pricing + JSON-LD.
 * Product SSOT: packages/services/src/plan.ts.
 * Drift is blocked by `bun run check:plans` (wired into www typecheck).
 */

export type PublicPlanKey = "free" | "starter" | "plus" | "ultra";

export type PlanDefinition = {
  key: PublicPlanKey;
  label: string;
  monthlyPriceIdr: number;
  annualPriceIdr: number;
  monthlyCredits: number;
  deepResearchRuns: number;
  workspaceLimit: number;
  libraryItemLimit: number;
  features: string[];
};

/** Batas tak-terhingga ditandai Number.MAX_SAFE_INTEGER (sama seperti product catalog). */
export const UNLIMITED = Number.MAX_SAFE_INTEGER;

export const PLAN_CATALOG: Record<PublicPlanKey, PlanDefinition> = {
  free: {
    key: "free",
    label: "Free",
    monthlyPriceIdr: 0,
    annualPriceIdr: 0,
    monthlyCredits: 150,
    deepResearchRuns: 2,
    workspaceLimit: 1,
    libraryItemLimit: 25,
    features: [
      "Astra Lite",
      "150 credits per bulan",
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
    features: [
      "Astra Lite + Astra Pro",
      "10.000 credits per bulan",
      "Deep Research tanpa batas (fair-use)",
      "Workspace tanpa batas",
      "Library tanpa batas",
    ],
  },
};

export const PUBLIC_PLAN_KEYS: PublicPlanKey[] = [
  "free",
  "starter",
  "plus",
  "ultra",
];
