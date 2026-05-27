import { describe, expect, it } from "vitest";
import type { ExternalCandidate } from "../convex/agent/externalProviders";
import {
  openAlexWorkToCandidate,
  reconstructOpenAlexAbstract,
} from "../convex/agent/openalexProvider";
import {
  candidatesToExplorePapers,
  exploreCacheKey,
} from "../convex/exploreModel";

describe("explore paper model", () => {
  it("maps OpenAlex works into paper metadata", () => {
    const candidate = openAlexWorkToCandidate({
      id: "https://openalex.org/W123",
      doi: "https://doi.org/10.1000/test",
      display_name: "Learning Analytics in Practice",
      publication_year: 2025,
      publication_date: "2025-02-03",
      cited_by_count: 42,
      abstract_inverted_index: {
        Learning: [0],
        analytics: [1],
        improves: [2],
        feedback: [3],
      },
      best_oa_location: {
        landing_page_url: "https://example.edu/paper",
        pdf_url: "https://example.edu/paper.pdf",
        is_oa: true,
        source: { display_name: "Journal of Learning" },
      },
      authorships: [
        { author: { display_name: "Ayu Santoso" } },
        { raw_author_name: "Bima Putra" },
      ],
      primary_topic: {
        display_name: "Learning Analytics",
        score: 0.87,
        subfield: { display_name: "Education" },
        field: { display_name: "Social Sciences" },
      },
      ids: {
        openalex: "https://openalex.org/W123",
        doi: "https://doi.org/10.1000/test",
      },
    });

    expect(candidate).toMatchObject({
      provider: "openalex",
      title: "Learning Analytics in Practice",
      doi: "10.1000/test",
      url: "https://example.edu/paper",
      snippet: "Learning analytics improves feedback",
    });

    const [paper] = candidatesToExplorePapers([candidate!], 10);
    expect(paper).toMatchObject({
      key: "doi:10.1000/test",
      provider: "OpenAlex",
      pdfUrl: "https://example.edu/paper.pdf",
      authors: ["Ayu Santoso", "Bima Putra"],
      venue: "Journal of Learning",
      citedByCount: 42,
      isOpenAccess: true,
      topics: ["Learning Analytics", "Education", "Social Sciences"],
    });
  });

  it("reconstructs OpenAlex abstracts in word order", () => {
    expect(
      reconstructOpenAlexAbstract({
        world: [1],
        Hello: [0],
        again: [2],
      }),
    ).toBe("Hello world again");
  });

  it("dedupes by DOI, arXiv id, and normalized URL using the canonical source key", () => {
    const candidates: ExternalCandidate[] = [
      candidate({
        provider: "openalex",
        doi: "10.5555/example",
        title: "Same DOI",
        url: "https://openalex.org/W1",
      }),
      candidate({
        provider: "arxiv",
        doi: "https://doi.org/10.5555/example",
        title: "Same DOI",
        url: "https://arxiv.org/abs/2501.12345v2",
      }),
      candidate({
        provider: "arxiv",
        title: "Attention Is All You Need",
        url: "https://arxiv.org/pdf/1706.03762v7.pdf",
      }),
      candidate({
        provider: "jina_search",
        title: "Attention Is All You Need",
        url: "https://arxiv.org/html/1706.03762",
      }),
      candidate({
        provider: "exa",
        title: "URL duplicate",
        url: "https://www.example.com/a?utm_source=test#section",
      }),
      candidate({
        provider: "jina_search",
        title: "URL duplicate",
        url: "https://example.com/a",
      }),
    ];

    const papers = candidatesToExplorePapers(candidates, 10);
    expect(papers.map((paper) => paper.key)).toEqual([
      "doi:10.5555/example",
      "arxiv:1706.03762",
      "url:example.com/a",
    ]);
  });

  it("uses a daily bucket for explore cache keys", () => {
    expect(
      exploreCacheKey({
        mode: "recommendations",
        query: "",
        limit: 12,
        now: Date.UTC(2026, 4, 27, 3),
      }),
    ).toBe("explore:v1:recommendations::12:2026-05-27");
  });
});

function candidate(args: {
  provider: string;
  title: string;
  url: string;
  doi?: string;
}): ExternalCandidate {
  return {
    origin: args.provider === "arxiv" ? "arxiv" : "web",
    provider: args.provider,
    evidenceStrength: "medium",
    title: args.title,
    locator: args.url,
    url: args.url,
    doi: args.doi,
    snippet: "Snippet",
  };
}
