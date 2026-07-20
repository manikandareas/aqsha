import type { WorkspaceKind, WorkspaceKindInfo } from "@aqsha/db";
import {
  AnnotationService,
  FolderService,
  WorkspaceDocumentService,
  WorkspaceService,
} from "@aqsha/services";
import {
  DocumentProposalService,
  WorkspaceDocxExportService,
  WorkspacePdfExportService,
} from "@aqsha/services/typst";
import { Elysia, t } from "elysia";
import { getDb } from "../clients/db";
import { authMacro } from "../plugins/auth";
import { rateLimitMacro } from "../plugins/rate-limit";

// Literal arrays spelled out (not `WORKSPACE_KINDS.map(t.Literal)`): `.map` widens a readonly
// tuple to a plain array, which collapses these fields to `never` when Eden Treaty infers the
// client body type. Keep in sync with `WORKSPACE_KINDS` in @aqsha/db.
const kindSchema = t.Union([
  t.Literal("undergraduate_thesis"),
  t.Literal("masters_thesis"),
  t.Literal("dissertation"),
  t.Literal("journal_article"),
  t.Literal("proposal"),
  t.Literal("paper"),
  t.Literal("freeform"),
]);
// Superset flat field kind_info; service memvalidasi mana yang relevan per kind.
const kindInfoSchema = t.Object({
  university: t.Optional(t.Union([t.String(), t.Null()])),
  faculty: t.Optional(t.Union([t.String(), t.Null()])),
  studyProgram: t.Optional(t.Union([t.String(), t.Null()])),
  targetJournal: t.Optional(t.Union([t.String(), t.Null()])),
  affiliation: t.Optional(t.Union([t.String(), t.Null()])),
  courseOrVenue: t.Optional(t.Union([t.String(), t.Null()])),
});
const annotationKindSchema = t.Union([t.Literal("highlight"), t.Literal("pin")]);
const annotationRectSchema = t.Object({
  x: t.Number(),
  y: t.Number(),
  w: t.Number(),
  h: t.Number(),
});

