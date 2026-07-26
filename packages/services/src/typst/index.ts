export { runSandboxed, type RunOptions, type RunResult } from "./runner";
export { parseTypstDiagnostics } from "./diagnostics";
export type { TypstDiagnostic, TypstDiagnosticSeverity } from "./types";
export {
  TypstCompileService,
  isTypstAvailable,
  type TypstCompileInput,
  type TypstCompileResult,
} from "./compile.service";
export {
  MAIN_TYP_FILENAMES,
  mainTypFilename,
  resolveMainTypFilename,
  sanitizeMainTypFilename,
} from "./main-filename";
export { scaffoldTypstDocument, type ScaffoldTypstOptions } from "./scaffold";
export { scanTypstCiteKeys, stripTypstComments } from "./cite-scan";
export {
  applyOutlineOperations,
  countWords,
  findOutlineSectionByTitle,
  type OutlineHeading,
  type OutlineOperation,
  type OutlineSection,
  parseTypstOutline,
  sliceOutlineSection,
} from "./outline";
export { composeProjectBib, listProjectReferences, type ProjectReference } from "./project-bib";
export {
  citeIntegrity,
  type ProjectFacts,
  ProjectFactsService,
  renderProjectManifest,
} from "./project-facts";
export {
  type DocumentIssues,
  type DocumentReport,
  DocumentReportService,
  inspectDocumentSource,
} from "./document-report";
export {
  applyHunkSelection,
  computeProposalHunks,
  type ProposalHunk,
} from "./hunks";
export {
  applyProposalEdits,
  DocumentProposalService,
  type AcceptProposalResult,
  type PendingProposalView,
  type ProposalEdit,
  type ProposeDocumentEditResult,
} from "./document-proposal.service";
export { WorkspacePdfExportService, type PdfExportResult } from "./pdf-export.service";
export {
  WorkspaceDocxExportService,
  convertTypstToDocx,
  isPandocAvailable,
  type ConvertTypstToDocxInput,
} from "./docx-export.service";
