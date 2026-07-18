import {
  CitationRepo,
  type Db,
  type LatexBuild,
  LatexBuildRepo,
  type NewLatexBuild,
  throwAppError,
  WorkspaceCitationLinkRepo,
  WorkspaceCitationSettingsRepo,
  WorkspaceSectionRepo,
} from "@aqsha/db";
import { composeBibliography } from "../citations/citation-bib";
import type { CslItem } from "../citations/citation-normalize";
import { CitationService } from "../citations/citation.service";
import { SectionLatexService } from "../section-latex.service";
import { SectionService } from "../section.service";
import { StorageService } from "../storage.service";
import { WorkspaceService } from "../workspace.service";
import {
  type AssembledDocument,
  type AssemblyProjectInput,
  assembleSection,
  assembleWorkspace,
} from "./assembly.service";
import { type LatexCompileResult, LatexCompileService } from "./compile.service";
import type { CompileError } from "./types";

const LOG_TAIL_CHARS = 4000;

export type LatexBuildOutcome =
  | { status: "ok"; buildId: string }
  | { status: "error"; errors: CompileError[] };

export type LatexBuildView = {
  id: string;
  status: "ok" | "error";
  errors: CompileError[] | null;
  logTail: string | null;
  sourceVersions: Record<string, number>;
  builtAt: number;
  pdfUrl: string | null;
};

/** .bib proyek = seluruh sitasi ter-link workspace, kunci persisten; biblatex hanya
 * merender yang disitasi sehingga tak perlu subset per-bab. */
async function projectBib(db: Db, ownerUserId: string, workspaceId: string): Promise<string> {
  const links = await WorkspaceCitationLinkRepo.listByWorkspace(db, workspaceId);
  const ids = [...new Set(links.map((l) => l.citationId))];
  if (ids.length === 0) return "";
  const keyById = await CitationService.ensureBibKeys(db, { ownerUserId, citationIds: ids });
  const rows = (await CitationRepo.findByIds(db, ownerUserId, ids)).filter((r) => !r.deletedAt);
  return composeBibliography(
    rows.map((r) => ({ key: keyById[r.id]!, csl: r.cslJson as CslItem })),
  );
}

async function projectInput(
  db: Db,
  ownerUserId: string,
  workspaceId: string,
): Promise<AssemblyProjectInput> {
  const workspace = await WorkspaceService.assertWorkspaceOwner(db, ownerUserId, workspaceId);
  const settings = await WorkspaceCitationSettingsRepo.findByWorkspace(db, workspaceId);
  return {
    title: workspace.name || workspace.topicNote || "Tanpa judul",
    author: null,
    kind: workspace.kind,
    styleId: settings?.defaultStyleId ?? "apa-7",
  };
}

async function deleteStaleKeys(keys: Array<string | null | undefined>): Promise<void> {
  for (const key of keys) {
    if (!key) continue;
    try {
      await StorageService.deleteObject(key);
    } catch (err) {
      console.error("[latex-build] stale key delete failed", key, err);
    }
  }
}

/** Upsert baris latest-only per scope + simpan blob. Saat error, pdf/synctex key
 * build sukses terakhir DIPERTAHANKAN (viewer tetap punya PDF; errors menjelaskan). */
async function persistBuild(
  db: Db,
  input: {
    ownerUserId: string;
    workspaceId: string;
    sectionId: string | null;
    result: LatexCompileResult;
    sourceVersions: Record<string, number>;
  },
): Promise<LatexBuildOutcome> {
  const existing = input.sectionId
    ? await LatexBuildRepo.findBySection(db, input.ownerUserId, input.sectionId)
    : await LatexBuildRepo.findFullByWorkspace(db, input.ownerUserId, input.workspaceId);
  const now = Date.now();

  if (!input.result.ok) {
    const patch = {
      status: "error" as const,
      errors: input.result.errors,
      logTail: input.result.log.slice(-LOG_TAIL_CHARS),
      sourceVersions: input.sourceVersions,
      builtAt: now,
    };
    if (existing) {
      await LatexBuildRepo.updateById(db, existing.id, patch);
    } else {
      await insertBuild(db, {
        id: crypto.randomUUID(),
        ownerUserId: input.ownerUserId,
        workspaceId: input.workspaceId,
        sectionId: input.sectionId,
        pdfR2Key: null,
        synctexR2Key: null,
        ...patch,
      });
    }
    return { status: "error", errors: input.result.errors };
  }

  // Blob dulu, pointer kemudian: upload gagal → throw, pointer lama tetap valid.
  const idSlot = input.sectionId ?? input.workspaceId;
  const pdfKey = await StorageService.storeBytes(
    input.ownerUserId,
    idSlot,
    "latex-pdf",
    input.result.pdf,
    "application/pdf",
  );
  const synctexKey = input.result.synctex
    ? await StorageService.storeBytes(
        input.ownerUserId,
        idSlot,
        "latex-synctex",
        input.result.synctex,
        "application/gzip",
      )
    : null;
  const patch = {
    status: "ok" as const,
    pdfR2Key: pdfKey,
    synctexR2Key: synctexKey,
    errors: null,
    logTail: null,
    sourceVersions: input.sourceVersions,
    builtAt: now,
  };
  let buildId: string;
  if (existing) {
    await LatexBuildRepo.updateById(db, existing.id, patch);
    buildId = existing.id;
  } else {
    buildId = crypto.randomUUID();
    await insertBuild(db, {
      id: buildId,
      ownerUserId: input.ownerUserId,
      workspaceId: input.workspaceId,
      sectionId: input.sectionId,
      ...patch,
    });
  }
  await deleteStaleKeys([existing?.pdfR2Key, existing?.synctexR2Key]);
  return { status: "ok", buildId };
}

