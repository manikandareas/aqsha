import { ForbiddenError } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";
import { clerkAuth } from "../lib/clerk";
import { checkOwnership } from "../lib/store";

/**
 * Channel eve — Slice 6.1: Clerk AuthFn + ownership gate. Menggantikan auth SPIKE 6.0
 * (`[localDev(), none()]`). Channel `/eve/v1/*` di-host PROSES eve (bukan api-v2);
 * `withEve` mem-proxy dari origin web-v2.
 *
 * - `auth`: HANYA `clerkAuth()`, di SEMUA environment. `localDev()` SENGAJA TIDAK dipakai:
 *   di balik proxy `withEve` SEMUA request masuk sebagai loopback (`127.0.0.1`), jadi
 *   `localDev()` akan menerima request TANPA token sebagai principal `local-dev` bersama —
 *   bypass auth pada deploy non-`production` mana pun. Browser ber-Clerk selalu kirim bearer
 *   → tak butuh fallback; curl dev cukup pakai token Clerk. (`none()` juga sudah di-DROP.)
 * - `onMessage`: route-auth TIDAK menegakkan ownership session (ground-truth eve §2.5).
 *   Untuk FOLLOW-UP (sessionId ada), pastikan thread (id == sessionId) dimiliki caller.
 *   Mismatch → throw → eve `resolveOnMessage` balas HTTP 500 generik (BUKAN 403 — onMessage
 *   tak bisa memetakan status; lihat eve `public/channels/eve.js`). Yang penting: pesan TAK
 *   di-dispatch (turn tak jalan) → ownership tetap aman. Turn BARU (sessionId undefined) →
 *   thread belum ada (di-create hook `session.started`), tak perlu cek di sini.
 *
 * CATATAN KEAMANAN (deferred): route STREAM `GET /eve/v1/session/:id/stream` hanya jalan
 * routeAuth (autentikasi), TANPA ownership — `onMessage` cuma untuk POST. sessionId =
 * ULID tak-bisa-ditebak, tapi muncul di URL → bisa bocor. Gate ownership stream = TODO
 * hardening (lihat memory/report). Regresi dari V1 (Convex stream owner-gated).
 */
export default eveChannel({
  auth: [clerkAuth()],
  async onMessage(ctx) {
    const caller = ctx.eve.caller;
    if (!caller) {
      // Tak seharusnya terjadi (auth = [clerkAuth()] tanpa fallback → routeAuth 401 lebih
      // dulu), tapi defensif: tolak dispatch tanpa principal.
      throw new ForbiddenError({ message: "Tidak terautentikasi." });
    }

    if (ctx.eve.sessionId) {
      const verdict = await checkOwnership(ctx.eve.sessionId, caller.principalId);
      if (verdict === "forbidden") {
        throw new ForbiddenError({ message: "Bukan percakapan kamu." });
      }
    }

    return { auth: caller };
  },
});
