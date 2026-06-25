import { describe, expect, test } from "bun:test";
import {
  buildOpenAlexWorksUrl,
  type OpenAlexWork,
  openAlexWorkToExplorePaper,
  workIdentifiers,
} from "../src/feed/openAlex";
import {
  canonicalPaperKey,
  dedupeExplorePapers,
  deriveKeyProbe,
  type ExplorePaperInput,
} from "../src/explore/model";
import { paperToFeedInput } from "../src/feed/model";

const WORK: OpenAlexWork = {
  id: "https://openalex.org/W123",
  ids: { openalex: "https://openalex.org/W123", doi: "https://doi.org/10.1234/AbC" },
  display_name: "Deep Learning for Climate",
  publication_year: 2023,
  publication_date: "2023-05-01",
  cited_by_count: 142,
  is_retracted: false,
  abstract_inverted_index: { Climate: [0], change: [1], study: [2] },
  best_oa_location: {
    landing_page_url: "https://example.org/paper",
    pdf_url: "https://example.org/paper.pdf",
    is_oa: true,
    source: { display_name: "Nature" },
  },
  open_access: { is_oa: true, oa_url: "https://example.org/oa" },
  authorships: [
    { author: { display_name: "Jane Doe" } },
    { raw_author_name: "John Roe" },
  ],
  primary_topic: { display_name: "Climate ML", score: 0.9, field: { display_name: "CS" } },
};

describe("openAlexWorkToExplorePaper", () => {
  test("map field inti + key doi + author + topics + abstract", () => {
    const paper = openAlexWorkToExplorePaper(WORK)!;
    expect(paper).not.toBeNull();
    expect(paper.key).toBe("doi:10.1234/abc"); // doi dinormalisasi lowercase
    expect(paper.title).toBe("Deep Learning for Climate");
    expect(paper.provider).toBe("OpenAlex");
    expect(paper.url).toBe("https://example.org/oa"); // oa_url menang
    expect(paper.authors).toEqual(["Jane Doe", "John Roe"]);
    expect(paper.year).toBe(2023);
    expect(paper.citedByCount).toBe(142);
    expect(paper.isOpenAccess).toBe(true);
    expect(paper.pdfUrl).toBe("https://example.org/paper.pdf");
    expect(paper.topics).toContain("Climate ML");
    expect(paper.abstract).toBe("Climate change study");
  });

  test("tanpa title atau url → null", () => {
    expect(openAlexWorkToExplorePaper({ display_name: "" })).toBeNull();
  });
});

describe("canonicalPaperKey", () => {
  test("prioritas doi > arxiv > url > title", () => {
    expect(canonicalPaperKey({ doi: "10.1/X", url: "https://a" })).toBe("doi:10.1/x");
    expect(canonicalPaperKey({ url: "https://arxiv.org/abs/2401.01234" })).toBe("arxiv:2401.01234");
    expect(canonicalPaperKey({ url: "https://example.org/x?y=1#z" })).toBe("url:https://example.org/x");
    expect(canonicalPaperKey({ title: "Hello World" })).toBe("title:hello world");
  });
});

describe("deriveKeyProbe", () => {
  test("doi/arxiv membawa identifier, lain jadi query", () => {
    expect(deriveKeyProbe("doi:10.1/x")).toEqual({ query: "10.1/x", doi: "10.1/x" });
    expect(deriveKeyProbe("arxiv:2401.01234")).toEqual({ query: "2401.01234", arxivId: "2401.01234" });
    expect(deriveKeyProbe("title:hello")).toEqual({ query: "hello" });
    expect(deriveKeyProbe("bareword")).toEqual({ query: "bareword" });
  });
});

describe("dedupeExplorePapers", () => {
  test("dedup by key, OpenAlex menang atas Jina", () => {
    const a: ExplorePaperInput = {
      key: "doi:10.1/x",
      title: "A",
      snippet: "",
      url: "u",
      provider: "Jina",
      sourceLabel: "Jina",
      authors: [],
      topics: [],
    };
    const b: ExplorePaperInput = { ...a, provider: "OpenAlex", title: "B" };
    const out = dedupeExplorePapers([a, b], 10);
    expect(out.length).toBe(1);
    expect(out[0]!.provider).toBe("OpenAlex");
  });
});

describe("buildOpenAlexWorksUrl", () => {
  test("empty query → trending cited_by_count:desc", () => {
    const url = buildOpenAlexWorksUrl({ apiKey: "k", query: "", limit: 10 });
    expect(url.searchParams.get("sort")).toBe("cited_by_count:desc");
    expect(url.searchParams.get("per_page")).toBe("10");
  });
  test("query → relevance + search param", () => {
    const url = buildOpenAlexWorksUrl({ apiKey: "k", query: "climate", limit: 5 });
    expect(url.searchParams.get("sort")).toBe("relevance_score:desc");
    expect(url.searchParams.get("search")).toBe("climate");
  });
  test("includeRetracted=false menambah filter is_retracted:false", () => {
    const url = buildOpenAlexWorksUrl({ apiKey: "k", query: "", limit: 5, includeRetracted: false });
    expect(url.searchParams.get("filter")).toContain("is_retracted:false");
  });
});

describe("workIdentifiers + paperToFeedInput retraction", () => {
  test("retracted work → feed item retractionStatus retracted", () => {
    const retractedWork: OpenAlexWork = { ...WORK, is_retracted: true };
    const ids = new Set(workIdentifiers(retractedWork));
    const paper = openAlexWorkToExplorePaper(retractedWork)!;
    const input = paperToFeedInput(paper, ids);
    expect(input.kind).toBe("paper");
    expect(input.dedupeKey).toBe(`paper:${paper.key}`);
    expect(input.retractionStatus).toBe("retracted");
    expect(input.trendScore).toBe(142); // citedByCount
  });
});
