/**
 * Unit deep-viz — builders (ambang, dedupe, skor, `n` liar, input kosong) + injectVizBlocks
 * (strip fence liar, replace marker, duplikat, append blok inti, drop marker asing,
 * penomoran figure, fence-awareness) + parseDeepVizBlock (fallback payload korup).
 */
import { describe, expect, test } from "bun:test";
import {
  type BuildDeepVizInput,
  buildDeepVizBlocks,
  type ClaimsEvidenceBlock,
  type ConsensusMeterBlock,
  type DeepVizBlock,
  type DeepVizSourceInput,
  type GapsMatrixBlock,
  injectVizBlocks,
  parseDeepVizBlock,
  type ResultsTimelineBlock,
  type TopContributorsBlock,
  vizBlockToFence,
} from "../src/deep-viz";

function src(over: Partial<DeepVizSourceInput> & { n: number }): DeepVizSourceInput {
  return {
    subQuestionIndex: 0,
    title: `Paper ${over.n}`,
    authors: [],
    year: null,
    venue: null,
    citedByCount: null,
    evidenceStrength: "medium",
    stance: null,
    studyDesign: null,
    outcomes: [],
    topics: [],
    ...over,
  };
}

function input(over: Partial<BuildDeepVizInput> = {}): BuildDeepVizInput {
  return {
    subQuestions: ["Apakah X meningkatkan Y?"],
    sources: [],
    subQuestionAnswerable: [{ subQuestionIndex: 0, answerable: true }],
    claims: [],
    openQuestions: [],
    ...over,
  };
}

function findBlock<T extends DeepVizBlock["type"]>(blocks: DeepVizBlock[], type: T) {
  return blocks.find((b) => b.type === type);
}