/** Race dua compile paralel pada scope sama → unique index; kalah insert = jadi update. */
async function insertBuild(db: Db, row: NewLatexBuild): Promise<void> {
  try {
    await LatexBuildRepo.insert(db, row);
  } catch (err) {
    if ((err as { code?: string }).code !== "23505") throw err;
    const racer = row.sectionId
      ? await LatexBuildRepo.findBySection(db, row.ownerUserId, row.sectionId)
      : await LatexBuildRepo.findFullByWorkspace(db, row.ownerUserId, row.workspaceId);
    if (!racer) throw err;
    const { id: _id, ownerUserId: _o, workspaceId: _w, sectionId: _s, ...patch } = row;
    await LatexBuildRepo.updateById(db, racer.id, patch);
  }
}

function toView(row: LatexBuild, pdfUrl: string | null): LatexBuildView {
  return {
    id: row.id,
    status: row.status as "ok" | "error",
    errors: (row.errors as CompileError[] | null) ?? null,
    logTail: row.logTail,
    sourceVersions: row.sourceVersions,
    builtAt: row.builtAt,
    pdfUrl,
  };
}

async function viewOf(row: LatexBuild | null): Promise<LatexBuildView | null> {
  if (!row) return null;
  const pdfUrl = row.pdfR2Key ? await StorageService.getSignedReadUrl(row.pdfR2Key) : null;
  return toView(row, pdfUrl);
}

export const LatexBuildService = {
  /** Compile satu bab (loop edit cepat) — sinkron; hasil dipersist latest-only. */
  async compileSection(
    db: Db,
    input: { ownerUserId: string; sectionId: string },
  ): Promise<LatexBuildOutcome> {
    const section = await SectionService.assertSectionOwner(db, input.ownerUserId, input.sectionId);
    if (section.role === "bibliography") {
      throwAppError({
        message: "Daftar pustaka dirender saat compile dokumen penuh",
        code: "bibliography_not_editable",
        severity: "warning",
        status: 422,
      });
    }
    const doc = await SectionLatexService.getDocument(db, {
      ownerUserId: input.ownerUserId,
      sectionId: input.sectionId,
    });
    if (!doc) {
      throwAppError({
        message: "Bab belum punya sumber untuk di-compile",
        code: "section_document_not_found",
        severity: "warning",
        status: 404,
      });
    }
    const project = await projectInput(db, input.ownerUserId, section.workspaceId);
    const bib = await projectBib(db, input.ownerUserId, section.workspaceId);
    const assembled: AssembledDocument = assembleSection(project, {
      id: section.id,
      title: section.title,
      sortOrder: section.sortOrder,
      role: section.role,
      source: doc.source,
    });
    const result = await LatexCompileService.compile({
      mainTex: assembled.mainTex,
      extraFiles: assembled.extraFiles,
      bib,
    });
    return persistBuild(db, {
      ownerUserId: input.ownerUserId,
      workspaceId: section.workspaceId,
      sectionId: section.id,
      result,
      sourceVersions: { [section.id]: doc.contentVersion },
    });
  },

  /** Compile dokumen penuh (preview akhir/ekspor) — bab tanpa sumber dilewati. */
  async compileWorkspace(
    db: Db,
    input: { ownerUserId: string; workspaceId: string },
  ): Promise<LatexBuildOutcome> {
    const project = await projectInput(db, input.ownerUserId, input.workspaceId);
    const sections = await WorkspaceSectionRepo.listByWorkspace(db, input.workspaceId);
    const sourceVersions: Record<string, number> = {};
    const assemblyInputs = [];
    for (const section of sections) {
      if (section.role === "bibliography") {
        assemblyInputs.push({
          id: section.id,
          title: section.title,
          sortOrder: section.sortOrder,
          role: section.role,
          source: null,
        });
        continue;
      }
      const doc = await SectionLatexService.getDocument(db, {
        ownerUserId: input.ownerUserId,
        sectionId: section.id,
      });
      if (doc) sourceVersions[section.id] = doc.contentVersion;
      assemblyInputs.push({
        id: section.id,
        title: section.title,
        sortOrder: section.sortOrder,
        role: section.role,
        source: doc?.source ?? null,
      });
    }
    const bib = await projectBib(db, input.ownerUserId, input.workspaceId);
    const assembled = assembleWorkspace(project, assemblyInputs);
    const result = await LatexCompileService.compile({
      mainTex: assembled.mainTex,
      extraFiles: assembled.extraFiles,
      bib,
    });
    return persistBuild(db, {
      ownerUserId: input.ownerUserId,
      workspaceId: input.workspaceId,
      sectionId: null,
      result,
      sourceVersions,
    });
  },

  async getSectionBuild(
    db: Db,
    input: { ownerUserId: string; sectionId: string },
  ): Promise<LatexBuildView | null> {
    await SectionService.assertSectionOwner(db, input.ownerUserId, input.sectionId);
    return viewOf(await LatexBuildRepo.findBySection(db, input.ownerUserId, input.sectionId));
  },

  async getWorkspaceBuild(
    db: Db,
    input: { ownerUserId: string; workspaceId: string },
  ): Promise<LatexBuildView | null> {
    await WorkspaceService.assertWorkspaceOwner(db, input.ownerUserId, input.workspaceId);
    return viewOf(await LatexBuildRepo.findFullByWorkspace(db, input.ownerUserId, input.workspaceId));
  },
};
