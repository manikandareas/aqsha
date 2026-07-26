import { describe, expect, test } from "bun:test";
import { buildOpenAlexWorksUrl, type OpenAlexWork, workIdentifiers } from "../src/feed/openAlex";
import {
  canonicalPaperKey,
  dedupeExplorePapers,
  deriveKeyProbe,
  type ExplorePaperInput,
} from "../src/explore/model";
import { buildFeedItemRow } from "../src/feed/model";
import { mapOpenAlexWork } from "../src/papers/work";

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
  primary_topic: { display_name: "Climate ML", field: { display_name: "CS" } },
};

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
  test("dedup by key, OpenAlex menang atas Crossref", () => {
    const a: ExplorePaperInput = {
      key: "doi:10.1/x",
      title: "A",
      snippet: "",
      url: "u",
      provider: "Crossref",
      sourceLabel: "Crossref",
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

describe("workIdentifiers", () => {
  test("membawa openalexId + doi ternormalisasi", () => {
    expect(workIdentifiers(WORK)).toEqual(["https://openalex.org/W123", "10.1234/abc"]);
  });
});

describe("lane feed memakai mapper bersama", () => {
  test("work trending jadi row feed lewat mapOpenAlexWork", () => {
    const paper = mapOpenAlexWork(WORK)!;
    const row = buildFeedItemRow(paper, 1_000);
    expect(row.key).toBe(paper.key);
    expect(row.oaStatus).toBe(paper.oaStatus);
    expect(row.workType).toBe(paper.workType);
    expect(row.language).toBe(paper.language);
  });

  test("retraksi ikut dari work, tanpa set id terpisah", () => {
    const paper = mapOpenAlexWork({ ...WORK, is_retracted: true })!;
    const row = buildFeedItemRow(paper, 1_000);
    expect(row.isRetracted).toBe(true);
    expect(row.dedupeKey).toBe(`paper:${paper.key}`);
    expect(row.trendScore).toBe(142);
  });
});
