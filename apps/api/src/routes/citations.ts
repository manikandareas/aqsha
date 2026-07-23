import {
  CitationImportService,
  CitationLinkService,
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
 * Route Citation Manager — perpustakaan referensi per AKUN (`/citations/*`,
 * termasuk import batch) + koleksi per proyek via link (`/workspaces/:id/citations*`).
 * `render` ada di kedua level: `/citations/render` (akun, tanpa proyek → default
 * global) dan `/workspaces/:id/citations/render` (ikut gaya sitasi proyek). Yang
 * tetap workspace-scoped: render-document (numbering per dokumen), from-artifact
 * (artifact hidup di workspace), dan citation-settings. Tipis: auth → validasi `t`
 * permisif → 1 service call. Path statis (tags/export/duplicates/imports/...)
 * dideklarasikan sebelum `/:citationId`.
 */
export const citations = new Elysia()
  .use(authMacro)
  .use(rateLimitMacro)
  // ── Perpustakaan akun ────────────────────────────────────────────────────
  .get(
    "/citations",
    ({ ownerUserId, query }) => {
      const { db } = getDb();
      return CitationService.list(db, {
        ownerUserId,
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
    "/citations/tags",
    ({ ownerUserId }) => {
      const { db } = getDb();
      return CitationService.listTags(db, { ownerUserId });
    },
    { auth: true },
  )
  .get(
    "/citations/export",
    async ({ ownerUserId, query }) => {
      const { db } = getDb();
      const result = await CitationService.export(db, {
        ownerUserId,
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
  .get(
    "/citations/duplicates",
    ({ ownerUserId }) => {
      const { db } = getDb();
      return CitationService.listDuplicateGroups(db, { ownerUserId });
    },
    { auth: true },
  )
  .post(
    "/citations/duplicates/merge",
    ({ ownerUserId, body }) => {
      const { db } = getDb();
      return CitationService.merge(db, {
        ownerUserId,
        sourceId: body.sourceId,
        targetId: body.targetId,
      });
    },
    {
      auth: true,
      body: t.Object({ sourceId: t.String(), targetId: t.String() }),
    },
  )
  .post(
    "/citations/merge",
    ({ ownerUserId, body }) => {
      const { db } = getDb();
      return CitationService.mergeMany(db, {
        ownerUserId,
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
    "/citations/bulk-tag",
    ({ ownerUserId, body }) => {
      const { db } = getDb();
      return CitationService.bulkAddTag(db, { ownerUserId, ids: body.ids, tags: body.tags });
    },
    {
      auth: true,
      body: t.Object({ ids: t.Array(t.String()), tags: t.Array(t.String()) }),
    },
  )
  .post(
    "/citations/bulk-delete",
    ({ ownerUserId, body }) => {
      const { db } = getDb();
      return CitationService.bulkSoftDelete(db, { ownerUserId, ids: body.ids });
    },
    {
      auth: true,
      body: t.Object({ ids: t.Array(t.String()) }),
    },
  )
  .post(
    "/citations/imports/preview",
    async ({ ownerUserId, body }) => {
      const { db } = getDb();
      return CitationImportService.preview(db, {
        ownerUserId,
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
    "/citations/imports/:batchId/commit",
    ({ ownerUserId, params, body }) => {
      const { db } = getDb();
      return CitationImportService.commit(db, {
        ownerUserId,
        batchId: params.batchId,
        selectedIndexes: body.selectedIndexes,
        duplicatePolicy: body.duplicatePolicy,
        workspaceId: body.workspaceId,
      });
    },
    {
      auth: true,
      rateLimit: "citations:import",
      body: t.Object({
        selectedIndexes: t.Array(t.Number()),
        duplicatePolicy: t.Union([t.Literal("skip"), t.Literal("merge"), t.Literal("import")]),
        workspaceId: t.Optional(t.String()),
      }),
    },
  )
  .post(
    "/citations",
    ({ ownerUserId, body }) => {
      const { db } = getDb();
      if (body.doi) {
        return CitationService.createByDoi(db, {
          ownerUserId,
          doi: body.doi,
          tags: body.tags,
          allowDuplicate: body.allowDuplicate,
          onDuplicate: body.onDuplicate,
        });
      }
      return CitationService.createManual(db, {
        ownerUserId,
        // Body tanpa `doi` dan tanpa `fields` ditolak validasi service (judul wajib).
        fields: body.fields ?? { title: "" },
        tags: body.tags,
        allowDuplicate: body.allowDuplicate,
        onDuplicate: body.onDuplicate,
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
        onDuplicate: t.Optional(t.Literal("return-existing")),
      }),
    },
  )
  .post(
    "/citations/render",
    ({ ownerUserId, body }) => {
      const { db } = getDb();
      return CitationService.render(db, {
        ownerUserId,
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
  .get(
    "/citations/:citationId",
    ({ ownerUserId, params }) => {
      const { db } = getDb();
      return CitationService.get(db, { ownerUserId, citationId: params.citationId });
    },
    { auth: true },
  )
  .patch(
    "/citations/:citationId",
    ({ ownerUserId, params, body }) => {
      const { db } = getDb();
      return CitationService.update(db, {
        ownerUserId,
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
    "/citations/:citationId",
    ({ ownerUserId, params }) => {
      const { db } = getDb();
      return CitationService.softDelete(db, { ownerUserId, citationId: params.citationId });
    },
    { auth: true },
  )
  .post(
    "/citations/:citationId/resolve",
    ({ ownerUserId, params }) => {
      const { db } = getDb();
      return CitationService.resolveFromDoi(db, {
        ownerUserId,
        citationId: params.citationId,
      });
    },
    { auth: true, rateLimit: "citations:create" },
  )
  // ── Koleksi per proyek (link perpustakaan↔proyek) ────────────────────────
  .get(
    "/workspaces/:id/citations",
    ({ ownerUserId, params, query }) => {
      const { db } = getDb();
      return CitationLinkService.listForWorkspace(db, {
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
  .post(
    "/workspaces/:id/citations",
    ({ ownerUserId, params, body }) => {
      const { db } = getDb();
      if (body.doi) {
        return CitationLinkService.createInWorkspace(db, {
          ownerUserId,
          workspaceId: params.id,
          kind: "doi",
          doi: body.doi,
          tags: body.tags,
          allowDuplicate: body.allowDuplicate,
        });
      }
      return CitationLinkService.createInWorkspace(db, {
        ownerUserId,
        workspaceId: params.id,
        kind: "manual",
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
        onDuplicate: t.Optional(t.Literal("return-existing")),
      }),
    },
  )
  .get(
    "/workspaces/:id/citations/tags",
    ({ ownerUserId, params }) => {
      const { db } = getDb();
      return CitationLinkService.listTagsForWorkspace(db, {
        ownerUserId,
        workspaceId: params.id,
      });
    },
    { auth: true },
  )
  .get(
    "/workspaces/:id/citations/candidates",
    ({ ownerUserId, params, query }) => {
      const { db } = getDb();
      return CitationLinkService.listCandidates(db, {
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
    "/workspaces/:id/citations/export",
    async ({ ownerUserId, params, query }) => {
      const { db } = getDb();
      const result = await CitationLinkService.exportForWorkspace(db, {
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
    "/workspaces/:id/citations/bulk-unlink",
    ({ ownerUserId, params, body }) => {
      const { db } = getDb();
      return CitationLinkService.removeManyFromWorkspace(db, {
        ownerUserId,
        workspaceId: params.id,
        citationIds: body.ids,
      });
    },
    {
      auth: true,
      body: t.Object({ ids: t.Array(t.String()) }),
    },
  )
  .get(
    "/workspaces/:id/citations/:citationId",
    ({ ownerUserId, params }) => {
      const { db } = getDb();
      return CitationLinkService.getForWorkspace(db, {
        ownerUserId,
        workspaceId: params.id,
        citationId: params.citationId,
      });
    },
    { auth: true },
  )
  .post(
    "/workspaces/:id/citations/:citationId/link",
    ({ ownerUserId, params }) => {
      const { db } = getDb();
      return CitationLinkService.addToWorkspace(db, {
        ownerUserId,
        workspaceId: params.id,
        citationId: params.citationId,
      });
    },
    { auth: true },
  )
  .delete(
    "/workspaces/:id/citations/:citationId/link",
    ({ ownerUserId, params }) => {
      const { db } = getDb();
      return CitationLinkService.removeFromWorkspace(db, {
        ownerUserId,
        workspaceId: params.id,
        citationId: params.citationId,
      });
    },
    { auth: true },
  )
  // ── Tetap workspace-scoped ───────────────────────────────────────────────
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
  .get(
    "/workspaces/:id/bibliography",
    ({ ownerUserId, params }) => {
      const { db } = getDb();
      return CitationService.renderWorkspaceBibliography(db, {
        ownerUserId,
        workspaceId: params.id,
      });
    },
    { auth: true },
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
    "/workspaces/:id/citations/from-artifact",
    async ({ ownerUserId, params, body }) => {
      const { db } = getDb();
      const result = await CitationService.createFromArtifact(db, {
        ownerUserId,
        workspaceId: params.id,
        artifactId: body.artifactId,
        tags: body.tags,
      });
      // Sitasi dari artifact proyek langsung masuk koleksi proyek itu.
      await CitationLinkService.addToWorkspace(db, {
        ownerUserId,
        workspaceId: params.id,
        citationId: result.citation.id,
      });
      return result;
    },
    {
      auth: true,
      rateLimit: "citations:create",
      body: t.Object({ artifactId: t.String(), tags: t.Optional(t.Array(t.String())) }),
    },
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
