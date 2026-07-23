import { expect, test } from "bun:test";
import { buildLiteratureWorksUrl, mapOpenAlexWork } from "../src/literature-search/openalex";

test("menggunakan cursor OpenAlex dan memetakan Work", () => {
  const url = buildLiteratureWorksUrl({
    apiKey: "key",
    query: "climate adaptation",
    sort: "citations_desc",
    filters: [{ id: "retraction", value: "exclude" }],
    cursor: null,
    limit: 20,
  });
  expect(url.searchParams.get("search")).toBe("climate adaptation");
  expect(url.searchParams.get("cursor")).toBe("*");
  expect(url.searchParams.get("sort")).toBe("cited_by_count:desc");
  expect(url.searchParams.get("filter")).toBe("is_retracted:false,is_paratext:false");

  expect(
    mapOpenAlexWork({
      id: "https://openalex.org/W1",
      display_name: "Climate adaptation paper",
      publication_year: 2024,
      cited_by_count: 42,
      type: "article",
      language: "en",
      is_retracted: false,
      open_access: { is_oa: true, oa_status: "gold", oa_url: "https://example.test/paper" },
      best_oa_location: {
        pdf_url: "https://example.test/paper.pdf",
        source: { display_name: "Journal" },
      },
      authorships: [{ author: { display_name: "A. Researcher" } }],
    })?.workType,
  ).toBe("article");
});
