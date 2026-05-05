import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { searchCrossref } from "../crossref";

const SAMPLE_RESPONSE = {
  status: "ok",
  message: {
    items: [
      {
        DOI: "10.1234/example.2024.001",
        title: ["Evidence-based Retrieval at Scale"],
        abstract:
          "<jats:p>We evaluate hybrid retrieval pipelines on a 50M-document corpus.</jats:p>",
        author: [
          { given: "Alice", family: "Researcher" },
          { given: "Bob", family: "Engineer" },
        ],
        type: "journal-article",
        published: { "date-parts": [[2024, 6, 12]] },
        "container-title": ["Journal of Information Retrieval"],
      },
      {
        URL: "https://example.org/papers/no-doi",
        title: ["Untitled Without DOI"],
        author: [{ family: "Solo" }],
        issued: { "date-parts": [[2023]] },
      },
      {
        // missing both DOI and URL → must be filtered out.
        title: ["Phantom paper"],
      },
    ],
  },
};

const originalFetch = globalThis.fetch;

describe("searchCrossref", () => {
  beforeEach(() => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      expect(url).toContain("api.crossref.org/works");
      return new Response(JSON.stringify(SAMPLE_RESPONSE), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("normalizes CrossRef items, including DOI→URL mapping and JATS stripping", async () => {
    const candidates = await searchCrossref("hybrid retrieval", { rows: 10 });

    expect(candidates).toHaveLength(2);

    const [withDoi, withoutDoi] = candidates;

    expect(withDoi.url).toBe("https://doi.org/10.1234/example.2024.001");
    expect(withDoi.title).toBe("Evidence-based Retrieval at Scale");
    expect(withDoi.snippet).toBe("We evaluate hybrid retrieval pipelines on a 50M-document corpus.");
    expect(withDoi.publishedDate).toBe("2024-06-12");
    expect(withDoi.authors).toEqual(["Alice Researcher", "Bob Engineer"]);
    expect(withDoi.doi).toBe("10.1234/example.2024.001");
    expect(withDoi.provider).toBe("crossref");
    expect(withDoi.raw?.containerTitle).toBe("Journal of Information Retrieval");

    expect(withoutDoi.url).toBe("https://example.org/papers/no-doi");
    expect(withoutDoi.doi).toBeNull();
    expect(withoutDoi.publishedDate).toBe("2023");
    expect(withoutDoi.authors).toEqual(["Solo"]);
  });
});
