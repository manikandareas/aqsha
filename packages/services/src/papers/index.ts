/**
 * @aqsha/services papers — framework-agnostic port of the V1 Convex paper
 * resolution stack (identifier classification → metadata providers → OA PDF
 * download → Jina reader), Redis-cached and callable from BullMQ workers.
 */

export {
  classifyUrl,
  classifyPaperText,
  isAcademicIdentifier,
  type ClassifiedUrl,
} from "./identifiers";
export { resolvePaper, type ResolvedPaper, type PaperAuthor } from "./resolve";
export { BlockedUrlError, followRedirectsSafely, isBlockedHost } from "./http";
export { downloadOaPdf, pdfFileName } from "./download";
export { readWithJinaReader, type JinaReadResult } from "./jina";
