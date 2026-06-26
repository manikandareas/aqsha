import { FolderService, WorkspaceService } from "@aqsha/services";
import { Elysia, t } from "elysia";
import { getDb } from "../clients/db";
import { authMacro } from "../plugins/auth";
import { rateLimitMacro } from "../plugins/rate-limit";

/**
 * Route workspaces + folder nested (list/create). `/folders/:id` top-level ada di
 * `./folders`. Tipis: auth → validasi `t` permisif → 1 service call. Validasi
 * domain (capacity/emoji/name/dedupe) hidup di service → `appError` terstruktur,
 * di-map errorPlugin global.
 */
export const workspaces = new Elysia({ prefix: "/workspaces" })
  .use(authMacro)
  .use(rateLimitMacro)
  .get(
    "/",
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
    "/:id",
    ({ ownerUserId, params }) => {
      const { db } = getDb();
      return WorkspaceService.get(db, ownerUserId, params.id);
    },
    { auth: true },
  )
  .post(
    "/",
    ({ ownerUserId, email, body }) => {
      const { db } = getDb();
      return WorkspaceService.create(db, { ownerUserId, ownerEmail: email, name: body.name });
    },
    {
      auth: true,
      rateLimit: "workspaces:create",
      body: t.Object({ name: t.String() }),
    },
  )
  .patch(
    "/:id",
    ({ ownerUserId, params, body }) => {
      const { db } = getDb();
      return WorkspaceService.update(db, {
        ownerUserId,
        workspaceId: params.id,
        name: body.name,
        emoji: body.emoji,
      });
    },
    {
      auth: true,
      body: t.Object({
        name: t.Optional(t.String()),
        emoji: t.Optional(t.String()),
      }),
    },
  )
  .post(
    "/:id/archive",
    ({ ownerUserId, params }) => {
      const { db } = getDb();
      return WorkspaceService.archive(db, { ownerUserId, workspaceId: params.id });
    },
    { auth: true },
  )
  .get(
    "/:id/folders",
    ({ ownerUserId, params }) => {
      const { db } = getDb();
      return FolderService.list(db, ownerUserId, params.id);
    },
    { auth: true },
  )
  .post(
    "/:id/folders",
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
