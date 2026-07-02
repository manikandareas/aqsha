import { AgentPreferencesService, OnboardingService } from "@aqsha/services";
import { Elysia, t } from "elysia";
import { getDb } from "../clients/db";
import { authMacro } from "../plugins/auth";

/**
 * Route preferences (IMP-2) — Settings → Personalisasi. Tipis: auth → service.
 * Body permisif (string bebas); validasi enum + cap chars hidup di
 * `AgentPreferencesService`/`OnboardingService` supaya kode error sesuai kontrak.
 */
export const preferences = new Elysia({ prefix: "/preferences" })
  .use(authMacro)
  .get(
    "/",
    async ({ ownerUserId }) => {
      const { db } = getDb();
      const [prefs, onboarding] = await Promise.all([
        AgentPreferencesService.get(db, ownerUserId),
        OnboardingService.getProfile(db, ownerUserId),
      ]);
      return { ...prefs, interests: onboarding.interests };
    },
    { auth: true },
  )
  .patch(
    "/",
    ({ ownerUserId, body }) => {
      const { db } = getDb();
      return AgentPreferencesService.update(db, ownerUserId, body);
    },
    {
      auth: true,
      body: t.Object({
        answerLanguage: t.Optional(t.Nullable(t.String())),
        citationStyle: t.Optional(t.Nullable(t.String())),
        responseStyle: t.Optional(t.Nullable(t.String())),
        customInstruction: t.Optional(t.Nullable(t.String())),
      }),
    },
  )
  .patch(
    "/interests",
    ({ ownerUserId, body }) => {
      const { db } = getDb();
      return OnboardingService.updateInterests(db, ownerUserId, body.interests);
    },
    { auth: true, body: t.Object({ interests: t.Array(t.String()) }) },
  );
