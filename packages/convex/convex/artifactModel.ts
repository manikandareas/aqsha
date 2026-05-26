import { ConvexError } from "convex/values";

export const ARTIFACT_BODY_INLINE_LIMIT = 700_000;
export const ARTIFACT_CONTEXT_LIMIT = 24_000;
export const ARTIFACT_PREVIEW_LIMIT = 280;

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

export function titleFromUrl(url: string) {
  const parsed = new URL(url);
  const lastPath = parsed.pathname.split("/").filter(Boolean).at(-1);
  const label = lastPath ? decodeURIComponent(lastPath).replace(/[-_]+/g, " ") : parsed.hostname;
  return label || parsed.hostname;
}

export function siteNameFromUrl(url: string) {
  return new URL(url).hostname.replace(/^www\./, "");
}
