/**
 * @aqsha/chat-core — logika murni chat Astra. Tiap entry (subpath exports
 * map) = SATU file mandiri TANPA relative import: `index.ts` (ini) dan
 * `deep-viz.ts` (`@aqsha/chat-core/deep-viz`, evidence viz laporan `/deep`).
 *
 * Kenapa paket sendiri: konsumen ter-bundle (runtime agent Node) TIDAK bisa
 * mengonsumsi paket workspace TS-mentah dengan relative-import tanpa ekstensi
 * (`@aqsha/db`/`@aqsha/services`) — bundler gagal resolve, dan runtime Node tak
 * bisa import `.ts` mentah bila di-externalize. File entry mandiri tanpa relative
 * import aman di-bundle; dependency npm ter-compile (hanya `zod`, dipin sama dgn
 * web/agent) juga aman. Helper murni di sini dipakai BERSAMA oleh web, api, dan
 * agent + unit test → SATU SSOT, tanpa duplikasi.
 *
 * Struktur tabel SSOT = `packages/db` (migrasi).
 */

/**
 * Principal hasil auth Clerk — bentuk struktural netral (tak mengikat tipe
 * runtime/framework mana pun).
 */
export type SessionPrincipal = {
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
 * Map klaim token sesi Clerk → principal. `sub` (sama dengan `ownerUserId`) wajib; tanpa
 * `sub` → `null` (AuthFn skip → 401). `email` best-effort (bukan klaim token standar).
 */
export function clerkClaimsToPrincipal(
  claims: ClerkClaims,
): SessionPrincipal | null {
  const sub = typeof claims.sub === "string" ? claims.sub : "";
  if (!sub) return null;
  const attributes: Record<string, string> = {};
  if (typeof claims.email === "string" && claims.email)
    attributes.email = claims.email;
  if (typeof claims.org_id === "string" && claims.org_id)
    attributes.orgId = claims.org_id;
  return {
    principalId: sub,
    principalType: "user",
    authenticator: "clerk",
    subject: sub,
    ...(typeof claims.iss === "string" && claims.iss
      ? { issuer: claims.iss }
      : {}),
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

/**
 * Collapse whitespace + clamp ke `max` char (codepoint-safe via `Array.from`), tambah ellipsis bila
 * dipotong. Default `max` = 160 untuk preview thread list; pemanggil lain (mis. label pill
 * @mention) mengoper `max` lebih kecil. Satu util clamp bersama untuk web + agent.
 */
export function messagePreview(
  text: string,
  max: number = PREVIEW_MAX,
): string {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  const chars = Array.from(flat);
  if (chars.length <= max) return flat;
  return `${chars.slice(0, max - 1).join("")}…`;
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
export function assistantMessageId(
  sessionId: string,
  turnId: string,
  sequence: number,
): string {
  return `${sessionId}:${turnId}:${sequence}:assistant`;
}

// ---------------------------------------------------------------------------
