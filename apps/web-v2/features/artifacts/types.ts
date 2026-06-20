// Tipe lokal artifact untuk komponen (struktural — cocok dengan shape Eden dari
// api-v2). Sengaja TIDAK import @aqsha/services/@aqsha/db agar drizzle tak masuk
// bundle client.

export type Artifact = {
  _id: string;
  workspaceId: string | null;
  folderId: string | null;
  artifactType: string;
  artifactFamily: string;
  source: string;
  title: string;
  language: string | null;
  mimeType: string | null;
  fileName: string | null;
  byteSize: number | null;
  indexingStatus: string;
  indexingFailureReason: string | null;
  detectedDocumentKind: string | null;
  plainTextPreview: string | null;
  status: string | null;
  createdAt: number;
  updatedAt: number;
};

export type ArtifactRenderPayload =
  | { artifactType: "markdown"; blocksJson: string; markdown: string; plainText: string }
  | {
      artifactType: "pdf" | "docx";
      fileName: string;
      mimeType: string;
      byteSize: number;
      url: string;
      indexingStatus: string;
      indexingFailureReason?: string;
    }
  | {
      artifactType: "url";
      originalUrl: string;
      normalizedUrl: string;
      status: string;
      title?: string;
      description?: string;
      siteName?: string;
      failureReason?: string;
      readableText: string;
    }
  | {
      artifactType: "plain_text" | "html" | "svg" | "mermaid" | "json" | "csv" | "code";
      source: string;
      language?: string;
    };

const TYPE_LABELS: Record<string, string> = {
  markdown: "Dokumen",
  plain_text: "Teks",
  pdf: "PDF",
  docx: "Word",
  url: "Tautan",
  html: "HTML",
  svg: "SVG",
  mermaid: "Diagram",
  json: "JSON",
  csv: "CSV",
  code: "Kode",
};

export const artifactTypeLabel = (t: string): string => TYPE_LABELS[t] ?? t;

// Mirror UPLOAD_ALLOWED_EXTENSIONS/MIME_TYPES dari packages/services (web tak boleh
// import @aqsha/services). Dipakai sebagai `accept` input upload.
export const UPLOAD_ACCEPT = [
  ".pdf",
  ".docx",
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".json",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
].join(",");
