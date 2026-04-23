import { Elysia, t } from "elysia";
import { clerkPlugin } from "elysia-clerk";
import { sessionModel } from "./model";
import { sessionService } from "./service";
import { getAuthenticatedIdentity } from "../../utils";

export const sessionModule = new Elysia({
  prefix: "/session",
  name: "module.session",
  tags: ["session"],
})
  .use(clerkPlugin())
  .post(
    "/ensure-profile",
    async ({ auth, clerk, status }) => {
      const identity = getAuthenticatedIdentity(auth());

      if (!identity) {
        return status(401, "Unauthorized");
      }

      const user = await clerk.users.getUser(identity.clerkUserId);

      const fullName = [user.firstName, user.lastName]
        .filter(Boolean)
        .join(" ");

      const primaryEmail =
        user.emailAddresses.find(
          (email) => email.id === user.primaryEmailAddressId,
        )?.emailAddress ?? user.emailAddresses[0].emailAddress;

      await sessionService.ensureProfile({
        clerkUserId: identity.clerkUserId,
        authTokenIdentifier: identity.authTokenIdentifier,
        email: primaryEmail ?? "",
        name: user.fullName ?? (fullName.length > 0 ? fullName : null),
        avatarUrl: user.imageUrl ?? null,
      });

      return status(204, undefined);
    },
    {
      detail: {
        summary: "Ensure user profile",
        description:
          "Synchronizes the Clerk user identity into the local database. Creates or updates the profile as needed.",
      },
      response: {
        204: t.Void(),
        401: t.Literal("Unauthorized"),
      },
    },
  )
  .get(
    "/bootstrap",
    async ({ auth, status }) => {
      const identity = getAuthenticatedIdentity(auth());

      if (!identity) {
        return status(401, "Unauthorized");
      }

      return sessionService.getBootstrap(
        identity.authTokenIdentifier,
        identity.clerkUserId,
      );
    },
    {
      detail: {
        summary: "Bootstrap session",
        description:
          "Returns the current user profile and workspace context required to bootstrap the client application.",
      },
      response: {
        200: sessionModel.bootstrapResponse,
        401: t.Literal("Unauthorized"),
      },
    },
  )
  .get(
    "/onboarding",
    async ({ auth, status }) => {
      const identity = getAuthenticatedIdentity(auth());

      if (!identity) {
        return status(401, "Unauthorized");
      }

      return sessionService.getOnboarding(
        identity.authTokenIdentifier,
        identity.clerkUserId,
      );
    },
    {
      detail: {
        summary: "Get onboarding state",
        description:
          "Returns onboarding flags and checklist state for the currently authenticated user.",
      },
      response: {
        200: sessionModel.onboardingResponse,
        401: t.Literal("Unauthorized"),
      },
    },
  );
