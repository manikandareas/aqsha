// PDF text extraction via `pdf-parse`.
//
// Behaviour:
//  - Reuses politelyFetch (timeout, MAX_BYTES guard, polite UA).
//  - Truncates returned text per `maxChars`; the underlying buffer is also
//    bounded by `ASTRA_FETCH_MAX_BYTES`.
//  - On fetch errors propagates `HttpFetchError`; on non-PDF responses throws
//    a typed `NotPdfError` so callers can branch.

import pdfParse from "pdf-parse";
import { isPdf, politelyFetch } from "./http";
import { type ExtractedPdf, HttpFetchError } from "./types";

export class NotPdfError extends Error {
  constructor(
    message: string,
    public readonly url: string,
    public readonly contentType: string | null,
  ) {
    super(message);
    this.name = "NotPdfError";
  }
}

export type ExtractPdfOptions = {
  signal?: AbortSignal;
  maxChars?: number;
  /**
   * Skip the content-type check and parse whatever we get. Useful for sources
   * that serve PDFs with `application/octet-stream`.
   */
  forcePdf?: boolean;
};

const DEFAULT_MAX_CHARS = 25_000;

export async function extractPdf(
  url: string,
  options: ExtractPdfOptions = {},
): Promise<ExtractedPdf> {
  const result = await politelyFetch(url, {
    signal: options.signal,
    accept: "application/pdf,*/*;q=0.8",
  });

  if (!options.forcePdf && !isPdf(result.contentType) && !looksLikePdfMagic(result.bytes)) {
    throw new NotPdfError(
      `URL is not a PDF (content-type=${result.contentType ?? "unknown"})`,
      url,
      result.contentType,
    );
  }

  if (result.bytes.byteLength === 0) {
    throw new HttpFetchError(`Empty PDF body for ${url}`, url, result.status);
  }

  const parsed = await pdfParse(toNodeBuffer(result.bytes));
  const fullText = (parsed.text ?? "").trim();
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const textContent = fullText.slice(0, maxChars);

  const info = (parsed.info ?? {}) as Record<string, unknown>;

  return {
    url,
    pages: typeof parsed.numpages === "number" ? parsed.numpages : 0,
    textContent,
    meta: {
      title: stringField(info.Title),
      author: stringField(info.Author),
      creationDate: stringField(info.CreationDate),
    },
    truncated: result.truncated || fullText.length > textContent.length,
  };
}

// pdf-parse expects a Node Buffer. Bun's `Buffer.from(uint8)` works as a Node
// Buffer thanks to Bun's compat shims — but we route through `Buffer.from` to
// avoid relying on accidental conversions.
function toNodeBuffer(bytes: Uint8Array): Buffer {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function looksLikePdfMagic(bytes: Uint8Array): boolean {
  // PDF files start with `%PDF-`.
  return (
    bytes.byteLength >= 5
    && bytes[0] === 0x25
    && bytes[1] === 0x50
    && bytes[2] === 0x44
    && bytes[3] === 0x46
    && bytes[4] === 0x2d
  );
}

function stringField(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}
