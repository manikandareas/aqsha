import { v } from "convex/values";

// Leaf module: imports ONLY `convex/values` so it can be shared by
// `schema.ts`, `entitlements.ts`, `usage.ts`, and the rollup write/read paths
// without introducing an import cycle.

// Ordered list of credit-feature keys tracked in the per-day usage rollup.
// Must stay in sync with the `feature` union on `providerUsageLedger` and the
// `CreditFeature` type in `./catalog`.
export const USAGE_FEATURES = [
  "normal_chat",
  "pro_chat",
  "cited_answer",
  "deep_research",
  "external_search",
  "sandbox_compute",
  "citation_verify",
] as const;

export type UsageFeature = (typeof USAGE_FEATURES)[number];

export type FeatureCounts = Record<UsageFeature, number>;

// Validator for the per-day feature-count object. The original feature keys are
// required so legacy rollup rows stay fully populated. `sandbox_compute` and
// `citation_verify` were added later as `v.optional(...)` so existing rows
// (written before the feature existed) keep validating without a backfill
// migration; read paths coalesce a missing value to 0.
export const featureCountValidator = v.object({
  normal_chat: v.number(),
  pro_chat: v.number(),
  cited_answer: v.number(),
  deep_research: v.number(),
  external_search: v.number(),
  sandbox_compute: v.optional(v.number()),
  citation_verify: v.optional(v.number()),
});

// Fresh zeroed feature-count object. Returns a new object on each call so
// callers can safely mutate it.
export function emptyFeatureCounts(): FeatureCounts {
  return {
    normal_chat: 0,
    pro_chat: 0,
    cited_answer: 0,
    deep_research: 0,
    external_search: 0,
    sandbox_compute: 0,
    citation_verify: 0,
  };
}
