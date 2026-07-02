import { throwAppError } from "@aqsha/db";
import { FeedHydrationService, type FeedHydrationLane, resolvePlanKey } from "@aqsha/services";
import { Elysia, t } from "elysia";
import { authMacro } from "../plugins/auth";
import { delKey, setNxWithTtl } from "../clients/redis";

/**
 * Route admin (P4: feed hydrate trigger). Admin = `resolvePlanKey === "admin"` (env allowlist
 * `AQSHA_ADMIN_*`; AdminAuthService + admin_entitlements penuh = P9). `GET /admin/jobs`
 * (bull-board) + `GET /health/ready` (R2) = deferred P9.
 */
const HYDRATE_LOCK_KEY = "admin:feed:hydrate:lock";
const HYDRATE_LOCK_TTL_S = 60;

function requireAdmin(ownerUserId: string, email?: string | null): void {
  if (resolvePlanKey({ ownerUserId, email }) !== "admin") {
    throwAppError({
      message: "Akses admin diperlukan.",
      code: "admin_required",
      severity: "error",
      status: 403,
    });
  }
}

export const admin = new Elysia({ prefix: "/admin" })
  .use(authMacro)
  // POST /admin/feed/hydrate — fan-out lane hidrasi (ganti hydrateCycle). Throttle lock 60s.
  .post(
    "/feed/hydrate",
    async ({ ownerUserId, email, body }) => {
      requireAdmin(ownerUserId, email);
      const fresh = await setNxWithTtl(HYDRATE_LOCK_KEY, HYDRATE_LOCK_TTL_S);
      if (!fresh) {
        throwAppError({
          message: "Hidrasi feed sedang berjalan.",
          code: "hydration_in_progress",
          severity: "warning",
          status: 409,
        });
      }
      try {
        return await FeedHydrationService.enqueueHydrationLanes({
          lanes: body.lanes as FeedHydrationLane[] | undefined,
          staggerOverrideMs: body.staggerMs,
        });
      } catch {
        // 409-lock di-cek SEBELUM try, jadi catch ini hanya enqueue-failure (Redis/BullMQ):
        // lepas lock supaya retry tak terblok TTL 60s + map 503 queue_unavailable.
        await delKey(HYDRATE_LOCK_KEY);
        return throwAppError({
          message: "Antrian pekerjaan tidak tersedia.",
          code: "queue_unavailable",
          severity: "error",
          status: 503,
        });
      }
    },
    {
      auth: true,
      body: t.Object({
        lanes: t.Optional(
          t.Array(
            t.Union([
              t.Literal("refreshTrendingPapers"),
              t.Literal("refreshGdeltNews"),
              t.Literal("enrichNewsArticles"),
            ]),
          ),
        ),
        staggerMs: t.Optional(t.Numeric()),
      }),
    },
  );
