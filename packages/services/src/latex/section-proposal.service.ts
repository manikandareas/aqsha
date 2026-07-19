import {
  type Db,
  DocumentAnnotationRepo,
  type SectionEditProposal,
  SectionEditProposalRepo,
  throwAppError,
} from "@aqsha/db";
import { getRateLimiter } from "../quota";
import { LATEX_SOURCE_MAX_BYTES, SectionLatexService } from "../section-latex.service";
import { assembleSection } from "./assembly.service";
import { loadSectionCompileContext } from "./build.service";
import { LatexCompileService } from "./compile.service";
import { applyHunkSelection, computeProposalHunks, type ProposalHunk } from "./hunks";
import type { CompileError } from "./types";

export type ProposalEdit = { oldText: string; newText: string };

export type ProposeSectionEditResult =
  | { ok: true; proposalId: string; summary: string }
  | { ok: false; reason: "compile_error"; compileErrors: CompileError[] }
  | { ok: false; reason: "edit_mismatch"; message: string };

export type AcceptProposalResult =
  | { status: "accepted"; contentVersion: number }
  | { status: "stale"; currentVersion: number }
  | { status: "compile_error"; compileErrors: CompileError[] };

export type PendingProposalView = {
  id: string;
  sectionId: string;
  baseVersion: number;
  proposedSource: string;
  summary: string;
  annotationIds: string[];
  threadId: string | null;
  createdAt: number;
  currentSource: string;
  currentVersion: number;
  isStale: boolean;
  hunks: ProposalHunk[];
};

/**
 * Terapkan edits search-replace anchored berurutan. Tiap oldText WAJIB match tepat satu —
 * ambigu/tak-ketemu dikembalikan sebagai union (pesan actionable untuk agen memperbaiki
 * anchor-nya), bukan throw.
 */
export function applyProposalEdits(
  source: string,
  edits: ProposalEdit[],
):
  | { ok: true; source: string }
  | { ok: false; index: number; reason: "not_found" | "ambiguous"; matches: number } {
  let current = source;
  for (let index = 0; index < edits.length; index += 1) {
    const edit = edits[index]!;
    if (!edit.oldText) return { ok: false, index, reason: "not_found", matches: 0 };
    let matches = 0;
    let at = current.indexOf(edit.oldText);
    while (at !== -1) {
      matches += 1;
      at = current.indexOf(edit.oldText, at + edit.oldText.length);
    }
    if (matches === 0) return { ok: false, index, reason: "not_found", matches };
    if (matches > 1) return { ok: false, index, reason: "ambiguous", matches };
    current = current.replace(edit.oldText, edit.newText);
  }
  return { ok: true, source: current };
}

/** Satu bucket dengan compile user; store error → fail-open (paritas rateLimitMacro API). */
async function consumeCompileQuota(ownerUserId: string): Promise<void> {
  try {
    await getRateLimiter("latex:compile").consume(ownerUserId);
  } catch (rejected) {
    if (rejected instanceof Error) {
      console.error("[proposal] rate limit store error", rejected);
    } else {
      throwAppError({
        message: "Terlalu banyak compile. Coba lagi sebentar lagi.",
        code: "rate_limited",
        severity: "info",
        status: 429,
      });
    }
  }
}

async function assertPendingProposal(
  db: Db,
  ownerUserId: string,
  proposalId: string,
): Promise<SectionEditProposal> {
  const row = await SectionEditProposalRepo.findById(db, ownerUserId, proposalId);
  if (!row) {
    throwAppError({
      message: "Proposal tidak ditemukan",
      code: "proposal_not_found",
      severity: "warning",
      status: 404,
    });
  }
  if (row.status !== "pending") {
    throwAppError({
      message: "Proposal sudah diputuskan",
      code: "proposal_not_pending",
      severity: "warning",
      status: 409,
    });
  }
  return row;
}

