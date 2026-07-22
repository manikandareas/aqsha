import { describe, expect, test } from "bun:test";
import { TypstCompileService, isTypstAvailable } from "../src/typst/compile.service";
import { parseTypstDiagnostics } from "../src/typst/diagnostics";

const SYNTAX_ERR = [
  "error: unclosed delimiter",
  "  ┌─ main.typ:3:7",
  "  │",
  "3 │ #strong[unclosed",
  "  │        ^",
  "",
].join("\n");

const UNKNOWN_VAR = [
  "error: unknown variable: undefined_var",
  "  ┌─ main.typ:3:1",
  "  │",
  "3 │ #undefined_var",
  "  │  ^^^^^^^^^^^^^",
  "",
].join("\n");

const FONT_WARNING = [
  "warning: unknown font family: no such font xyz",
  "  ┌─ main.typ:1:16",
  "  │",
  '1 │ #set text(font: "No Such Font XYZ")',
  "  │                 ^^^^^^^^^^^^^^^^^^",
  "",
].join("\n");

describe("parseTypstDiagnostics", () => {
  test("error sintaks → file/line/message/severity", () => {
    expect(parseTypstDiagnostics(SYNTAX_ERR)).toEqual([
      { file: "main.typ", line: 3, message: "unclosed delimiter", severity: "error" },
    ]);
  });

  test("unknown variable (pesan mengandung titik dua)", () => {
    expect(parseTypstDiagnostics(UNKNOWN_VAR)).toEqual([
      { file: "main.typ", line: 3, message: "unknown variable: undefined_var", severity: "error" },
    ]);
  });

  test("warning terparse dengan severity warning", () => {
    expect(parseTypstDiagnostics(FONT_WARNING)).toEqual([
      {
        file: "main.typ",
        line: 1,
        message: "unknown font family: no such font xyz",
        severity: "warning",
      },
    ]);
  });

  test("diagnostik tanpa lokasi → line 0, file kosong", () => {
    expect(parseTypstDiagnostics("error: something went wrong\n")).toEqual([
      { file: "", line: 0, message: "something went wrong", severity: "error" },
    ]);
  });

  test("stderr kosong → tak ada diagnostik", () => {
    expect(parseTypstDiagnostics("")).toEqual([]);
  });
});

const typst = await isTypstAvailable();
const maybe = typst ? test : test.skip;

describe("TypstCompileService.compile", () => {
  maybe("happy-path → ok:true dengan byte PDF (magic %PDF)", async () => {
    const result = await TypstCompileService.compile({
      mainTyp: "= Pendahuluan\n\nHalo dunia.\n",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pdf.byteLength).toBeGreaterThan(0);
      // Magic bytes PDF = "%PDF".
      expect(result.pdf[0]).toBe(0x25);
      expect(result.pdf[1]).toBe(0x50);
    }
  });

  maybe("error sintaks → ok:false dengan diagnostik terstruktur", async () => {
    const result = await TypstCompileService.compile({
      mainTyp: "= Bab\n\n#undefined_var_xyz\n",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]!.severity).toBe("error");
      expect(result.errors[0]!.message).toContain("unknown variable");
      expect(result.errors[0]!.line).toBe(3);
    }
  });

  maybe("mainFileName kind-based → diagnostik memakai basename tersebut", async () => {
    const result = await TypstCompileService.compile({
      mainTyp: "= Bab\n\n#undefined_var_xyz\n",
      mainFileName: "skripsi.typ",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]!.file).toBe("skripsi.typ");
    }
  });

  maybe("dokumen dengan bibliography + sitasi → ok:true", async () => {
    const bib = [
      "@article{sugiyono2019,",
      "  title = {Metode Penelitian},",
      "  author = {Sugiyono},",
      "  year = {2019},",
      "  journal = {Jurnal Uji},",
      "}",
      "",
    ].join("\n");
    const result = await TypstCompileService.compile({
      mainTyp: '= Bab\n\nMenurut @sugiyono2019 ...\n\n#bibliography("refs.bib")\n',
      bib,
    });
    expect(result.ok).toBe(true);
  });

  test("isTypstAvailable mengembalikan boolean tanpa throw", async () => {
    expect(typeof (await isTypstAvailable())).toBe("boolean");
  });
});
