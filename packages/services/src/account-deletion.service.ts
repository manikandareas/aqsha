import {
  artifactContents,
  artifacts,
  artifactUrls,
  type Db,
  type DbOrTx,
  UserRepo,
  users,
} from "@aqsha/db";
import { eq } from "drizzle-orm";
import { ACCOUNT_QUEUES, enqueue } from "./clients/queue";
import { StorageService } from "./storage.service";

export type DeletionStatus = "active" | "deleting" | "deleted" | "failed";

/** Kumpulkan SEMUA blob key object-storage milik owner (artifacts + contents + urls). */
async function collectStorageKeys(db: DbOrTx, ownerUserId: string): Promise<string[]> {
  const [files, contents, urls] = await Promise.all([
    db
      .select({ k: artifacts.storageR2Key })
      .from(artifacts)
      .where(eq(artifacts.ownerUserId, ownerUserId)),
    db
      .select({
        p: artifactContents.plainTextR2Key,
        b: artifactContents.blocksJsonR2Key,
        m: artifactContents.markdownR2Key,
      })
      .from(artifactContents)
      .where(eq(artifactContents.ownerUserId, ownerUserId)),
    db
      .select({ r: artifactUrls.readableTextR2Key })
      .from(artifactUrls)
      .where(eq(artifactUrls.ownerUserId, ownerUserId)),
  ]);
  const keys: string[] = [];
  for (const f of files) if (f.k) keys.push(f.k);
  for (const c of contents) {
    if (c.p) keys.push(c.p);
    if (c.b) keys.push(c.b);
    if (c.m) keys.push(c.m);
  }
  for (const u of urls) if (u.r) keys.push(u.r);
  return keys;
}

/**
 * AccountDeletionService — cascade hard-delete seluruh data owner (P9).
 *
 * Mekanik: FK `owner_user_id → users` ber-`ON DELETE CASCADE` (migrasi 0009) →
 * satu `DELETE FROM users` menghapus SEMUA tabel owner-scoped sekaligus (tanpa cap
 * 500, self-maintaining: tabel owner baru otomatis ikut). Blob object-storage tak
 * ada di PG → di-sweep terpisah dari key yang dikumpulkan dulu. `request` set
 * tombstone + enqueue worker; `run` (worker) idempoten + BullMQ-retryable.
 */
export const AccountDeletionService = {
  /** Self-serve / webhook entry: guard idempoten → tombstone 'deleting' → enqueue. */
  async request(db: DbOrTx, ownerUserId: string): Promise<{ status: "deleting" | "deleted" }> {
    const user = await UserRepo.findByOwnerUserId(db, ownerUserId);
    if (!user || (user.deletionStatus as DeletionStatus) === "deleted") {
      return { status: "deleted" };
    }
    if ((user.deletionStatus as DeletionStatus) === "deleting") {
      return { status: "deleting" };
    }
    const now = Date.now();
    await UserRepo.patch(db, ownerUserId, {
      deletionStatus: "deleting",
      deletionRequestedAt: now,
      updatedAt: now,
    });
    await enqueue(ACCOUNT_QUEUES.accountDeletion, { ownerUserId });
    return { status: "deleting" };
  },

  /** Webhook Clerk `user.deleted` — resolve owner dari clerkUserId lalu reuse `request`. */
  async requestByClerkId(db: DbOrTx, clerkUserId: string): Promise<void> {
    const user = await UserRepo.findByClerkUserId(db, clerkUserId);
    if (user) await this.request(db, user.ownerUserId);
  },

  /**
   * Worker entry — idempoten + retryable. Urutan: hapus user Clerk (404=ok via
   * `deps.deleteClerkUser`) → kumpulkan blob key → hapus blob best-effort →
   * `DELETE FROM users` (cascade semua dependent). Throw sebelum DELETE → tandai
   * `failed` (job retry backoff). Sesudah DELETE, baris hilang = state 'deleted'.
   */
  async run(
    db: Db,
    deps: { deleteClerkUser: (clerkUserId: string) => Promise<void> },
    ownerUserId: string,
  ): Promise<void> {
    const user = await UserRepo.findByOwnerUserId(db, ownerUserId);
    if (!user) return; // sudah terhapus (idempoten)
    try {
      await deps.deleteClerkUser(user.clerkUserId);
      const keys = await collectStorageKeys(db, ownerUserId);
      for (const key of keys) {
        try {
          await StorageService.deleteObject(key);
        } catch (err) {
          // blob orphan ≪ blok deletion — log + lanjut.
          console.error(`[account-deletion] blob ${key} gagal dihapus`, err);
        }
      }
      // ponytail: cascade DELETE satu-transaksi (tanpa cap). Bila suatu akun pernah
      // punya jutaan baris embedding & DELETE timeout, pindah ke batched delete per-tabel.
      await db.delete(users).where(eq(users.ownerUserId, ownerUserId));
    } catch (err) {
      await UserRepo.patch(db, ownerUserId, {
        deletionStatus: "failed",
        updatedAt: Date.now(),
      }).catch(() => {});
      throw err;
    }
  },

  collectStorageKeys,
};
