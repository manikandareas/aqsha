import { describe, expect, it } from "vitest";
import {
  classifyPaperText,
  isUsablePaperMetadata,
  normalizeLlmPaperMetadata,
  paperHeaderRegion,
} from "../convex/paperIngest/uploadIdentifiers";

describe("classifyPaperText", () => {
  it("extracts a DOI printed in the page text", () => {
    const result = classifyPaperText(
      "Some Paper Title\nJournal of Things, 2021.\nhttps://doi.org/10.1145/3292500.3330701\nAbstract...",
    );
    expect(result).toEqual({
      kind: "doi",
      doi: "10.1145/3292500.3330701",
      academicDomain: false,
      raw: "10.1145/3292500.3330701",
    });
  });

  it("prefers arXiv over a DOI when both appear (matches classifyUrl precedence)", () => {
    const result = classifyPaperText(
      "Attention Is All You Need\narXiv:1706.03762v5\ndoi:10.5555/3295222.3295349",
    );
    expect(result?.kind).toBe("arxiv");
    expect(result?.arxivId).toBe("1706.03762");
    // raw is the bare id, not the whole text blob (keeps the cache key small).
    expect(result?.raw).toBe("1706.03762");
  });

  it("returns null for prose with no identifier", () => {
    expect(classifyPaperText("This is just a memo about the quarterly budget.")).toBeNull();
  });

  it("returns null for empty text", () => {
    expect(classifyPaperText("")).toBeNull();
  });

  it("ignores a DOI that only appears in the References section (cited work)", () => {
    const text = [
      "A Header-less Manuscript",
      "Jane Author, John Coauthor",
      "Abstract: we present a study without a printed DOI.",
      "1. Introduction ...",
      "References",
      "[1] Someone et al. https://doi.org/10.1145/3292500.3330701",
    ].join("\n");
    // The only DOI is a citation → must not resolve as this paper's identifier.
    expect(classifyPaperText(text)).toBeNull();
  });

  it("still finds the paper's own DOI printed in the header", () => {
    const text = [
      "My Paper Title",
      "https://doi.org/10.1000/header.doi",
      "Abstract...",
      "References",
      "[1] Other. https://doi.org/10.9999/cited.doi",
    ].join("\n");
    expect(classifyPaperText(text)?.doi).toBe("10.1000/header.doi");
  });
});

describe("paperHeaderRegion", () => {
  it("cuts at the References heading", () => {
    const text = "Title\nAbstract\nReferences\n[1] cited";
    expect(paperHeaderRegion(text)).toBe("Title\nAbstract");
  });

  it("caps the header window when there is no References heading", () => {
    const text = "x".repeat(5000);
    expect(paperHeaderRegion(text).length).toBe(3000);
  });
});

describe("isUsablePaperMetadata", () => {
  it("is usable with a title", () => {
    expect(isUsablePaperMetadata({ title: "A Title", authorCount: 0 })).toBe(true);
  });

  it("is usable with an abstract", () => {
    expect(isUsablePaperMetadata({ abstract: "We study...", authorCount: 0 })).toBe(true);
  });

  it("is usable with at least one author", () => {
    expect(isUsablePaperMetadata({ authorCount: 2 })).toBe(true);
  });

  it("is not usable when title/abstract are blank and there are no authors", () => {
    expect(isUsablePaperMetadata({ title: "   ", abstract: "", authorCount: 0 })).toBe(false);
  });
});

describe("normalizeLlmPaperMetadata", () => {
  it("trims fields, dedupes authors, lowercases the DOI, and clamps the year", () => {
    const result = normalizeLlmPaperMetadata({
      title: "  Deep   Learning  ",
      abstract: "  We propose...  ",
      doi: "10.1000/ABC.DEF",
      authors: ["Jane Doe", "jane doe", "  John Roe  ", ""],
      journal: "  Nature  ",
      publishedYear: 2020,
    });
    expect(result.title).toBe("Deep Learning");
    expect(result.abstract).toBe("We propose...");
    expect(result.doi).toBe("10.1000/abc.def");
    expect(result.authors).toEqual(["Jane Doe", "John Roe"]);
    expect(result.journal).toBe("Nature");
    expect(result.publishedYear).toBe(2020);
  });

  it("drops an out-of-range year and empty optional fields", () => {
    const result = normalizeLlmPaperMetadata({
      title: "",
      authors: [],
      publishedYear: 3500,
    });
    expect(result.title).toBeUndefined();
    expect(result.abstract).toBeUndefined();
    expect(result.doi).toBeUndefined();
    expect(result.authors).toEqual([]);
    expect(result.publishedYear).toBeUndefined();
  });
});
