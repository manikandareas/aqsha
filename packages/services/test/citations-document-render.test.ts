/**
 * Fase 3 — render sitasi in-text seluruh dokumen (numbering konsisten) +
 * bibliography used-in-document, dan ekstraksi cluster dari blocksJson BlockNote.
 */
import { describe, expect, test } from "bun:test";
import type { CslItem } from "../src/citations/citation-normalize";
import { renderDocumentCitations } from "../src/citations/citation-format";
import { extractCitationClusters } from "../src/citations/citation-usages";

const ITEMS: CslItem[] = [
  {
    id: "A",
    type: "article-journal",
    title: "Deep learning for X",
    author: [{ family: "Smith", given: "J." }],
    issued: { "date-parts": [[2020]] },
    "container-title": "Nature",
  },
  {
    id: "B",
    type: "article-journal",
    title: "A study of Y",
    author: [{ family: "Doe", given: "A." }],
    issued: { "date-parts": [[2019]] },
    "container-title": "Science",
  },
  {
    id: "C",
    type: "book",
    title: "Handbook of Z",
    author: [{ family: "Lee", given: "K." }],
    issued: { "date-parts": [[2021]] },
    publisher: "MIT Press",
  },
];

describe("renderDocumentCitations", () => {
  const clusters = [
    { nodeId: "n1", items: [{ id: "A" }] },
    { nodeId: "n2", items: [{ id: "B" }, { id: "C" }] },
    { nodeId: "n3", items: [{ id: "A", locator: "42", label: "page" }] },
  ];

  test("APA author-date in-text + alphabetical bibliography", () => {
    const out = renderDocumentCitations(ITEMS, clusters, "apa-7");
    expect(out.clusters.map((c) => c.text)).toEqual([
      "(Smith, 2020)",
      "(Doe, 2019; Lee, 2021)",
      "(Smith, 2020, p. 42)",
    ]);
    // APA bibliography urut alfabet family → Doe, Lee, Smith.
    expect(out.bibliography.map((b) => b.id)).toEqual(["B", "C", "A"]);
    expect(out.bibliography[0]?.text).toContain("Doe");
  });

  test("IEEE numeric in-text — numbering global konsisten by appearance", () => {
    const out = renderDocumentCitations(ITEMS, clusters, "ieee");
    expect(out.clusters.map((c) => c.text)).toEqual(["[1]", "[2], [3]", "[1, p. 42]"]);
    // IEEE bibliography urut kemunculan → A, B, C.
    expect(out.bibliography.map((b) => b.id)).toEqual(["A", "B", "C"]);
  });

  test("hanya item yang dipakai masuk bibliography (used-in-document)", () => {
    const out = renderDocumentCitations(ITEMS, [{ nodeId: "n1", items: [{ id: "B" }] }], "apa-7");
    expect(out.bibliography.map((b) => b.id)).toEqual(["B"]);
  });

  test("cluster kosong → teks kosong, tanpa melempar", () => {
    const out = renderDocumentCitations(ITEMS, [{ nodeId: "n1", items: [] }], "ieee");
    expect(out.clusters).toEqual([{ nodeId: "n1", text: "" }]);
    expect(out.bibliography).toEqual([]);
  });

  test("tanpa item → semua cluster kosong", () => {
    const out = renderDocumentCitations([], [{ nodeId: "n1", items: [{ id: "A" }] }], "apa-7");
    expect(out.clusters).toEqual([{ nodeId: "n1", text: "" }]);
    expect(out.bibliography).toEqual([]);
  });
});

describe("extractCitationClusters", () => {
  test("walk depth-first, urutan dokumen; csv ids + locator", () => {
    const doc = JSON.stringify([
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Menurut " },
          { type: "citation", props: { nodeId: "x1", citationIds: "A", locator: "42", label: "page" } },
          { type: "text", text: " dan " },
          { type: "citation", props: { nodeId: "x2", citationIds: "B,C" } },
        ],
        children: [
          {
            type: "paragraph",
            content: [{ type: "citation", props: { nodeId: "x3", citationIds: "D" } }],
          },
        ],
      },
    ]);
    const clusters = extractCitationClusters(doc);
    expect(clusters).toEqual([
      { nodeId: "x1", citationIds: ["A"], locator: { locator: "42", label: "page" } },
      { nodeId: "x2", citationIds: ["B", "C"], locator: {} },
      { nodeId: "x3", citationIds: ["D"], locator: {} },
    ]);
  });

  test("JSON rusak / bukan array → kosong", () => {
    expect(extractCitationClusters("not json")).toEqual([]);
    expect(extractCitationClusters("")).toEqual([]);
    expect(extractCitationClusters(null)).toEqual([]);
    expect(extractCitationClusters(JSON.stringify({ foo: 1 }))).toEqual([]);
  });

  test("citation tanpa id diabaikan", () => {
    const doc = JSON.stringify([
      { type: "paragraph", content: [{ type: "citation", props: { nodeId: "x", citationIds: "" } }] },
    ]);
    expect(extractCitationClusters(doc)).toEqual([]);
  });
});
