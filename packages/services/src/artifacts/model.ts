import { throwAppError } from "@aqsha/db";

/**
 * Pure helpers + konstanta artifact (port dari V1 `convex/artifacts/model.ts` +
 * `uploadPolicy.ts` + `uploadLimits.ts`). `ConvexError` → `throwAppError` terstruktur.
 * Legacy-row helpers V1 (`artifactTypeForLegacyArtifact`/`indexingStatusForLegacy`)
 * di-drop — kolom V2 NOT NULL, artifactType selalu terisi. Tanpa Convex/zod dep.
 */

// Threshold inline-vs-R2 (disatukan ke 700_000 untuk semua path; drop 900k V1).
export const ARTIFACT_BODY_INLINE_LIMIT = 700_000;
export const ARTIFACT_CONTEXT_LIMIT = 24_000;
export const ARTIFACT_PREVIEW_LIMIT = 280;
export const MAX_INDEXED_TEXT_CHARS = 300_000;
export const PAPER_ENRICHMENT_TEXT_CHARS = 8_000;
export const MAX_UPLOAD_MB = 50;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

/**
 * Ambang inline vs async untuk index lampiran thread (D5). File ≤ ambang diekstrak+di-index
 * INLINE saat finalize (umumnya cepat, `indexed` langsung diketahui). File > ambang di-offload
 * ke worker `artifact-indexing` (finalize balik cepat dgn status `pending`, FE poll → ready/failed).
 */
export const INLINE_INDEX_MAX_BYTES = 2 * 1024 * 1024;

export const artifactTypes = [
  "markdown",
  "plain_text",
  "pdf",
  "docx",
  "image",
  "spreadsheet",
  "html",
  "svg",
  "mermaid",
  "json",
  "csv",
  "code",
  "url",
] as const;
export type ArtifactType = (typeof artifactTypes)[number];

export const artifactFamilies = [
  "text",
  "file",
  "interactive",
  "visual",
  "data",
  "link",
] as const;
export type ArtifactFamily = (typeof artifactFamilies)[number];

export const artifactSources = ["manual", "upload", "agent", "url"] as const;
export type ArtifactSource = (typeof artifactSources)[number];

export const indexingStatuses = ["not_indexed", "pending", "ready", "failed"] as const;
export type IndexingStatus = (typeof indexingStatuses)[number];

export type DetectedDocumentKind = "generic" | "scholarly_paper";

export const agentWritableArtifactTypes = [
  "markdown",
  "plain_text",
  "html",
  "svg",
  "mermaid",
  "json",
  "csv",
  "code",
] as const satisfies readonly ArtifactType[];
export type AgentWritableArtifactType = (typeof agentWritableArtifactTypes)[number];

// Tipe yang boleh DI-UPLOAD user (Pustaka): dokumen + data tabular. Sengaja sempit;
// visual/code tetap bisa DIHASILKAN agent (jalur terpisah), bukan upload.
export const uploadAllowedArtifactTypes = [
  "pdf",
  "docx",
  "image",
  "spreadsheet",
  "markdown",
  "plain_text",
  "csv",
  "json",
] as const satisfies readonly ArtifactType[];
export type UploadAllowedArtifactType = (typeof uploadAllowedArtifactTypes)[number];

export function isUploadAllowedArtifactType(
  artifactType: ArtifactType,
): artifactType is UploadAllowedArtifactType {
  return (uploadAllowedArtifactTypes as readonly string[]).includes(artifactType);
}

// ----- Upload allow-lists (port uploadPolicy.ts) -----
export const UPLOAD_ALLOWED_EXTENSIONS = [
  ".pdf",
  ".docx",
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".xlsx",
  // Dataset statistik (fase 5): SPSS (.sav) & Stata (.dta) dibaca pyreadstat (value labels ikut).
  ".sav",
  ".dta",
  ".json",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
] as const;

export const UPLOAD_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  // SPSS/Stata sering dikirim browser sebagai octet-stream → validasi jatuh ke ekstensi.
  "application/x-spss-sav",
  "application/x-stata-dta",
  "application/json",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export const WORKSPACE_UPLOAD_ACCEPT = [
  ...UPLOAD_ALLOWED_EXTENSIONS,
  ...UPLOAD_ALLOWED_MIME_TYPES,
].join(",");

