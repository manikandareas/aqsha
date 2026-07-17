import {
  SECTION_STATUSES,
  type SectionStatus,
  throwAppError,
  type WorkspaceSection,
  WorkspaceSectionRepo,
} from "@aqsha/db";
import type { Db, DbOrTx } from "@aqsha/db";
import { WorkspaceService } from "./workspace.service";
import { normalizeName } from "./workspaces/normalize";

const SECTION_TITLE_LABEL = "Section title";

/** Kerangka bab proyek — CRUD + reorder + status. Dipakai route api (+ tool agent nanti). */
export const SectionService = {
  async list(db: DbOrTx, ownerUserId: string, workspaceId: string): Promise<WorkspaceSection[]> {
    await WorkspaceService.assertWorkspaceOwner(db, ownerUserId, workspaceId);
    return WorkspaceSectionRepo.listByWorkspace(db, workspaceId);
  },

  /** Tambah bab di akhir kerangka. */
  async create(
    db: Db,
    input: { ownerUserId: string; workspaceId: string; title: string },
  ): Promise<{ id: string }> {
    await WorkspaceService.assertWorkspaceOwner(db, input.ownerUserId, input.workspaceId, {
      requireActive: true,
    });
    const title = normalizeName(input.title, SECTION_TITLE_LABEL);
    const now = Date.now();
    const id = crypto.randomUUID();
    await db.transaction(async (tx) => {
      const existing = await WorkspaceSectionRepo.listByWorkspace(tx, input.workspaceId);
      await WorkspaceSectionRepo.insertMany(tx, [
        {
          id,
          workspaceId: input.workspaceId,
          title,
          sortOrder: existing.length,
          status: "empty",
          role: null,
          documentArtifactId: null,
          createdAt: now,
          updatedAt: now,
        },
      ]);
    });
    return { id };
  },

  async rename(
    db: DbOrTx,
    input: { ownerUserId: string; sectionId: string; title: string },
  ): Promise<{ ok: true }> {
    await this.assertSectionOwner(db, input.ownerUserId, input.sectionId);
    await WorkspaceSectionRepo.update(db, input.sectionId, {
      title: normalizeName(input.title, SECTION_TITLE_LABEL),
      updatedAt: Date.now(),
    });
    return { ok: true };
  },

  async setStatus(
    db: DbOrTx,
    input: { ownerUserId: string; sectionId: string; status: SectionStatus },
  ): Promise<{ ok: true }> {
    if (!SECTION_STATUSES.includes(input.status)) {
      throwAppError({
        message: "Status bab tidak dikenal",
        code: "section_status_invalid",
        severity: "warning",
        status: 422,
      });
    }
    await this.assertSectionOwner(db, input.ownerUserId, input.sectionId);
    await WorkspaceSectionRepo.update(db, input.sectionId, {
      status: input.status,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },

  /** Reorder total: `orderedIds` wajib sama persis dengan himpunan section workspace. */
  async reorder(
    db: Db,
    input: { ownerUserId: string; workspaceId: string; orderedIds: string[] },
  ): Promise<{ ok: true }> {
    await WorkspaceService.assertWorkspaceOwner(db, input.ownerUserId, input.workspaceId);
    await db.transaction(async (tx) => {
      const existing = await WorkspaceSectionRepo.listByWorkspace(tx, input.workspaceId);
      const existingIds = new Set(existing.map((s) => s.id));
      const sameSet =
        input.orderedIds.length === existing.length &&
        input.orderedIds.every((id) => existingIds.has(id)) &&
        new Set(input.orderedIds).size === input.orderedIds.length;
      if (!sameSet) {
        throwAppError({
          message: "Daftar urutan bab tidak cocok dengan kerangka saat ini",
          code: "section_reorder_mismatch",
          severity: "warning",
          status: 409,
        });
      }
      await WorkspaceSectionRepo.reorder(tx, input.workspaceId, input.orderedIds, Date.now());
    });
    return { ok: true };
  },

  async remove(db: DbOrTx, input: { ownerUserId: string; sectionId: string }): Promise<{ ok: true }> {
    await this.assertSectionOwner(db, input.ownerUserId, input.sectionId);
    await WorkspaceSectionRepo.deleteById(db, input.sectionId);
    return { ok: true };
  },

  /** Section → workspace → owner. Missing/not-owned → 404 `section_not_found`. */
  async assertSectionOwner(
    db: DbOrTx,
    ownerUserId: string,
    sectionId: string,
  ): Promise<WorkspaceSection> {
    const section = await WorkspaceSectionRepo.findById(db, sectionId);
    if (!section) {
      throwAppError({
        message: "Section not found",
        code: "section_not_found",
        severity: "error",
        status: 404,
      });
    }
    await WorkspaceService.assertWorkspaceOwner(db, ownerUserId, section.workspaceId);
    return section;
  },
};
