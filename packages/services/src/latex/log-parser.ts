import type { CompileError } from "./types";

const ERROR_LINE = /^!\s?(.*)$/;
const LINE_REF = /^l\.(\d+)/;
const WARNING_LINE = /^(?:LaTeX|Package \S+|Class \S+) Warning: (.*)$/;
const ON_INPUT_LINE = /on input line (\d+)\.?\s*$/;

/**
 * Parser log transcript TeX (ditulis Tectonic via --keep-logs). Deterministik:
 * error = baris "!" + nomor baris dari "l.<n>" terdekat sesudahnya; warning =
 * baris "LaTeX/Package/Class Warning" + nomor dari "on input line <n>".
 */
export function parseTexLog(log: string): CompileError[] {
  const lines = log.split(/\r?\n/);
  const found: CompileError[] = [];
  for (let i = 0; i < lines.length; i++) {
    const err = lines[i]?.match(ERROR_LINE);
    if (err) {
      const message = (err[1] ?? "").trim();
      // "! ==> Fatal error occurred..." cuma penanda akhir, bukan error actionable.
      if (!message || message.startsWith("==>")) continue;
      let line: number | null = null;
      for (let j = i + 1; j < Math.min(i + 12, lines.length); j++) {
        const candidate = lines[j] ?? "";
        const ref = candidate.match(LINE_REF);
        if (ref) {
          line = Number(ref[1]);
          break;
        }
        if (ERROR_LINE.test(candidate)) break;
      }
      found.push({ line, message, severity: "error" });
      continue;
    }
    const warn = lines[i]?.match(WARNING_LINE);
    if (warn) {
      const message = (warn[1] ?? "").trim();
      const onLine = message.match(ON_INPUT_LINE);
      found.push({
        line: onLine ? Number(onLine[1]) : null,
        message,
        severity: "warning",
      });
    }
  }
  return found;
}
