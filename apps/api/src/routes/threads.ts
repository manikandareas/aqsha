import {
  ArtifactService,
  ContextService,
  ResearchService,
  ThreadService,
} from "@aqsha/services";
import {
  dedupeReferenceSources,
  formatBibtex,
  formatRis,
  sortForReferenceList,
} from "@aqsha/services/research";
import { SendQuotaService } from "@aqsha/services/quota";
import { Elysia, t } from "elysia";
import { getDb } from "../clients/db";
import { authMacro } from "../plugins/auth";

/**
 * Route threads (Fase 6) — READ + non-stream WRITE (list/detail/rename/delete) + panel data
 * (sources/artifacts/attachments). Stream chat & isi pesan TIDAK lewat sini: turn live + history
 * di-handle server Mastra (`/mastra-api/*`); Mastra Memory (`mastra_*`) = SoT pesan. Thread
 * metadata di-proyeksikan tipis ke `chat_threads` oleh `threadProjectionProcessor` agent (untuk
 * sidebar/billing list), bukan POST di sini.
 *
 * Tipis: auth → 1 service call. Ownership/validasi domain hidup di service →
 * `appError` terstruktur, di-map errorPlugin global.
 */
export const threads = new Elysia({ prefix: "/threads" })
  .use(authMacro)
  // Pre-check kirim — non-consuming preview entitlement + cooldown untuk UX composer.
  // Backstop otoritatif tetap di processor billing runtime agent. Static route → router
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
        paperKeys: body.paperKeys,
        feedItemIds: body.feedItemIds,
        selections: body.selections,
      });
    },
    {
      auth: true,
      body: t.Object({
        workspaceIds: t.Array(t.String()),
        artifactIds: t.Array(t.String()),
        // Sumber Explore publik yang disematkan langsung (paper by key / berita by id).
        paperKeys: t.Optional(t.Array(t.String())),
        feedItemIds: t.Optional(t.Array(t.String())),
        // Pilihan blok editor ("Tanya Astra") — blok spesifik artifact markdown + cuplikan.
        selections: t.Optional(
          t.Array(
            t.Object({
              artifactId: t.String(),
              blockIds: t.Array(t.String()),
              excerpt: t.String(),
            }),
          ),
        ),
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
  // Thread yang disematkan — grup "Disematkan" sidebar (fetch utuh, DESC pinnedAt). Static
  // route → di atas `/:id` supaya "pinned" tak salah-cocok sebagai id.
  .get(
    "/pinned",
    async ({ ownerUserId }) => {
      const { db } = getDb();
      const items = await ThreadService.listPinned(db, ownerUserId);
      return { items };
    },
    { auth: true },
  )
  .get(
    "/:id",
    ({ ownerUserId, params }) => {
      const { db } = getDb();
      return ThreadService.get(db, ownerUserId, params.id);
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
  // Ekspor daftar pustaka thread (FEAT-3) — BibTeX/RIS deterministik dari `research_sources`
  // (dedup lintas turn, urut alfabetis APA). FE mengunduh sebagai blob; body = teks file.
  .get(
    "/:id/references",
    async ({ ownerUserId, params, query }) => {
      const { db } = getDb();
      await ThreadService.assertOwner(db, ownerUserId, params.id);
      const items = await ResearchService.listThreadSources(db, params.id);
      const sources = sortForReferenceList(dedupeReferenceSources(items));
      const format = query.format === "ris" ? "ris" : "bibtex";
      return {
        format,
        count: sources.length,
        fileName: `referensi-${params.id}.${format === "ris" ? "ris" : "bib"}`,
        mime: format === "ris" ? "application/x-research-info-systems" : "application/x-bibtex",
        content: format === "ris" ? formatRis(sources) : formatBibtex(sources),
      };
    },
    { auth: true, query: t.Object({ format: t.Optional(t.String()) }) },
  )
  // Lampiran thread (Slice 6.7) — file di-attach di chat, HEADLESS (workspaceId=null,
  // threadId set). Ownership = THREAD (assertOwner), bukan workspace. Reuse presign +
  // extract/RAG pipeline. Astra baca via tool list_artifacts/search_thread_documents
  // (6.4, scope threadId → temukan headless attachment).
  .post(
    "/:id/attachments/upload-url",
    async ({ ownerUserId, params }) => {
      const { db } = getDb();
      // D6: izinkan lampiran di percakapan baru (thread belum terproyeksi); tolak thread milik lain.
      await ThreadService.assertOwnerOrAbsent(db, ownerUserId, params.id);
      return ArtifactService.generateThreadUploadUrl(ownerUserId);
    },
    { auth: true },
  )
  .post(
    "/:id/attachments",
    async ({ ownerUserId, params, body }) => {
      const { db } = getDb();
      await ThreadService.assertOwnerOrAbsent(db, ownerUserId, params.id);
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
      // D6: percakapan baru (belum terproyeksi) tetap boleh — lampiran pesan-1 di-render live
      // sebelum projection. Tolak thread milik lain.
      await ThreadService.assertOwnerOrAbsent(db, ownerUserId, params.id);
      const items = await ArtifactService.listByThread(db, ownerUserId, params.id);
      return { items };
    },
    { auth: true },
  )
  // Cabut lampiran thread yang masih di-stage (sebelum kirim). Headless-tolerant: ownership =
  // owner + lampiran upload milik thread ini (di-assert di service). Soft-delete + cleanup.
  .delete(
    "/:id/attachments/:artifactId",
    async ({ ownerUserId, params }) => {
      const { db } = getDb();
      await ThreadService.assertOwnerOrAbsent(db, ownerUserId, params.id);
      return ArtifactService.removeThreadAttachment(db, {
        ownerUserId,
        threadId: params.id,
        artifactId: params.artifactId,
      });
    },
    { auth: true },
  )
  // Sematkan / lepas sematan thread. Sub-route `/:id/pin` → di atas `PATCH /:id` (rename).
  .patch(
    "/:id/pin",
    ({ ownerUserId, params, body }) => {
      const { db } = getDb();
      return ThreadService.setPinned(db, {
        ownerUserId,
        threadId: params.id,
        pinned: body.pinned,
      });
    },
    {
      auth: true,
      body: t.Object({ pinned: t.Boolean() }),
    },
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
