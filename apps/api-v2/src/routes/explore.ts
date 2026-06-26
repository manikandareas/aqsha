import { ExploreAnalysisService, FacetsService, suggestQueries } from "@aqsha/services";
import { Elysia, t } from "elysia";
import { getDb } from "../clients/db";
import { authMacro } from "../plugins/auth";

/**
 * Route Explore page (driven by query `q`). Read-only, auth wajib:
 *   GET /explore/suggest  — typeahead saran kueri (LLM murah, cached).
 *   GET /explore/facets   — Pulse chart + Globe (OpenAlex group_by, cached, no job).
 *   GET /explore/analysis — Gap + Tension (background job + semantic-reuse; client polling).
 */
export const explore = new Elysia({ prefix: "/explore" })
  .use(authMacro)
  .get(
    "/suggest",
    ({ query }) => suggestQueries(query.q ?? "").then((suggestions) => ({ suggestions })),
    { auth: true, query: t.Object({ q: t.Optional(t.String()) }) },
  )
  .get("/facets", ({ query }) => FacetsService.getFacets(query.q ?? ""), {
    auth: true,
    query: t.Object({ q: t.Optional(t.String()) }),
  })
  .get(
    "/analysis",
    ({ query }) => {
      const { db } = getDb();
      return ExploreAnalysisService.getOrStartAnalysis(db, query.q ?? "");
    },
    { auth: true, query: t.Object({ q: t.Optional(t.String()) }) },
  );
