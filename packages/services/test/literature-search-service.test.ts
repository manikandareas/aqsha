import { afterEach, expect, spyOn, test } from "bun:test";
import {
  LiteratureSearchService,
  literatureSearchDeps,
} from "../src/literature-search/service";
import * as cache from "../src/papers/external-cache";
import { PaperCacheService } from "../src/paper-cache.service";

afterEach(() => {
  // Restore spies so later files still see the live OpenAlex client.
});

test("direct search menyimpan hasil OpenAlex ke paper cache", async () => {
  process.env.OPENALEX_API_KEY = "test-key";
  const fetchWorks = spyOn(literatureSearchDeps, "fetchWorks").mockResolvedValue({
    items: [{ key: "doi:10.1/x", title: "X" } as never],
    total: 1,
    nextCursor: null,
  });
  const upsert = spyOn(PaperCacheService, "upsert").mockResolvedValue(undefined as never);
  spyOn(cache, "getCache").mockResolvedValue(null);
  spyOn(cache, "putCache").mockResolvedValue(undefined);

  try {
    const page = await LiteratureSearchService.search({} as never, {
      query: "climate",
      sort: "relevance",
      filters: [],
      cursor: null,
      limit: 20,
    });
    expect(page.total).toBe(1);
    expect(upsert).toHaveBeenCalled();
  } finally {
    fetchWorks.mockRestore();
    upsert.mockRestore();
  }
});

test("direct search meneruskan field oa/type/language ke paper cache", async () => {
  process.env.OPENALEX_API_KEY = "test-key";
  const paper = {
    key: "doi:10.1/x",
    title: "X",
    snippet: "S",
    doi: "10.1/x",
    url: "https://e.org/x",
    pdfUrl: null,
    hasPdf: false,
    authors: ["A"],
    year: 2024,
    publicationDate: "2024-02-02",
    venue: "V",
    citedByCount: 7,
    isOpenAccess: true,
    oaStatus: "hybrid",
    workType: "preprint",
    language: "id",
    isRetracted: true,
    topics: ["t"],
  };
  const fetchWorks = spyOn(literatureSearchDeps, "fetchWorks").mockResolvedValue({
    items: [paper as never],
    total: 1,
    nextCursor: null,
  });
  const upsert = spyOn(PaperCacheService, "upsert").mockResolvedValue(undefined as never);
  spyOn(cache, "getCache").mockResolvedValue(null);
  spyOn(cache, "putCache").mockResolvedValue(undefined);

  try {
    await LiteratureSearchService.search({} as never, {
      query: "climate",
      sort: "relevance",
      filters: [],
      cursor: null,
      limit: 20,
    });
    const cached = upsert.mock.calls[0]![1] as Array<Record<string, unknown>>;
    expect(cached[0]!.oaStatus).toBe("hybrid");
    expect(cached[0]!.workType).toBe("preprint");
    expect(cached[0]!.language).toBe("id");
    expect(cached[0]!.isRetracted).toBe(true);
  } finally {
    fetchWorks.mockRestore();
    upsert.mockRestore();
  }
});
