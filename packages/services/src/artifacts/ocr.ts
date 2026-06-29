import { Mistral } from "@mistralai/mistralai";

/** Model OCR Mistral (override via env bila perlu). */
const OCR_MODEL = process.env.MISTRAL_OCR_MODEL ?? "mistral-ocr-latest";

let client: Mistral | null = null;
function getClient(): Mistral {
  if (!client) client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY ?? "" });
  return client;
}

/**
 * True bila `MISTRAL_API_KEY` tersedia → OCR aktif untuk PDF hasil scan (D3) & gambar (D8).
 * Best-effort (BUKAN fail-fast seperti embedding): bila mati, ekstraksi gambar/PDF-scan gagal
 * dengan alasan jelas, bukan men-crash proses.
 */
export function isOcrEnabled(): boolean {
  return Boolean(process.env.MISTRAL_API_KEY);
}

/**
 * Ekstrak teks dari blob (PDF hasil scan / gambar) via Mistral OCR. Bytes dikirim sebagai data
 * URI base64 (tak butuh URL publik). Markdown semua halaman digabung. Throw bila OCR disabled atau
 * API gagal — caller (`extractIndexAndPatch`) men-set `indexingStatus: failed` + reason.
 */
export async function ocrExtractText(
  bytes: Uint8Array,
  mimeType: string,
  kind: "image" | "pdf",
): Promise<string> {
  if (!isOcrEnabled()) {
    throw new Error("OCR tidak aktif (MISTRAL_API_KEY belum diset).");
  }
  const dataUri = `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
  const document =
    kind === "image"
      ? ({ type: "image_url", imageUrl: dataUri } as const)
      : ({ type: "document_url", documentUrl: dataUri } as const);
  const result = await getClient().ocr.process({ model: OCR_MODEL, document });
  return result.pages
    .map((p) => p.markdown)
    .join("\n\n")
    .trim();
}
