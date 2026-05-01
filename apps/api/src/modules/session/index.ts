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

function getWorkspaceNameError(workspaceName: string): string | null {
  if (!workspaceName) {
    return "Workspace name is required.";
  }

  if (workspaceName.length > 80) {
    return "Workspace name must be 80 characters or fewer.";
  }

  return null;
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
    async ({ authSession, body, sessionService, status }) => {
      const workspaceName = body.workspaceName.trim();
      const workspaceNameError = getWorkspaceNameError(workspaceName);

      if (workspaceNameError) {
        return status(400, {
          error: {
            code: "validation_error",
            message: workspaceNameError,
          },
        });
      }

      return sessionService.getStarted({
        ...toAuthProfileInput(authSession.user),
        workspaceName,
      });
    },
    {
      body: sessionModel.getStartedBody,
      detail: {
        summary: "Complete get-started onboarding",
        description:
          "Synchronizes the Better Auth user, provisions the owned workspace, ensures owner membership and an internal free subscription, then returns the bootstrap payload.",
      },
      response: {
        200: sessionModel.bootstrapResponse,
        400: sessionModel.validationError,
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
          "Returns the current user profile and workspace context required to bootstrap the client application.",
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
