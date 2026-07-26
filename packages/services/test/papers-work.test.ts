import { describe, expect, test } from "bun:test";
import {
  explorePaperToLiteraturePaper,
  literaturePaperToExplorePaper,
  mapOpenAlexWork,
  type LiteraturePaper,
  type OpenAlexWorkPayload,
} from "../src/papers/work";

const WORK: OpenAlexWorkPayload = {
  id: "https://openalex.org/W1",
  ids: { openalex: "https://openalex.org/W1", doi: "https://doi.org/10.1234/AbC" },
  display_name: "Deep Learning for Climate",
  publication_year: 2023,
  publication_date: "2023-04-01",
  cited_by_count: 42,
  type: "article",
  language: "en",
  is_retracted: false,
  abstract_inverted_index: { Sebuah: [0], studi: [1] },
  open_access: { is_oa: true, oa_status: "gold", oa_url: "https://oa.example/x.pdf" },
  best_oa_location: { pdf_url: "https://oa.example/x.pdf", source: { display_name: "Nature" } },
  authorships: [{ author: { display_name: "Ada Lovelace" } }],
  primary_topic: { display_name: "Climate", field: { display_name: "Earth" } },
};

describe("mapOpenAlexWork", () => {
  test("memetakan work jadi LiteraturePaper lengkap", () => {
    const paper = mapOpenAlexWork(WORK)!;
    expect(paper.key).toBe("doi:10.1234/abc");
    expect(paper.title).toBe("Deep Learning for Climate");
    expect(paper.doi).toBe("10.1234/abc");
    expect(paper.year).toBe(2023);
    expect(paper.publicationDate).toBe("2023-04-01");
    expect(paper.venue).toBe("Nature");
    expect(paper.citedByCount).toBe(42);
    expect(paper.isOpenAccess).toBe(true);
    expect(paper.oaStatus).toBe("gold");
    expect(paper.workType).toBe("article");
    expect(paper.language).toBe("en");
    expect(paper.isRetracted).toBe(false);
    expect(paper.hasPdf).toBe(true);
    expect(paper.authors).toEqual(["Ada Lovelace"]);
    expect(paper.topics).toEqual(["Climate", "Earth"]);
  });

  test("work tanpa judul ditolak", () => {
    expect(mapOpenAlexWork({ id: "https://openalex.org/W2" })).toBeNull();
  });
});

describe("konversi cache paper", () => {
  test("LiteraturePaper bolak-balik lewat explore_papers tanpa kehilangan field", () => {
    const paper = mapOpenAlexWork(WORK)!;
    const cached = literaturePaperToExplorePaper(paper);
    const back = explorePaperToLiteraturePaper({
      key: cached.key,
      title: cached.title,
      snippet: cached.snippet,
      url: cached.url,
      pdfUrl: cached.pdfUrl ?? null,
      doi: cached.doi ?? null,
      authors: cached.authors,
      year: cached.year ?? null,
      publicationDate: cached.publicationDate ?? null,
      venue: cached.venue ?? null,
      citedByCount: cached.citedByCount ?? null,
      isOpenAccess: cached.isOpenAccess ?? null,
      oaStatus: cached.oaStatus ?? null,
      workType: cached.workType ?? null,
      language: cached.language ?? null,
      isRetracted: cached.isRetracted ?? false,
      topics: cached.topics,
    });
    expect(back).toEqual(paper);
  });

  test("paper tanpa url memakai doi sebagai alamat cache", () => {
    const paper: LiteraturePaper = { ...mapOpenAlexWork(WORK)!, url: null };
    expect(literaturePaperToExplorePaper(paper).url).toBe("https://doi.org/10.1234/abc");
  });
});
