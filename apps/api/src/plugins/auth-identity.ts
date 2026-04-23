import { Elysia } from "elysia";
import { clerkPlugin } from "elysia-clerk";
import { getAuthenticatedIdentity } from "../utils";

export const authIdentityPlugin = new Elysia({
  name: "plugin.auth-identity",
})
  .use(clerkPlugin())
  .resolve({ as: "scoped" }, ({ auth, status }) => {
    if (!auth) {
      return status(401, {
        error: {
          code: "unauthorized",
          message: "Unauthorized",
        },
      });
    }

    const identity = getAuthenticatedIdentity(auth());

    if (!identity) {
      return status(401, {
        error: {
          code: "unauthorized",
          message: "Unauthorized",
        },
      });
    }

    return { identity };
  });