describe("buildDeepVizBlocks — input kosong & ambang", () => {
  test("input kosong → tanpa blok sama sekali", () => {
    expect(buildDeepVizBlocks(input())).toEqual([]);
  });

  test("consensus-meter: N ≥ 5 + ≥ 2 stance → tampil; N = 4 → drop", () => {
    const five = [
      src({ n: 1, stance: "yes", studyDesign: "rct" }),
      src({ n: 2, stance: "yes", studyDesign: "meta_analysis" }),
      src({ n: 3, stance: "yes" }),
      src({ n: 4, stance: "no", studyDesign: "observational" }),
      src({ n: 5, stance: "mixed" }),
    ];
    const blocks = buildDeepVizBlocks(input({ sources: five }));
    const meter = findBlock(blocks, "consensus-meter") as ConsensusMeterBlock;
    expect(meter).toBeDefined();
    expect(meter.id).toBe("consensus-q0");
    expect(meter.n).toBe(5);
    expect(meter.stances).toEqual({ yes: 3, possibly: 0, mixed: 1, no: 1 });
    // Design null → bucket badge `other`.
    expect(meter.designByStance.yes).toEqual({ rct: 1, meta_analysis: 1, other: 1 });

    const four = buildDeepVizBlocks(input({ sources: five.slice(0, 4) }));
    expect(findBlock(four, "consensus-meter")).toBeUndefined();
  });

  test("consensus-meter: satu stance seragam / subQ tak answerable / not_applicable → drop", () => {
    const uniform = Array.from({ length: 6 }, (_, i) => src({ n: i + 1, stance: "yes" }));
    expect(findBlock(buildDeepVizBlocks(input({ sources: uniform })), "consensus-meter")).toBeUndefined();

    const mixed = [
      src({ n: 1, stance: "yes" }),
      src({ n: 2, stance: "yes" }),
      src({ n: 3, stance: "no" }),
      src({ n: 4, stance: "no" }),
      // not_applicable TIDAK masuk populasi N.
      src({ n: 5, stance: "not_applicable" }),
      src({ n: 6, stance: "possibly" }),
    ];
    const meter = findBlock(
      buildDeepVizBlocks(input({ sources: mixed })),
      "consensus-meter",
    ) as ConsensusMeterBlock;
    expect(meter.n).toBe(5);

    const notAnswerable = buildDeepVizBlocks(
      input({ sources: mixed, subQuestionAnswerable: [{ subQuestionIndex: 0, answerable: false }] }),
    );
    expect(findBlock(notAnswerable, "consensus-meter")).toBeUndefined();
  });

  test("dedupe unit n×subQ: kemunculan pertama menang", () => {
    const sources = [
      src({ n: 1, stance: "yes" }),
      src({ n: 1, stance: "no" }), // duplikat unit → diabaikan
      src({ n: 2, stance: "yes" }),
      src({ n: 3, stance: "yes" }),
      src({ n: 4, stance: "no" }),
      src({ n: 5, stance: "no" }),
    ];
    const meter = findBlock(
      buildDeepVizBlocks(input({ sources })),
      "consensus-meter",
    ) as ConsensusMeterBlock;
    expect(meter.n).toBe(5);
    expect(meter.stances.yes).toBe(3);
    expect(meter.stances.no).toBe(2);
  });

  test("results-timeline: ≥ 4 titik ber-tahun + ≥ 2 tahun → tampil terurut; 1 tahun → drop", () => {
    const sources = [
      src({ n: 1, year: 2020, citedByCount: 10 }),
      src({ n: 2, year: 2019 }),
      src({ n: 3, year: 2020, citedByCount: 3 }),
      src({ n: 4, year: 2024, citedByCount: 99 }),
      src({ n: 5, year: null }), // tanpa tahun → bukan titik
    ];
    const timeline = findBlock(
      buildDeepVizBlocks(input({ sources })),
      "results-timeline",
    ) as ResultsTimelineBlock;
    expect(timeline.points.map((p) => p.n)).toEqual([2, 1, 3, 4]);
    expect(timeline.points[0]?.citedByCount).toBe(null);

    const sameYear = Array.from({ length: 4 }, (_, i) => src({ n: i + 1, year: 2020 }));
    expect(findBlock(buildDeepVizBlocks(input({ sources: sameYear })), "results-timeline")).toBeUndefined();
  });

  test("top-contributors: hanya ≥ 2 paper unik, top 3, tiebreak total sitasi", () => {
    const sources = [
      src({ n: 1, authors: ["Alice", "Bob"], venue: "Nature", citedByCount: 5 }),
      src({ n: 2, authors: ["Alice", "Carol"], venue: "Nature", citedByCount: 7 }),
      src({ n: 3, authors: ["Bob"], venue: "Science", citedByCount: 100 }),
      src({ n: 4, authors: ["Dave"], venue: "Science" }),
      src({ n: 5, authors: ["Eve"] }),
    ];
    const contributors = findBlock(
      buildDeepVizBlocks(input({ sources })),
      "top-contributors",
    ) as TopContributorsBlock;
    // Alice (n1,n2, 12 sitasi) vs Bob (n1,n3, 105 sitasi) → Bob duluan; Eve/Dave/Carol (1 paper) tak masuk.
    expect(contributors.authors.map((a) => a.name)).toEqual(["Bob", "Alice"]);
    expect(contributors.authors[0]?.papers).toEqual([1, 3]);
    expect(contributors.venues.map((v) => v.name)).toEqual(["Science", "Nature"]);

    const solo = [src({ n: 1, authors: ["Alice"], venue: "Nature" })];
    expect(findBlock(buildDeepVizBlocks(input({ sources: solo })), "top-contributors")).toBeUndefined();
  });
});

