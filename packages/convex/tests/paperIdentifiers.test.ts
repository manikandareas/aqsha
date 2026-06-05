import { describe, expect, it } from "vitest";
import {
  arxivPdfUrl,
  classifyUrl,
  extractArxivId,
  extractDoi,
  isAcademicIdentifier,
  normalizeDoi,
} from "../convex/paperIngest/identifiers";

describe("classifyUrl — arXiv", () => {
  it("classifies an arxiv.org/abs URL", () => {
    const result = classifyUrl("https://arxiv.org/abs/1304.0445");
    expect(result.kind).toBe("arxiv");
    expect(result.arxivId).toBe("1304.0445");
    expect(result.academicDomain).toBe(true);
    expect(result.publisherHint).toBe("arxiv.org");
  });

  it("classifies an arxiv pdf URL with version (strips version)", () => {
    const result = classifyUrl("https://arxiv.org/pdf/2301.10140v2");
    expect(result.kind).toBe("arxiv");
    expect(result.arxivId).toBe("2301.10140");
  });

  it("classifies a 5-digit arxiv id", () => {
    expect(classifyUrl("https://arxiv.org/abs/1706.03762").arxivId).toBe(
      "1706.03762",
    );
  });

  it("classifies a legacy arxiv id", () => {
    const result = classifyUrl("https://arxiv.org/abs/math/9901001");
    expect(result.kind).toBe("arxiv");
    expect(result.arxivId).toBe("math/9901001");
  });

  it("classifies an arXiv DOI (10.48550) as arxiv", () => {
    const result = classifyUrl("https://doi.org/10.48550/arXiv.2301.10140");
    expect(result.kind).toBe("arxiv");
    expect(result.arxivId).toBe("2301.10140");
  });

  it("classifies a bare arxiv id", () => {
    expect(classifyUrl("1304.0445").arxivId).toBe("1304.0445");
    expect(classifyUrl("arXiv:1304.0445").arxivId).toBe("1304.0445");
  });
});

describe("classifyUrl — DOI", () => {
  it("classifies a doi.org URL and normalizes", () => {
    const result = classifyUrl("https://doi.org/10.1038/nphys1170");
    expect(result.kind).toBe("doi");
    expect(result.doi).toBe("10.1038/nphys1170");
  });

  it("extracts a DOI embedded in a publisher path", () => {
    const result = classifyUrl(
      "https://link.springer.com/article/10.1007/s11192-021-04097-5",
    );
    expect(result.kind).toBe("doi");
    expect(result.doi).toBe("10.1007/s11192-021-04097-5");
    expect(result.publisherHint).toBe("link.springer.com");
  });

  it("strips query string and trailing punctuation from a DOI", () => {
    expect(extractDoi("https://dl.acm.org/doi/10.1145/3292500.3330701?foo=1")).toBe(
      "10.1145/3292500.3330701",
    );
    expect(extractDoi("see 10.1038/nphys1170.")).toBe("10.1038/nphys1170");
  });

  it("classifies a bare DOI string", () => {
    expect(classifyUrl("10.1371/journal.pone.0000308").kind).toBe("doi");
  });
});

describe("classifyUrl — PMID", () => {
  it("classifies a pubmed URL", () => {
    const result = classifyUrl("https://pubmed.ncbi.nlm.nih.gov/14907713/");
    expect(result.kind).toBe("pmid");
    expect(result.pmid).toBe("14907713");
  });
});

describe("classifyUrl — generic", () => {
  it("treats a normal website as generic", () => {
    const result = classifyUrl("https://example.com/blog/some-article");
    expect(result.kind).toBe("generic");
    expect(result.academicDomain).toBe(false);
    expect(isAcademicIdentifier(result)).toBe(false);
  });

  it("marks a research-sharing domain academicDomain even without an inline id", () => {
    const result = classifyUrl("https://www.researchgate.net/publication/123_Title");
    expect(result.kind).toBe("generic");
    expect(result.academicDomain).toBe(true);
    expect(result.publisherHint).toBe("researchgate.net");
  });
});

describe("helpers", () => {
  it("normalizeDoi strips prefixes and lowercases", () => {
    expect(normalizeDoi("https://dx.doi.org/10.1038/NPhys1170")).toBe(
      "10.1038/nphys1170",
    );
    expect(normalizeDoi("doi:10.1038/Nphys1170")).toBe("10.1038/nphys1170");
  });

  it("extractArxivId returns undefined for non-arxiv", () => {
    expect(extractArxivId("https://example.com")).toBeUndefined();
  });

  it("arxivPdfUrl builds a direct pdf URL", () => {
    expect(arxivPdfUrl("1304.0445")).toBe("https://arxiv.org/pdf/1304.0445");
  });

  it("isAcademicIdentifier is true for doi/arxiv/pmid", () => {
    expect(isAcademicIdentifier(classifyUrl("10.1038/nphys1170"))).toBe(true);
    expect(isAcademicIdentifier(classifyUrl("arXiv:1304.0445"))).toBe(true);
  });
});
