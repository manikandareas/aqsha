import { WORKSPACE_KINDS, type WorkspaceKind } from "@aqsha/db";

/**
 * Basename berkas utama Typst per kind proyek (label ID, slug). `freeform` tetap `main.typ`.
 * Paritas dengan helper client di apps/web workspaces.
 */
export const MAIN_TYP_FILENAMES = {
  undergraduate_thesis: "skripsi.typ",
  masters_thesis: "tesis.typ",
  dissertation: "disertasi.typ",
  journal_article: "artikel-jurnal.typ",
  proposal: "proposal.typ",
  paper: "makalah.typ",
  freeform: "main.typ",
} as const satisfies Record<WorkspaceKind, string>;

const ALLOWED_MAIN_TYP_FILENAMES: ReadonlySet<string> = new Set(Object.values(MAIN_TYP_FILENAMES));

export function mainTypFilename(kind: WorkspaceKind): string {
  return MAIN_TYP_FILENAMES[kind];
}

/** Resolve aman dari kind string DB / unknown — unknown → `main.typ`. */
export function resolveMainTypFilename(kind: string | null | undefined): string {
  if (kind && (WORKSPACE_KINDS as readonly string[]).includes(kind)) {
    return MAIN_TYP_FILENAMES[kind as WorkspaceKind];
  }
  return MAIN_TYP_FILENAMES.freeform;
}

/** Hanya basename yang dikenal yang lolos; selain itu jatuh ke `main.typ` (cegah path traversal). */
export function sanitizeMainTypFilename(name: string | null | undefined): string {
  const candidate = name?.trim() ?? "";
  if (ALLOWED_MAIN_TYP_FILENAMES.has(candidate)) return candidate;
  return MAIN_TYP_FILENAMES.freeform;
}
