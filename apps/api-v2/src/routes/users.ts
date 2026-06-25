import { AccountDeletionService, UserService } from "@aqsha/services";
import { Elysia, t } from "elysia";
import { getDb } from "../clients/db";
import { authMacro } from "../plugins/auth";
import { rateLimitMacro } from "../plugins/rate-limit";

/** Route users — tipis: auth → (validasi) → 1 service call. */
export const users = new Elysia({ prefix: "/users" })
  .use(authMacro)
  .use(rateLimitMacro)
  .post(
    "/me/sync",
    ({ ownerUserId, clerkUserId, email }) => {
      const { db } = getDb();
      return UserService.ensureCurrentUser(db, { ownerUserId, clerkUserId, email });
    },
    { auth: true },
  )
  .get(
    "/me",
    ({ ownerUserId }) => {
      const { db } = getDb();
      return UserService.getCurrentUserProfile(db, ownerUserId);
    },
    { auth: true },
  )
  .patch(
    "/me",
    ({ ownerUserId, body }) => {
      const { db } = getDb();
      return UserService.updateDisplayName(db, ownerUserId, body.name);
    },
    { auth: true, body: t.Object({ name: t.String() }) },
  )
  // Hapus akun: tombstone 'deleting' + enqueue worker cascade → web sign-out.
  .delete(
    "/me",
    ({ ownerUserId }) => {
      const { db } = getDb();
      return AccountDeletionService.request(db, ownerUserId);
    },
    { auth: true, rateLimit: "account:delete" },
  );
