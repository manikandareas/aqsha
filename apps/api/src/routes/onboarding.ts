import { OnboardingService } from "@aqsha/services";
import { Elysia, t } from "elysia";
import { getDb } from "../clients/db";
import { authMacro } from "../plugins/auth";

/**
 * Route onboarding. Body sengaja permisif (tanpa minItems/enum) — validasi
 * terstruktur (dedup-filter-count, enum, other wajib) ada di OnboardingService
 * supaya kode error sesuai kontrak.
 */
export const onboarding = new Elysia({ prefix: "/onboarding" })
  .use(authMacro)
  .get(
    "/status",
    ({ ownerUserId }) => {
      const { db } = getDb();
      return OnboardingService.getStatus(db, ownerUserId);
    },
    { auth: true },
  )
  .post(
    "/complete",
    ({ ownerUserId, clerkUserId, email, body }) => {
      const { db } = getDb();
      return OnboardingService.complete(db, { ownerUserId, clerkUserId, email }, body);
    },
    {
      auth: true,
      body: t.Object({
        background: t.String(),
        interests: t.Array(t.String()),
        heardAboutSource: t.String(),
        heardAboutOther: t.Optional(t.String()),
      }),
    },
  );
