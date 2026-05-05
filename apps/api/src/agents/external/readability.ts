// HTML → readable text via Mozilla Readability + JSDOM.
//
// Used as the ReaderAgent fallback when Exa fetch fails or returns paywalled
// content. Returns clean plain text + extracted metadata.

import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { bytesToText, isHtml, isPdf, politelyFetch } from "./http";
import {
  type FetchedDocument,
  HttpFetchError,
  NotHtmlError,
} from "./types";

export type FetchReadableOptions = {
  signal?: AbortSignal;
  /** Max characters of textContent to return — protect against giant articles. */
  maxChars?: number;
};

const DEFAULT_MAX_CHARS = 25_000;

export async function fetchReadable(
  url: string,
  options: FetchReadableOptions = {},
): Promise<FetchedDocument> {
  const result = await politelyFetch(url, {
    signal: options.signal,
    accept: "text/html,application/xhtml+xml,*/*;q=0.8",
  });

  if (isPdf(result.contentType)) {
    throw new NotHtmlError(
      `URL is a PDF, use pdf_extract instead: ${url}`,
      url,
      result.contentType,
    );
  }

  if (!isHtml(result.contentType)) {
    throw new NotHtmlError(
      `URL is not HTML (content-type=${result.contentType ?? "unknown"})`,
      url,
      result.contentType,
    );
  }

  const html = bytesToText(result.bytes);
  if (!html.trim()) {
    throw new HttpFetchError(`Empty HTML body for ${url}`, url, result.status);
  }

  const dom = new JSDOM(html, { url: result.finalUrl });
  const article = new Readability(dom.window.document).parse();

  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const fullText = (article?.textContent ?? "").trim();
  const textContent = fullText.slice(0, maxChars);

  return {
    url,
    finalUrl: result.finalUrl,
    title: cleanText(article?.title) ?? extractTitleFallback(dom),
    byline: cleanText(article?.byline),
    publishedTime: extractPublishedTime(dom),
    textContent,
    excerpt: cleanText(article?.excerpt),
    length: fullText.length,
    contentType: result.contentType,
    truncated: result.truncated || fullText.length > textContent.length,
  };
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed || null;
}

function extractTitleFallback(dom: JSDOM): string | null {
  const titleEl = dom.window.document.querySelector("title");
  return cleanText(titleEl?.textContent ?? null);
}

function extractPublishedTime(dom: JSDOM): string | null {
  const doc = dom.window.document;
  const candidates = [
    doc.querySelector('meta[property="article:published_time"]')?.getAttribute("content"),
    doc.querySelector('meta[name="pubdate"]')?.getAttribute("content"),
    doc.querySelector('meta[name="publish-date"]')?.getAttribute("content"),
    doc.querySelector('meta[itemprop="datePublished"]')?.getAttribute("content"),
    doc.querySelector("time[datetime]")?.getAttribute("datetime"),
  ];

  for (const value of candidates) {
    const cleaned = cleanText(value);
    if (cleaned) {
      return cleaned;
    }
  }
  return null;
}
