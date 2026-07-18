import type { WorkspaceKind, WorkspaceStage } from "@aqsha/db";
import {
  FolderService,
  MAX_UPLOAD_BYTES,
  parseClustersJson,
  SectionDocumentService,
  SectionService,
  WorkspaceService,
} from "@aqsha/services";
import { Elysia, t } from "elysia";
import { getDb } from "../clients/db";
import { authMacro } from "../plugins/auth";
import { rateLimitMacro } from "../plugins/rate-limit";

// Literal arrays spelled out (not `WORKSPACE_KINDS.map(t.Literal)`): `.map` widens a readonly
// tuple to a plain array, which collapses these fields to `never` when Eden Treaty infers the
// client body type. Keep in sync with `WORKSPACE_KINDS`/`WORKSPACE_STAGES` in @aqsha/db.
const kindSchema = t.Union([
  t.Literal("undergraduate_thesis"),
  t.Literal("masters_thesis"),
  t.Literal("dissertation"),
  t.Literal("journal_article"),
  t.Literal("proposal"),
  t.Literal("paper"),
  t.Literal("freeform"),
]);
const stageSchema = t.Union([
  t.Literal("exploration"),
  t.Literal("proposal"),
  t.Literal("research"),
  t.Literal("writing"),
  t.Literal("revision"),
  t.Literal("done"),
]);
const sectionStatusSchema = t.Union([
  t.Literal("empty"),
  t.Literal("draft"),
  t.Literal("in_review"),
  t.Literal("done"),
]);

/**
 * Route workspaces (proyek karya tulis) + kerangka bab (sections) + folder nested.
 * `/folders/:id` top-level ada di `./folders`; `/sections/:id` top-level di sini.
 * Tipis: auth → validasi `t` permisif → 1 service call. Validasi domain
 * (capacity/emoji/name/kind/stage/reorder) hidup di service → `appError`
 * terstruktur, di-map errorPlugin global.
 */
export const workspaces = new Elysia()
  .use(authMacro)
  .use(rateLimitMacro)
  .get(
    "/workspaces",
    ({ ownerUserId, query }) => {
      const { db } = getDb();
      return WorkspaceService.list(db, ownerUserId, {
        includeArchived: query.includeArchived,
        cursor: query.cursor ?? null,
        limit: query.limit,
      });
    },
    {
      auth: true,
      query: t.Object({
        cursor: t.Optional(t.String()),
        limit: t.Optional(t.Numeric()),
        includeArchived: t.Optional(t.Boolean()),
      }),
    },
  )
  .get(
    "/workspaces/:id",
    ({ ownerUserId, params }) => {
      const { db } = getDb();
      return WorkspaceService.get(db, ownerUserId, params.id);
    },
    { auth: true },
  )
  .post(
    "/workspaces",
    ({ ownerUserId, email, body }) => {
      const { db } = getDb();
      return WorkspaceService.create(db, {
        ownerUserId,
        ownerEmail: email,
        name: body.name,
        kind: body.kind as WorkspaceKind,
        topicNote: body.topicNote ?? null,
        deadline: body.deadline ?? null,
      });
    },
    {
      auth: true,
      rateLimit: "workspaces:create",
      body: t.Object({
        name: t.Optional(t.String()),
        kind: kindSchema,
        topicNote: t.Optional(t.String()),
        deadline: t.Optional(t.Numeric()),
      }),
    },
  )
  .patch(
    "/workspaces/:id",
    ({ ownerUserId, params, body }) => {
      const { db } = getDb();
      return WorkspaceService.update(db, {
        ownerUserId,
        workspaceId: params.id,
        name: body.name,
        emoji: body.emoji,
        description: body.description,
        stage: body.stage as WorkspaceStage | undefined,
        deadline: body.deadline,
        topicNote: body.topicNote,
      });
    },
    {
      auth: true,
      body: t.Object({
        name: t.Optional(t.String()),
        emoji: t.Optional(t.String()),
        description: t.Optional(t.Union([t.String(), t.Null()])),
        stage: t.Optional(stageSchema),
        deadline: t.Optional(t.Union([t.Numeric(), t.Null()])),
        topicNote: t.Optional(t.Union([t.String(), t.Null()])),
      }),
    },
  )
  .post(
    "/workspaces/:id/archive",
    ({ ownerUserId, params }) => {
      const { db } = getDb();
      return WorkspaceService.archive(db, { ownerUserId, workspaceId: params.id });
    },
    { auth: true },
  )
  // ── Kerangka bab ─────────────────────────────────────────────────────────
  .get(
    "/workspaces/:id/sections",
    ({ ownerUserId, params }) => {
      const { db } = getDb();
      return SectionService.list(db, ownerUserId, params.id);
    },
    { auth: true },
  )
  .post(
    "/workspaces/:id/sections",
    ({ ownerUserId, params, body }) => {
      const { db } = getDb();
      return SectionService.create(db, {
        ownerUserId,
        workspaceId: params.id,
        title: body.title,
      });
    },
    {
      auth: true,
      body: t.Object({ title: t.String() }),
    },
  )
  .post(
    "/workspaces/:id/sections/reorder",
    ({ ownerUserId, params, body }) => {
      const { db } = getDb();
      return SectionService.reorder(db, {
        ownerUserId,
        workspaceId: params.id,
        orderedIds: body.orderedIds,
      });
    },
    {
      auth: true,
      body: t.Object({ orderedIds: t.Array(t.String()) }),
    },
  )
  .patch(
    "/sections/:id",
    async ({ ownerUserId, params, body }) => {
      const { db } = getDb();
      if (body.title !== undefined) {
        await SectionService.rename(db, { ownerUserId, sectionId: params.id, title: body.title });
      }
      if (body.status !== undefined) {
        await SectionService.setStatus(db, {
          ownerUserId,
          sectionId: params.id,
          status: body.status,
        });
      }
      return { ok: true as const };
    },
    {
      auth: true,
      body: t.Object({
        title: t.Optional(t.String()),
        status: t.Optional(sectionStatusSchema),
      }),
    },
  )
  .delete(
    "/sections/:id",
    ({ ownerUserId, params }) => {
      const { db } = getDb();
      return SectionService.remove(db, { ownerUserId, sectionId: params.id });
    },
    { auth: true },
  )
  .put(
    "/sections/:id/document",
    async ({ ownerUserId, params, body }) => {
      const { db } = getDb();
      return SectionDocumentService.saveDocument(db, {
        ownerUserId,
        sectionId: params.id,
        bytes: new Uint8Array(await body.file.arrayBuffer()),
        fileName: body.file.name,
        baseVersion: body.baseVersion,
        clusters: parseClustersJson(body.clustersJson),
      });
    },
    {
      auth: true,
      // Tanpa rateLimit: dipanggil autosave debounced — limiter akan memutus penyimpanan.
      body: t.Object({
        file: t.File({ maxSize: MAX_UPLOAD_BYTES }),
        baseVersion: t.Optional(t.Numeric()),
        clustersJson: t.Optional(t.String()),
      }),
    },
  )
  // ── Folder nested (legacy board) ─────────────────────────────────────────
  .get(
    "/workspaces/:id/folders",
    ({ ownerUserId, params }) => {
      const { db } = getDb();
      return FolderService.list(db, ownerUserId, params.id);
    },
    { auth: true },
  )
  .post(
    "/workspaces/:id/folders",
    ({ ownerUserId, params, body }) => {
      const { db } = getDb();
      return FolderService.create(db, {
        ownerUserId,
        workspaceId: params.id,
        name: body.name,
      });
    },
    {
      auth: true,
      body: t.Object({ name: t.String() }),
    },
  );
