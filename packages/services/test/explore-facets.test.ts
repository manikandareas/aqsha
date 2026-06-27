import { describe, expect, test } from "bun:test";
import { subfieldId, topSubfieldSeeds } from "../src/explore/facets.service";
import type { OpenAlexGroup } from "../src/feed/openAlex";

const group = (key: string, label: string, count: number): OpenAlexGroup => ({ key, label, count });

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
