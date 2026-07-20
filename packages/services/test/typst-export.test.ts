import { describe, expect, test } from "bun:test";
import { convertTypstToDocx, isPandocAvailable } from "../src/typst/docx-export.service";

const pandoc = await isPandocAvailable();
const maybe = pandoc ? test : test.skip;

describe("convertTypstToDocx", () => {
  maybe("menghasilkan byte .docx (zip PK) dari Typst + sitasi @key", async () => {
    const bib = [
      "@book{sugiyono2019,",
      "  title = {Metode Penelitian},",
      "  author = {Sugiyono},",
      "  year = {2019},",
      "  publisher = {Alfabeta},",
      "}",
      "",
    ].join("\n");
    const docx = await convertTypstToDocx({
      source: '= Pendahuluan\n\nMenurut @sugiyono2019, ini penting.\n\n#bibliography("refs.bib")\n',
      bib,
    });
    expect(docx.byteLength).toBeGreaterThan(0);
    // Magic bytes DOCX = arsip ZIP: 0x50 0x4B ("PK").
    expect(docx[0]).toBe(0x50);
    expect(docx[1]).toBe(0x4b);
  });

  test("isPandocAvailable mengembalikan boolean tanpa throw", async () => {
    expect(typeof (await isPandocAvailable())).toBe("boolean");
  });
});
