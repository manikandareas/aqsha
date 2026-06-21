import { ExploreService } from "@aqsha/services";
import { Elysia, t } from "elysia";
import { getDb } from "../clients/db";
import { authMacro } from "../plugins/auth";

/**
 * Route papers/explore (Domain 9, P4). `GET /papers/search` (waterfall OpenAlex + cache),
 * `GET /papers/:key` (getOrFetchPaper cold-resolve). Key kanonik (`doi:`/`arxiv:`/`url:`/`title:`)
 * dibawa Eden ter-encode di path param → Elysia decode jadi `params.key` utuh.
 */
export const papers = new Elysia({ prefix: "/papers" })
  .use(authMacro)
  .get(
    "/search",
    ({ ownerUserId, query }) => {
      const { db } = getDb();
      return ExploreService.searchPapers(db, ownerUserId, {
        query: query.query,
        limit: query.limit,
        mode: query.mode,
        fromYear: query.fromYear,
        interestSeed: query.interestSeed,
      });
    },
    {
      auth: true,
      query: t.Object({
        query: t.Optional(t.String()),
        limit: t.Optional(t.Numeric()),
        mode: t.Optional(t.Union([t.Literal("recommendations"), t.Literal("search")])),
        fromYear: t.Optional(t.Numeric()),
        interestSeed: t.Optional(t.Boolean()),
      }),
    },
  )
  .get(
    "/:key",
    ({ ownerUserId, params, query }) => {
      const { db } = getDb();
      return ExploreService.getOrFetchPaper(db, params.key, {
        fetchOnMiss: query.fetchOnMiss,
      });
    },
    {
      auth: true,
      query: t.Object({ fetchOnMiss: t.Optional(t.Boolean()) }),
    },
  );
