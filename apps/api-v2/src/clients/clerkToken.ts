import { verifyToken } from "@clerk/backend";

function requireSecretKey(): string {
  const key = process.env.CLERK_SECRET_KEY;
  if (!key) throw new Error("CLERK_SECRET_KEY is required to verify Clerk tokens");
  return key;
}

/**
 * Verifikasi session token Clerk (networkless via secretKey). Mengembalikan
 * payload bila valid, atau `null` bila tak valid — supaya auth macro memancarkan
 * 401 bersih alih-alih 500. (Modul terpisah dari webhook agar test memock token
 * tanpa menyentuh verifikasi webhook.)
 */
export async function verifyClerkToken(
  token: string,
): Promise<{ sub: string; email: string | null } | null> {
  try {
    const payload = await verifyToken(token, { secretKey: requireSecretKey() });
    if (!payload?.sub) return null;
    // email bukan claim standar token sesi; best-effort (source-of-truth = webhook).
    const claims = payload as unknown as Record<string, unknown>;
    const email = typeof claims.email === "string" ? claims.email : null;
    return { sub: payload.sub, email };
  } catch {
    return null;
  }
}
