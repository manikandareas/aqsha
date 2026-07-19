export {
  LatexCompileService,
  type LatexCompileInput,
  type LatexCompileOptions,
  type LatexCompileResult,
} from "./compile.service";
export { parseTexLog } from "./log-parser";
export { type RunOptions, type RunResult, runSandboxed } from "./runner";
export {
  parseSynctex,
  pdfPointToSp,
  SP_PER_PDF_POINT,
  spToPdfPoint,
  type SynctexData,
  type SynctexRecord,
  synctexForwardLookup,
  synctexInverseLookup,
  synctexInverseLookupPdfPoint,
} from "./synctex";
export type { CompileError, CompileErrorSeverity } from "./types";
export {
  type AssembledDocument,
  type AssemblyProjectInput,
  type AssemblySectionInput,
  assembleSection,
  assembleWorkspace,
  buildPreamble,
  escapeLatex,
  sectionFilePath,
} from "./assembly.service";
export { scanCiteKeys, stripTexComments } from "./cite-scan";
export {
  assembleWorkspaceDocument,
  LatexBuildService,
  type LatexBuildOutcome,
  type LatexBuildView,
  loadSectionCompileContext,
} from "./build.service";
export { WorkspaceDocxService } from "./docx-export.service";
export {
  applyProposalEdits,
  type AcceptProposalResult,
  type PendingProposalView,
  type ProposalEdit,
  type ProposeSectionEditResult,
  SectionProposalService,
} from "./section-proposal.service";
export { applyHunkSelection, computeProposalHunks, type ProposalHunk } from "./hunks";
