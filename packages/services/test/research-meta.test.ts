/**
 * Unit `candidateCitationMeta` — ekstraksi metadata sitasi + evidence viz (citedByCount,
 * topics) dari `metadataJson` provider. Pure (tanpa DB/HTTP). Plus test sinkronisasi vocab
 * stance/study-design lintas-paket (chat-core ↔ db) — services depend keduanya, jadi test
 * ini penjaga agar CHECK kolom dan kontrak viz tak drift diam-diam.
 */
import { DEEP_VIZ_CLASSIFIED_STANCES, DEEP_VIZ_STUDY_DESIGNS } from "@aqsha/chat-core/deep-viz";
import { RESEARCH_SOURCE_STANCES, RESEARCH_SOURCE_STUDY_DESIGNS } from "@aqsha/db";
import { describe, expect, test } from "bun:test";
import { candidateCitationMeta, type ResearchCandidate } from "../src/research";

describe("vocab stance/study-design — sinkron lintas-paket", () => {
  test("chat-core deep-viz ↔ CHECK kolom research_sources", () => {
    expect([...DEEP_VIZ_CLASSIFIED_STANCES]).toEqual([...RESEARCH_SOURCE_STANCES]);
    expect([...DEEP_VIZ_STUDY_DESIGNS]).toEqual([...RESEARCH_SOURCE_STUDY_DESIGNS]);
  });
});

function candidate(metadataJson?: string): ResearchCandidate {
  return {
    origin: "doi",
    provider: "openalex",
    evidenceStrength: "strong",
    title: "Paper",
    locator: "10.1234/x",
    snippet: "abstrak",
    metadataJson,
  };
}

describe("candidateCitationMeta — kolom evidence viz (mig 0027)", () => {
  test("blob OpenAlex lengkap → authors ≤3, year, venue, citedByCount, topics ≤5", () => {
    const meta = candidateCitationMeta(
      candidate(
        JSON.stringify({
          authors: ["A", "B", "C", "D"],
          year: 2021,
          venue: "Nature Energy",
          citedByCount: 128,
          topics: ["T1", "T2", "T3", "T4", "T5", "T6"],
        }),
      ),
    );
    expect(meta.authors).toEqual(["A", "B", "C"]);
    expect(meta.year).toBe(2021);
    expect(meta.venue).toBe("Nature Energy");
    expect(meta.citedByCount).toBe(128);
    expect(meta.topics).toEqual(["T1", "T2", "T3", "T4", "T5"]);
  });

  test("citedByCount/topics tak valid → null/[] (defensif, blob provider tak terkontrol)", () => {
    const meta = candidateCitationMeta(
      candidate(JSON.stringify({ citedByCount: "128", topics: [1, "", "Valid"] })),
    );
    expect(meta.citedByCount).toBe(null);
    expect(meta.topics).toEqual(["Valid"]);
  });

  test("tanpa metadataJson / blob korup → kosong seluruhnya", () => {
    for (const c of [candidate(undefined), candidate("{bukan json")]) {
      const meta = candidateCitationMeta(c);
      expect(meta).toEqual({ authors: [], year: null, venue: null, citedByCount: null, topics: [] });
    }
  });
});
