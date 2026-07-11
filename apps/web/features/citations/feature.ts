"use client";

import { useBillingCurrent } from "@/features/settings/api";
import { featureFlags } from "@/lib/feature-flags";

/**
 * Gate Citation Manager (tab Sitasi + entry "Tambahkan ke Sitasi"). Aktif bila flag
 * build-time `NEXT_PUBLIC_FEATURE_WORKSPACE_CITATIONS=true` (GA) ATAU user internal
 * (`isAdmin` dari billing snapshot). Default (env kosong) = hanya internal users,
 * sesuai rollout §10. Deep-link `?panel=cite` diguard di `WorkspaceSidePanel`.
 */
export function useWorkspaceCitationsEnabled(): boolean {
  const billing = useBillingCurrent();
  return featureFlags.workspaceCitations || (billing.data?.isAdmin ?? false);
}
