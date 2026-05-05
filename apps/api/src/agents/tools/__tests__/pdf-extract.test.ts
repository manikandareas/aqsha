import { describe, expect, it } from "bun:test";
import { NotPdfError } from "../../external/pdf";
import { HttpFetchError, type ExtractedPdf } from "../../external/types";
import { createPdfExtractTool } from "../pdf-extract";

describe("pdf_extract tool", () => {
  it("returns Mistral OCR metadata without changing the existing text contract", async () => {
    const tool = executablePdfTool({
      extractPdf: async (): Promise<ExtractedPdf> => ({
        url: "https://example.com/paper.pdf",
        pages: 2,
        textContent: "OCR markdown",
        processor: "mistral_ocr",
        meta: {
          title: null,
          author: null,
          creationDate: null,
          model: "mistral-ocr-latest",
          usageInfo: { pagesProcessed: 2 },
          ocr: { imageCount: 0, tableCount: 1 },
        },
        truncated: false,
      }),
    });

    const result = await tool.execute(
      { url: "https://example.com/paper.pdf", forcePdf: false },
      {},
    );

    expect(result).toMatchObject({
      ok: true,
      url: "https://example.com/paper.pdf",
      pages: 2,
      textContent: "OCR markdown",
      truncated: false,
      processor: "mistral_ocr",
      metadata: {
        processor: "mistral_ocr",
        model: "mistral-ocr-latest",
        usageInfo: { pagesProcessed: 2 },
        ocr: { imageCount: 0, tableCount: 1 },
      },
    });
  });

  it("keeps not_pdf failures actionable for fetch_url fallback", async () => {
    const tool = executablePdfTool({
      extractPdf: async () => {
        throw new NotPdfError(
          "URL is not a PDF",
          "https://example.com/article",
          "text/html",
        );
      },
    });

    const result = await tool.execute(
      { url: "https://example.com/article", forcePdf: false },
      {},
    );

    expect(result).toEqual({
      ok: false,
      url: "https://example.com/article",
      reason: "not_pdf",
      contentType: "text/html",
      hint: "Try fetch_url for HTML content.",
    });
  });

  it("returns ok=false instead of throwing when PDF extraction fails", async () => {
    const tool = executablePdfTool({
      extractPdf: async () => {
        throw new HttpFetchError("Upstream 503", "https://example.com/paper.pdf", 503);
      },
    });

    const result = await tool.execute(
      { url: "https://example.com/paper.pdf", forcePdf: false },
      {},
    );

    expect(result).toEqual({
      ok: false,
      url: "https://example.com/paper.pdf",
      reason: "http_error",
      status: 503,
      message: "Upstream 503",
    });
  });
});

function executablePdfTool(options: Parameters<typeof createPdfExtractTool>[0]) {
  return createPdfExtractTool(options) as unknown as {
    execute(
      input: {
        url: string;
        forcePdf: boolean;
      },
      options: {
        abortSignal?: AbortSignal;
      },
    ): Promise<unknown>;
  };
}
