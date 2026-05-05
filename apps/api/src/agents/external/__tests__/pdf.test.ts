import { afterEach, describe, expect, it } from "bun:test";
import { env } from "../../../config";
import { extractPdf } from "../pdf";
import type { MistralOcrClient, PdfParseFn } from "../pdf";

const originalFetch = globalThis.fetch;

describe("extractPdf", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("uses Mistral OCR markdown as the primary PDF text source", async () => {
    const calls: unknown[] = [];
    const client = fakeMistralClient(calls, {
      pages: [
        {
          index: 0,
          markdown: "Page one\n\n| A | B |\n| - | - |\n| 1 | 2 |",
          images: [{ id: "img-0" }],
          tables: [{ id: "tbl-0" }],
          hyperlinks: ["https://example.com"],
          dimensions: { width: 1700, height: 2200, dpi: 200 },
        },
        {
          index: 1,
          markdown: "Page two",
          images: [],
          tables: [],
          hyperlinks: [],
          dimensions: null,
        },
      ],
      model: "mistral-ocr-latest",
      usageInfo: {
        pagesProcessed: 2,
        docSizeBytes: 1234,
      },
    });

    const result = await extractPdf("https://example.com/paper.pdf", {
      mistralClient: client,
      maxChars: 25_000,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      request: {
        model: "mistral-ocr-latest",
        document: {
          type: "document_url",
          documentUrl: "https://example.com/paper.pdf",
        },
        includeImageBase64: false,
        tableFormat: "markdown",
      },
    });
    expect(result.processor).toBe("mistral_ocr");
    expect(result.pages).toBe(2);
    expect(result.textContent).toContain("Page one");
    expect(result.textContent).toContain("| A | B |");
    expect(result.textContent).toContain("Page two");
    expect(result.meta.model).toBe("mistral-ocr-latest");
    expect(result.meta.usageInfo).toEqual({ pagesProcessed: 2, docSizeBytes: 1234 });
    expect(result.meta.ocr).toMatchObject({
      pageCount: 2,
      imageCount: 1,
      tableCount: 1,
      hyperlinkCount: 1,
    });
    expect(result.truncated).toBe(false);
  });

  it("truncates Mistral OCR markdown to the requested cap", async () => {
    const result = await extractPdf("https://example.com/long.pdf", {
      mistralClient: fakeMistralClient([], {
        pages: [
          {
            index: 0,
            markdown: "abcdefghijklmnopqrstuvwxyz",
            images: [],
            dimensions: null,
          },
        ],
        model: "mistral-ocr-latest",
        usageInfo: {
          pagesProcessed: 1,
        },
      }),
      maxChars: 10,
    });

    expect(result.textContent).toBe("abcdefghij");
    expect(result.truncated).toBe(true);
  });

  it("falls back to pdf-parse when Mistral is not configured", async () => {
    mockPdfFetch();

    const result = await extractPdf("https://example.com/local.pdf", {
      mistralApiKey: null,
      pdfParse: fakePdfParse({
        text: "Local parser text",
        numpages: 3,
        info: {
          Title: "Local PDF",
          Author: "Aqsha",
          CreationDate: "D:20260505000000Z",
        },
      }),
    });

    expect(result.processor).toBe("pdf_parse");
    expect(result.pages).toBe(3);
    expect(result.textContent).toBe("Local parser text");
    expect(result.meta.title).toBe("Local PDF");
    expect(result.meta.author).toBe("Aqsha");
    expect(result.meta.creationDate).toBe("D:20260505000000Z");
  });

  it("falls back to pdf-parse when Mistral OCR fails", async () => {
    mockPdfFetch();

    const result = await extractPdf("https://example.com/fallback.pdf", {
      mistralClient: {
        ocr: {
          process: async () => {
            throw new Error("OCR unavailable");
          },
        },
      },
      pdfParse: fakePdfParse({
        text: "Fallback text",
        numpages: 1,
        info: {},
      }),
    });

    expect(result.processor).toBe("pdf_parse");
    expect(result.textContent).toBe("Fallback text");
    expect(result.meta.fallback).toMatchObject({
      from: "mistral_ocr",
      reason: "Error: OCR unavailable",
    });
  });
});

const describeMistralIntegration = env.RUN_INTEGRATION_TESTS && env.MISTRAL_API_KEY
  ? describe
  : describe.skip;

describeMistralIntegration("extractPdf Mistral OCR integration", () => {
  it(
    "processes a public arXiv PDF through Mistral OCR",
    async () => {
      const result = await extractPdf("https://arxiv.org/pdf/1706.03762v7", {
        forcePdf: true,
      });

      expect(result.processor).toBe("mistral_ocr");
      expect(result.pages).toBeGreaterThan(0);
      expect(result.textContent.toLowerCase()).toMatch(/attention|transformer/);
    },
    120_000,
  );
});

function fakeMistralClient(
  calls: unknown[],
  response: Awaited<ReturnType<FakeOcrProcess>>,
): MistralOcrClient {
  const process: FakeOcrProcess = async (request, options) => {
    calls.push({ request, options });
    return response;
  };

  return {
    ocr: {
      process,
    },
  };
}

type FakeOcrProcess = (
  request: {
    model: string;
    document: {
      type: "document_url";
      documentUrl: string;
    };
    includeImageBase64?: boolean;
    tableFormat?: "markdown" | "html";
  },
  options?: {
    signal?: AbortSignal;
    timeoutMs?: number;
  },
) => Promise<{
  pages: Array<{
    index: number;
    markdown: string;
    images?: unknown[];
    tables?: unknown[];
    hyperlinks?: string[];
    dimensions?: unknown;
  }>;
  model: string;
  usageInfo?: {
    pagesProcessed?: number;
    docSizeBytes?: number | null;
  } | null;
}>;

function fakePdfParse(result: {
  text: string;
  numpages: number;
  info: Record<string, unknown>;
}): PdfParseFn {
  return (async () => result) as unknown as PdfParseFn;
}

function mockPdfFetch() {
  globalThis.fetch = (async () =>
    new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), {
      status: 200,
      headers: { "content-type": "application/pdf" },
    })) as unknown as typeof fetch;
}
