import {
  CitationImportService,
  CitationService,
  MAX_IMPORT_FILE_BYTES,
} from "@aqsha/services";
import { Elysia, t } from "elysia";
import { getDb } from "../clients/db";
import { authMacro } from "../plugins/auth";
import { rateLimitMacro } from "../plugins/rate-limit";

const manualFields = t.Object({
  documentType: t.Optional(t.String()),
  title: t.String(),
  authors: t.Optional(
    t.Array(
      t.Object({
        family: t.Optional(t.String()),
        given: t.Optional(t.String()),
        literal: t.Optional(t.String()),
      }),
    ),
  ),
  publishedYear: t.Optional(t.Union([t.Number(), t.Null()])),
  venue: t.Optional(t.Union([t.String(), t.Null()])),
  publisher: t.Optional(t.Union([t.String(), t.Null()])),
  doi: t.Optional(t.Union([t.String(), t.Null()])),
  url: t.Optional(t.Union([t.String(), t.Null()])),
  isbn: t.Optional(t.Union([t.String(), t.Null()])),
});

const styleId = t.Union([
  t.Literal("apa-7"),
  t.Literal("ieee"),
  t.Literal("vancouver"),
  t.Literal("chicago-author-date"),
]);

/**
 * Route Citation Manager (Fase 1) — Citation Library workspace-scoped.
 * Tipis: auth → validasi `t` permisif → 1 service call; otorisasi workspace +
 * aturan domain (dedupe/limits/policy) hidup di `CitationService`/`CitationImportService`.
 * Path statis (tags/export/render/imports) dideklarasikan sebelum `/:citationId`.
 */
