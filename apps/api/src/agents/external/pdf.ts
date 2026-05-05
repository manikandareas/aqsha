// PDF text extraction.
//
// Behaviour:
//  - Uses Mistral OCR as the primary processor when MISTRAL_API_KEY is present.
//  - Falls back to local `pdf-parse` for local/dev use and OCR failures.
//  - Truncates returned text per `maxChars`; the local fallback buffer is also
//    bounded by `ASTRA_FETCH_MAX_BYTES`.
//  - On fetch errors propagates `HttpFetchError`; on non-PDF responses throws
//    a typed `NotPdfError` so callers can branch.

import { Mistral } from "@mistralai/mistralai";
import pdfParse from "pdf-parse";
import { env } from "../../config";
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
  mistralApiKey?: string | null;
  mistralClient?: MistralOcrClient;
  pdfParse?: PdfParseFn;
};

const DEFAULT_MAX_CHARS = 25_000;
const MISTRAL_OCR_MODEL = "mistral-ocr-latest";

export type PdfParseFn = typeof pdfParse;

type MistralOcrRequest = {
  model: string;
  document: {
    type: "document_url";
    documentUrl: string;
  };
  includeImageBase64?: boolean;
  tableFormat?: "markdown" | "html";
};

type MistralOcrRequestOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

export type MistralOcrClient = {
  ocr: {
    process(
      request: MistralOcrRequest,
      options?: MistralOcrRequestOptions,
    ): Promise<MistralOcrResponse>;
  };
};

type MistralOcrResponse = {
  pages: MistralOcrPage[];
  model: string;
  usageInfo?: MistralOcrUsageInfo | null;
};

type MistralOcrUsageInfo = {
  pagesProcessed?: number;
  docSizeBytes?: number | null;
};

type MistralOcrPage = {
  index: number;
  markdown: string;
  images?: unknown[];
  tables?: unknown[];
  hyperlinks?: string[];
  dimensions?: unknown;
};

export async function extractPdf(
  url: string,
  options: ExtractPdfOptions = {},
): Promise<ExtractedPdf> {
  const apiKey = options.mistralApiKey === undefined
    ? env.MISTRAL_API_KEY
    : options.mistralApiKey;

  if (options.mistralClient || apiKey) {
    try {
      return await extractPdfWithMistralOcr(url, {
        client: options.mistralClient ?? createMistralClient(apiKey ?? ""),
        maxChars: options.maxChars ?? DEFAULT_MAX_CHARS,
        signal: options.signal,
      });
    } catch (error) {
      const fallback = await extractPdfWithPdfParse(url, options);
      return {
        ...fallback,
        meta: {
          ...fallback.meta,
          fallback: {
            from: "mistral_ocr",
            reason: errorMessage(error),
          },
        },
      };
    }
  }

  return await extractPdfWithPdfParse(url, options);
}

async function extractPdfWithMistralOcr(
  url: string,
  options: {
    client: MistralOcrClient;
    maxChars: number;
    signal?: AbortSignal;
  },
): Promise<ExtractedPdf> {
  const response = await options.client.ocr.process(
    {
      model: MISTRAL_OCR_MODEL,
      document: {
        type: "document_url",
        documentUrl: url,
      },
      includeImageBase64: false,
      tableFormat: "markdown",
    },
    {
      signal: options.signal,
      timeoutMs: env.ASTRA_FETCH_TIMEOUT_MS,
    },
  );

  const fullText = response.pages
    .map((page) => page.markdown.trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
  const textContent = fullText.slice(0, options.maxChars);
  const ocr = summarizeMistralOcr(response.pages);

  return {
    url,
    pages: response.usageInfo?.pagesProcessed ?? response.pages.length,
    textContent,
    processor: "mistral_ocr",
    meta: {
      title: null,
      author: null,
      creationDate: null,
      model: response.model,
      usageInfo: response.usageInfo ?? null,
      ocr,
    },
    truncated: fullText.length > textContent.length,
  };
}

async function extractPdfWithPdfParse(
  url: string,
  options: ExtractPdfOptions,
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

  const parse = options.pdfParse ?? pdfParse;
  const parsed = await parse(toNodeBuffer(result.bytes));
  const fullText = (parsed.text ?? "").trim();
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const textContent = fullText.slice(0, maxChars);

  const info = (parsed.info ?? {}) as Record<string, unknown>;

  return {
    url,
    pages: typeof parsed.numpages === "number" ? parsed.numpages : 0,
    textContent,
    processor: "pdf_parse",
    meta: {
      title: stringField(info.Title),
      author: stringField(info.Author),
      creationDate: stringField(info.CreationDate),
      ocr: null,
    },
    truncated: result.truncated || fullText.length > textContent.length,
  };
}

function createMistralClient(apiKey: string): MistralOcrClient {
  return new Mistral({ apiKey });
}

function summarizeMistralOcr(pages: MistralOcrPage[]): Record<string, unknown> {
  let imageCount = 0;
  let tableCount = 0;
  let hyperlinkCount = 0;

  const pageSummaries = pages.map((page) => {
    const images = page.images?.length ?? 0;
    const tables = page.tables?.length ?? 0;
    const hyperlinks = page.hyperlinks?.length ?? 0;

    imageCount += images;
    tableCount += tables;
    hyperlinkCount += hyperlinks;

    return {
      index: page.index,
      markdownLength: page.markdown.length,
      imageCount: images,
      tableCount: tables,
      hyperlinkCount: hyperlinks,
      dimensions: page.dimensions ?? null,
    };
  });

  return {
    pageCount: pages.length,
    imageCount,
    tableCount,
    hyperlinkCount,
    pages: pageSummaries,
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
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
