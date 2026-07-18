import { describe, expect, test } from "bun:test";
import { AppError } from "@aqsha/db";
import { LatexCompileService } from "../src/latex/compile.service";

const hasToolchain =
  Bun.which("tectonic") !== null &&
  (Bun.which("tectonic-biber") !== null || Bun.which("biber") !== null);
const itest = hasToolchain ? test : test.skip;

async function expectAppError(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
    throw new Error(`expected AppError ${code}, tapi resolve`);
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
  }
}

describe("LatexCompileService.compile", () => {
  test("extraFiles dengan path traversal ditolak sebelum spawn", async () => {
    await expectAppError(
      LatexCompileService.compile({
        mainTex: "\\documentclass{article}\\begin{document}x\\end{document}",
        extraFiles: { "../evil.txt": new Uint8Array([1]) },
      }),
      "latex_invalid_input",
    );
  });

  itest(
    "doc minimal → ok, pdf non-kosong, synctex ada",
    async () => {
      const result = await LatexCompileService.compile({
        mainTex: [
          "\\documentclass{article}",
          "\\begin{document}",
          "Halo Aqsha.",
          "\\end{document}",
        ].join("\n"),
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.pdf.byteLength).toBeGreaterThan(1000);
      expect(result.synctex).not.toBeNull();
      expect(result.log.length).toBeGreaterThan(0);
    },
    120_000,
  );

  itest(
    "doc dengan error LaTeX → union { ok:false, errors } dengan baris",
    async () => {
      const result = await LatexCompileService.compile({
        mainTex: [
          "\\documentclass{article}",
          "\\begin{document}",
          "\\undefinedmacro",
          "\\end{document}",
        ].join("\n"),
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]?.message).toContain("Undefined control sequence");
      expect(result.errors[0]?.line).toBe(3);
    },
    120_000,
  );

  itest(
    "loop tak berujung → throw latex_compile_timeout",
    async () => {
      await expectAppError(
        LatexCompileService.compile({
          mainTex: [
            "\\documentclass{article}",
            "\\begin{document}",
            "\\loop\\iftrue\\repeat",
            "\\end{document}",
          ].join("\n"),
          options: { timeoutMs: 5000 },
        }),
        "latex_compile_timeout",
      );
    },
    60_000,
  );
});
