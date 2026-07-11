/**
 * Feature flags build-time (`NEXT_PUBLIC_*`) untuk rollout bertahap. Repo belum
 * punya sistem flag runtime; nilai di sini di-bake saat build — GA sebuah fitur =
 * set env-nya `true` lalu redeploy. Gate visibilitas per-fitur biasanya flag ini
 * OR `isAdmin` (internal users selalu lihat), lihat `features/citations/feature.ts`.
 */
export const featureFlags = {
  /** Citation Manager (tab Sitasi workspace). Rollout §10 plan citation-manager. */
  workspaceCitations: process.env.NEXT_PUBLIC_FEATURE_WORKSPACE_CITATIONS === "true",
} as const;
