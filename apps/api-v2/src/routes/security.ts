import { AppError } from "@aqsha/db";
import { Elysia, t } from "elysia";
import { listUserSessions, revokeUserSession } from "../clients/clerkBackend";
import { authMacro } from "../plugins/auth";
import { rateLimitMacro } from "../plugins/rate-limit";

/**
 * Route security — perangkat aktif diproksi ke Clerk Backend SDK (password & 2FA
 * ditangani langsung Clerk frontend SDK di web-v2, tak lewat sini). Tipis:
 * auth → (guard) → 1 helper Clerk.
 */
export const security = new Elysia({ prefix: "/security" })
  .use(authMacro)
  .use(rateLimitMacro)
  // Daftar sesi aktif + tanda "perangkat ini" (sesi token saat ini).
  .get(
    "/sessions",
    async ({ clerkUserId, sessionId }) => {
      const sessions = await listUserSessions(clerkUserId);
      return sessions.map((s) => ({ ...s, isCurrent: s.id === sessionId }));
    },
    { auth: true },
  )
  // Keluarkan satu perangkat. Sesi sendiri ditolak (gunakan logout biasa).
  .post(
    "/sessions/:id/revoke",
    async ({ clerkUserId, sessionId, params }) => {
      if (params.id === sessionId) {
        throw new AppError({
          message: "Tidak bisa keluar dari perangkat ini di sini. Gunakan tombol keluar biasa.",
          code: "cannot_revoke_current_session",
          status: 400,
        });
      }
      await revokeUserSession({ clerkUserId, sessionId: params.id });
      return { ok: true };
    },
    { auth: true, rateLimit: "security:sessions-revoke", params: t.Object({ id: t.String() }) },
  );