describe("buildDeepVizBlocks — claims (skor deterministik + n liar)", () => {
  const papers = [
    src({ n: 1, studyDesign: "meta_analysis", evidenceStrength: "strong" }), // 3.0
    src({ n: 2, studyDesign: "rct", evidenceStrength: "medium" }), // 1.875
    src({ n: 3, studyDesign: "observational", evidenceStrength: "weak" }), // 0.75
    src({ n: 4 }), // design null → other 1.0 × medium 0.75 = 0.75
  ];

  test("skor = Σ bobot design × multiplier strength; label by ambang; n liar dibuang", () => {
    const blocks = buildDeepVizBlocks(
      input({
        sources: papers,
        claims: [
          { text: "K1", reasoning: "R1", papers: [1, 2, 3] }, // 5.625 → 5.6 moderate
          { text: "K2", reasoning: "R2", papers: [1, 1, 99] }, // dedupe + 99 liar → [1] = 3.0 moderate
          { text: "K3", reasoning: "R3", papers: [3, 4] }, // 1.5 limited
          { text: "K4", reasoning: "R4", papers: [99] }, // tanpa paper valid → drop
        ],
      }),
    );
    const claims = (findBlock(blocks, "claims-evidence") as ClaimsEvidenceBlock).claims;
    expect(claims.length).toBe(3);
    expect(claims[0]).toMatchObject({ text: "K1", papers: [1, 2, 3], score: 5.6, label: "moderate" });
    expect(claims[1]).toMatchObject({ text: "K2", papers: [1], score: 3, label: "moderate" });
    expect(claims[2]).toMatchObject({ text: "K3", papers: [3, 4], score: 1.5, label: "limited" });
  });

  test("skor clamp 10 + label strong; < 3 klaim valid → blok drop", () => {
    const metas = Array.from({ length: 5 }, (_, i) =>
      src({ n: i + 1, studyDesign: "meta_analysis", evidenceStrength: "strong" }),
    );
    const blocks = buildDeepVizBlocks(
      input({
        sources: metas,
        claims: [
          { text: "Kuat", reasoning: "", papers: [1, 2, 3, 4, 5] }, // 15 → clamp 10
          { text: "K2", reasoning: "", papers: [1] },
          { text: "K3", reasoning: "", papers: [2] },
        ],
      }),
    );
    const claims = (findBlock(blocks, "claims-evidence") as ClaimsEvidenceBlock).claims;
    expect(claims[0]).toMatchObject({ score: 10, label: "strong" });

    const tooFew = buildDeepVizBlocks(
      input({ sources: metas, claims: [{ text: "K1", reasoning: "", papers: [1] }] }),
    );
    expect(findBlock(tooFew, "claims-evidence")).toBeUndefined();
  });
});

