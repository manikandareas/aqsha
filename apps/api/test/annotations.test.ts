import { afterAll, describe, expect, mock, test } from "bun:test";

mock.module("../src/clients/clerkToken", () => ({
  verifyClerkToken: async (token: string) =>
    token.startsWith("tok_") ? { sub: token.slice(4), email: null } : null,
}));

const DATABASE_URL = process.env.DATABASE_URL;
const itest = DATABASE_URL ? test : test.skip;
const suffix = Math.floor(Math.random() * 1e9);
const OWNER = `apian_${suffix}`;

const { app } = await import("../src/index");

function req(method: string, path: string, token?: string, body?: unknown) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
  );
}

describe("annotations routes", () => {
  test("tanpa token → 401", async () => {
    const res = await req("GET", "/workspaces/x/annotations");
    expect(res.status).toBe(401);
  });

  itest("proyek asing → 404 structured", async () => {
    const res = await req("POST", `/workspaces/nonexistent_${suffix}/annotations`, `tok_${OWNER}`, {
      kind: "pin",
      page: 1,
      rects: [{ x: 0, y: 0, w: 0, h: 0 }],
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code?: string };
    expect(typeof body.code).toBe("string");
  });
});

afterAll(() => {
  // Gerbang menolak sebelum write — tidak ada resource dibuat.
});