/**
 * Route workspaces (proyek karya tulis) = satu dokumen Typst kontinu + anotasi + proposal
 * Astra + ekspor, plus folder nested (legacy board artifact). Tipis: auth → validasi `t`
 * permisif → 1 service call. Validasi domain (capacity/emoji/name/kind/kindInfo) hidup di
 * service → `appError` terstruktur, di-map errorPlugin global.
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
        kindInfo: body.kindInfo as WorkspaceKindInfo | undefined,
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
        kindInfo: t.Optional(kindInfoSchema),
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
        kindInfo: body.kindInfo as WorkspaceKindInfo | null | undefined,
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
        kindInfo: t.Optional(t.Union([kindInfoSchema, t.Null()])),
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
  // ── Dokumen Typst tunggal ────────────────────────────────────────────────
  .get(
    "/workspaces/:id/document",
    ({ ownerUserId, params }) => {
      const { db } = getDb();
      return WorkspaceDocumentService.getDocument(db, { ownerUserId, workspaceId: params.id });
    },
    { auth: true },
  )
  .put(
    "/workspaces/:id/document",
    ({ ownerUserId, params, body }) => {
      const { db } = getDb();
      return WorkspaceDocumentService.saveDocument(db, {
        ownerUserId,
        workspaceId: params.id,
        source: body.source,
        baseVersion: body.baseVersion,
        author: "user",
      });
    },
    {
      auth: true,
      // Tanpa rateLimit: dipanggil autosave debounced.
      body: t.Object({
        source: t.String(),
        baseVersion: t.Optional(t.Numeric()),
      }),
    },
  )
  // ── Ekspor dokumen penuh ─────────────────────────────────────────────────
  .post(
    "/workspaces/:id/export/pdf",
    ({ ownerUserId, params }) => {
      const { db } = getDb();
      return WorkspacePdfExportService.export(db, { ownerUserId, workspaceId: params.id });
    },
    { auth: true, rateLimit: "typst:compile" },
  )
  .post(
    "/workspaces/:id/export/docx",
    ({ ownerUserId, params }) => {
      const { db } = getDb();
      return WorkspaceDocxExportService.export(db, { ownerUserId, workspaceId: params.id });
    },
    { auth: true, rateLimit: "typst:compile" },
  )
  // ── Anotasi preview dokumen ──────────────────────────────────────────────
  .get(
    "/workspaces/:id/annotations",
    ({ ownerUserId, params }) => {
      const { db } = getDb();
      return AnnotationService.list(db, { ownerUserId, workspaceId: params.id });
    },
    { auth: true },
  )
  .post(
    "/workspaces/:id/annotations",
    ({ ownerUserId, params, body }) => {
      const { db } = getDb();
      return AnnotationService.create(db, {
        ownerUserId,
        workspaceId: params.id,
        kind: body.kind,
        page: body.page,
        rects: body.rects,
        selectedText: body.selectedText ?? null,
        note: body.note ?? null,
      });
    },
    {
      auth: true,
      body: t.Object({
        kind: annotationKindSchema,
        page: t.Numeric(),
        rects: t.Array(annotationRectSchema, { minItems: 1, maxItems: 32 }),
        selectedText: t.Optional(t.String()),
        note: t.Optional(t.String()),
      }),
    },
  )
  .patch(
    "/workspaces/:id/annotations/:aid",
    ({ ownerUserId, params, body }) => {
      const { db } = getDb();
      return AnnotationService.update(db, {
        ownerUserId,
        workspaceId: params.id,
        annotationId: params.aid,
        note: body.note,
        status: body.status,
      });
    },
    {
      auth: true,
      body: t.Object({
        note: t.Optional(t.Union([t.String(), t.Null()])),
        status: t.Optional(t.Union([t.Literal("open"), t.Literal("dismissed")])),
      }),
    },
  )
  .delete(
    "/workspaces/:id/annotations/:aid",
    ({ ownerUserId, params }) => {
      const { db } = getDb();
      return AnnotationService.remove(db, {
        ownerUserId,
        workspaceId: params.id,
        annotationId: params.aid,
      });
    },
    { auth: true },
  )
  .post(
    "/workspaces/:id/annotations/mark-sent",
    ({ ownerUserId, params, body }) => {
      const { db } = getDb();
      return AnnotationService.markSent(db, {
        ownerUserId,
        workspaceId: params.id,
        ids: body.ids,
        threadId: body.threadId,
        messageId: body.messageId ?? null,
      });
    },
    {
      auth: true,
      body: t.Object({
        ids: t.Array(t.String(), { minItems: 1, maxItems: 64 }),
        threadId: t.String(),
        messageId: t.Optional(t.String()),
      }),
    },
  )
  // ── Proposal suntingan agen ──────────────────────────────────────────────
  .get(
    "/workspaces/:id/proposals",
    ({ ownerUserId, params }) => {
      const { db } = getDb();
      return DocumentProposalService.getPending(db, { ownerUserId, workspaceId: params.id });
    },
    { auth: true },
  )
  .post(
    "/workspaces/:id/proposals/:pid/accept",
    ({ ownerUserId, params, body }) => {
      const { db } = getDb();
      return DocumentProposalService.accept(db, {
        ownerUserId,
        proposalId: params.pid,
        acceptedHunkIndexes: body?.acceptedHunkIndexes,
      });
    },
    {
      auth: true,
      body: t.Optional(
        t.Object({
          acceptedHunkIndexes: t.Optional(
            t.Array(t.Integer({ minimum: 0 }), { maxItems: 512 }),
          ),
        }),
      ),
    },
  )
  .post(
    "/workspaces/:id/proposals/:pid/reject",
    ({ ownerUserId, params }) => {
      const { db } = getDb();
      return DocumentProposalService.reject(db, { ownerUserId, proposalId: params.pid });
    },
    { auth: true },
  )
  // ── Folder nested (legacy board artifact) ────────────────────────────────
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
