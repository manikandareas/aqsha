export type TypstDiagnosticSeverity = "error" | "warning";

/** Diagnostik terstruktur dari stderr `typst compile` (paritas bentuk CompileError LaTeX lama). */
export type TypstDiagnostic = {
  /** Nama berkas sumber pada lokasi (mis. `main.typ`); string kosong bila tak ter-anchor. */
  file: string;
  /** Nomor baris 1-based; 0 bila diagnostik tanpa lokasi sumber. */
  line: number;
  message: string;
  severity: TypstDiagnosticSeverity;
};
