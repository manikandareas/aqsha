import { ConvexError } from "convex/values";

const DEFAULT_GROBID_TIMEOUT_MS = 90_000;

export type GrobidFulltextResult = {
  teiXml: string;
  durationMs: number;
};

export function isGrobidEnabled() {
  return process.env.GROBID_ENABLED !== "false" && Boolean(process.env.GROBID_BASE_URL);
}

export async function processFulltextPdfWithGrobid(args: {
  pdfBytes: Uint8Array;
  fileName: string;
}): Promise<GrobidFulltextResult> {
  const baseUrl = process.env.GROBID_BASE_URL?.replace(/\/+$/, "");
  if (!baseUrl) {
    throw new ConvexError("GROBID_BASE_URL is not configured");
  }

  const startedAt = Date.now();
  const timeoutMs = Number(process.env.GROBID_TIMEOUT_MS ?? DEFAULT_GROBID_TIMEOUT_MS);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const pdfArrayBuffer = args.pdfBytes.buffer.slice(
      args.pdfBytes.byteOffset,
      args.pdfBytes.byteOffset + args.pdfBytes.byteLength,
    ) as ArrayBuffer;
    const form = new FormData();
    form.append(
      "input",
      new Blob([pdfArrayBuffer], { type: "application/pdf" }),
      args.fileName,
    );
    form.append("consolidateHeader", "2");
    form.append("consolidateCitations", "2");
    form.append("includeRawCitations", "1");
    form.append("includeRawAffiliations", "1");

    const response = await fetch(`${baseUrl}/api/processFulltextDocument`, {
      method: "POST",
      headers: { Accept: "application/xml" },
      body: form,
      signal: controller.signal,
    });

    const body = await response.text();
    if (!response.ok) {
      throw new ConvexError(
        `GROBID fulltext extraction failed with ${response.status}: ${body.slice(0, 500)}`,
      );
    }
    if (!body.trim()) {
      throw new ConvexError("GROBID returned an empty TEI response");
    }

    return {
      teiXml: body,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ConvexError(`GROBID request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
