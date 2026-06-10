import { ConvexError } from "convex/values";
import { z } from "zod";
import {
  normalizeUploadMimeType,
  UPLOAD_REJECTED_MESSAGE,
} from "./uploadPolicy";

export const ARTIFACT_BODY_INLINE_LIMIT = 700_000;
export const ARTIFACT_CONTEXT_LIMIT = 24_000;
export const ARTIFACT_PREVIEW_LIMIT = 280;

export const artifactTypes = [
  "markdown",
  "plain_text",
  "pdf",
  "docx",
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

export const indexingStatuses = [
  "not_indexed",
  "pending",
  "ready",
  "failed",
] as const;

export type IndexingStatus = (typeof indexingStatuses)[number];

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

export const agentWritableArtifactTypeEnum = z.enum(agentWritableArtifactTypes);

// Tipe yang boleh DI-UPLOAD user sebagai bahan riset (Pustaka). Sengaja sempit:
// dokumen + data tabular. Tipe visual/kode (html/svg/mermaid/code) tetap bisa
// DIHASILKAN agent — itu jalur terpisah (agentWritableArtifactTypes), bukan upload.
export const uploadAllowedArtifactTypes = [
  "pdf",
  "docx",
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

const extensionTypeMap: Array<{ extensions: string[]; artifactType: ArtifactType }> = [
  { extensions: [".pdf"], artifactType: "pdf" },
  { extensions: [".docx"], artifactType: "docx" },
  { extensions: [".md", ".markdown"], artifactType: "markdown" },
  { extensions: [".txt"], artifactType: "plain_text" },
  { extensions: [".html", ".htm"], artifactType: "html" },
  { extensions: [".svg"], artifactType: "svg" },
  { extensions: [".mmd", ".mermaid"], artifactType: "mermaid" },
  { extensions: [".json"], artifactType: "json" },
  { extensions: [".csv"], artifactType: "csv" },
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
  [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "docx",
  ],
  ["text/markdown", "markdown"],
  ["text/plain", "plain_text"],
  ["text/html", "html"],
  ["image/svg+xml", "svg"],
  ["application/json", "json"],
  ["text/csv", "csv"],
]);

export function normalizeUrl(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new ConvexError("URL is invalid");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ConvexError("URL must use http or https");
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

export function previewFromText(value: string, limit = ARTIFACT_PREVIEW_LIMIT) {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= limit) {
    return compact;
  }
  return `${compact.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
}

export function plainTextFromMarkdown(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]+`/g, " ")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/[#*_~>-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function contextFromText(value: string) {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= ARTIFACT_CONTEXT_LIMIT) {
    return compact;
  }
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
    case "html":
      return "interactive";
    case "svg":
    case "mermaid":
      return "visual";
    case "json":
    case "csv":
    case "code":
      return artifactType === "code" ? "text" : "data";
    case "url":
      return "link";
  }
}

export function isAgentWritableArtifactType(
  artifactType: ArtifactType | undefined,
): artifactType is AgentWritableArtifactType {
  if (!artifactType) {
    return false;
  }
  return (agentWritableArtifactTypes as readonly string[]).includes(artifactType);
}

export function artifactTypeForLegacyArtifact(args: {
  artifactType?: ArtifactType;
  kind?: string;
  type?: string;
  contentFormat?: string;
  mimeType?: string;
  fileName?: string;
}): ArtifactType {
  if (args.artifactType) {
    return args.artifactType;
  }
  if (args.kind === "url") {
    return "url";
  }
  if (args.type === "code" || args.contentFormat === "code") {
    return "code";
  }
  if (args.type === "html" || args.contentFormat === "html") {
    return "html";
  }
  if (args.type === "json" || args.contentFormat === "json") {
    return "json";
  }
  if (args.type === "plain_text" || args.contentFormat === "plain") {
    return "plain_text";
  }
  if (args.mimeType && args.fileName) {
    try {
      return artifactTypeFromUpload({
        fileName: args.fileName,
        mimeType: args.mimeType,
      });
    } catch {
      // Fall through to markdown for legacy BlockNote rows.
    }
  }
  return "markdown";
}

export function indexingStatusForLegacy(status?: IndexingStatus): IndexingStatus {
  return status ?? "not_indexed";
}

export function artifactTypeFromUpload(args: {
  fileName: string;
  mimeType: string;
}): ArtifactType {
  const lowerType = normalizeUploadMimeType(args.mimeType);
  const byMime = mimeTypeMap.get(lowerType);
  if (byMime) {
    return byMime;
  }

  const lowerName = args.fileName.toLowerCase();
  for (const entry of extensionTypeMap) {
    if (entry.extensions.some((extension) => lowerName.endsWith(extension))) {
      return entry.artifactType;
    }
  }

  throw new ConvexError(UPLOAD_REJECTED_MESSAGE);
}

// Detect + enforce the upload allow-list in one place. Use this at upload
// entry points (workspace + thread attachment) instead of artifactTypeFromUpload,
// so a detectable-but-disallowed type (e.g. .svg/.html/.py) is rejected clearly
// while artifactTypeFromUpload stays available for legacy detection/rendering.
export function uploadArtifactType(args: {
  fileName: string;
  mimeType: string;
}): UploadAllowedArtifactType {
  const artifactType = artifactTypeFromUpload(args);
  if (!isUploadAllowedArtifactType(artifactType)) {
    throw new ConvexError(UPLOAD_REJECTED_MESSAGE);
  }
  return artifactType;
}

export function artifactTypeFromAgentInput(value: string): AgentWritableArtifactType {
  if ((artifactTypes as readonly string[]).includes(value)) {
    const artifactType = value as ArtifactType;
    if (isAgentWritableArtifactType(artifactType)) {
      return artifactType;
    }
  }
  throw new ConvexError("Unsupported generated artifact type");
}

export function defaultLanguageForArtifactType(artifactType: ArtifactType) {
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

export function titleFromUrl(url: string) {
  const parsed = new URL(url);
  const lastPath = parsed.pathname.split("/").filter(Boolean).at(-1);
  const label = lastPath ? decodeURIComponent(lastPath).replace(/[-_]+/g, " ") : parsed.hostname;
  return label || parsed.hostname;
}

export function siteNameFromUrl(url: string) {
  return new URL(url).hostname.replace(/^www\./, "");
}
