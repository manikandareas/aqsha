import { describe, expect, it, vi } from "vitest";
import { CACHE_TTL_BY_STATUS, Pacer, ProviderCache } from "../src/providers/cache";
import { crossrefToCandidate } from "../src/providers/crossref";
import { searchArxivProvider } from "../src/providers/arxiv";
import {
  openAlexWorkToCandidate,
  reconstructOpenAlexAbstract,
} from "../src/providers/openalex";
import { parseJinaSearchResponse } from "../src/providers/jina";
import { searchWebProvider } from "../src/providers";
import { providerFailureReason, type ProviderDeps } from "../src/providers/types";

function deps(overrides: Partial<ProviderDeps> = {}): ProviderDeps {
  return {
    cache: new ProviderCache(),
    env: {},
    ...overrides,
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("ProviderCache", () => {
  it("expires entries per status TTL", () => {
    let now = 1_000_000;
    const cache = new ProviderCache(() => now);
    cache.put("exa", "k", { hit: true }, "ready");
    expect(cache.get("exa", "k")).toEqual({ hit: true });
    now += CACHE_TTL_BY_STATUS.ready + 1;
    expect(cache.get("exa", "k")).toBeNull();
  });

  it("failed entries expire faster than ready entries", () => {
    let now = 0;
    const cache = new ProviderCache(() => now);
    cache.putCandidates("crossref", "ok", [{ a: 1 }]);
    cache.putCandidates("crossref", "bad", [], "boom");
    now += CACHE_TTL_BY_STATUS.failed + 1;
    expect(cache.get("crossref", "ok")).not.toBeNull();
    expect(cache.get("crossref", "bad")).toBeNull();
  });
});

describe("Pacer", () => {
  it("spaces calls by the min gap and rejects beyond the max wait", async () => {
    let now = 0;
    const sleeps: number[] = [];
    const pacer = new Pacer(3_000, 6_000, () => now, async (ms) => {
      sleeps.push(ms);
    });
    await pacer.reserve(); // immediate
    await pacer.reserve(); // waits 3s
    await pacer.reserve(); // waits 6s (still allowed)
    expect(sleeps).toEqual([3_000, 6_000]);
    await expect(pacer.reserve()).rejects.toThrow(/rate limited/);
  });
});

describe("crossrefToCandidate", () => {
  it("maps a Crossref work with metadata", () => {
    const candidate = crossrefToCandidate({
      DOI: "10.1000/ABC",
      URL: "https://doi.org/10.1000/abc",
      title: ["A Paper Title"],
      abstract: "<jats:p>Some abstract</jats:p>",
      author: [{ given: "Ada", family: "Lovelace" }],
      published: { "date-parts": [[2021, 5]] },
      "container-title": ["Journal of Tests"],
    });
    expect(candidate?.doi).toBe("10.1000/abc");
    expect(candidate?.origin).toBe("doi");
    expect(candidate?.snippet).toContain("Some abstract");
    const meta = JSON.parse(candidate?.metadataJson ?? "{}");
    expect(meta.authors).toEqual(["Ada Lovelace"]);
    expect(meta.year).toBe(2021);
    expect(meta.venue).toBe("Journal of Tests");
  });

  it("returns null without a DOI or title", () => {
    expect(crossrefToCandidate({ title: ["x"] })).toBeNull();
    expect(crossrefToCandidate({ DOI: "10.1/x" })).toBeNull();
  });
});

const ARXIV_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/1706.03762v7</id>
    <title>Attention Is All You Need</title>
    <summary>The dominant sequence transduction models...</summary>
    <published>2017-06-12T17:57:34Z</published>
    <author><name>Ashish Vaswani</name></author>
    <author><name>Noam Shazeer</name></author>
    <link href="http://arxiv.org/abs/1706.03762v7" rel="alternate" type="text/html"/>
  </entry>
</feed>`;

describe("searchArxivProvider", () => {
  it("parses the Atom feed into candidates and caches them", async () => {
    const fetchImpl = vi.fn(async () => new Response(ARXIV_FEED, { status: 200 }));
    const d = deps({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const results = await searchArxivProvider(d, { query: "attention", limit: 1 });
    expect(results).toHaveLength(1);
    expect(results[0]?.title).toBe("Attention Is All You Need");
    expect(results[0]?.arxivId).toBe("1706.03762v7");
    expect(results[0]?.evidenceStrength).toBe("strong");

    // Second call hits the cache, not fetch.
    await searchArxivProvider(d, { query: "attention", limit: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("returns a failure sentinel on provider errors", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 503 }));
    const results = await searchArxivProvider(
      deps({ fetchImpl: fetchImpl as unknown as typeof fetch }),
      { query: "attention" },
    );
    expect(results).toHaveLength(1);
    expect(providerFailureReason(results[0]!)).toContain("503");
  });
});

describe("openalex", () => {
  it("reconstructs abstracts from the inverted index", () => {
    expect(
      reconstructOpenAlexAbstract({ Hello: [0], world: [1], again: [2] }),
    ).toBe("Hello world again");
    expect(reconstructOpenAlexAbstract(null)).toBe("");
  });

  it("maps an OpenAlex work to a candidate", () => {
    const candidate = openAlexWorkToCandidate({
      id: "https://openalex.org/W123",
      display_name: "A Work",
      publication_year: 2020,
      ids: { openalex: "https://openalex.org/W123", doi: "https://doi.org/10.1/w" },
      authorships: [{ author: { display_name: "Jane Doe" } }],
      best_oa_location: {
        landing_page_url: "https://example.com/paper",
        source: { display_name: "Example Journal" },
      },
      abstract_inverted_index: { Short: [0], abstract: [1] },
    });
    expect(candidate?.doi).toBe("10.1/w");
    expect(candidate?.evidenceStrength).toBe("strong");
    const meta = JSON.parse(candidate?.metadataJson ?? "{}");
    expect(meta.authors).toEqual(["Jane Doe"]);
    expect(meta.venue).toBe("Example Journal");
  });
});

describe("parseJinaSearchResponse", () => {
  it("parses the JSON response shape", () => {
    const results = parseJinaSearchResponse(
      JSON.stringify({
        data: [
          { title: "Result A", url: "https://a.example", content: "Body A" },
          { title: "Result B", url: "https://b.example", description: "Desc B" },
        ],
      }),
      5,
    );
    expect(results).toHaveLength(2);
    expect(results[0]?.url).toBe("https://a.example");
    expect(results[1]?.snippet).toContain("Desc B");
  });

  it("parses the text block fallback shape", () => {
    const text = `Title: Some Page\nURL Source: https://page.example\nMarkdown Content: Page body here`;
    const results = parseJinaSearchResponse(text, 5);
    expect(results[0]?.title).toBe("Some Page");
    expect(results[0]?.url).toBe("https://page.example");
  });
});

describe("searchWebProvider", () => {
  it("falls back to Jina when Exa is not configured", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      expect(url).toContain("s.jina.ai");
      return jsonResponse({ data: [{ title: "Jina hit", url: "https://j.example" }] });
    });
    const results = await searchWebProvider(
      deps({ fetchImpl: fetchImpl as unknown as typeof fetch }),
      { query: "anything" },
    );
    expect(results[0]?.provider).toBe("jina_search");
  });

  it("uses Exa when configured and results are non-empty", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      expect(url).toContain("api.exa.ai");
      return jsonResponse({
        results: [{ title: "Exa hit", url: "https://e.example", summary: "S" }],
      });
    });
    const results = await searchWebProvider(
      deps({
        env: { exaApiKey: "key" },
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
      { query: "anything" },
    );
    expect(results[0]?.provider).toBe("exa");
  });
});
