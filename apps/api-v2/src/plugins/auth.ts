import { Elysia, status } from "elysia";
import { verifyClerkToken } from "../clients/clerkToken";

/**
 * Macro auth tunggal. Route opt-in via `{ auth: true }`; handler menerima
 * `{ ownerUserId, clerkUserId, email }` ter-resolve. Token absent/invalid →
 * `status(401)` (bukan throw) supaya inference Eden/OpenAPI tetap rapi.
 *
 * Keputusan Fase 1: ownerUserId == clerkUserId == Clerk payload.sub.
 */
export const authMacro = new Elysia({ name: "authMacro" }).macro({
  auth: {
    async resolve({ headers }) {
      const header = headers.authorization;
      const token =
        header && /^bearer\s+/i.test(header) ? header.replace(/^bearer\s+/i, "").trim() : undefined;
      if (!token) {
        return status(401, { message: "Unauthenticated", code: "unauthenticated" });
      }
      const verified = await verifyClerkToken(token);
      if (!verified) {
        return status(401, { message: "Unauthenticated", code: "unauthenticated" });
      }
      return {
        ownerUserId: verified.sub,
        clerkUserId: verified.sub,
        email: verified.email,
        sessionId: verified.sessionId,
      };
    },
  },
});
