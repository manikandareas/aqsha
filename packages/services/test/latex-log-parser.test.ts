import { describe, expect, test } from "bun:test";
import { parseTexLog } from "../src/latex/log-parser";

const ERROR_LOG = [
  "This is XeTeX, Version 3.141592653 (Tectonic 0.16.9)",
  "(./main.tex",
  "LaTeX2e <2021-11-15>",
  "! Undefined control sequence.",
  "l.9 \\undefinedmacro",
  "",
  "The control sequence at the end of the top line of your error message was never",
  "! LaTeX Error: File `missing.png' not found.",
  "",
  "See the LaTeX manual or LaTeX Companion for explanation.",
  "l.13 \\includegraphics{missing.png}",
  "",
  "LaTeX Warning: Citation 'foo2020' on page 1 undefined on input line 8.",
  "",
  "! ==> Fatal error occurred, no output PDF file produced!",
].join("\n");

describe("parseTexLog", () => {
  test("mengekstrak error dengan nomor baris dari pola ! + l.<n>", () => {
    const errors = parseTexLog(ERROR_LOG).filter((e) => e.severity === "error");
    expect(errors).toHaveLength(2);
    expect(errors[0]).toEqual({
      line: 9,
      message: "Undefined control sequence.",
      severity: "error",
    });
    expect(errors[1]?.line).toBe(13);
    expect(errors[1]?.message).toContain("File `missing.png' not found");
  });

  test("mengekstrak warning dengan nomor baris dari 'on input line'", () => {
    const warnings = parseTexLog(ERROR_LOG).filter((e) => e.severity === "warning");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.line).toBe(8);
    expect(warnings[0]?.message).toContain("Citation 'foo2020'");
  });

  test("mengabaikan baris fatal '==>' (bukan error yang actionable)", () => {
    const messages = parseTexLog(ERROR_LOG).map((e) => e.message);
    expect(messages.some((m) => m.startsWith("==>"))).toBe(false);
  });

  test("log sukses tanpa error → array kosong", () => {
    expect(parseTexLog("This is XeTeX\nOutput written on main.pdf (2 pages).")).toEqual([]);
  });

  test("error tanpa l.<n> di dekatnya → line null", () => {
    const errors = parseTexLog("! Emergency stop.\n<*> main.tex\n");
    expect(errors).toEqual([{ line: null, message: "Emergency stop.", severity: "error" }]);
  });
});
