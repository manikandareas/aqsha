import { describe, expect, it } from "vitest";
import type { ExternalCandidate } from "@aqsha/agent-contracts";
import {
  classifyIntegrity,
  compareMetadata,
  verifyOneCitation,
  type CitationProviders,
  type IntegritySignals,
} from "../src/citations/integrity";

const baseSignals: IntegritySignals = {
  hasIdentifier: false,
  identifierResolved: null,
  identifierTitleMatch: null,
  existenceFound: null,
  metadataConsistent: null,
  metadataIssues: [],
};

describe("classifyIntegrity", () => {
  it("verified when the identifier resolves with matching title", () => {
    expect(
      classifyIntegrity({
        ...baseSignals,
        hasIdentifier: true,
        identifierResolved: true,
        identifierTitleMatch: true,
      }),
    ).toBe("verified");
  });

  it("identifier_invalid when resolution fails or points elsewhere", () => {
    expect(
      classifyIntegrity({
        ...baseSignals,
        hasIdentifier: true,
        identifierResolved: false,
      }),
    ).toBe("identifier_invalid");
    expect(
      classifyIntegrity({
        ...baseSignals,
        hasIdentifier: true,
        identifierResolved: true,
        identifierTitleMatch: false,
      }),
    ).toBe("identifier_invalid");
  });

  it("metadata_mismatch when resolved but metadata differs", () => {
    expect(
      classifyIntegrity({
        ...baseSignals,
        hasIdentifier: true,
        identifierResolved: true,
        identifierTitleMatch: true,
        metadataConsistent: false,
      }),
    ).toBe("metadata_mismatch");
  });

  it("falls back to existence when no identifier signal", () => {
    expect(classifyIntegrity({ ...baseSignals, existenceFound: true })).toBe("verified");
    expect(classifyIntegrity({ ...baseSignals, existenceFound: false })).toBe(
      "not_found",
    );
    expect(classifyIntegrity(baseSignals)).toBe("unverifiable");
  });
});

describe("compareMetadata", () => {
  it("tolerates ±1 year and flags bigger gaps", () => {
    expect(compareMetadata({ year: 2020 }, { year: 2021 }).consistent).toBe(true);
    const result = compareMetadata({ year: 2018 }, { year: 2021 });
    expect(result.consistent).toBe(false);
    expect(result.issues[0]).toContain("year");
  });

  it("flags author mismatch", () => {
    const result = compareMetadata(
      { authors: ["Smith, J.", "Jones, K."] },
      { authors: ["Completely Other", "Someone Else"] },
    );
    expect(result.consistent).toBe(false);
    expect(result.issues).toContain("author mismatch");
  });
});

function candidate(overrides: Partial<ExternalCandidate>): ExternalCandidate {
  return {
    origin: "doi",
    evidenceStrength: "medium",
    title: "Attention Is All You Need",
    locator: "10.1000/attn",
    snippet: "snippet",
    ...overrides,
  };
}

function providers(overrides: Partial<CitationProviders>): CitationProviders {
  return {
    lookupDoi: async () => [],
    searchArxiv: async () => [],
    searchOpenAlex: async () => [],
    ...overrides,
  };
}

describe("verifyOneCitation", () => {
  it("verifies a DOI-backed citation with consistent metadata", async () => {
    const result = await verifyOneCitation(
      providers({
        lookupDoi: async () => [
          candidate({
            metadataJson: JSON.stringify({
              authors: ["Ashish Vaswani"],
              year: 2017,
              venue: "NeurIPS",
            }),
          }),
        ],
      }),
      {
        title: "Attention Is All You Need",
        authors: ["Vaswani, A."],
        year: 2017,
        venue: "NeurIPS",
        doi: "10.1000/attn",
      },
    );
    expect(result.status).toBe("verified");
    expect(result.matchedTitle).toBe("Attention Is All You Need");
  });

  it("flags identifier_invalid when the DOI resolves to a different title", async () => {
    const result = await verifyOneCitation(
      providers({
        lookupDoi: async () => [candidate({ title: "A Totally Different Paper About Biology" })],
      }),
      { title: "Attention Is All You Need", doi: "10.1000/attn" },
    );
    expect(result.status).toBe("identifier_invalid");
  });

  it("treats provider failure sentinels as no signal (unverifiable)", async () => {
    const failureSentinel = candidate({
      title: "Provider unavailable",
      metadataJson: JSON.stringify({ providerFailure: true, reason: "Crossref 500" }),
    });
    const result = await verifyOneCitation(
      providers({
        lookupDoi: async () => [failureSentinel],
        searchOpenAlex: async () => [failureSentinel],
      }),
      { title: "Attention Is All You Need", doi: "10.1000/attn" },
    );
    expect(result.status).toBe("unverifiable");
  });

  it("uses OpenAlex existence when there is no identifier", async () => {
    const found = await verifyOneCitation(
      providers({
        searchOpenAlex: async () => [candidate({ origin: "web" })],
      }),
      { title: "Attention Is All You Need" },
    );
    expect(found.status).toBe("verified");

    const missing = await verifyOneCitation(
      providers({
        searchOpenAlex: async () => [
          candidate({ origin: "web", title: "An Entirely Unrelated Work" }),
        ],
      }),
      { title: "Attention Is All You Need" },
    );
    expect(missing.status).toBe("not_found");
  });

  it("never crashes on provider exceptions — degrades to unverifiable", async () => {
    const result = await verifyOneCitation(
      providers({
        lookupDoi: async () => {
          throw new Error("network down");
        },
        searchOpenAlex: async () => {
          throw new Error("network down");
        },
      }),
      { title: "Some Paper", doi: "10.1/x" },
    );
    expect(result.status).toBe("unverifiable");
  });
});