export const UPLOAD_REJECTED_MESSAGE =
  "Tipe file tidak didukung. Unggah PDF, DOCX, gambar (PNG/JPG/WebP), TXT, Markdown, CSV, XLSX, SPSS (.sav), Stata (.dta), atau JSON.";

export function normalizeUploadMimeType(mimeType: string | undefined | null): string {
  return (mimeType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}

const extensionTypeMap: Array<{ extensions: string[]; artifactType: ArtifactType }> = [
  { extensions: [".pdf"], artifactType: "pdf" },
  { extensions: [".docx"], artifactType: "docx" },
  { extensions: [".md", ".markdown"], artifactType: "markdown" },
  { extensions: [".txt"], artifactType: "plain_text" },
  { extensions: [".png", ".jpg", ".jpeg", ".webp"], artifactType: "image" },
  { extensions: [".html", ".htm"], artifactType: "html" },
  { extensions: [".svg"], artifactType: "svg" },
  { extensions: [".mmd", ".mermaid"], artifactType: "mermaid" },
  { extensions: [".json"], artifactType: "json" },
  { extensions: [".csv"], artifactType: "csv" },
  { extensions: [".xlsx"], artifactType: "spreadsheet" },
  // SPSS/Stata dataset (fase 5) → family "data" (dibaca pyreadstat di sandbox).
  { extensions: [".sav", ".dta"], artifactType: "spreadsheet" },
  {
    extensions: [
      ".js",
      ".jsx",
      ".ts",
      ".tsx",
      ".css",
      ".py",
      ".java",
      ".go",
      ".rs",
      ".sql",
      ".sh",
      ".yml",
      ".yaml",
    ],
    artifactType: "code",
  },
];

const mimeTypeMap = new Map<string, ArtifactType>([
  ["application/pdf", "pdf"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"],
  ["text/markdown", "markdown"],
  ["text/plain", "plain_text"],
  ["text/html", "html"],
  ["image/svg+xml", "svg"],
  ["image/png", "image"],
  ["image/jpeg", "image"],
  ["image/webp", "image"],
  ["application/json", "json"],
  ["text/csv", "csv"],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "spreadsheet"],
]);

export function normalizeUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throwAppError({ message: "URL is invalid", code: "url_invalid", field: "url", severity: "warning" });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throwAppError({
      message: "URL must use http or https",
      code: "url_protocol_invalid",
      field: "url",
      severity: "warning",
    });
  }
  parsed.hash = "";
  parsed.hostname = parsed.hostname.toLowerCase();
  if (
    (parsed.protocol === "http:" && parsed.port === "80") ||
    (parsed.protocol === "https:" && parsed.port === "443")
  ) {
    parsed.port = "";
  }
  return parsed.toString();
}

export function previewFromText(value: string, limit = ARTIFACT_PREVIEW_LIMIT): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= limit) return compact;
  return `${compact.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
}

export function plainTextFromMarkdown(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]+`/g, " ")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/[#*_~>-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function contextFromText(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= ARTIFACT_CONTEXT_LIMIT) return compact;
  return compact.slice(0, ARTIFACT_CONTEXT_LIMIT).trimEnd();
}

export function artifactFamilyForType(artifactType: ArtifactType): ArtifactFamily {
  switch (artifactType) {
    case "markdown":
    case "plain_text":
      return "text";
    case "pdf":
    case "docx":
      return "file";
    case "image":
      return "visual";
    case "html":
      return "interactive";
    case "svg":
    case "mermaid":
      return "visual";
    case "json":
    case "csv":
    case "spreadsheet":
    case "code":
      return artifactType === "code" ? "text" : "data";
    case "url":
      return "link";
  }
}

export function isAgentWritableArtifactType(
  artifactType: ArtifactType | undefined,
): artifactType is AgentWritableArtifactType {
  if (!artifactType) return false;
  return (agentWritableArtifactTypes as readonly string[]).includes(artifactType);
}