describe("buildDeepVizBlocks — gaps-matrix & open-questions", () => {
  test("gaps: ≥ 8 paper + ≥ 2 baris → pivot; fallback topics; merge case-insensitive", () => {
    const sources = [
      src({ n: 1, outcomes: ["Mortality"], studyDesign: "rct" }),
      src({ n: 2, outcomes: ["mortality"], studyDesign: "meta_analysis" }), // merge dgn Mortality
      src({ n: 3, outcomes: ["Mortality", "Quality of life"], studyDesign: "rct" }),
      src({ n: 4, outcomes: ["Quality of life"], studyDesign: "observational" }),
      src({ n: 5, outcomes: ["Quality of life"] }), // design null → kolom other
      src({ n: 6, outcomes: [], topics: ["Cost"] }), // fallback topics
      src({ n: 7, outcomes: ["Mortality"], studyDesign: "systematic_review" }),
      src({ n: 8, outcomes: ["Cost"], studyDesign: "review" }), // review → bucket other
    ];
    const gaps = findBlock(buildDeepVizBlocks(input({ sources })), "gaps-matrix") as GapsMatrixBlock;
    expect(gaps.rows).toEqual(["Mortality", "Quality of life", "Cost"]);
    expect(gaps.cols).toEqual(["meta_sysrev", "rct", "observational", "other"]);
    // Mortality: meta(2)+sysrev(7)=2, rct(1,3)=2; QoL: rct(3)=1, obs(4)=1, other(5)=1; Cost: other(6,8)=2.
    expect(gaps.cells).toEqual([
      [2, 2, 0, 0],
      [0, 1, 1, 1],
      [0, 0, 0, 2],
    ]);

    const tooFew = buildDeepVizBlocks(input({ sources: sources.slice(0, 7) }));
    expect(findBlock(tooFew, "gaps-matrix")).toBeUndefined();
  });

  test("open-questions: pass-through 2–4; < 2 → drop; > 4 → cap", () => {
    const items = Array.from({ length: 6 }, (_, i) => ({ question: `Q${i}`, why: `W${i}` }));
    const blocks = buildDeepVizBlocks(input({ openQuestions: items }));
    const open = findBlock(blocks, "open-questions");
    expect(open?.type === "open-questions" && open.items.length).toBe(4);

    const one = buildDeepVizBlocks(input({ openQuestions: [items[0]!] }));
    expect(findBlock(one, "open-questions")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------

const meterBlock: DeepVizBlock = {
  v: 1,
  type: "consensus-meter",
  id: "consensus-q0",
  subQuestionIndex: 0,
  question: "Apakah X?",
  n: 5,
  stances: { yes: 3, possibly: 0, mixed: 1, no: 1 },
  designByStance: { yes: { rct: 2, other: 1 }, possibly: {}, mixed: { other: 1 }, no: { observational: 1 } },
};
const timelineBlock: DeepVizBlock = {
  v: 1,
  type: "results-timeline",
  id: "timeline",
  points: [{ n: 1, year: 2020, citedByCount: 10 }],
};
const claimsBlock: DeepVizBlock = {
  v: 1,
  type: "claims-evidence",
  id: "claims",
  claims: [{ text: "K", reasoning: "R", papers: [1], score: 3, label: "moderate" }],
};

describe("injectVizBlocks", () => {
  test("replace marker → fenced JSON; marker asing dihapus; duplikat: pertama menang", () => {
    const report = [
      "## Temuan",
      "Paragraf pembuka.",
      "{{viz:consensus-q0}}",
      "Paragraf lanjutan.",
      "{{viz:tidak-dikenal}}",
      "{{viz:consensus-q0}}",
      "Penutup.",
    ].join("\n");
    const out = injectVizBlocks(report, [meterBlock]);
    expect(out.placedIds).toEqual(["consensus-q0"]);
    expect(out.removedMarkerCount).toBe(2);
    expect(out.report).toContain("```aqsha:viz");
    expect(out.report).not.toContain("{{viz:");
    // Payload di fence harus parse balik ke blok yang sama + nomor figure hasil stamping.
    const payload = out.report.match(/```aqsha:viz\n(.*)\n```/)?.[1] ?? "";
    expect(parseDeepVizBlock(payload)).toEqual({ ...meterBlock, figure: 1 });
    // Hanya satu fence (duplikat tak diinjeksi dua kali).
    expect(out.report.match(/```aqsha:viz/g)?.length).toBe(1);
  });

  test("anti-forgery: fence aqsha:viz tulisan model di-strip (termasuk tanpa penutup)", () => {
    const forged = [
      "Teks.",
      "```aqsha:viz",
      '{"v":1,"type":"open-questions","id":"open-questions","items":[]}',
      "```",
      "Tengah.",
      "{{viz:timeline}}",
      "Akhir.",
      "```aqsha:viz",
      '{"palsu":true}',
    ].join("\n");
    const out = injectVizBlocks(forged, [timelineBlock]);
    expect(out.strippedFenceCount).toBe(2);
    expect(out.report).not.toContain("palsu");
    expect(out.report).not.toContain("open-questions");
    expect(out.report).toContain("Tengah.");
    // Marker sah tetap diganti fence hasil injeksi.
    expect(out.report.match(/```aqsha:viz/g)?.length).toBe(1);
    expect(out.placedIds).toEqual(["timeline"]);
  });

  test("blok inti tak ditaruh → append Lampiran visual; non-inti tak ditaruh → drop", () => {
    const out = injectVizBlocks("Laporan tanpa marker.", [meterBlock, claimsBlock, timelineBlock]);
    expect(out.appendedIds).toEqual(["consensus-q0", "claims"]);
    expect(out.droppedIds).toEqual(["timeline"]);
    expect(out.report).toContain("### Lampiran visual");
    expect(out.report.match(/```aqsha:viz/g)?.length).toBe(2);
    expect(out.report.indexOf("Laporan tanpa marker.")).toBeLessThan(out.report.indexOf("### Lampiran visual"));
  });

  test("marker di dalam fence code biasa TIDAK disentuh; dua marker berdampingan dipisah baris kosong", () => {
    const report = [
      "```js",
      "{{viz:timeline}}",
      "```",
      "{{viz:consensus-q0}}",
      "{{viz:claims}}",
    ].join("\n");
    const out = injectVizBlocks(report, [meterBlock, claimsBlock, timelineBlock]);
    // Marker di fence js utuh; timeline tak ditaruh (dan non-inti) → drop.
    expect(out.report).toContain("{{viz:timeline}}");
    expect(out.placedIds).toEqual(["consensus-q0", "claims"]);
    expect(out.droppedIds).toEqual(["timeline"]);
    // Tak ada fence penutup yang langsung disusul fence pembuka.
    expect(out.report).not.toContain("```\n```aqsha:viz");
  });

  test("idempoten terhadap retry: injeksi ulang dari laporan mentah menghasilkan output sama", () => {
    const raw = "Isi.\n{{viz:claims}}\nAkhir.";
    const first = injectVizBlocks(raw, [claimsBlock]);
    const second = injectVizBlocks(raw, [claimsBlock]);
    expect(second.report).toBe(first.report);
  });

  test("nomor figure berurutan: marker sesuai urutan dokumen, lampiran melanjutkan", () => {
    const report = ["Awal.", "{{viz:timeline}}", "Tengah.", "{{viz:claims}}", "Akhir."].join("\n");
    const out = injectVizBlocks(report, [meterBlock, claimsBlock, timelineBlock]);
    const payloads = [...out.report.matchAll(/```aqsha:viz\n(.*)\n```/g)].map((m) =>
      parseDeepVizBlock(m[1] ?? ""),
    );
    // timeline (marker 1) → 1, claims (marker 2) → 2, consensus (lampiran) → 3.
    expect(payloads.map((b) => [b?.id, b?.figure])).toEqual([
      ["timeline", 1],
      ["claims", 2],
      ["consensus-q0", 3],
    ]);
  });

  test("baris kosong beruntun DI DALAM fence code dipertahankan; di luar dikolaps", () => {
    const report = ["```python", "def a():", "    pass", "", "", "def b():", "    pass", "```", "Teks.", "", "", "", "Akhir."].join("\n");
    const out = injectVizBlocks(report, []);
    expect(out.report).toContain("    pass\n\n\ndef b():");
    expect(out.report).toContain("Teks.\n\nAkhir.");
  });

  test("fence 4-backtick: baris ``` di dalamnya BUKAN penutup — marker di dalamnya utuh", () => {
    const report = ["````md", "```", "{{viz:claims}}", "```", "````", "{{viz:claims}}"].join("\n");
    const out = injectVizBlocks(report, [claimsBlock]);
    // Marker pertama ada di dalam fence 4-backtick → tak disentuh; marker kedua diganti fence.
    expect(out.report).toContain("```\n{{viz:claims}}\n```");
    expect(out.placedIds).toEqual(["claims"]);
    expect(out.report.match(/```aqsha:viz/g)?.length).toBe(1);
  });

  test("marker berbullet ditoleransi; token marker inline di tengah kalimat dibuang", () => {
    const report = ["- {{viz:claims}}", "Sebaran dirangkum {{viz:consensus-q0}} berikut."].join("\n");
    const out = injectVizBlocks(report, [meterBlock, claimsBlock]);
    expect(out.placedIds).toEqual(["claims"]);
    expect(out.report).not.toContain("{{viz:");
    expect(out.report).toContain("Sebaran dirangkum berikut.");
    // Blok inti yang token-nya dibuang tetap tampil via lampiran.
    expect(out.appendedIds).toEqual(["consensus-q0"]);
  });
});

describe("parseDeepVizBlock — fallback payload korup", () => {
  test("JSON korup / v asing / type asing → null; payload valid → blok", () => {
    expect(parseDeepVizBlock("{bukan json")).toBe(null);
    expect(parseDeepVizBlock(JSON.stringify({ ...timelineBlock, v: 2 }))).toBe(null);
    expect(parseDeepVizBlock(JSON.stringify({ ...timelineBlock, type: "unknown" }))).toBe(null);
    expect(parseDeepVizBlock(JSON.stringify(timelineBlock))).toEqual(timelineBlock);
    // Round-trip via fence helper.
    const fence = vizBlockToFence(meterBlock);
    const payload = fence.split("\n")[1] ?? "";
    expect(parseDeepVizBlock(payload)).toEqual(meterBlock);
  });
});
