import { normalizeDoi } from "../../lib/identifiers";
import type { SourceCandidate } from "./sourceCandidates";

const BLOCKED_PATTERNS = [
  /access denied/i,
  /just a moment/i,
  /security check/i,
  /captcha/i,
  /enable javascript/i,
  /cookie (consent|preferences|settings)/i,
  /login (required|to continue)/i,
  /sign in to continue/i,
  /403 forbidden/i,
  /temporarily blocked/i,
];

const METADATA_ONLY_PATTERNS = [
  /^crossref metadata only/i,
  /^source lookup failed/i,
  /^no extract was available/i,
  /^jina search returned no readable result/i,
];

export type SourceQuality =
  | { ok: true; reason: "readable" | "academic_abstract" | "sufficient_snippet" }
  | {
      ok: false;
      reason:
        | "blocked"
        | "empty"
        | "metadata_only"
        | "provider_failure"
        | "too_short"
        | "duplicate";
    };

export function assessSourceQuality(
  source: Pick<SourceCandidate, "origin" | "title" | "locator" | "snippet" | "url" | "arxivId" | "doi">,
  readText?: string,
): SourceQuality {
  const content = normalizeText(
    [source.title, source.locator, source.snippet, readText].filter(Boolean).join("\n"),
  );
  const readableText = normalizeText(readText || source.snippet);

  if (!content) {
    return { ok: false, reason: "empty" };
  }
  if (BLOCKED_PATTERNS.some((pattern) => pattern.test(content))) {
    return { ok: false, reason: "blocked" };
  }
  if (/provider unavailable/i.test(source.title) || /lookup failed/i.test(source.snippet)) {
    return { ok: false, reason: "provider_failure" };
  }
  if (METADATA_ONLY_PATTERNS.some((pattern) => pattern.test(source.snippet))) {
    return { ok: false, reason: "metadata_only" };
  }
  if (source.origin === "arxiv" && readableText.length >= 180) {
    return { ok: true, reason: "academic_abstract" };
  }
  if (readableText.length >= 500) {
    return { ok: true, reason: "readable" };
  }
  if (source.snippet.length >= 240 && source.origin !== "doi") {
    return { ok: true, reason: "sufficient_snippet" };
  }
  return { ok: false, reason: "too_short" };
}

export function canonicalSourceKey(
  source: Pick<SourceCandidate, "doi" | "arxivId" | "url" | "locator" | "title">,
) {
  const doi = source.doi ? normalizeDoi(source.doi) : undefined;
  if (doi) {
    return `doi:${doi}`;
  }
  const arxivId = normalizeArxivId(source.arxivId || source.url || source.locator);
  if (arxivId) {
    return `arxiv:${arxivId}`;
  }
  const url = normalizeUrl(source.url || source.locator);
  if (url) {
    return `url:${url}`;
  }
  return `title:${normalizeText(source.title).toLowerCase()}`;
}

export function sourceDomain(source: Pick<SourceCandidate, "url" | "locator">) {
  const raw = source.url || source.locator;
  try {
    const url = new URL(raw);
    return url.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return undefined;
  }
}

function normalizeArxivId(value?: string) {
  const match = value?.match(/(?:arxiv\.org\/(?:abs|pdf|html)\/|^)(\d{4}\.\d{4,5}(?:v\d+)?)/i);
  return match?.[1]?.replace(/v\d+$/i, "").toLowerCase();
}

function normalizeUrl(value?: string) {
  if (!value) {
    return undefined;
  }
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    const pathname = url.pathname
      .replace(/\/pdf\/(\d{4}\.\d{4,5})(?:v\d+)?(?:\.pdf)?$/i, "/abs/$1")
      .replace(/\/html\/(\d{4}\.\d{4,5})(?:v\d+)?$/i, "/abs/$1")
      .replace(/\/+$/, "");
    return `${url.hostname.replace(/^www\./, "").toLowerCase()}${pathname}`.toLowerCase();
  } catch {
    return value.trim().toLowerCase();
  }
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
