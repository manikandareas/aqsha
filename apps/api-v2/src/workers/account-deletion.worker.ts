import { AccountDeletionService } from "@aqsha/services";
import type { Job } from "bullmq";
import { deleteClerkUser } from "../clients/clerkBackend";
import { getDb } from "../clients/db";

export type AccountDeletionJob = {
  ownerUserId: string;
};

/**
 * Worker `account-deletion` (P9) — cascade hard-delete data owner. Trigger:
 * `DELETE /users/me` (self-serve) + webhook Clerk `user.deleted`. Idempoten +
 * retryable (attempt-guard + backoff di `enqueue`).
 */
export async function processAccountDeletion(job: Job<AccountDeletionJob>): Promise<void> {
  const { db } = getDb();
  await AccountDeletionService.run(db, { deleteClerkUser }, job.data.ownerUserId);
}
