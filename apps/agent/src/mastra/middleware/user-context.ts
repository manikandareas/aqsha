import { clerkClaimsToPrincipal } from "@aqsha/chat-core";
import { verifyToken } from "@clerk/backend";
import type { ContextWithMastra, Middleware } from "@mastra/core/server";
import { AQSHA_EMAIL_KEY } from "../lib/tool-context";

/**
 * Middleware konteks-user (Fase 1) — melengkapi `MastraAuthClerk` (yang hanya memetakan
 * resourceId = Clerk `sub`). Untuk gate entitlement admin (`AQSHA_ADMIN_EMAILS`), billing
 * butuh email caller. Mastra tak otomatis menaruh email di RequestContext, jadi middleware ini
 * memverifikasi bearer Clerk (networkless via `secretKey`) sekali, ekstrak email dari klaim
 * (reuse `clerkClaimsToPrincipal`), dan set ke `AQSHA_EMAIL_KEY` — dibaca tool via
 * `callerEmail(ctx)`.
 *
 * Best-effort: token tanpa klaim email → tak set apa-apa (admin-allowlist tak aktif untuk user
 * itu, persis perilaku eve). Tak pernah memblokir request (auth sudah ditegakkan
 * `server.auth`); kegagalan di-swallow.
 */
const handler = async (c: ContextWithMastra, next: () => Promise<void>): Promise<void> => {
  try {
    const auth = c.req.header("authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;
    const secretKey = process.env.CLERK_SECRET_KEY;
    const requestContext = c.get("requestContext");
    if (token && secretKey && requestContext) {
      const claims = await verifyToken(token, { secretKey });
      const principal = clerkClaimsToPrincipal(claims as Record<string, unknown>);
      const email = principal?.attributes?.email;
      if (typeof email === "string" && email.length > 0) {
        requestContext.set(AQSHA_EMAIL_KEY, email);
      }
    }
  } catch {
    // email opsional — jangan blokir request bila verifikasi gagal.
  }
  await next();
};

export const userContextMiddleware: Middleware = handler;
