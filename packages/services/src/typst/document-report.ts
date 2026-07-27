import type { Db } from "@aqsha/db";
import { WorkspaceDocumentService } from "../workspace-document.service";
import { WorkspaceService } from "../workspace.service";
import { TypstCompileService } from "./compile.service";
import { resolveMainTypFilename } from "./main-filename";
import { countWords, parseTypstOutline } from "./outline";
import { composeProjectBib, listProjectReferences } from "./project-bib";
import { citeIntegrity } from "./project-facts";
import type { TypstDiagnostic } from "./types";

export type DocumentIssues = {
  orphanCiteKeys: string[];
  unusedReferenceKeys: string[];
  emptyHeadings: { index: number; title: string; line: number }[];
  duplicateHeadings: string[];
};

export type DocumentReport = DocumentIssues & {
  compiles: boolean;
  compileErrors: TypstDiagnostic[];
  totalWords: number;
  chapterCount: number;
};

/** Cacat yang dapat dinilai dari sumber saja — tanpa compile, tanpa DB. */
export function inspectDocumentSource(source: string, referenceKeys: string[]): DocumentIssues {
  const outline = parseTypstOutline(source);
  const seen = new Set<string>();
  const duplicateHeadings: string[] = [];
  for (const heading of outline) {
    const key = heading.title.trim().toLowerCase();
    if (seen.has(key)) {
      if (!duplicateHeadings.includes(heading.title)) duplicateHeadings.push(heading.title);
    }
    seen.add(key);
  }
  return {
    ...citeIntegrity(source, referenceKeys),
    emptyHeadings: outline
      .filter((h) => h.isEmpty)
      .map((h) => ({ index: h.index, title: h.title, line: h.line })),
    duplicateHeadings,
  };
}

export const DocumentReportService = {
  /** Laporan lengkap: cacat sumber + hasil dry-run compile dengan bib proyek terkini. */
  async check(db: Db, input: { ownerUserId: string; workspaceId: string }): Promise<DocumentReport> {
    const workspace = await WorkspaceService.get(db, input.ownerUserId, input.workspaceId);
    const doc = await WorkspaceDocumentService.getDocument(db, input);
    const source = doc?.source ?? "";
    const references = await listProjectReferences(db, input);
    const issues = inspectDocumentSource(
      source,
      references.map((r) => r.key),
    );
    const bib = await composeProjectBib(db, input);
    const compiled = await TypstCompileService.compile({
      mainTyp: source,
      bib,
      mainFileName: resolveMainTypFilename(workspace?.kind),
    });
    return {
      ...issues,
      compiles: compiled.ok,
      compileErrors: compiled.ok ? [] : compiled.errors,
      totalWords: countWords(source),
      chapterCount: parseTypstOutline(source).filter((h) => h.level === 1).length,
    };
  },
};
