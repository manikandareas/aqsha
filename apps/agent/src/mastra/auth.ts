import { MastraAuthClerk } from "@mastra/auth-clerk";

/**
 * Auth Clerk native Mastra (`MastraAuthClerk`), bukan verifikasi token buatan tangan.
 *
 * `MastraAuthClerk.authenticateToken` memverifikasi bearer Clerk via JWKS (RS256), jadi WAJIB
 * `jwksUri` + `secretKey` + `publishableKey`. `jwksUri` kita turunkan dari publishableKey
 * (base64 → frontend-API domain) supaya cukup set `CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY`
 * (nilai SAMA dengan api/web).
 *
 * `mapUserToResourceId` = sumber KEAMANAN memory: Mastra memakai nilai ini sebagai
 * `MASTRA_RESOURCE_ID_KEY` di RequestContext dan ia MENIMPA `resource` yang dikirim klien
 * (cegah user mengakses thread user lain). resourceId = `sub` (Clerk userId) = `owner_user_id`
 * aplikasi → memory thread selaras dengan kepemilikan data app. Auth default mengizinkan semua
 * user terautentikasi (`authorizeUser` → true).
 */
function deriveJwksUri(publishableKey: string): string {
  const withoutPrefix = publishableKey.replace(/^pk_(test|live)_/, "");
  const domain = atob(withoutPrefix).replace(/\$+$/, "");
  return `https://${domain}/.well-known/jwks.json`;
}

export function createClerkAuth(): MastraAuthClerk {
  const secretKey = process.env.CLERK_SECRET_KEY;
  const publishableKey = process.env.CLERK_PUBLISHABLE_KEY;
  if (!secretKey || !publishableKey) {
    throw new Error(
      "CLERK_SECRET_KEY and CLERK_PUBLISHABLE_KEY are required for the Mastra Astra runtime auth",
    );
  }
  const jwksUri = process.env.CLERK_JWKS_URI ?? deriveJwksUri(publishableKey);
  return new MastraAuthClerk({
    secretKey,
    publishableKey,
    jwksUri,
    mapUserToResourceId: (user) => (typeof user.sub === "string" ? user.sub : null),
  });
}
