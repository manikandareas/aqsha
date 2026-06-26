import {
  ArtifactService,
  ContextService,
  EventService,
  MessageService,
  ResearchService,
  ThreadService,
} from "@aqsha/services";
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
    ({ ownerUserId, email, query }) => {
      const { db } = getDb();
      // feature=deep_research (Slice 7.0) ⇒ pre-check `/deep` ikut sertakan cap bulanan deep.
      return SendQuotaService.getSendStatus(db, {
        ownerUserId,
        ownerEmail: email,
        feature: query.feature === "deep_research" ? "deep_research" : "normal_chat",
      });
    },
    { auth: true, query: t.Object({ feature: t.Optional(t.String()) }) },
  )
  // Hydrate konteks `@mention` (Slice 6.6) — resolve workspace/paper yang di-pin
  // composer → catatan ringkas + id tervalidasi. Per-user (bukan per-thread):
  // ownership tiap id di-cek di ContextService. Static route → di atas `/:id`.
  .post(
    "/context/hydrate",
    async ({ ownerUserId, body }) => {
      const { db } = getDb();
      return ContextService.hydrate(db, {
        ownerUserId,
        workspaceIds: body.workspaceIds,
        artifactIds: body.artifactIds,
      });
    },
    {
      auth: true,
      body: t.Object({
        workspaceIds: t.Array(t.String()),
        artifactIds: t.Array(t.String()),
      }),
    },
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
  // Thread `streaming` termuda milik caller (Layer C2) — klien memakai ini untuk menemukan
  // sessionId turn PERTAMA segera setelah `send()` (eve baru surface sessionId di akhir turn),
  // lalu bump URL → refresh saat menyusun plan tak kehilangan thread. Static route → di atas `/:id`.
  .get(
    "/recent-active",
    ({ ownerUserId, query }) => {
      const { db } = getDb();
      return ThreadService.recentActive(db, ownerUserId, query.since);
    },
    { auth: true, query: t.Object({ since: t.Optional(t.Numeric()) }) },
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
  // Event stream eve mentah per thread (fix timeline persist) — klien me-replay lewat
  // `defaultMessageReducer` supaya timeline reload == live, dan poll endpoint ini selagi
  // turn berjalan agar progress in-flight tetap terlihat setelah refresh. Ownership
  // di-assert dulu (thread milik caller), lalu list by thread (urut seq).
  .get(
    "/:id/events",
    async ({ ownerUserId, params, query }) => {
      const { db } = getDb();
      await ThreadService.assertOwner(db, ownerUserId, params.id);
      // `afterIndex` → fetch INCREMENTAL (hanya delta) untuk reconciliation klien; tanpa
      // itu → seluruh log (cold-start snapshot saat reload).
      const items = await EventService.listByThread(db, params.id, query.afterIndex);
      return { items };
    },
    { auth: true, query: t.Object({ afterIndex: t.Optional(t.Numeric()) }) },
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
  // Lampiran thread (Slice 6.7) — file di-attach di chat, HEADLESS (workspaceId=null,
  // threadId set). Ownership = THREAD (assertOwner), bukan workspace. Reuse presign +
  // extract/RAG pipeline. Astra baca via tool list_artifacts/search_thread_documents
  // (6.4, scope threadId → temukan headless attachment).
  .post(
    "/:id/attachments/upload-url",
    async ({ ownerUserId, params }) => {
      const { db } = getDb();
      await ThreadService.assertOwner(db, ownerUserId, params.id);
      return ArtifactService.generateThreadUploadUrl(ownerUserId);
    },
    { auth: true },
  )
  .post(
    "/:id/attachments",
    async ({ ownerUserId, params, body }) => {
      const { db } = getDb();
      await ThreadService.assertOwner(db, ownerUserId, params.id);
      return ArtifactService.finalizeThreadUpload(db, {
        ownerUserId,
        threadId: params.id,
        key: body.key,
        fileName: body.fileName,
        mimeType: body.mimeType,
        size: body.size,
      });
    },
    {
      auth: true,
      body: t.Object({
        key: t.String(),
        fileName: t.String(),
        mimeType: t.String(),
        size: t.Number(),
      }),
    },
  )
  .get(
    "/:id/artifacts",
    async ({ ownerUserId, params }) => {
      const { db } = getDb();
      await ThreadService.assertOwner(db, ownerUserId, params.id);
      const items = await ArtifactService.listByThread(db, ownerUserId, params.id);
      return { items };
    },
    { auth: true },
  )
  // Pending user message (Slice resume) — recovery pesan terkirim yang turn-nya belum settle.
  // Ditulis klien sebelum `agent.send()` follow-up; di-DELETE saat kirim gagal. Recovery
  // (null saat sudah settle) dihitung klien dari `events`. Owner-gated di service.
  .post(
    "/:id/pending",
    ({ ownerUserId, params, body }) => {
      const { db } = getDb();
      return ThreadService.markPending(db, {
        ownerUserId,
        threadId: params.id,
        message: body.message,
      });
    },
    { auth: true, body: t.Object({ message: t.String() }) },
  )
  .delete(
    "/:id/pending",
    ({ ownerUserId, params }) => {
      const { db } = getDb();
      return ThreadService.clearPending(db, { ownerUserId, threadId: params.id });
    },
    { auth: true },
  )
  // Handle-resume eve (continuationToken) — di-upsert SERVER-SIDE oleh proxy-tee respons
  // create/continue eve (`web app/eve/v1/[...path]/route.ts`), BUKAN klien. Token dari
  // respons create-POST = ber-namespace TUNGGAL (`eve:<uuid>`); RACE-PROOF (insert-if-absent,
  // owner-guard di repo) karena respons create (202) bisa mendahului hook `session.started`.
  .post(
    "/:id/session-token",
    ({ ownerUserId, params, body }) => {
      const { db } = getDb();
      return ThreadService.upsertContinuationToken(db, {
        ownerUserId,
        threadId: params.id,
        continuationToken: body.continuationToken,
      });
    },
    { auth: true, body: t.Object({ continuationToken: t.String() }) },
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
