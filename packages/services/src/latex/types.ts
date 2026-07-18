export type CompileErrorSeverity = "error" | "warning";

export type CompileError = {
  /** Nomor baris di main.tex; null bila log tak menyebut lokasi. */
  line: number | null;
  message: string;
  severity: CompileErrorSeverity;
};
