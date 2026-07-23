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
