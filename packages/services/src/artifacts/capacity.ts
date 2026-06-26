import { ArtifactRepo, type DbOrTx, throwAppError } from "@aqsha/db";
import { PLAN_CATALOG, UNLIMITED } from "../plan";
import { resolveEffectivePlanKey } from "../billing/snapshot";

/**
 * Gate kapasitas library per-plan (mirror `WorkspaceService.create`). Hitung artifact
 * aktif owner (capped) vs `PLAN_CATALOG[plan].libraryItemLimit`. Admin/unlimited skip.
 * Dipanggil sebelum insert artifact baru (createDocument/upload/url/link).
 */
export async function assertLibraryCapacity(
  db: DbOrTx,
  ownerUserId: string,
  ownerEmail?: string | null,
): Promise<void> {
  const plan = await resolveEffectivePlanKey(db, { ownerUserId, email: ownerEmail });
  const limit = PLAN_CATALOG[plan].libraryItemLimit;
  if (limit === UNLIMITED) return;
  const count = await ArtifactRepo.countActiveByOwner(db, ownerUserId, limit);
  if (count >= limit) {
    throwAppError({
      message: "Library item limit reached for current plan",
      code: "library_item_limit_reached",
      severity: "warning",
      status: 409,
    });
  }
}
