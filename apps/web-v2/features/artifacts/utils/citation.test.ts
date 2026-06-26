import { describe, expect, it } from "vitest";
import { formatCitation } from "./citation";

const paper = {
  key: "doi:10.1000/example",
  title: "Learning Analytics in Practice",
  snippet: "Snippet",
  url: "https://example.edu/paper",
  doi: "10.1000/example",
  provider: "OpenAlex" as const,
  sourceLabel: "OpenAlex",
  authors: ["Ayu Santoso", "Bima Putra", "Citra Dewi"],
  year: 2025,
  venue: "Journal of Learning",
  topics: ["Learning Analytics"],
};

describe("explore citation formatting", () => {
  it("formats plain text citation", () => {
    expect(formatCitation(paper, "plain")).toBe(
      "Ayu Santoso et al. (2025). Learning Analytics in Practice. Journal of Learning. https://doi.org/10.1000/example",
    );
  });

  it("formats markdown citation", () => {
    expect(formatCitation(paper, "markdown")).toBe(
      "Ayu Santoso et al. (2025). [Learning Analytics in Practice](https://example.edu/paper), Journal of Learning.",
    );
  });

  it("formats BibTeX citation", () => {
    expect(formatCitation(paper, "bibtex")).toContain("@article{santoso2025learning,");
    expect(formatCitation(paper, "bibtex")).toContain("doi = {10.1000/example}");
  });
});
