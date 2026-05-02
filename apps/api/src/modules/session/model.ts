import { t } from "elysia";

const planCode = t.Union([t.Literal("free"), t.Literal("pro")]);

const onboarding = t.Object({
  shouldShow: t.Boolean(),
  reason: t.Union([t.Literal("missing_first_journal"), t.Null()]),
});

const unauthorizedError = t.Object({
  error: t.Object({
    code: t.Literal("unauthorized"),
    message: t.String(),
  }),
});

export const sessionModel = {
  onboarding,
  unauthorizedError,
  getStartedBody: t.Object({}),
  validationError: t.Object({
    error: t.Object({
      code: t.Literal("validation_error"),
      message: t.String(),
    }),
  }),
  bootstrapResponse: t.Union([
    t.Object({
      user: t.Object({
        id: t.String(),
        email: t.String(),
        name: t.Union([t.String(), t.Null()]),
        avatarUrl: t.Union([t.String(), t.Null()]),
        planCode,
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
