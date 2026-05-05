import { tool } from "ai";
import { z } from "zod";
import { extractPdf, NotPdfError } from "../external/pdf";
import { HttpFetchError } from "../external/types";

const inputSchema = z.object({
  url: z.string().url(),
  forcePdf: z
    .boolean()
    .default(false)
    .describe(
      "Skip the content-type check. Useful for sources that serve PDFs as "
      + "application/octet-stream — only enable when the URL clearly ends in .pdf or you "
      + "have other strong evidence.",
    ),
});

const HARD_TEXT_CAP = 25_000;

export function createPdfExtractTool() {
  return tool({
    description:
      "Extract text from a PDF URL. Use this for arXiv / DOI PDFs, government reports, "
      + "and anywhere a URL ends with .pdf. Returns up to 25,000 characters of text plus "
      + "page count and PDF metadata (title/author when present).",
    inputSchema,
    execute: async ({ url, forcePdf }, { abortSignal }) => {
      try {
        const result = await extractPdf(url, {
          signal: abortSignal,
          maxChars: HARD_TEXT_CAP,
          forcePdf,
        });
        return {
          ok: true as const,
          url: result.url,
          pages: result.pages,
          title: result.meta.title,
          author: result.meta.author,
          creationDate: result.meta.creationDate,
          textContent: result.textContent,
          truncated: result.truncated,
        };
      } catch (error) {
        return failureResult(url, error);
      }
    },
  });
}

function failureResult(url: string, error: unknown) {
  if (error instanceof NotPdfError) {
    return {
      ok: false as const,
      url,
      reason: "not_pdf" as const,
      contentType: error.contentType,
      hint: "Try fetch_url for HTML content.",
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
