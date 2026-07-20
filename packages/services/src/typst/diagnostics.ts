import type { TypstDiagnostic } from "./types";

// Header diagnostik: `error: <pesan>` / `warning: <pesan>`.
const HEADER_RE = /^(error|warning): (.+)$/;
// Baris lokasi: `  ┌─ main.typ:12:4` — `.+` greedy backtrack agar dua `:num:num` terakhir menang.
const LOCATION_RE = /┌─\s+(.+):(\d+):(\d+)\s*$/;

/**
 * Parse stderr `typst compile` menjadi diagnostik terstruktur. typst umumnya berhenti di
 * error pertama (satu error per compile gagal), tapi parser tetap menangani banyak blok.
 * Blok diagnostik = baris header (`error:`/`warning:`) diikuti baris lokasi (`┌─ file:line:col`);
 * diagnostik tanpa lokasi (jarang) diemit dengan `line: 0`, `file: ""`. stderr subprocess di-pipe
 * (bukan TTY) sehingga typst tak mewarnai — tak perlu strip ANSI.
 */
export function parseTypstDiagnostics(stderr: string): TypstDiagnostic[] {
  const lines = stderr.split("\n");
  const out: TypstDiagnostic[] = [];
  for (let i = 0; i < lines.length; i++) {
    const header = HEADER_RE.exec(lines[i]!.trimEnd());
    if (!header) continue;
    const severity = header[1] as TypstDiagnostic["severity"];
    const message = header[2]!.trim();
    let file = "";
    let line = 0;
    // Cari baris lokasi sampai header berikutnya (atau habis blok).
    for (let j = i + 1; j < lines.length; j++) {
      if (HEADER_RE.test(lines[j]!.trimEnd())) break;
      const loc = LOCATION_RE.exec(lines[j]!);
      if (loc) {
        file = loc[1]!.trim();
        line = Number.parseInt(loc[2]!, 10);
        break;
      }
    }
    out.push({ file, line, message, severity });
  }
  return out;
}
