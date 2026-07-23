import { expect, mock, test } from "bun:test";

mock.module("../src/clients/clerkToken", () => ({
  verifyClerkToken: async (token: string) =>
    token.startsWith("tok_") ? { sub: token.slice(4), email: null } : null,
}));

const DATABASE_URL = process.env.DATABASE_URL;

// Catalog + invalid-filter tidak butuh DB; mock getDb agar POST validation tetap jalan offline.
if (!DATABASE_URL) {
  mock.module("../src/clients/db", () => ({
    getDb: () => ({ db: {} }),
  }));
}

const { app } = await import("../src/index");
const tok = (owner: string) => `tok_${owner}`;
const req = (method: string, path: string, token?: string, body?: unknown) =>
  app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );

const OWNER = "user_literature_route";

test("katalog tidak membocorkan provider path", async () => {
  const response = await req("GET", "/papers/literature-search/catalog", tok(OWNER));
  expect(response.status).toBe(200);
  const body = (await response.json()) as {
    filters: Array<{ id: string; kind: string }>;
  };
  expect(body.filters).toContainEqual(
    expect.objectContaining({ id: "citation_count", kind: "number-range" }),
  );
  expect(JSON.stringify(body)).not.toContain("primary_location.source.id");
});

test("search menolak provider field mentah sebagai 400 terstruktur", async () => {
  const response = await req("POST", "/papers/literature-search", tok(OWNER), {
    query: "climate",
    sort: "relevance",
    filters: [{ id: "primary_location.source.id", value: "S1" }],
  });
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({
    code: "literature_filter_invalid",
    field: "filters",
  });
});
