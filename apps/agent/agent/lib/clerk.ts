import { clerkClaimsToPrincipal } from "@aqsha/chat-core";
import { verifyToken } from "@clerk/backend";
import { type AuthFn, extractBearerToken } from "eve/channels/auth";

/**
 * AuthFn Clerk untuk channel eve (Slice 6.1). eve = proses Node TERPISAH dari Next,
 * jadi helper `@clerk/nextjs/server` (yang baca cookie/header dari konteks Next) TAK
 * tersedia — kita verifikasi token sesi mentah dengan `@clerk/backend.verifyToken`
 * (networkless via `secretKey`), reuse pola `apps/api/src/clients/clerkToken.ts`.
 *
 * Token sesi Clerk = RS256 → tak cocok faktori `jwtHmac`/`jwtEcdsa` eve; AuthFn custom
 * wajib. Klien melampirkan bearer via `useEveAgent({ auth: { bearer } })`. Return:
 * - `SessionAuthContext { principalId: sub, principalType: "user", ... }` bila valid.
 * - `null` bila token absen/invalid → `routeAuth` skip ke entri berikut (`localDev` di
 *   non-prod) atau 401 bila habis. (Tak melempar supaya 401 bersih, bukan 500.)
 */
export function clerkAuth(): AuthFn<Request> {
  return async (request) => {
    const token = extractBearerToken(request.headers.get("authorization"));
    if (!token) return null;
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) return null;
    try {
      const claims = await verifyToken(token, { secretKey });
      return clerkClaimsToPrincipal(claims as Record<string, unknown>);
    } catch {
      return null;
    }
  };
}
