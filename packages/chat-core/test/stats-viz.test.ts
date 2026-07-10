/**
 * Unit stats-viz — buildStatsGroup (urutan blok tabel→verdict→figur, kosong→null, verdict
 * fallback, sel non-angka), penanda (toRunKey, statsMarker, referencedRunKeys), dan
 * parseStatsBlock/Group (fallback payload korup + strip kunci asing).
 */
import { describe, expect, test } from "bun:test";
import {
  buildStatsGroup,
  parseStatsBlock,
  parseStatsGroup,
  referencedRunKeys,
  type StatsDecisionBlock,
  type StatsFigureBlock,
  type StatsTableBlock,
  statsMarker,
  stripStatsMarkers,
  toRunKey,
} from "../src/stats-viz";

const RESULT = {
  analysis: "uji_validitas",
  tables: [
    {
      id: "item_total",
      title: "Item-Total Statistics",
      columns: ["Item", "r hitung", "r tabel", "Keputusan"],
      rows: [
        ["X1.1", 0.612, 0.361, "Valid"],
        ["X1.2", 0.245, 0.361, "Tidak Valid"],
      ],
      notes: ["a. df = n − 2"],
    },
  ],
  decisions: [
    {
      id: "valid_x1_1",
      label: "Validitas X1.1",
      rule: "r hitung ≥ r tabel",
      value: 0.612,
      cutoff: 0.361,
      verdict: "lolos",
      interpretation: "Item X1.1 valid.",
    },
  ],
};

describe("buildStatsGroup", () => {
  test("urutan blok: tabel → kartu verdict → figur; id + nomor terisi", () => {
    const group = buildStatsGroup({
      runKey: "call-1",
      analysis: "uji_validitas",
      title: "Uji validitas",
      result: RESULT,
      charts: [{ png: "AAAA", title: "Scatter", type: "scatter" }],
    });
    expect(group).not.toBeNull();
    expect(group?.blocks.map((b) => b.type)).toEqual([
      "stats-table",
      "stats-decision",
      "stats-figure",
    ]);
    const table = group?.blocks[0] as StatsTableBlock;
    expect(table.table.rows[0]).toEqual(["X1.1", 0.612, 0.361, "Valid"]);
    const decision = group?.blocks[1] as StatsDecisionBlock;
    expect(decision.title).toBe("Kesimpulan Uji validitas");
    expect(decision.decisions[0]?.verdict).toBe("lolos");
    const figure = group?.blocks[2] as StatsFigureBlock;
    expect(figure.png).toBe("AAAA");
    expect(figure.chartType).toBe("scatter");
  });

  test("hasil tanpa tabel/decision/chart → null", () => {
    expect(
      buildStatsGroup({
        runKey: "k",
        analysis: "x",
        title: "X",
        result: { tables: [], decisions: [] },
        charts: [],
      }),
    ).toBeNull();
  });

  test("verdict tak dikenal → 'perhatian'; chart tanpa png dibuang", () => {
    const group = buildStatsGroup({
      runKey: "k",
      analysis: "x",
      title: "X",
      result: { decisions: [{ id: "d", verdict: "ngawur" }] },
      charts: [{ png: "" }],
    });
    const decision = group?.blocks.find((b) => b.type === "stats-decision") as StatsDecisionBlock;
    expect(decision.decisions[0]?.verdict).toBe("perhatian");
    expect(group?.blocks.some((b) => b.type === "stats-figure")).toBe(false);
  });
});

describe("penanda", () => {
  test("toRunKey menyanitasi toolCallId jadi kunci aman", () => {
    expect(toRunKey("call_ABC.123:xyz")).toBe("call-abc-123-xyz");
    expect(toRunKey("!!!")).toBe("run");
  });

  test("statsMarker + referencedRunKeys (dedup, urutan pertama)", () => {
    expect(statsMarker("call-1")).toBe("{{stats:call-1}}");
    const text = "Lihat {{stats:a}} lalu {{stats:b}} dan lagi {{stats:a}}.";
    expect(referencedRunKeys(text)).toEqual(["a", "b"]);
    expect(referencedRunKeys("tanpa penanda")).toEqual([]);
  });

  test("stripStatsMarkers membuang token dari teks polos", () => {
    expect(stripStatsMarkers("Hasil uji {{stats:a}} sudah siap.")).toBe("Hasil uji sudah siap.");
    expect(stripStatsMarkers("tanpa penanda")).toBe("tanpa penanda");
  });
});

describe("parse", () => {
  test("parseStatsBlock: valid vs korup", () => {
    const block: StatsFigureBlock = { v: 1, type: "stats-figure", id: "f", png: "AA", caption: "" };
    expect(parseStatsBlock(JSON.stringify(block))?.type).toBe("stats-figure");
    expect(parseStatsBlock("{bukan json")).toBeNull();
    expect(parseStatsBlock(JSON.stringify({ v: 2, type: "stats-figure" }))).toBeNull();
  });

  test("parseStatsGroup: strip kunci asing (toolCallId), tolak blok tak valid", () => {
    const group = buildStatsGroup({
      runKey: "k",
      analysis: "x",
      title: "X",
      result: RESULT,
      charts: [],
    });
    const withExtra = { ...group, toolCallId: "call-1", ignored: true };
    const parsed = parseStatsGroup(withExtra);
    expect(parsed?.runKey).toBe("k");
    expect((parsed as unknown as { toolCallId?: string }).toolCallId).toBeUndefined();
    expect(parseStatsGroup({ v: 1, runKey: "k" })).toBeNull();
  });
});
