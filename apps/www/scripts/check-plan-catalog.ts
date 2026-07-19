/**
 * Asserts apps/www marketing plan snapshot stays in sync with the product
 * catalog in packages/services. Run via `bun run check:plans` (also hooked
 * into www typecheck).
 */
import {
  PLAN_CATALOG as productCatalog,
  UNLIMITED as productUnlimited,
  type PublicPlanKey,
} from "../../../packages/services/src/plan";
import {
  PLAN_CATALOG as marketingCatalog,
  PUBLIC_PLAN_KEYS,
  UNLIMITED as marketingUnlimited,
} from "../src/data/plan-catalog";

const PUBLIC_FIELDS = [
  "monthlyPriceIdr",
  "annualPriceIdr",
  "monthlyCredits",
  "deepResearchRuns",
  "workspaceLimit",
  "libraryItemLimit",
  "features",
] as const;

const errors: string[] = [];

if (marketingUnlimited !== productUnlimited) {
  errors.push(
    `UNLIMITED sentinel mismatch: marketing=${marketingUnlimited} product=${productUnlimited}`,
  );
}

for (const key of PUBLIC_PLAN_KEYS) {
  const marketing = marketingCatalog[key];
  const product = productCatalog[key as PublicPlanKey];
  if (!product) {
    errors.push(`Missing product plan: ${key}`);
    continue;
  }
  for (const field of PUBLIC_FIELDS) {
    const left = JSON.stringify(marketing[field]);
    const right = JSON.stringify(product[field]);
    if (left !== right) {
      errors.push(`${key}.${field}: marketing=${left} product=${right}`);
    }
  }
}

if (errors.length > 0) {
  console.error("Plan catalog drift detected:\n" + errors.map((e) => `  - ${e}`).join("\n"));
  console.error(
    "\nUpdate apps/www/src/data/plan-catalog.ts from packages/services/src/plan.ts",
  );
  process.exit(1);
}

console.log("Plan catalog in sync with packages/services for public plans.");
