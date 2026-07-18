import { describe, expect, test } from "bun:test";
import { scanCiteKeys, stripTexComments } from "../src/latex/cite-scan";

describe("stripTexComments", () => {
  test("buang komentar % sampai akhir baris, pertahankan \\%", () => {
    expect(stripTexComments("a % komentar \\cite{x}\nb \\% bukan komentar")).toBe(
      "a \nb \\% bukan komentar",
    );
  });
});

describe("scanCiteKeys", () => {
  test("urutan dokumen + duplikat dipertahankan", () => {
    expect(scanCiteKeys("\\cite{a} lalu \\cite{b} lalu \\cite{a}")).toEqual(["a", "b", "a"]);
  });

  test("keluarga perintah biblatex + multi-key koma", () => {
    const src =
      "\\parencite{a,b} \\textcite{c} \\autocite{d} \\footcite{e} \\fullcite{f} \\Cite{g} \\nocite{h}";
    expect(scanCiteKeys(src)).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]);
  });

  test("varian multi \\cites mengambil semua grup kurawal", () => {
    expect(scanCiteKeys("\\cites{a}{b,c}")).toEqual(["a", "b", "c"]);
  });

  test("perintah tunggal hanya mengambil grup pertama", () => {
    expect(scanCiteKeys("\\cite{a}{bukan-key}")).toEqual(["a"]);
  });

  test("prenote/postnote dilewati", () => {
    expect(scanCiteKeys("\\parencite[lihat][hlm. 3]{a}")).toEqual(["a"]);
  });

  test("baris ter-komentar diabaikan; \\nocite{*} dilewati", () => {
    expect(scanCiteKeys("% \\cite{mati}\n\\nocite{*}\n\\cite{hidup}")).toEqual(["hidup"]);
  });
});
