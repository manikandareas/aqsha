import { describe, expect, it } from "vitest";
import {
  extractCitations,
  extractReferencesSection,
  parseReferenceEntry,
} from "../src/citations/bibliography";

const DOCUMENT = `# Studi Transformer

Isi makalah membahas arsitektur attention.

## References

[1] Vaswani, A., Shazeer, N. (2017). "Attention Is All You Need". NeurIPS. https://doi.org/10.48550/arXiv.1706.03762

[2] Devlin, J., Chang, M. (2019). BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding. arXiv:1810.04805

[3] Brown, T. (2020). Language Models are Few-Shot Learners. NeurIPS 2020. doi:10.5555/3495724
`;

describe("extractReferencesSection", () => {
  it("finds English and Indonesian headings", () => {
    expect(extractReferencesSection(DOCUMENT)).toContain("Vaswani");
    expect(
      extractReferencesSection("Isi\n\n## Daftar Pustaka\n\nSatu entri referensi yang cukup panjang."),
    ).toContain("Satu entri");
    expect(extractReferencesSection("No refs here")).toBeNull();
  });
});

describe("extractCitations", () => {
  it("parses numbered entries with DOI, arXiv id, year, and title", () => {
    const citations = extractCitations(DOCUMENT);
    expect(citations).toHaveLength(3);

    const first = citations[0]!;
    expect(first.title).toBe("Attention Is All You Need");
    expect(first.doi).toBe("10.48550/arxiv.1706.03762");
    expect(first.year).toBe(2017);

    const second = citations[1]!;
    expect(second.arxivId).toBe("1810.04805");
    expect(second.year).toBe(2019);

    const third = citations[2]!;
    expect(third.doi).toBe("10.5555/3495724");
  });

  it("returns empty for documents without a references section", () => {
    expect(extractCitations("Just prose, no bibliography.")).toEqual([]);
  });
});

describe("parseReferenceEntry", () => {
  it("rejects fragments that are too short", () => {
    expect(parseReferenceEntry("too short")).toBeNull();
  });

  it("extracts authors before the year", () => {
    const parsed = parseReferenceEntry(
      'Smith, J., & Jones, K. (2021). "A Study of Things". Journal of Stuff.',
    );
    expect(parsed?.authors?.some((author) => author.includes("Smith"))).toBe(true);
    expect(parsed?.year).toBe(2021);
  });
});
