import { Elysia, t } from "elysia";
import { sessionModel } from "./model";
import { authIdentityPlugin } from "../../plugins/auth-identity";
import { servicesPlugin } from "../../plugins/services";
import type { AuthProfileInput } from "../users/service";

function toAuthProfileInput(user: {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string;
  image?: string | null;
}): AuthProfileInput {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    name: user.name,
    avatarUrl: user.image ?? null,
  };
}

export const sessionModule = new Elysia({
  prefix: "/session",
  name: "module.session",
  tags: ["session"],
})
  .use(servicesPlugin)
  .use(authIdentityPlugin)
  .post(
    "/ensure-profile",
    async ({ authSession, sessionService, status }) => {
      await sessionService.ensureProfile(
        toAuthProfileInput(authSession.user),
      );

      return status(204, undefined);
    },
    {
      detail: {
        summary: "Ensure user profile",
        description:
          "Synchronizes the Better Auth user identity into the local database. Creates or updates the profile as needed.",
      },
      response: {
        204: t.Void(),
        401: sessionModel.unauthorizedError,
      },
    },
  )
  .post(
    "/get-started",
    async ({ authSession, sessionService }) => {
      return sessionService.getStarted(toAuthProfileInput(authSession.user));
    },
    {
      body: sessionModel.getStartedBody,
      detail: {
        summary: "Complete get-started onboarding",
        description:
          "Synchronizes the Better Auth user, marks onboarding complete, ensures an internal free subscription, then returns the bootstrap payload.",
      },
      response: {
        200: sessionModel.bootstrapResponse,
        401: sessionModel.unauthorizedError,
      },
    },
  )
  .get(
    "/bootstrap",
    async ({ identity, sessionService }) => {
      return sessionService.getBootstrap(identity.authUserId);
    },
    {
      detail: {
        summary: "Bootstrap session",
        description:
          "Returns the current user profile required to bootstrap the client application.",
      },
      response: {
        200: sessionModel.bootstrapResponse,
        401: sessionModel.unauthorizedError,
      },
    },
  )
  .get(
    "/onboarding",
    async ({ identity, sessionService }) => {
      return sessionService.getOnboarding(identity.authUserId);
    },
    {
      detail: {
        summary: "Get onboarding state",
        description:
          "Returns onboarding flags and checklist state for the currently authenticated user.",
      },
      response: {
        200: sessionModel.onboardingResponse,
        401: sessionModel.unauthorizedError,
      },
    },
  );
