import { throwAppError, UserRepo } from "@aqsha/db";
import type { Db, DbOrTx } from "@aqsha/db";
import { WorkspaceService } from "./workspace.service";

const MAX_DISPLAY_NAME_LENGTH = 120;

/** Identitas terverifikasi dari edge (Clerk). ownerUserId == clerkUserId == sub (P1). */
export type CurrentUserIdentity = {
  ownerUserId: string;
  clerkUserId: string;
  email?: string | null;
};

export type UserProfile = {
  id: string;
  name: string | null;
  email: string | null;
  emailVerified: boolean;
  image: string | null;
};

/**
 * Provisioning di dalam transaksi yang sudah dibuka caller (tanpa membuka tx
 * sendiri) — menghindari SAVEPOINT bertingkat saat dipanggil dari
 * `OnboardingService.complete`. Upsert users (pertahankan name) + default workspace.
 */
export async function ensureUserWithin(
  tx: DbOrTx,
  identity: CurrentUserIdentity,
): Promise<{ id: string; clerkUserId: string }> {
  const existing = await UserRepo.findByOwnerUserId(tx, identity.ownerUserId);
  const now = Date.now();
  if (existing) {
    await UserRepo.patch(tx, identity.ownerUserId, {
      clerkUserId: identity.clerkUserId,
      email: identity.email ?? existing.email ?? null,
      name: existing.name ?? null, // jangan timpa name yang di-set user
      updatedAt: now,
    });
  } else {
    await UserRepo.insert(tx, {
      ownerUserId: identity.ownerUserId,
      clerkUserId: identity.clerkUserId,
      email: identity.email ?? null,
      emailVerified: false, // token tak bawa email_verified; webhook yang isi (P1 decision #2)
      name: null,
      image: null,
      createdAt: now,
      updatedAt: now,
    });
  }
  await WorkspaceService.ensureDefaultWorkspaceForOwner(tx, identity.ownerUserId);
  return { id: identity.ownerUserId, clerkUserId: identity.clerkUserId };
}

export const UserService = {
  /**
   * Seam provisioning (sync route + self-heal onboarding + webhook user.created).
   * Atomik: upsert users + default workspace dalam satu transaksi. Idempotent.
   */
  async ensureCurrentUser(
    db: Db,
    identity: CurrentUserIdentity,
  ): Promise<{ id: string; clerkUserId: string }> {
    return db.transaction((tx) => ensureUserWithin(tx, identity));
  },

  /** GET /users/me — baca row; 409 bila belum ter-sync. */
  async getCurrentUserProfile(db: DbOrTx, ownerUserId: string): Promise<UserProfile> {
    const user = await UserRepo.findByOwnerUserId(db, ownerUserId);
    if (!user) {
      throwAppError({
        code: "user_not_synced",
        message: "Authenticated user has not been synced.",
        status: 409,
      });
    }
    return {
      id: user.ownerUserId,
      name: user.name ?? null,
      email: user.email ?? null,
      emailVerified: user.emailVerified ?? false,
      image: user.image ?? null, // resolusi R2 landing P3
    };
  },

  /** PATCH /users/me — trim, non-empty, max 120; patch name + updatedAt. */
  async updateDisplayName(
    db: DbOrTx,
    ownerUserId: string,
    nameInput: string,
  ): Promise<{ ok: true }> {
    const name = nameInput.trim();
    if (!name) {
      throwAppError({
        code: "display_name_required",
        message: "Nama tampilan tidak boleh kosong.",
        field: "name",
      });
    }
    if (name.length > MAX_DISPLAY_NAME_LENGTH) {
      throwAppError({
        code: "display_name_too_long",
        message: `Nama tampilan maksimal ${MAX_DISPLAY_NAME_LENGTH} karakter.`,
        field: "name",
      });
    }
    await UserRepo.patch(db, ownerUserId, { name, updatedAt: Date.now() });
    return { ok: true };
  },

  /**
   * Webhook user.created/user.updated — webhook adalah source-of-truth profil
   * (decision #2): patch email saja (pertahankan name); insert minimal bila
   * webhook tiba sebelum /sync. Default workspace dibuat saat /sync (bukan di sini).
   */
  async applyClerkUserUpsert(
    db: DbOrTx,
    input: { clerkUserId: string; email: string | null },
  ): Promise<void> {
    const existing = await UserRepo.findByClerkUserId(db, input.clerkUserId);
    const now = Date.now();
    if (existing) {
      await UserRepo.patch(db, existing.ownerUserId, {
        email: input.email ?? existing.email ?? null,
        updatedAt: now,
      });
    } else {
      await UserRepo.insert(db, {
        ownerUserId: input.clerkUserId, // decision #1: ownerUserId == clerkUserId == sub
        clerkUserId: input.clerkUserId,
        email: input.email ?? null,
        emailVerified: false,
        name: null,
        image: null,
        createdAt: now,
        updatedAt: now,
      });
    }
  },

  /** Webhook user.deleted — P1 minimal: rekam tombstone. Cascade penuh P9. */
  async markUserDeletedFromWebhook(db: DbOrTx, clerkUserId: string): Promise<void> {
    const existing = await UserRepo.findByClerkUserId(db, clerkUserId);
    if (!existing) return;
    const now = Date.now();
    await UserRepo.patch(db, existing.ownerUserId, {
      deletionRequestedAt: now,
      updatedAt: now,
    });
  },
};
