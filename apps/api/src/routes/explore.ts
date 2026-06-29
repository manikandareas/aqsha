import { suggestQueries } from "@aqsha/services";
import { Elysia, t } from "elysia";
import { authMacro } from "../plugins/auth";

/**
 * Route Explore page (driven by query `q`). Read-only, auth wajib:
 *   GET /explore/suggest — typeahead saran kueri (LLM murah, cached) untuk ask-bar.
 *
 * Pencarian paper + berita Explore memakai feed discovery (route /feed); widget
 * analitik lama (facets/analysis) sudah dihapus bersama UI-nya.
 */
export const explore = new Elysia({ prefix: "/explore" })
  .use(authMacro)
  .get(
    "/suggest",
    ({ query }) => suggestQueries(query.q ?? "").then((suggestions) => ({ suggestions })),
    { auth: true, query: t.Object({ q: t.Optional(t.String()) }) },
  );
