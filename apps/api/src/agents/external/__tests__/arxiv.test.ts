import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { searchArxiv } from "../arxiv";

const SAMPLE_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom">
  <title>arXiv Query</title>
  <entry>
    <id>http://arxiv.org/abs/2401.12345v1</id>
    <updated>2024-01-22T10:00:00Z</updated>
    <published>2024-01-20T10:00:00Z</published>
    <title>Hybrid Retrieval for Retrieval-Augmented Generation</title>
    <summary>We propose a hybrid retrieval pipeline combining dense and sparse signals.</summary>
    <author><name>Alice Researcher</name></author>
    <author><name>Bob Engineer</name></author>
    <link href="http://arxiv.org/abs/2401.12345v1" rel="alternate" type="text/html"/>
    <link title="pdf" href="http://arxiv.org/pdf/2401.12345v1" rel="related" type="application/pdf"/>
    <arxiv:doi>10.48550/arXiv.2401.12345</arxiv:doi>
    <arxiv:primary_category term="cs.IR"/>
  </entry>
  <entry>
    <id>http://arxiv.org/abs/2403.99999v2</id>
    <published>2024-03-15T08:30:00Z</published>
    <title>Reranking Strategies in Modern IR</title>
    <summary>A survey of cross-encoder rerankers.</summary>
    <author><name>Carol Author</name></author>
    <link href="http://arxiv.org/abs/2403.99999v2" rel="alternate" type="text/html"/>
  </entry>
</feed>`;

const originalFetch = globalThis.fetch;

describe("searchArxiv", () => {
  beforeEach(() => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      expect(url).toContain("export.arxiv.org/api/query");
      return new Response(SAMPLE_FEED, {
        status: 200,
        headers: { "content-type": "application/atom+xml" },
      });
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("parses the Atom feed into normalized CandidateSource records", async () => {
    const candidates = await searchArxiv("rag retrieval", { maxResults: 5 });

    expect(candidates).toHaveLength(2);
    const [first, second] = candidates;

    expect(first.url).toBe("http://arxiv.org/abs/2401.12345v1");
    expect(first.title).toBe("Hybrid Retrieval for Retrieval-Augmented Generation");
    expect(first.snippet).toContain("hybrid retrieval pipeline");
    expect(first.publishedDate).toBe("2024-01-20T10:00:00Z");
    expect(first.authors).toEqual(["Alice Researcher", "Bob Engineer"]);
    expect(first.doi).toBe("10.48550/arXiv.2401.12345");
    expect(first.provider).toBe("arxiv");
    expect(first.raw?.primaryCategory).toBe("cs.IR");

    // Second entry has no DOI element — must surface as null.
    expect(second.doi).toBeNull();
    expect(second.authors).toEqual(["Carol Author"]);
  });

  it("returns an empty array for an empty query", async () => {
    const candidates = await searchArxiv("   ");
    expect(candidates).toEqual([]);
  });
});
