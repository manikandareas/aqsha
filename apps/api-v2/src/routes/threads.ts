import { MessageService, ResearchService, ThreadService } from "@aqsha/services";
import { SendQuotaService } from "@aqsha/services/quota";
import { Elysia, t } from "elysia";
import { getDb } from "../clients/db";
import { authMacro } from "../plugins/auth";

/**
 * Route threads (Fase 6) — READ + non-stream WRITE (list/detail/history/rename/delete).
 * Stream chat TIDAK lewat sini: turn live di-handle PROSES eve (`/eve/v1/*` via proxy
 * `withEve`); thread+pesan di-persist hook proyeksi eve. Route ini hanya read history +
 * thread CRUD. Thread di-CREATE oleh hook (id == eve session id), bukan POST di sini.
 *
 * Tipis: auth → 1 service call. Ownership/validasi domain hidup di service →
 * `appError` terstruktur, di-map errorPlugin global.
 */
export const threads = new Elysia({ prefix: "/threads" })
  .use(authMacro)
  // Pre-check kirim (Slice 6.2) — non-consuming preview entitlement + cooldown untuk UX
  // composer. Backstop otoritatif tetap di `onMessage` proses eve. Static route → router
  // Elysia memprioritaskan di atas `/:id`.
  .get(
    "/send-status",
    ({ ownerUserId, email }) => {
      const { db } = getDb();
      return SendQuotaService.getSendStatus(db, { ownerUserId, ownerEmail: email });
    },
    { auth: true },
  )
  .get(
    "/",
    ({ ownerUserId, query }) => {
      const { db } = getDb();
      return ThreadService.list(db, ownerUserId, {
        cursor: query.cursor ?? null,
        limit: query.limit,
      });
    },
    {
      auth: true,
      query: t.Object({
        cursor: t.Optional(t.String()),
        limit: t.Optional(t.Numeric()),
      }),
    },
  )
  .get(
    "/:id",
    ({ ownerUserId, params }) => {
      const { db } = getDb();
      return ThreadService.get(db, ownerUserId, params.id);
    },
    { auth: true },
  )
  .get(
    "/:id/messages",
    async ({ ownerUserId, params }) => {
      const { db } = getDb();
      await ThreadService.assertOwner(db, ownerUserId, params.id);
      const items = await MessageService.listByThread(db, params.id);
      return { items };
    },
    { auth: true },
  )
  // Sumber riset yang dipersist tool Astra (Slice 6.4) — panel Sources. Ownership
  // di-assert dulu (thread milik caller), lalu list by thread.
  .get(
    "/:id/sources",
    async ({ ownerUserId, params }) => {
      const { db } = getDb();
      await ThreadService.assertOwner(db, ownerUserId, params.id);
      const items = await ResearchService.listThreadSources(db, params.id);
      return { items };
    },
    { auth: true },
  )
  .patch(
    "/:id",
    ({ ownerUserId, params, body }) => {
      const { db } = getDb();
      return ThreadService.rename(db, { ownerUserId, threadId: params.id, title: body.title });
    },
    {
      auth: true,
      body: t.Object({ title: t.String() }),
    },
  )
  .delete(
    "/:id",
    ({ ownerUserId, params }) => {
      const { db } = getDb();
      return ThreadService.remove(db, { ownerUserId, threadId: params.id });
    },
    { auth: true },
  );
