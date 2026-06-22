import { SendQuotaService } from "@aqsha/services/quota";
import { ForbiddenError } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";
import { clerkAuth } from "../lib/clerk.ts";
import { getServiceDb } from "../lib/db.ts";
import { checkOwnership, saveContinuationToken } from "../lib/store.ts";

/**
 * Channel eve — Slice 6.1: Clerk AuthFn + ownership gate. Menggantikan auth SPIKE 6.0
 * (`[localDev(), none()]`). Channel `/eve/v1/*` di-host app TERPISAH `@aqsha/agent-v2`
 * (proses eve sendiri); web-v2 mem-proxy same-origin via Next `rewrites()` ke origin agent-v2.
 *
 * - `auth`: HANYA `clerkAuth()`, di SEMUA environment. `localDev()` SENGAJA TIDAK dipakai:
 *   di balik rewrite Next SEMUA request masuk sebagai loopback (`127.0.0.1`), jadi
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

    // Backstop billing/cooldown OTORITATIF (Slice 6.2). Pre-check ramah ada di composer
    // (`GET /threads/send-status`); ini menutup celah POST langsung ke channel. Blok →
    // `return null` (terima-tanpa-dispatch, ~204) — BUKAN throw: `onMessage` tak bisa
    // memetakan ke 402/429 (throw → 500 generik), dan turn tetap TIDAK jalan.
    const email = caller.attributes?.email;
    const quota = await SendQuotaService.check(getServiceDb(), {
      ownerUserId: caller.principalId,
      ownerEmail: typeof email === "string" ? email : null,
    });
    if (!quota.ok) return null;

    return { auth: caller };
  },
  events: {
    // Persist resume handle saat sesi parkir. `session.waiting` = turn selesai, sesi
    // menunggu input berikutnya; `channel.continuationToken` = handle untuk turn berikut.
    // Disimpan ke chat_threads → ThreadView me-rehydrate `initialSession.continuationToken`
    // saat reload supaya follow-up bisa lanjut (eve wajib continuationToken di continue).
    async "session.waiting"(_event, channel, ctx) {
      const token = channel.continuationToken;
      if (!token) return;
      try {
        await saveContinuationToken(ctx.session.id, token);
      } catch {
        // Best-effort: jangan gagalkan turn kalau persist gagal (mis. migration 0009
        // belum diterapkan). Follow-up lintas-reload baru jalan setelah kolom ada.
      }
    },
  },
});
