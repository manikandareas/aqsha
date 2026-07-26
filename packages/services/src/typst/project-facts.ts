import { ChatThreadRepo, type Db } from "@aqsha/db";
import { AnnotationService } from "../annotation.service";
import { WorkspaceDocumentService } from "../workspace-document.service";
import { WorkspaceService } from "../workspace.service";
import { scanTypstCiteKeys } from "./cite-scan";
import { DocumentProposalService } from "./document-proposal.service";
import { resolveMainTypFilename } from "./main-filename";
import { countWords, type OutlineHeading, parseTypstOutline } from "./outline";
import { listProjectReferences } from "./project-bib";

export type ProjectFacts = {
  workspaceId: string;
  workspaceName: string;
  mainFileName: string;
  contentVersion: number;
  totalWords: number;
  headings: OutlineHeading[];
  referenceCount: number;
  orphanCiteKeys: string[];
  unusedReferenceKeys: string[];
  openAnnotationCount: number;
  pendingProposal: { id: string; hunkCount: number; isStale: boolean } | null;
};

/** Sitasi yang tak punya entri bib, dan entri bib yang tak pernah disitasi. Keduanya unik & terurut kemunculan. */
export function citeIntegrity(
  source: string,
  referenceKeys: string[],
): { orphanCiteKeys: string[]; unusedReferenceKeys: string[] } {
  const known = new Set(referenceKeys);
  const cited = new Set<string>();
  const orphanCiteKeys: string[] = [];
  for (const key of scanTypstCiteKeys(source)) {
    cited.add(key);
    if (!known.has(key) && !orphanCiteKeys.includes(key)) orphanCiteKeys.push(key);
  }
  return {
    orphanCiteKeys,
    unusedReferenceKeys: referenceKeys.filter((key) => !cited.has(key)),
  };
}

function headingLine(heading: OutlineHeading, position: number): string {
  const marker = "=".repeat(heading.level);
  const size = heading.isEmpty ? "kosong" : `${heading.words} kata`;
  return `  ${position}. ${marker} ${heading.title} (${size})`;
}

/**
 * Manifest yang disuntik tiap turn. Sengaja memuat PETA (bab, panjang, cacat) dan bukan ISI:
 * biaya prompt tetap stabil, sementara orientasi tak lagi menghabiskan satu ronde tool call.
 */
export function renderProjectManifest(facts: ProjectFacts): string {
  const lines: string[] = [
    "<system-reminder>",
    `Proyek aktif: "${facts.workspaceName}" (workspaceId: ${facts.workspaceId}).`,
  ];

  if (facts.headings.length === 0 && facts.totalWords === 0) {
    lines.push(
      `Dokumen masih kosong (${facts.mainFileName}, contentVersion ${facts.contentVersion}).`,
    );
  } else {
    lines.push(
      `Dokumen: ${facts.mainFileName}, contentVersion ${facts.contentVersion}, ${facts.totalWords} kata.`,
      "Kerangka:",
      ...facts.headings.map((h, i) => headingLine(h, i + 1)),
    );
  }

  lines.push(
    `Referensi proyek: ${facts.referenceCount} entri` +
      (facts.orphanCiteKeys.length > 0
        ? `; sitasi yatim: ${facts.orphanCiteKeys.map((k) => `@${k}`).join(", ")}`
        : "") +
      (facts.unusedReferenceKeys.length > 0
        ? `; referensi menganggur: ${facts.unusedReferenceKeys.length}`
        : "") +
      ".",
    `Anotasi terbuka: ${facts.openAnnotationCount}.`,
    facts.pendingProposal
      ? `Proposal tertunda: ${facts.pendingProposal.hunkCount} bagian menunggu keputusan user${facts.pendingProposal.isStale ? " (basi)" : ""}. Jangan membuat proposal baru sebelum diselesaikan.`
      : "Proposal tertunda: tidak ada.",
    "</system-reminder>",
  );
  return lines.join("\n");
}

export const ProjectFactsService = {
  /** Fakta proyek untuk manifest dan tool peta. `null` bila thread tak terikat proyek milik user. */
  async get(
    db: Db,
    input: { ownerUserId: string; workspaceId: string },
  ): Promise<ProjectFacts | null> {
    // Kepemilikan dipastikan lebih dulu: pembaca dokumen melempar untuk workspace asing.
    const workspace = await WorkspaceService.get(db, input.ownerUserId, input.workspaceId);
    if (!workspace) return null;
    const doc = await WorkspaceDocumentService.getDocument(db, input);
    const source = doc?.source ?? "";
    const [references, annotations, pending] = await Promise.all([
      listProjectReferences(db, input),
      AnnotationService.list(db, input),
      DocumentProposalService.getPending(db, input),
    ]);
    const integrity = citeIntegrity(
      source,
      references.map((r) => r.key),
    );
    return {
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      mainFileName: resolveMainTypFilename(workspace.kind),
      contentVersion: doc?.contentVersion ?? 0,
      totalWords: countWords(source),
      headings: parseTypstOutline(source),
      referenceCount: references.length,
      orphanCiteKeys: integrity.orphanCiteKeys,
      unusedReferenceKeys: integrity.unusedReferenceKeys,
      openAnnotationCount: annotations.filter((a) => a.status === "open" || a.status === "sent")
        .length,
      pendingProposal: pending
        ? { id: pending.id, hunkCount: pending.hunks.length, isStale: pending.isStale }
        : null,
    };
  },

  /** Proyek yang menaungi thread, bila ada. Dipakai tool agar model tak perlu menebak workspaceId. */
  async workspaceIdForThread(
    db: Db,
    input: { ownerUserId: string; threadId: string },
  ): Promise<string | null> {
    const thread = await ChatThreadRepo.findById(db, input.threadId);
    if (!thread || thread.ownerUserId !== input.ownerUserId) return null;
    return thread.workspaceId ?? null;
  },
};
