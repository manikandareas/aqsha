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
  type SynctexData,
  type SynctexRecord,
  synctexInverseLookup,
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
