import { describe, expect, test } from "bun:test";
import { filterCitableReferenceSources, selectSourceIdsForNumbering } from "../src/research";

type Row = {
  id: string;
  subQuestionIndex: number | null;
  evidenceStrength: string;
  doi: string | null;
  arxivId: string | null;
  locator: string;
};

function row(id: string, subQ: number | null, strength: string, doi: string | null = null): Row {
  return { id, subQuestionIndex: subQ, evidenceStrength: strength, doi, arxivId: null, locator: id };
}

describe("selectSourceIdsForNumbering", () => {
  test("tanpa cap → semua baris lolos", () => {
    const rows = [row("a", 0, "weak"), row("b", 1, "strong"), row("c", null, "weak")];
    expect(selectSourceIdsForNumbering(rows)).toEqual(new Set(["a", "b", "c"]));
    expect(selectSourceIdsForNumbering(rows, 0)).toEqual(new Set(["a", "b", "c"]));
  });

  test("cap per sub-Q memprioritaskan evidenceStrength (strong → medium → weak)", () => {
    const rows = [
      row("w1", 0, "weak"),
      row("m1", 0, "medium"),
      row("s1", 0, "strong"),
      row("w2", 0, "weak"),
    ];
    expect(selectSourceIdsForNumbering(rows, 2)).toEqual(new Set(["s1", "m1"]));
  });

  test("seri kekuatan dipecah urutan persist (baris lebih awal menang)", () => {
    const rows = [row("s1", 0, "strong"), row("s2", 0, "strong"), row("s3", 0, "strong")];
    expect(selectSourceIdsForNumbering(rows, 2)).toEqual(new Set(["s1", "s2"]));
  });

  test("cap dihitung PER sub-pertanyaan, bukan global", () => {
    const rows = [
      row("a0", 0, "strong"),
      row("b0", 0, "strong"),
      row("a1", 1, "weak"),
      row("b1", 1, "weak"),
    ];
    expect(selectSourceIdsForNumbering(rows, 1)).toEqual(new Set(["a0", "a1"]));
  });

  test("baris tanpa subQuestionIndex (bukti tandingan/untagged) selalu lolos", () => {
    const rows = [
      row("s1", 0, "strong"),
      row("s2", 0, "strong"),
      row("counter", null, "weak"),
    ];
    expect(selectSourceIdsForNumbering(rows, 1)).toEqual(new Set(["s1", "counter"]));
  });

  test("evidenceStrength tak dikenal diprioritaskan paling akhir", () => {
    const rows = [row("x", 0, "unknown-value"), row("w", 0, "weak")];
    expect(selectSourceIdsForNumbering(rows, 1)).toEqual(new Set(["w"]));
  });

  test("cap menghitung PAPER unik: baris duplikat (kunci dedupe sama) tak memakan slot", () => {
    // Paper sama via arXiv + publisher (locator beda, DOI ternormalisasi sama) berbagi satu [n]
    // di penomoran — baris duplikatnya ikut terpilih TANPA menggusur paper unik lain dari cap.
    const rows = [
      row("dupA", 0, "strong", "10.1/x"),
      row("dupB", 0, "strong", "10.1/X"), // normalizeDoi lowercase → kunci sama dgn dupA
      row("unik", 0, "medium"),
    ];
    expect(selectSourceIdsForNumbering(rows, 2)).toEqual(new Set(["dupA", "dupB", "unik"]));
  });
});

describe("filterCitableReferenceSources", () => {
  const item = (turnId: string | null, citationNumber: number | null) => ({
    turnId,
    citationNumber,
  });

  test("baris null pada turn BERNOMOR (tersisih cap) dikeluarkan", () => {
    const items = [item("deep-run", 1), item("deep-run", null), item("deep-run", 2)];
    expect(filterCitableReferenceSources(items)).toEqual([item("deep-run", 1), item("deep-run", 2)]);
  });

  test("sumber chat biasa (turn tanpa penomoran sama sekali) tetap lolos", () => {
    const items = [item("chat-turn", null), item("deep-run", 1), item("deep-run", null)];
    expect(filterCitableReferenceSources(items)).toEqual([item("chat-turn", null), item("deep-run", 1)]);
  });

  test("tanpa turn bernomor → semua lolos (perilaku lama utuh)", () => {
    const items = [item("a", null), item(null, null)];
    expect(filterCitableReferenceSources(items)).toEqual(items);
  });
});
