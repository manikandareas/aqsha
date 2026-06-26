export const UPLOAD_ALLOWED_EXTENSIONS = [
  ".pdf",
  ".docx",
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".json",
] as const;

export const UPLOAD_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
] as const;

const uploadAllowedMimeTypeSet = new Set<string>(UPLOAD_ALLOWED_MIME_TYPES);

export const WORKSPACE_UPLOAD_ACCEPT = [
  ...UPLOAD_ALLOWED_EXTENSIONS,
  ...UPLOAD_ALLOWED_MIME_TYPES,
].join(",");

export const UPLOAD_REJECTED_MESSAGE =
  "Tipe file tidak didukung. Unggah PDF, DOCX, TXT, Markdown, CSV, atau JSON.";

export function normalizeUploadMimeType(mimeType: string | undefined | null) {
  return (mimeType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}

export function isAllowedWorkspaceUploadFile(file: {
  name: string;
  type?: string | null;
}) {
  const name = file.name.toLowerCase();
  if (UPLOAD_ALLOWED_EXTENSIONS.some((extension) => name.endsWith(extension))) {
    return true;
  }
  const mimeType = normalizeUploadMimeType(file.type);
  return mimeType ? uploadAllowedMimeTypeSet.has(mimeType) : false;
}
