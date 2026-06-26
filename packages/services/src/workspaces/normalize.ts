import { throwAppError } from "@aqsha/db";

/**
 * Normalisasi nama workspace/folder (port V1 `workspaces/access.ts normalizeName`):
 * collapse whitespace + trim, wajib 1..120 char. V1 melempar bare-string
 * `ConvexError`; V2 distandarkan ke `appError` terstruktur dengan kode
 * `name_required`/`name_too_long` (field `name`, severity `warning`) — `label`
 * hanya menentukan `message` yang human-facing ("Workspace name"/"Folder name").
 */
export function normalizeName(value: string, label: string): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) {
    throwAppError({
      message: `${label} is required`,
      code: "name_required",
      severity: "warning",
      field: "name",
    });
  }
  if (trimmed.length > 120) {
    throwAppError({
      message: `${label} is too long`,
      code: "name_too_long",
      severity: "warning",
      field: "name",
    });
  }
  return trimmed;
}
