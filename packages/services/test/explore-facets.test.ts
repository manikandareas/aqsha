import { describe, expect, test } from "bun:test";
import { buildEdges, type NodeFeat, subfieldId, topSubfieldSeeds } from "../src/explore/facets.service";
import type { OpenAlexGroup } from "../src/feed/openAlex";

const group = (key: string, label: string, count: number): OpenAlexGroup => ({ key, label, count });

const feat = (oaId: string, topics: string[], related: string[] = []): NodeFeat => ({
  oaId,
  topics: new Set(topics),
  related: new Set(related),
});

describe("subfieldId", () => {
  test("extracts short id from OpenAlex subfield URL key", () => {
    expect(subfieldId("https://openalex.org/subfields/3312")).toBe("3312");
  });
  test("passes through a bare id", () => {
    expect(subfieldId("1702")).toBe("1702");
  });
});

describe("topSubfieldSeeds", () => {
  const groups = [
    group("https://openalex.org/subfields/1702", "Artificial Intelligence", 500),
    group("https://openalex.org/subfields/3312", "Sociology and Political Science", 300),
    group("https://openalex.org/subfields/0000", "Empty", 0), // di-drop (count 0)
    group("https://openalex.org/subfields/2200", "Oncology", 200),
    group("https://openalex.org/subfields/2800", "Neuroscience", 100),
    group("https://openalex.org/subfields/9999", "Fifth", 50), // di-luar cap MAX_SERIES=4
  ];

  test("drops zero-count, caps at MAX_SERIES, builds subfield filter clause", () => {
    const seeds = topSubfieldSeeds(groups);
    expect(seeds.map((s) => s.name)).toEqual([
      "Artificial Intelligence",
      "Sociology and Political Science",
      "Oncology",
      "Neuroscience",
    ]);
    expect(seeds[0]).toEqual({
      name: "Artificial Intelligence",
      search: undefined,
      filter: "primary_topic.subfield.id:1702",
    });
  });

  test("threads search through every seed when provided", () => {
    const seeds = topSubfieldSeeds(groups, "transformer");
    expect(seeds.every((s) => s.search === "transformer")).toBe(true);
  });
});

describe("buildEdges", () => {
  test("topic overlap → edge weighted by Jaccard", () => {
    const edges = buildEdges([feat("W1", ["a", "b", "c"]), feat("W2", ["b", "c", "d"])]);
    expect(edges).toEqual([[0, 1, 0.5]]); // |{b,c}| / |{a,b,c,d}| = 2/4
  });

  test("related_works hit forces a strong edge despite no topic overlap", () => {
    const edges = buildEdges([
      feat("https://openalex.org/W1", ["x"]),
      feat("https://openalex.org/W2", ["y"], ["https://openalex.org/W1"]),
    ]);
    expect(edges).toEqual([[0, 1, 0.7]]); // related → max(jaccard=0, RELATED_WEIGHT)
  });

  test("weak overlap below threshold and unrelated → no edge", () => {
    const edges = buildEdges([
      feat("W1", ["a", "b", "c", "d", "e"]),
      feat("W2", ["e", "f", "g", "h", "i"]),
    ]);
    expect(edges).toEqual([]); // jaccard = 1/9 ≈ 0.11 < EDGE_MIN_WEIGHT
  });
});