export const citations = new Elysia()
  .use(authMacro)
  .use(rateLimitMacro)
  .get(
    "/workspaces/:id/citations",
    ({ ownerUserId, params, query }) => {
      const { db } = getDb();
      return CitationService.list(db, {
        ownerUserId,
        workspaceId: params.id,
        cursor: query.cursor ?? null,
        limit: query.limit,
        q: query.q,
        status: query.status,
        source: query.source,
        tag: query.tag,
      });
    },
    {
      auth: true,
      query: t.Object({
        cursor: t.Optional(t.String()),
        limit: t.Optional(t.Numeric()),
        q: t.Optional(t.String()),
        status: t.Optional(
          t.Union([t.Literal("verified"), t.Literal("needs_review"), t.Literal("incomplete")]),
        ),
        source: t.Optional(
          t.Union([
            t.Literal("import"),
            t.Literal("provider_sync"),
            t.Literal("artifact"),
            t.Literal("doi"),
            t.Literal("manual"),
          ]),
        ),
        tag: t.Optional(t.String()),
      }),
    },
  )
  .get(
    "/workspaces/:id/citations/tags",
    ({ ownerUserId, params }) => {
      const { db } = getDb();
      return CitationService.listTags(db, { ownerUserId, workspaceId: params.id });
    },
    { auth: true },
  )
  .get(
    "/workspaces/:id/citations/export",
    async ({ ownerUserId, params, query }) => {
      const { db } = getDb();
      const result = await CitationService.export(db, {
        ownerUserId,
        workspaceId: params.id,
        format: query.format,
        citationIds: query.ids ? query.ids.split(",").filter(Boolean) : undefined,
      });
      return new Response(result.content, {
        headers: {
          "content-type": `${result.mimeType}; charset=utf-8`,
          "content-disposition": `attachment; filename="${result.filename}"`,
        },
      });
    },
    {
      auth: true,
      query: t.Object({
        format: t.Union([t.Literal("bibtex"), t.Literal("ris"), t.Literal("csl-json")]),
        ids: t.Optional(t.String()),
      }),
    },
  )
  .post(
    "/workspaces/:id/citations/render",
    ({ ownerUserId, params, body }) => {
      const { db } = getDb();
      return CitationService.render(db, {
        ownerUserId,
        workspaceId: params.id,
        styleId: body.styleId,
        citationIds: body.citationIds,
      });
    },
    {
      auth: true,
      body: t.Object({
        styleId: t.Optional(styleId),
        citationIds: t.Optional(t.Array(t.String())),
      }),
    },
  )
  .post(
    "/workspaces/:id/citations/render-document",
    ({ ownerUserId, params, body }) => {
      const { db } = getDb();
      return CitationService.renderDocument(db, {
        ownerUserId,
        workspaceId: params.id,
        styleId: body.styleId,
        clusters: body.clusters,
      });
    },
    {
      auth: true,
      body: t.Object({
        styleId: t.Optional(styleId),
        clusters: t.Array(
          t.Object({
            nodeId: t.String(),
            citationIds: t.Array(t.String()),
            locator: t.Optional(t.String()),
            label: t.Optional(t.String()),
            prefix: t.Optional(t.String()),
            suffix: t.Optional(t.String()),
          }),
        ),
      }),
    },
  )
  .post(
    "/workspaces/:id/citations/imports/preview",
    async ({ ownerUserId, params, body }) => {
      const { db } = getDb();
      return CitationImportService.preview(db, {
        ownerUserId,
        workspaceId: params.id,
        fileName: body.file.name,
        content: await body.file.text(),
      });
    },
    {
      auth: true,
      rateLimit: "citations:import",
      body: t.Object({ file: t.File({ maxSize: MAX_IMPORT_FILE_BYTES }) }),
    },
  )
  .post(
    "/workspaces/:id/citations/imports/:batchId/commit",
    ({ ownerUserId, params, body }) => {
      const { db } = getDb();
      return CitationImportService.commit(db, {
        ownerUserId,
        workspaceId: params.id,
        batchId: params.batchId,
        selectedIndexes: body.selectedIndexes,
        duplicatePolicy: body.duplicatePolicy,
      });
    },
    {
      auth: true,
      rateLimit: "citations:import",
      body: t.Object({
        selectedIndexes: t.Array(t.Number()),
        duplicatePolicy: t.Union([t.Literal("skip"), t.Literal("merge"), t.Literal("import")]),
      }),
    },
  )
  .post(
    "/workspaces/:id/citations/duplicates/merge",
    ({ ownerUserId, params, body }) => {
      const { db } = getDb();
      return CitationService.merge(db, {
        ownerUserId,
        workspaceId: params.id,
        sourceId: body.sourceId,
        targetId: body.targetId,
      });
    },
    {
      auth: true,
      body: t.Object({ sourceId: t.String(), targetId: t.String() }),
    },
  )
  .get(
    "/workspaces/:id/citations/duplicates",
    ({ ownerUserId, params }) => {
      const { db } = getDb();
      return CitationService.listDuplicateGroups(db, { ownerUserId, workspaceId: params.id });
    },
    { auth: true },
  )
  .post(
    "/workspaces/:id/citations/merge",
    ({ ownerUserId, params, body }) => {
      const { db } = getDb();
      return CitationService.mergeMany(db, {
        ownerUserId,
        workspaceId: params.id,
        ids: body.ids,
        targetId: body.targetId,
      });
    },
    {
      auth: true,
      body: t.Object({ ids: t.Array(t.String()), targetId: t.Optional(t.String()) }),
    },
  )
  .post(
    "/workspaces/:id/citations/from-artifact",
    ({ ownerUserId, params, body }) => {
      const { db } = getDb();
      return CitationService.createFromArtifact(db, {
        ownerUserId,
        workspaceId: params.id,
        artifactId: body.artifactId,
        tags: body.tags,
      });
    },
    {
      auth: true,
      rateLimit: "citations:create",
      body: t.Object({ artifactId: t.String(), tags: t.Optional(t.Array(t.String())) }),
    },
  )
  .post(
    "/workspaces/:id/citations/bulk-tag",
    ({ ownerUserId, params, body }) => {
      const { db } = getDb();
      return CitationService.bulkAddTag(db, {
        ownerUserId,
        workspaceId: params.id,
        ids: body.ids,
        tags: body.tags,
      });
    },
    {
      auth: true,
      body: t.Object({ ids: t.Array(t.String()), tags: t.Array(t.String()) }),
    },
  )
  .post(
    "/workspaces/:id/citations/bulk-delete",
    ({ ownerUserId, params, body }) => {
      const { db } = getDb();
      return CitationService.bulkSoftDelete(db, {
        ownerUserId,
        workspaceId: params.id,
        ids: body.ids,
      });
    },
    {
      auth: true,
      body: t.Object({ ids: t.Array(t.String()) }),
    },
  )
  .post(
    "/workspaces/:id/citations",
    ({ ownerUserId, params, body }) => {
      const { db } = getDb();
      if (body.doi) {
        return CitationService.createByDoi(db, {
          ownerUserId,
          workspaceId: params.id,
          doi: body.doi,
          tags: body.tags,
          allowDuplicate: body.allowDuplicate,
        });
      }
      return CitationService.createManual(db, {
        ownerUserId,
        workspaceId: params.id,
        // Body tanpa `doi` dan tanpa `fields` ditolak validasi service (judul wajib).
        fields: body.fields ?? { title: "" },
        tags: body.tags,
        allowDuplicate: body.allowDuplicate,
      });
    },
    {
      auth: true,
      rateLimit: "citations:create",
      body: t.Object({
        doi: t.Optional(t.String()),
        fields: t.Optional(manualFields),
        tags: t.Optional(t.Array(t.String())),
        allowDuplicate: t.Optional(t.Boolean()),
      }),
    },
  )
  .get(
    "/workspaces/:id/citations/:citationId",
    ({ ownerUserId, params }) => {
      const { db } = getDb();
      return CitationService.get(db, {
        ownerUserId,
        workspaceId: params.id,
        citationId: params.citationId,
      });
    },
    { auth: true },
  )
  .patch(
    "/workspaces/:id/citations/:citationId",
    ({ ownerUserId, params, body }) => {
      const { db } = getDb();
      return CitationService.update(db, {
        ownerUserId,
        workspaceId: params.id,
        citationId: params.citationId,
        fields: body.fields,
        tags: body.tags,
        artifactId: body.artifactId,
        markReviewed: body.markReviewed,
      });
    },
    {
      auth: true,
      body: t.Object({
        fields: t.Optional(manualFields),
        tags: t.Optional(t.Array(t.String())),
        artifactId: t.Optional(t.Union([t.String(), t.Null()])),
        markReviewed: t.Optional(t.Boolean()),
      }),
    },
  )
  .delete(
    "/workspaces/:id/citations/:citationId",
    ({ ownerUserId, params }) => {
      const { db } = getDb();
      return CitationService.softDelete(db, {
        ownerUserId,
        workspaceId: params.id,
        citationId: params.citationId,
      });
    },
    { auth: true },
  )
  .post(
    "/workspaces/:id/citations/:citationId/resolve",
    ({ ownerUserId, params }) => {
      const { db } = getDb();
      return CitationService.resolveFromDoi(db, {
        ownerUserId,
        workspaceId: params.id,
        citationId: params.citationId,
      });
    },
    { auth: true, rateLimit: "citations:create" },
  )
  .get(
    "/workspaces/:id/citation-settings",
    ({ ownerUserId, params }) => {
      const { db } = getDb();
      return CitationService.getSettings(db, { ownerUserId, workspaceId: params.id });
    },
    { auth: true },
  )
  .patch(
    "/workspaces/:id/citation-settings",
    ({ ownerUserId, params, body }) => {
      const { db } = getDb();
      return CitationService.updateSettings(db, {
        ownerUserId,
        workspaceId: params.id,
        defaultStyleId: body.defaultStyleId,
        bibliographySort: body.bibliographySort,
      });
    },
    {
      auth: true,
      body: t.Object({
        defaultStyleId: t.Optional(styleId),
        bibliographySort: t.Optional(
          t.Union([t.Literal("author"), t.Literal("year"), t.Literal("title")]),
        ),
      }),
    },
  );