export function artifactTypeFromUpload(args: { fileName: string; mimeType: string }): ArtifactType {
  const lowerType = normalizeUploadMimeType(args.mimeType);
  const byMime = mimeTypeMap.get(lowerType);
  if (byMime) return byMime;
  const lowerName = args.fileName.toLowerCase();
  for (const entry of extensionTypeMap) {
    if (entry.extensions.some((extension) => lowerName.endsWith(extension))) {
      return entry.artifactType;
    }
  }
  throwAppError({
    message: UPLOAD_REJECTED_MESSAGE,
    code: "upload_unsupported_type",
    field: "mimeType",
    severity: "warning",
  });
}

// Detect + enforce allow-list di satu tempat (entry point upload).
export function uploadArtifactType(args: {
  fileName: string;
  mimeType: string;
}): UploadAllowedArtifactType {
  const artifactType = artifactTypeFromUpload(args);
  if (!isUploadAllowedArtifactType(artifactType)) {
    throwAppError({
      message: UPLOAD_REJECTED_MESSAGE,
      code: "upload_unsupported_type",
      field: "mimeType",
      severity: "warning",
    });
  }
  return artifactType;
}

/** Validasi finalize upload (nama/size/tipe) → kembalikan artifactType allow-list. */
export function validateUpload(args: {
  fileName: string;
  mimeType: string;
  size: number;
}): UploadAllowedArtifactType {
  if (!args.fileName.trim()) {
    throwAppError({
      message: "File name is required",
      code: "upload_filename_required",
      field: "fileName",
      severity: "warning",
    });
  }
  if (args.size <= 0) {
    throwAppError({
      message: "File is empty",
      code: "upload_empty",
      field: "size",
      severity: "warning",
    });
  }
  if (args.size > MAX_UPLOAD_BYTES) {
    throwAppError({
      message: `File is too large. Maximum upload size is ${MAX_UPLOAD_MB} MB.`,
      code: "upload_too_large",
      field: "size",
      severity: "warning",
    });
  }
  return uploadArtifactType({ fileName: args.fileName, mimeType: args.mimeType });
}

export function artifactTypeFromAgentInput(value: string): AgentWritableArtifactType {
  if ((artifactTypes as readonly string[]).includes(value)) {
    const artifactType = value as ArtifactType;
    if (isAgentWritableArtifactType(artifactType)) return artifactType;
  }
  throwAppError({
    message: "Unsupported generated artifact type",
    code: "artifact_type_unsupported",
    severity: "warning",
  });
}

export function defaultLanguageForArtifactType(artifactType: ArtifactType): string | undefined {
  switch (artifactType) {
    case "html":
      return "html";
    case "svg":
      return "svg";
    case "mermaid":
      return "mermaid";
    case "json":
      return "json";
    case "csv":
      return "csv";
    case "markdown":
      return "markdown";
    case "plain_text":
      return "text";
    default:
      return undefined;
  }
}

export function titleFromUrl(url: string): string {
  const parsed = new URL(url);
  const lastPath = parsed.pathname.split("/").filter(Boolean).at(-1);
  const label = lastPath ? decodeURIComponent(lastPath).replace(/[-_]+/g, " ") : parsed.hostname;
  return label || parsed.hostname;
}

export function siteNameFromUrl(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "");
}

/** Normalisasi judul artifact (kode kontrak `artifact_title_*`, cap 120). */
export function normalizeArtifactTitle(value: string): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) {
    throwAppError({
      message: "Artifact title is required",
      code: "artifact_title_required",
      field: "title",
      severity: "warning",
    });
  }
  if (trimmed.length > 120) {
    throwAppError({
      message: "Artifact title is too long",
      code: "artifact_title_too_long",
      field: "title",
      severity: "warning",
    });
  }
  return trimmed;
}

/** Judul dari nama file upload (port `titleFromFileName` V1, cap 120). */
export function titleFromFileName(fileName: string): string {
  const base = fileName.replace(/\.[^./\\]+$/, "").replace(/[-_]+/g, " ").trim();
  const title = base || fileName.trim() || "Untitled";
  return title.length > 120 ? title.slice(0, 120) : title;
}
