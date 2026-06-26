import { FolderService } from "@aqsha/services";
import { Elysia, t } from "elysia";
import { getDb } from "../clients/db";
import { authMacro } from "../plugins/auth";

/**
 * Route folder top-level `/folders/:id` (rename/move/remove). List + create folder
 * nested di `./workspaces` (`/workspaces/:id/folders`) sesuai kontrak 05.
 */
export const folders = new Elysia({ prefix: "/folders" })
  .use(authMacro)
  .patch(
    "/:id",
    ({ ownerUserId, params, body }) => {
      const { db } = getDb();
      return FolderService.rename(db, { ownerUserId, folderId: params.id, name: body.name });
    },
    {
      auth: true,
      body: t.Object({ name: t.String() }),
    },
  )
  .post(
    "/:id/move",
    ({ ownerUserId, params, body }) => {
      const { db } = getDb();
      return FolderService.move(db, {
        ownerUserId,
        folderId: params.id,
        targetWorkspaceId: body.targetWorkspaceId,
      });
    },
    {
      auth: true,
      body: t.Object({ targetWorkspaceId: t.String() }),
    },
  )
  .delete(
    "/:id",
    ({ ownerUserId, params }) => {
      const { db } = getDb();
      return FolderService.remove(db, { ownerUserId, folderId: params.id });
    },
    { auth: true },
  );
