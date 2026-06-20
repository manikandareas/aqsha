import { FolderRepo, throwAppError, type WorkspaceFolder } from "@aqsha/db";
import type { Db, DbOrTx } from "@aqsha/db";
import { normalizeName } from "./workspaces/normalize";
import { WorkspaceService } from "./workspace.service";

const FOLDER_NAME_LABEL = "Folder name";

/** Folder seam — CRUD/move/remove dalam sebuah workspace (P2). */
export const FolderService = {
  /**
   * Assert kepemilikan folder aktif. Missing/not-owned/non-active/workspace
   * mismatch → 404 `folder_not_found`. Port `assertFolderOwner` V1.
   */
  async assertFolderOwner(
    db: DbOrTx,
    ownerUserId: string,
    folderId: string,
    options: { workspaceId?: string } = {},
  ): Promise<WorkspaceFolder> {
    const folder = await FolderRepo.findById(db, folderId);
    if (
      !folder ||
      folder.ownerUserId !== ownerUserId ||
      folder.status !== "active" ||
      (options.workspaceId && folder.workspaceId !== options.workspaceId)
    ) {
      throwAppError({
        message: "Folder not found",
        code: "folder_not_found",
        severity: "error",
        status: 404,
      });
    }
    return folder;
  },

  /** Folder aktif suatu workspace (assert ws owner dulu), cap 200. */
  async list(
    db: DbOrTx,
    ownerUserId: string,
    workspaceId: string,
  ): Promise<{ items: WorkspaceFolder[] }> {
    await WorkspaceService.assertWorkspaceOwner(db, ownerUserId, workspaceId);
    const items = await FolderRepo.listActiveByWorkspace(db, ownerUserId, workspaceId);
    return { items };
  },

  /**
   * Buat folder: workspace wajib active, nama unik aktif per (owner, workspace).
   * Atomik (dup-check + insert satu transaksi). Port `folders.create` V1.
   */
  async create(
    db: Db,
    input: { ownerUserId: string; workspaceId: string; name: string },
  ): Promise<{ id: string }> {
    const name = normalizeName(input.name, FOLDER_NAME_LABEL);
    const now = Date.now();
    const id = crypto.randomUUID();

    await db.transaction(async (tx) => {
      await WorkspaceService.assertWorkspaceOwner(tx, input.ownerUserId, input.workspaceId, {
        requireActive: true,
      });
      const duplicate = await FolderRepo.findActiveByName(
        tx,
        input.ownerUserId,
        input.workspaceId,
        name,
      );
      if (duplicate) {
        throwAppError({
          message: "Folder name already exists",
          code: "folder_name_exists",
          severity: "warning",
          field: "name",
          status: 409,
        });
      }
      await FolderRepo.insert(tx, {
        id,
        ownerUserId: input.ownerUserId,
        workspaceId: input.workspaceId,
        name,
        status: "active",
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
    });

    return { id };
  },

  /** Rename folder (workspace wajib active). NO dup re-check (preserve V1). */
  async rename(
    db: DbOrTx,
    input: { ownerUserId: string; folderId: string; name: string },
  ): Promise<{ ok: true }> {
    const name = normalizeName(input.name, FOLDER_NAME_LABEL);
    const folder = await this.assertFolderOwner(db, input.ownerUserId, input.folderId);
    await WorkspaceService.assertWorkspaceOwner(db, input.ownerUserId, folder.workspaceId, {
      requireActive: true,
    });
    await FolderRepo.update(db, input.folderId, { name, updatedAt: Date.now() });
    return { ok: true };
  },

  /**
   * Pindah folder ke workspace lain (sumber & target wajib active), nama unik di
   * target. No-op bila sudah di target. Port `folders.move` V1.
   *
   * P3: re-point setiap artifact aktif dalam folder ke target + cascade
   * `workspaceId` ke side-table lewat seam `syncArtifactWorkspaceMove` (paginated,
   * bukan bare `.collect()`). Tabel `artifacts` belum ada di P2 → fan-out menyusul
   * di fase Artifacts, dalam transaksi yang sama dengan patch folder di bawah.
   */
  async move(
    db: Db,
    input: { ownerUserId: string; folderId: string; targetWorkspaceId: string },
  ): Promise<{ ok: true }> {
    return db.transaction(async (tx) => {
      const folder = await this.assertFolderOwner(tx, input.ownerUserId, input.folderId);
      await WorkspaceService.assertWorkspaceOwner(tx, input.ownerUserId, folder.workspaceId, {
        requireActive: true,
      });
      await WorkspaceService.assertWorkspaceOwner(tx, input.ownerUserId, input.targetWorkspaceId, {
        requireActive: true,
      });
      if (folder.workspaceId === input.targetWorkspaceId) return { ok: true };

      const duplicate = await FolderRepo.findActiveByName(
        tx,
        input.ownerUserId,
        input.targetWorkspaceId,
        folder.name,
      );
      if (duplicate) {
        throwAppError({
          message: "Folder name already exists in target workspace",
          code: "folder_name_exists",
          severity: "warning",
          field: "name",
          status: 409,
        });
      }
      await FolderRepo.update(tx, input.folderId, {
        workspaceId: input.targetWorkspaceId,
        updatedAt: Date.now(),
      });
      // P3 seam: fan-out artifacts dalam folder → targetWorkspaceId di sini.
      return { ok: true };
    });
  },

  /**
   * Soft-delete folder (workspace wajib active). Port `folders.remove` V1.
   *
   * P3: orphan (clear `folderId`) setiap artifact aktif folder di transaksi yang
   * sama (artifacts table belum ada di P2).
   */
  async remove(
    db: Db,
    input: { ownerUserId: string; folderId: string },
  ): Promise<{ ok: true }> {
    return db.transaction(async (tx) => {
      const folder = await this.assertFolderOwner(tx, input.ownerUserId, input.folderId);
      await WorkspaceService.assertWorkspaceOwner(tx, input.ownerUserId, folder.workspaceId, {
        requireActive: true,
      });
      const now = Date.now();
      // P3 seam: orphan artifacts aktif folder (clear folderId) di sini.
      await FolderRepo.update(tx, input.folderId, {
        status: "deleted",
        deletedAt: now,
        updatedAt: now,
      });
      return { ok: true };
    });
  },
};
