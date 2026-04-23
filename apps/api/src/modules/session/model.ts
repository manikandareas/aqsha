import { t } from "elysia";

const planCode = t.Union([t.Literal("free"), t.Literal("pro")]);

const onboarding = t.Object({
  shouldShow: t.Boolean(),
  reason: t.Union([t.Literal("missing_first_journal"), t.Null()]),
});

export const sessionModel = {
  onboarding,
  bootstrapResponse: t.Union([
    t.Object({
      user: t.Object({
        id: t.String(),
        email: t.String(),
        name: t.Union([t.String(), t.Null()]),
        avatarUrl: t.Union([t.String(), t.Null()]),
        planCode,
      }),
      workspace: t.Object({
        id: t.String(),
        userId: t.String(),
        ownerUserId: t.String(),
        name: t.String(),
        slug: t.Union([t.String(), t.Null()]),
      }),
      plan: t.Object({
        code: planCode,
        label: t.String(),
      }),
      usage: t.Object({
        period: t.String(),
        aiActionsUsed: t.Number(),
        aiActionsReserved: t.Number(),
        aiActionsRemaining: t.Number(),
        exportsRemaining: t.Number(),
        sourceUploadsRemaining: t.Number(),
      }),
      journalStats: t.Object({
        activeCount: t.Number(),
        archivedCount: t.Number(),
      }),
      onboarding,
    }),
    t.Null(),
  ]),
  onboardingResponse: t.Union([onboarding, t.Null()]),
};