export const SectionProposalService = {
  /**
   * Usulan suntingan agen: apply edits → dry-run compile (assembly bab dengan sumber usulan,
   * TANPA menyimpan build/sumber) → hanya usulan yang compile bersih dipersist sebagai
   * `pending` (supersede pending lama). Error compile dikembalikan sebagai union supaya agen
   * ber-self-repair dengan memanggil ulang. Satu bucket rate-limit dengan compile user
   * (`latex:compile`) — loop agen tidak mendapat jatah terpisah.
   */
  async propose(
    db: Db,
    input: {
      ownerUserId: string;
      sectionId: string;
      edits?: ProposalEdit[];
      fullSource?: string;
      summary: string;
      respondsToAnnotationIds?: string[];
      threadId?: string | null;
      enforceRateLimit?: boolean;
    },
  ): Promise<ProposeSectionEditResult> {
    if (input.enforceRateLimit !== false) {
      await consumeCompileQuota(input.ownerUserId);
    }

    const { section, doc, project, bib } = await loadSectionCompileContext(db, {
      ownerUserId: input.ownerUserId,
      sectionId: input.sectionId,
    });

    let candidate: string;
    if (input.fullSource !== undefined) {
      candidate = input.fullSource;
    } else if (input.edits && input.edits.length > 0) {
      if (!doc) {
        return {
          ok: false,
          reason: "edit_mismatch",
          message: "Bab masih kosong — kirim fullSource untuk draf awal, bukan edits.",
        };
      }
      const applied = applyProposalEdits(doc.source, input.edits);
      if (!applied.ok) {
        return {
          ok: false,
          reason: "edit_mismatch",
          message:
            applied.reason === "not_found"
              ? `edits[${applied.index}].oldText tidak ditemukan di sumber terkini. Baca ulang sumber (get_section_source) lalu pakai kutipan persis.`
              : `edits[${applied.index}].oldText ambigu (${applied.matches} kecocokan). Perluas kutipan supaya unik.`,
        };
      }
      candidate = applied.source;
    } else {
      return {
        ok: false,
        reason: "edit_mismatch",
        message: "Sertakan edits (suntingan terarah) atau fullSource (tulis ulang bab).",
      };
    }

    if (Buffer.byteLength(candidate, "utf8") > LATEX_SOURCE_MAX_BYTES) {
      throwAppError({
        message: "Sumber usulan terlalu besar. Maksimum 2 MB.",
        code: "latex_source_too_large",
        severity: "warning",
        status: 413,
      });
    }

    // Dry-run: build resmi TIDAK tersentuh — user tak pernah melihat PDF dari usulan
    // yang belum diterima, dan pointer build lama tetap utuh.
    const assembled = assembleSection(project, {
      id: section.id,
      title: section.title,
      sortOrder: section.sortOrder,
      role: section.role,
      source: candidate,
    });
    const result = await LatexCompileService.compile({
      mainTex: assembled.mainTex,
      extraFiles: assembled.extraFiles,
      bib,
    });
    if (!result.ok) {
      return { ok: false, reason: "compile_error", compileErrors: result.errors };
    }

    const now = Date.now();
    const proposalId = crypto.randomUUID();
    await db.transaction(async (tx) => {
      await SectionEditProposalRepo.supersedePendingBySection(
        tx,
        input.ownerUserId,
        section.id,
        now,
      );
      await SectionEditProposalRepo.insert(tx, {
        id: proposalId,
        ownerUserId: input.ownerUserId,
        workspaceId: section.workspaceId,
        sectionId: section.id,
        threadId: input.threadId ?? null,
        baseVersion: doc?.contentVersion ?? 0,
        proposedSource: candidate,
        summary: input.summary,
        annotationIds: input.respondsToAnnotationIds ?? [],
        status: "pending",
        createdAt: now,
        decidedAt: null,
      });
    });
    return { ok: true, proposalId, summary: input.summary };
  },

  /**
   * Terima proposal, utuh atau per-hunk. Utuh (tanpa acceptedHunkIndexes) memakai
   * proposedSource yang sudah lolos dry-run saat propose — tanpa compile ulang. Subset hunk
   * menghasilkan sumber baru → wajib dry-run compile dulu; gagal → union compile_error dan
   * proposal tetap pending. Basis hunk = sumber terkini, sah hanya bila versi belum bergeser
   * (guard di awal); CAS saveDocument tetap lapisan pengaman kedua. Urutan save→transisi:
   * gagal di antaranya menyisakan pending yang aman (accept ulang → stale).
   */
  async accept(
    db: Db,
    input: {
      ownerUserId: string;
      proposalId: string;
      acceptedHunkIndexes?: number[];
      enforceRateLimit?: boolean;
    },
  ): Promise<AcceptProposalResult> {
    const proposal = await assertPendingProposal(db, input.ownerUserId, input.proposalId);

    let source = proposal.proposedSource;
    if (input.acceptedHunkIndexes) {
      const doc = await SectionLatexService.getDocument(db, {
        ownerUserId: input.ownerUserId,
        sectionId: proposal.sectionId,
      });
      const currentVersion = doc?.contentVersion ?? 0;
      if (currentVersion !== proposal.baseVersion) {
        await SectionEditProposalRepo.updateById(db, proposal.id, {
          status: "superseded",
          decidedAt: Date.now(),
        });
        return { status: "stale", currentVersion };
      }
      const baseSource = doc?.source ?? "";
      const hunks = computeProposalHunks(baseSource, proposal.proposedSource);
      const selected = new Set(input.acceptedHunkIndexes);
      const invalid =
        selected.size === 0 ||
        [...selected].some((i) => !Number.isInteger(i) || i < 0 || i >= hunks.length);
      if (invalid) {
        throwAppError({
          message: "Pilihan hunk tidak valid",
          code: "invalid_hunk_selection",
          severity: "warning",
          status: 422,
        });
      }
      if (selected.size < hunks.length) {
        source = applyHunkSelection(baseSource, hunks, selected);
        if (Buffer.byteLength(source, "utf8") > LATEX_SOURCE_MAX_BYTES) {
          throwAppError({
            message: "Sumber hasil pilihan terlalu besar. Maksimum 2 MB.",
            code: "latex_source_too_large",
            severity: "warning",
            status: 413,
          });
        }
        if (input.enforceRateLimit !== false) {
          await consumeCompileQuota(input.ownerUserId);
        }
        // Sumber parsial belum pernah compile — dry-run dulu, build resmi tak tersentuh.
        const { section, project, bib } = await loadSectionCompileContext(db, {
          ownerUserId: input.ownerUserId,
          sectionId: proposal.sectionId,
        });
        const assembled = assembleSection(project, {
          id: section.id,
          title: section.title,
          sortOrder: section.sortOrder,
          role: section.role,
          source,
        });
        const compiled = await LatexCompileService.compile({
          mainTex: assembled.mainTex,
          extraFiles: assembled.extraFiles,
          bib,
        });
        if (!compiled.ok) {
          return { status: "compile_error", compileErrors: compiled.errors };
        }
      }
    }

    const saved = await SectionLatexService.saveDocument(db, {
      ownerUserId: input.ownerUserId,
      sectionId: proposal.sectionId,
      source,
      // baseVersion 0 = bab belum pernah ditulis (lazy-create tanpa CAS versi).
      ...(proposal.baseVersion > 0 ? { baseVersion: proposal.baseVersion } : {}),
      author: "agent",
    });
    const now = Date.now();
    if (saved.status === "stale_write") {
      await SectionEditProposalRepo.updateById(db, proposal.id, {
        status: "superseded",
        decidedAt: now,
      });
      return { status: "stale", currentVersion: saved.currentVersion };
    }
    await SectionEditProposalRepo.updateById(db, proposal.id, {
      status: "accepted",
      decidedAt: now,
    });
    await DocumentAnnotationRepo.updateStatusByIds(db, input.ownerUserId, proposal.annotationIds, {
      status: "resolved",
      updatedAt: now,
    });
    return { status: "accepted", contentVersion: saved.contentVersion };
  },

  /** Tolak proposal; anotasi yang dijawabnya dibuka kembali supaya bisa dikirim ulang. */
  async reject(
    db: Db,
    input: { ownerUserId: string; proposalId: string },
  ): Promise<{ ok: true }> {
    const proposal = await assertPendingProposal(db, input.ownerUserId, input.proposalId);
    const now = Date.now();
    await SectionEditProposalRepo.updateById(db, proposal.id, {
      status: "rejected",
      decidedAt: now,
    });
    await DocumentAnnotationRepo.updateStatusByIds(db, input.ownerUserId, proposal.annotationIds, {
      status: "open",
      updatedAt: now,
    });
    return { ok: true };
  },

  async getPending(
    db: Db,
    input: { ownerUserId: string; sectionId: string },
  ): Promise<PendingProposalView | null> {
    const row = await SectionEditProposalRepo.findPendingBySection(
      db,
      input.ownerUserId,
      input.sectionId,
    );
    if (!row) return null;
    const doc = await SectionLatexService.getDocument(db, {
      ownerUserId: input.ownerUserId,
      sectionId: input.sectionId,
    });
    const currentVersion = doc?.contentVersion ?? 0;
    return {
      id: row.id,
      sectionId: row.sectionId,
      baseVersion: row.baseVersion,
      proposedSource: row.proposedSource,
      summary: row.summary,
      annotationIds: row.annotationIds,
      threadId: row.threadId,
      createdAt: row.createdAt,
      currentSource: doc?.source ?? "",
      currentVersion,
      isStale: row.baseVersion !== currentVersion,
      hunks: computeProposalHunks(doc?.source ?? "", row.proposedSource),
    };
  },
};
