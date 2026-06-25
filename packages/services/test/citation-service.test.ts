/**
 * Slice 7.5 — service-unit untuk CitationService (engine integritas 4-langkah,
 * port V1). Provider crossref/arxiv/openalex di-`spyOn` pada namespace modul-nya
 * (BUKAN `mock.module` global — gotcha 6.9) → TANPA network/db. Tiap verdict
 * di-drive lewat return provider palsu; classifier + batch + echo `[n]` + tally
 * + caveat ter-cover.
 *
 * Adaptasi V2 yang diuji eksplisit (citation.ts header): provider balas `[]` saat
 * gagal *dan* nihil → existence kosong = ambigu → `unverifiable`, TAK PERNAH
 * false `not_found`. `not_found` hanya bila hasil nyata datang & tak ada cocok.
 */
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import * as arxivMod from "../src/research/arxiv";
import { CitationService } from "../src/research/citation";
import * as crossrefMod from "../src/research/crossref";
import * as openalexMod from "../src/research/openalex";
import type { ResearchCandidate } from "../src/research/types";

const cand = (over: Partial<ResearchCandidate> & { title: string }): ResearchCandidate => ({
  origin: "doi",
  evidenceStrength: "medium",
  locator: "loc",
  snippet: "snippet",
  ...over,
});

let doi: ReturnType<typeof spyOn>;
let arxiv: ReturnType<typeof spyOn>;
let openalex: ReturnType<typeof spyOn>;

beforeEach(() => {
  // Default: semua provider nihil (`[]`) → baseline ambigu (unverifiable).
  doi = spyOn(crossrefMod, "lookupDoi").mockResolvedValue([] as never);
  arxiv = spyOn(arxivMod, "searchArxiv").mockResolvedValue([] as never);
  openalex = spyOn(openalexMod, "searchOpenAlex").mockResolvedValue([] as never);
});
afterEach(() => mock.restore());

// ── verifyIdentifiers: satu verdict per langkah ──────────────────────────────
describe("CitationService.verifyIdentifiers — verdicts", () => {
  const TITLE = "A Study of Solar Energy Systems in Arid Regions";

  test("verified — DOI resolve + judul cocok + metadata konsisten", async () => {
    doi.mockResolvedValue([cand({ title: TITLE })] as never);
    const r = await CitationService.verifyIdentifiers([{ title: TITLE, doi: "10.1234/solar" }]);
    expect(r.items[0]?.status).toBe("verified");
    expect(openalex).not.toHaveBeenCalled(); // identifier resolve → skip existence
  });

  test("identifier_invalid — DOI resolve tapi judul TAK cocok", async () => {
    doi.mockResolvedValue([cand({ title: "Completely Unrelated Cooking Recipes" })] as never);
    const r = await CitationService.verifyIdentifiers([{ title: TITLE, doi: "10.1234/wrong" }]);
    expect(r.items[0]?.status).toBe("identifier_invalid");
  });

  test("metadata_mismatch — DOI cocok tapi tahun selisih > 1", async () => {
    doi.mockResolvedValue([
      cand({ title: TITLE, metadataJson: JSON.stringify({ year: 2005 }) }),
    ] as never);
    const r = await CitationService.verifyIdentifiers([
      { title: TITLE, doi: "10.1234/solar", year: 2020 },
    ]);
    expect(r.items[0]?.status).toBe("metadata_mismatch");
    expect(r.items[0]?.issues.some((i) => i.includes("year"))).toBe(true);
  });

  test("not_found — tanpa identifier, openalex balas hasil NYATA none-match", async () => {
    openalex.mockResolvedValue([cand({ title: "Totally Different Subject", origin: "web" })] as never);
    const r = await CitationService.verifyIdentifiers([{ title: TITLE }]);
    expect(r.items[0]?.status).toBe("not_found");
  });

  test("unverifiable — openalex balas [] (ambigu, BUKAN false not_found)", async () => {
    openalex.mockResolvedValue([] as never);
    const r = await CitationService.verifyIdentifiers([{ title: TITLE }]);
    expect(r.items[0]?.status).toBe("unverifiable");
  });

  test("unverifiable — provider throw (outage) degrade ke null, bukan tuduhan", async () => {
    openalex.mockImplementation(() => Promise.reject(new Error("openalex 503")));
    const r = await CitationService.verifyIdentifiers([{ title: TITLE }]);
    expect(r.items[0]?.status).toBe("unverifiable");
  });
});

// ── batch concurrency + echo [n] + tally + caveat ────────────────────────────
describe("CitationService.verifyIdentifiers — batch/tally/echo", () => {
  test("batch > 4 (concurrency) → semua verdict balik + echo [n]", async () => {
    const refs = Array.from({ length: 6 }, (_, i) => ({ title: `Paper ${i}`, citation: i + 1 }));
    const r = await CitationService.verifyIdentifiers(refs);
    expect(r.items.length).toBe(6);
    expect(r.items.map((it) => it.citation)).toEqual([1, 2, 3, 4, 5, 6]); // [n] passthrough
  });

  test("tally summary (checked/verified/flagged) + caveat netral", async () => {
    // Drive 3 verdict via existence keyed-by-query: verified / not_found / unverifiable.
    openalex.mockImplementation(async ({ query }: { query: string }) =>
      query.includes("Verified")
        ? [cand({ title: "Verified Paper" })]
        : query.includes("Missing")
          ? [cand({ title: "Some Other Real Title" })]
          : ([] as ResearchCandidate[]),
    );
    const r = await CitationService.verifyIdentifiers([
      { title: "Verified Paper", citation: 1 },
      { title: "Missing Paper", citation: 2 }, // real result, none-match → not_found (flagged)
      { title: "Ambiguous Paper", citation: 3 }, // [] → unverifiable (NOT flagged)
    ]);
    expect(r.summary).toEqual({ checked: 3, verified: 1, flagged: 1 });
    expect(r.caveat).toContain("not an accusation");
  });
});

// ── verifyCitations: ekstraksi bibliografi ───────────────────────────────────
describe("CitationService.verifyCitations — bibliography extraction", () => {
  test("ada bagian References → ekstrak entry lalu verdict", async () => {
    const text = [
      "## Temuan",
      "Energi surya menjanjikan [1].",
      "",
      "References",
      "[1] Smith, J. (2020). A study of solar energy systems in arid regions. Journal of Energy Research.",
    ].join("\n");
    const r = await CitationService.verifyCitations(text);
    expect(r.summary.checked).toBe(1);
    expect(r.items.length).toBe(1);
    expect(r.note).toBeUndefined();
  });

  test("tanpa bagian References → note 'no parseable references' + items kosong", async () => {
    const r = await CitationService.verifyCitations("Hanya prosa biasa tanpa daftar pustaka.");
    expect(r.items).toEqual([]);
    expect(r.note).toContain("No parseable references");
  });
});
