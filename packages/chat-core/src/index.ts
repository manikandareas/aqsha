/**
 * @aqsha/chat-core — logika MURNI chat Astra (Fase 6), zero-dep & SATU FILE
 * (tanpa relative import).
 *
 * Kenapa paket sendiri: PROSES eve (`apps/web-v2/agent/*`) di-bundle Rolldown dan
 * TIDAK bisa mengonsumsi paket workspace TS-mentah dengan relative-import tanpa
 * ekstensi (`@aqsha/db`/`@aqsha/services`) — bundler-nya gagal resolve, dan runtime
 * Node tak bisa import `.ts` mentah bila di-externalize. Paket satu-file tanpa relative
 * import BISA di-bundle eve. Helper murni di sini dipakai BERSAMA oleh `agent/` (eve)
 * dan unit test (`test:v2`) → SATU SSOT, tanpa duplikasi.
 *
 * Tulisan tabel (raw SQL) tetap di `agent/lib/store.ts` (butuh driver `postgres`);
 * struktur tabel SSOT = `packages/db` (migrasi).
 */

/**
 * Principal hasil auth Clerk — STRUKTURAL identik `SessionAuthContext` eve tanpa
 * mengikat tipe eve.
 */
export type EvePrincipal = {
  principalId: string;
  principalType: string;
  authenticator: string;
  subject?: string;
  issuer?: string;
  attributes: Record<string, string>;
};

type ClerkClaims = {
  sub?: unknown;
  iss?: unknown;
  email?: unknown;
  org_id?: unknown;
};

/**
 * Map klaim token sesi Clerk → principal. `sub` (== `ownerUserId` V2) wajib; tanpa
 * `sub` → `null` (AuthFn skip → 401). `email` best-effort (bukan klaim token standar).
 */
export function clerkClaimsToPrincipal(claims: ClerkClaims): EvePrincipal | null {
  const sub = typeof claims.sub === "string" ? claims.sub : "";
  if (!sub) return null;
  const attributes: Record<string, string> = {};
  if (typeof claims.email === "string" && claims.email) attributes.email = claims.email;
  if (typeof claims.org_id === "string" && claims.org_id) attributes.orgId = claims.org_id;
  return {
    principalId: sub,
    principalType: "user",
    authenticator: "clerk",
    subject: sub,
    ...(typeof claims.iss === "string" && claims.iss ? { issuer: claims.iss } : {}),
    attributes,
  };
}

/**
 * Verdikt kepemilikan session→thread untuk `onMessage` (follow-up dengan sessionId).
 * - `not_found`: belum ada thread (lag proyeksi / first turn) → izinkan (hook create+own).
 * - `forbidden`: thread ada tapi owner ≠ caller → channel WAJIB tolak (403).
 * - `ok`: owner cocok.
 */
export function ownershipVerdict(
  thread: { ownerUserId: string } | null,
  callerPrincipalId: string,
): "ok" | "not_found" | "forbidden" {
  if (!thread) return "not_found";
  return thread.ownerUserId === callerPrincipalId ? "ok" : "forbidden";
}

const PREVIEW_MAX = 160;

/** Preview pesan untuk thread list — collapse whitespace + clamp 160 char (port V1). */
export function messagePreview(text: string): string {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  const chars = Array.from(flat);
  if (chars.length <= PREVIEW_MAX) return flat;
  return `${chars.slice(0, PREVIEW_MAX - 1).join("")}…`;
}

/**
 * Id pesan DETERMINISTIK supaya proyeksi idempoten: step durable yang re-run saat
 * resume meng-upsert baris yang sama, bukan duplikat.
 */
export function userMessageId(sessionId: string, turnId: string): string {
  return `${sessionId}:${turnId}:user`;
}

/**
 * Key by `sequence` (event index, monotonik per turn), BUKAN `stepIndex`: satu turn
 * bisa emit >1 `message.completed` dengan stepIndex SAMA (teks → tool-call → teks dalam
 * satu step). `sequence` selalu distinct per event → tak tabrakan; dan stabil saat resume
 * durable (log replay sequence sama) → upsert idempoten.
 */
export function assistantMessageId(sessionId: string, turnId: string, sequence: number): string {
  return `${sessionId}:${turnId}:${sequence}:assistant`;
}
