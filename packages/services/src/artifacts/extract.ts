import { normalizeUploadMimeType } from "./model";

/**
 * Ekstraksi teks dokumen (port `convex/artifacts/uploads.ts` `extractStoredDocument`):
 * PDF → unpdf, DOCX → mammoth, text-like → utf8 (+ stripHtml untuk HTML). TANPA GROBID.
 * Dipakai inline di `finalizeUpload` (route + worker url-ingestion OA-PDF).
 */
export type ExtractedDocument = { markdown: string; plainText: string };

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function normalizeExtractedText(text: string): string {
  return text
    .replace(/\0/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function extractPdf(bytes: Uint8Array): Promise<ExtractedDocument> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  const normalized = normalizeExtractedText(Array.isArray(text) ? text.join("\n") : text);
  return { markdown: normalized, plainText: normalized };
}

async function extractDocx(bytes: Uint8Array): Promise<ExtractedDocument> {
  const mammoth = (await import("mammoth")).default;
  const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  const text = normalizeExtractedText(result.value);
  return { markdown: text, plainText: text };
}

export async function extractStoredDocument(
  bytes: Uint8Array,
  fileName: string,
  mimeType: string,
): Promise<ExtractedDocument> {
  const lowerName = fileName.toLowerCase();
  const mime = normalizeUploadMimeType(mimeType);

  if (mime === "application/pdf" || lowerName.endsWith(".pdf")) {
    return extractPdf(bytes);
  }
  if (mime === DOCX_MIME || lowerName.endsWith(".docx")) {
    return extractDocx(bytes);
  }

  const raw = normalizeExtractedText(Buffer.from(bytes).toString("utf8"));
  const isHtml =
    lowerName.endsWith(".html") || lowerName.endsWith(".htm") || mime === "text/html";
  const plainText = isHtml ? normalizeExtractedText(stripHtml(raw)) : raw;
  return { markdown: raw, plainText };
}
