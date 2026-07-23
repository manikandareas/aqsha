import { describe, expect, test } from "bun:test";
import {
  normalizeLiteratureSearch,
  publicLiteratureCatalog,
  toOpenAlexFilter,
} from "../src/literature-search/catalog";

describe("literature filter catalog", () => {
  test("memetakan clause user-facing dan mengecualikan retracted secara default", () => {
    const normalized = normalizeLiteratureSearch({
      query: " climate adaptation ",
      sort: "citations_desc",
      filters: [
        { id: "publication_date", value: { min: "2020-01-01", max: "2024-12-31" } },
        { id: "open_access", value: true },
        { id: "citation_count", value: { min: 50 } },
        { id: "work_type", value: ["article", "review"] },
      ],
    });

    expect(normalized.filters).toContainEqual({ id: "retraction", value: "exclude" });
    expect(toOpenAlexFilter(normalized.filters)).toBe(
      "from_publication_date:2020-01-01,to_publication_date:2024-12-31,open_access.is_oa:true,cited_by_count:>49,type:article|review,is_retracted:false,is_paratext:false",
    );
  });

  test("menolak provider path mentah sebagai field error terstruktur", () => {
    expect(() =>
      normalizeLiteratureSearch({
        query: "climate",
        sort: "relevance",
        filters: [{ id: "primary_location.source.id" as never, value: "S1" }],
      }),
    ).toThrow(/literature_filter_invalid/);
  });

  test("mengirim metadata UI tanpa OpenAlex path atau mapper", () => {
    const entry = publicLiteratureCatalog().filters.find((x) => x.id === "publication_date");
    expect(entry).toMatchObject({
      id: "publication_date",
      category: "publication",
      kind: "date-range",
    });
    expect(entry).not.toHaveProperty("openAlex");
  });
});
