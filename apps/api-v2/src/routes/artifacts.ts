import { ArtifactService } from "@aqsha/services";
import { Elysia, t } from "elysia";
import { getDb } from "../clients/db";
import { authMacro } from "../plugins/auth";
import { rateLimitMacro } from "../plugins/rate-limit";

/**
 * Route artifacts (P3). Path penuh (tanpa prefix) supaya nested workspace
 * (`/workspaces/:id/artifacts`, `/workspaces/:id/documents`) + top-level
 * (`/artifacts/:id`) hidup di satu modul. Tipis: auth → validasi `t` permisif →
 * 1 service call. `null` service → Elysia body kosong. Upload/URL = Slice 6/7.
 */
export const artifacts = new Elysia()
  .use(authMacro)
  .use(rateLimitMacro)
  // ----- workspace-scoped reads -----
  .get(
    "/workspaces/:id/artifacts",
    ({ ownerUserId, params, query }) => {
      const { db } = getDb();
      return ArtifactService.list(db, ownerUserId, {
        workspaceId: params.id,
        folderId: query.folderId,
        cursor: query.cursor ?? null,
        limit: query.limit,
      });
    },
    {
      auth: true,
      query: t.Object({
        folderId: t.Optional(t.String()),
        cursor: t.Optional(t.String()),
        limit: t.Optional(t.Numeric()),
      }),
    },
  )
  .get(
    "/workspaces/:id/artifacts/context-picker",
    ({ ownerUserId, params }) => {
      const { db } = getDb();
      return ArtifactService.listForContextPicker(db, ownerUserId, params.id);
    },
    { auth: true },
  )
  // ----- create document -----
  .post(
    "/workspaces/:id/documents",
    ({ ownerUserId, email, params, body }) => {
      const { db } = getDb();
      return ArtifactService.createDocument(db, {
        ownerUserId,
        ownerEmail: email,
        workspaceId: params.id,
        folderId: body.folderId,
        title: body.title,
      });
    },
    {
      auth: true,
      rateLimit: "artifacts:create",
      body: t.Object({
        folderId: t.Optional(t.String()),
        title: t.Optional(t.String()),
      }),
    },
  )
  // ----- upload (S3/MinIO presign 3-langkah) -----
  .post(
    "/artifacts/upload-url",
    ({ ownerUserId, body }) => {
      const { db } = getDb();
      return ArtifactService.generateUploadUrl(db, ownerUserId, body.workspaceId);
    },
    {
      auth: true,
      body: t.Object({ workspaceId: t.String() }),
    },
  )
  .post(
    "/workspaces/:id/artifacts/upload",
    ({ ownerUserId, email, params, body }) => {
      const { db } = getDb();
      return ArtifactService.finalizeUpload(db, {
        ownerUserId,
        ownerEmail: email,
        workspaceId: params.id,
        folderId: body.folderId,
        key: body.key,
        fileName: body.fileName,
        mimeType: body.mimeType,
        size: body.size,
      });
    },
    {
      auth: true,
      rateLimit: "artifacts:upload",
      body: t.Object({
        key: t.String(),
        folderId: t.Optional(t.String()),
        fileName: t.String(),
        mimeType: t.String(),
        size: t.Numeric(),
      }),
    },
  )
  // ----- save URL (createUrl) + retry -----
  .post(
    "/workspaces/:id/artifacts/url",
    ({ ownerUserId, email, params, body }) => {
      const { db } = getDb();
      return ArtifactService.saveUrl(db, {
        ownerUserId,
        ownerEmail: email,
        workspaceId: params.id,
        folderId: body.folderId,
        url: body.url,
        title: body.title,
      });
    },
    {
      auth: true,
      rateLimit: "artifacts:create",
      body: t.Object({
        url: t.String(),
        folderId: t.Optional(t.String()),
        title: t.Optional(t.String()),
      }),
    },
  )
  .post(
    "/artifacts/:id/retry-url-extraction",
    ({ ownerUserId, params }) => {
      const { db } = getDb();
      return ArtifactService.retryUrlExtraction(db, { ownerUserId, artifactId: params.id });
    },
    { auth: true },
  )
  // ----- artifact reads -----
  .get(
    "/artifacts/:id",
    ({ ownerUserId, params }) => {
      const { db } = getDb();
      return ArtifactService.get(db, ownerUserId, params.id);
    },
    { auth: true },
  )
  .get(
    "/artifacts/:id/render-payload",
    ({ ownerUserId, params }) => {
      const { db } = getDb();
      return ArtifactService.getRenderPayload(db, ownerUserId, params.id);
    },
    { auth: true },
  )
  // ----- mutations -----
  .put(
    "/artifacts/:id/document",
    ({ ownerUserId, params, body }) => {
      const { db } = getDb();
      return ArtifactService.updateDocument(db, {
        ownerUserId,
        artifactId: params.id,
        title: body.title,
        blocksJson: body.blocksJson,
        markdown: body.markdown,
        plainText: body.plainText,
      });
    },
    {
      auth: true,
      body: t.Object({
        title: t.Optional(t.String()),
        blocksJson: t.Optional(t.String()),
        markdown: t.Optional(t.String()),
        plainText: t.String(),
      }),
    },
  )
  .patch(
    "/artifacts/:id",
    ({ ownerUserId, params, body }) => {
      const { db } = getDb();
      return ArtifactService.update(db, {
        ownerUserId,
        artifactId: params.id,
        title: body.title,
        targetWorkspaceId: body.targetWorkspaceId,
        folderId: body.folderId,
      });
    },
    {
      auth: true,
      body: t.Object({
        title: t.Optional(t.String()),
        targetWorkspaceId: t.Optional(t.String()),
        folderId: t.Optional(t.Union([t.String(), t.Null()])),
      }),
    },
  )
  .delete(
    "/artifacts/:id",
    ({ ownerUserId, params }) => {
      const { db } = getDb();
      return ArtifactService.remove(db, { ownerUserId, artifactId: params.id });
    },
    { auth: true },
  );
