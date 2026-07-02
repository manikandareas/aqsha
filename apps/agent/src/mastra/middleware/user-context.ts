import { clerkClaimsToPrincipal } from "@aqsha/chat-core";
import { verifyToken } from "@clerk/backend";
import type { ContextWithMastra, Middleware } from "@mastra/core/server";
import { AQSHA_EMAIL_KEY, AQSHA_SERVER_OWNED_CONTEXT_KEYS } from "../lib/tool-context";

/**
 * Middleware konteks-user — melengkapi `MastraAuthClerk` (yang hanya memetakan
 * resourceId = Clerk `sub`). Untuk gate entitlement admin (`AQSHA_ADMIN_EMAILS`), billing
 * butuh email caller. Mastra tak otomatis menaruh email di RequestContext, jadi middleware ini
 * memverifikasi bearer Clerk (networkless via `secretKey`) sekali, ekstrak email dari klaim
 * (reuse `clerkClaimsToPrincipal`), dan set ke `AQSHA_EMAIL_KEY` — dibaca tool via
 * `callerEmail(ctx)`.
 *
 * Sekaligus pagar keamanan (SEC-1): `mergeBodyRequestContext` (@mastra/server) menyalin
 * `requestContext` dari body klien ke RequestContext server untuk key yang BELUM terdefinisi —
 * hanya prefix `mastra__` yang reserved, jadi tanpa pagar ini user terautentikasi bisa kirim
 * `{requestContext:{"aqsha__email":"<admin>"}}` dan lolos gate admin billing (kredit unlimited).
 * Middleware ini jalan SEBELUM handler me-merge body, jadi pre-seed SEMUA key server-owned
 * `aqsha__*` (`AQSHA_SERVER_OWNED_CONTEXT_KEYS`) — key yang sudah terdefinisi tak akan ditimpa
 * nilai klien. Kode server (workflow step, tool) tetap bebas men-`set` ulang setelahnya.
 *
 * Email best-effort: token tanpa klaim email / verifikasi gagal → tetap `""` (= absen bagi
 * `callerEmail`; admin-allowlist jatuh ke fallback email users-table di `resolveAdminOverride`).
 * Tak pernah memblokir request (auth sudah ditegakkan `server.auth`).
 */
const handler = async (c: ContextWithMastra, next: () => Promise<void>): Promise<void> => {
  const requestContext = c.get("requestContext");
  if (requestContext) {
    for (const key of AQSHA_SERVER_OWNED_CONTEXT_KEYS) {
      requestContext.set(key, "");
    }
    const email = await verifiedEmailFromBearer(c);
    if (email) {
      requestContext.set(AQSHA_EMAIL_KEY, email);
    }
  }
  await next();
};

/**
 * Email terverifikasi dari bearer Clerk; `null` bila token/secret absen, klaim tanpa email,
 * atau verifikasi gagal (email opsional — jangan blokir request).
 */
async function verifiedEmailFromBearer(c: ContextWithMastra): Promise<string | null> {
  try {
    const auth = c.req.header("authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!token || !secretKey) return null;
    const claims = await verifyToken(token, { secretKey });
    const principal = clerkClaimsToPrincipal(claims as Record<string, unknown>);
    const email = principal?.attributes?.email;
    return typeof email === "string" && email.length > 0 ? email : null;
  } catch {
    return null;
  }
}

export const userContextMiddleware: Middleware = handler;
