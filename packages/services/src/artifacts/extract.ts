import { normalizeUploadMimeType } from "./model";
import { isOcrEnabled, ocrExtractText } from "./ocr";

/**
 * Ekstraksi teks dokumen (port `convex/artifacts/uploads.ts` `extractStoredDocument`):
 * PDF → unpdf (fallback Mistral OCR utk PDF hasil scan, D3), DOCX → mammoth, gambar → Mistral OCR
 * (D8), text-like → utf8 (+ stripHtml untuk HTML). Dipakai inline di `finalizeUpload` (route +
 * worker url-ingestion OA-PDF + worker artifact-indexing).
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
  if (normalized) return { markdown: normalized, plainText: normalized };
  // PDF hasil scan (tanpa text-layer): unpdf kosong → fallback Mistral OCR (D3) bila aktif.
  if (isOcrEnabled()) {
    const ocr = normalizeExtractedText(await ocrExtractText(bytes, "application/pdf", "pdf"));
    return { markdown: ocr, plainText: ocr };
  }
  return { markdown: normalized, plainText: normalized };
}

/** Gambar (D8): OCR via Mistral. Tak ada text-layer; satu-satunya jalur teks = OCR. */
async function extractImage(bytes: Uint8Array, mimeType: string): Promise<ExtractedDocument> {
  const ocr = normalizeExtractedText(await ocrExtractText(bytes, mimeType || "image/png", "image"));
  return { markdown: ocr, plainText: ocr };
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
  // Gambar raster (D8) → OCR. SVG (image/svg+xml) bukan raster → biar jatuh ke jalur teks utf8.
  const isImage =
    (mime.startsWith("image/") && mime !== "image/svg+xml") ||
    /\.(png|jpe?g|webp)$/.test(lowerName);
  if (isImage) {
    return extractImage(bytes, mime);
  }

  const raw = normalizeExtractedText(Buffer.from(bytes).toString("utf8"));
  const isHtml =
    lowerName.endsWith(".html") || lowerName.endsWith(".htm") || mime === "text/html";
  const plainText = isHtml ? normalizeExtractedText(stripHtml(raw)) : raw;
  return { markdown: raw, plainText };
}
