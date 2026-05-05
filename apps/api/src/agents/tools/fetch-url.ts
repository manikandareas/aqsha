import { tool } from "ai";
import { z } from "zod";
import { fetchReadable } from "../external/readability";
import { HttpFetchError, NotHtmlError } from "../external/types";

const inputSchema = z.object({
  url: z.string().url(),
  reason: z
    .string()
    .min(3)
    .max(160)
    .describe(
      "Why this URL is being fetched as a fallback (e.g. 'Exa returned 4xx', 'paywalled'). "
      + "Used for telemetry; required so the model is explicit about its routing decisions.",
    ),
});

const HARD_TEXT_CAP = 25_000;

export function createFetchUrlTool() {
  return tool({
    description:
      "Fallback HTML fetcher with Readability extraction. Use ONLY when web_fetch_exa fails "
      + "(timeout / 4xx / 5xx / paywall) or returns empty content. Returns clean text plus "
      + "title, byline, and publishedTime when available. If the URL is a PDF, this tool "
      + "throws — call pdf_extract instead.",
    inputSchema,
    execute: async ({ url }, { abortSignal }) => {
      try {
        const doc = await fetchReadable(url, {
          signal: abortSignal,
          maxChars: HARD_TEXT_CAP,
        });
        return {
          ok: true as const,
          url: doc.url,
          finalUrl: doc.finalUrl,
          title: doc.title,
          byline: doc.byline,
          publishedTime: doc.publishedTime,
          excerpt: doc.excerpt,
          textContent: doc.textContent,
          length: doc.length,
          truncated: doc.truncated,
        };
      } catch (error) {
        return failureResult(url, error);
      }
    },
  });
}

function failureResult(url: string, error: unknown) {
  if (error instanceof NotHtmlError) {
    return {
      ok: false as const,
      url,
      reason: "not_html" as const,
      contentType: error.contentType,
      hint: "Try pdf_extract if the URL is a PDF.",
    };
  }
  if (error instanceof HttpFetchError) {
    return {
      ok: false as const,
      url,
      reason: "http_error" as const,
      status: error.status,
      message: error.message,
    };
  }
  if (error instanceof Error) {
    return {
      ok: false as const,
      url,
      reason: "unknown_error" as const,
      name: error.name,
      message: error.message,
    };
  }
  return {
    ok: false as const,
    url,
    reason: "unknown_error" as const,
    message: String(error),
  };
}
