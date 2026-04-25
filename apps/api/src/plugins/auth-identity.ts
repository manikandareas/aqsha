import { Elysia } from "elysia";
import { auth } from "../auth";

export type AuthIdentity = {
  authUserId: string;
  authTokenIdentifier: string;
};

export const authIdentityPlugin = new Elysia({
  name: "plugin.auth-identity",
}).resolve({ as: "scoped" }, async ({ request, status }) => {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session) {
    return status(401, {
      error: {
        code: "unauthorized",
        message: "Unauthorized",
      },
    });
  }

  return {
    authSession: session,
    identity: {
      authUserId: session.user.id,
      authTokenIdentifier: `better-auth:${session.session.token}`,
    } satisfies AuthIdentity,
  };
});
