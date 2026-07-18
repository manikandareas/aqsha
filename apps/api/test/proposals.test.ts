import { describe, expect, mock, test } from "bun:test";

mock.module("../src/clients/clerkToken", () => ({
  verifyClerkToken: async (token: string) =>
    token.startsWith("tok_") ? { sub: token.slice(4), email: null } : null,
}));

const DATABASE_URL = process.env.DATABASE_URL;
const itest = DATABASE_URL ? test : test.skip;
const suffix = Math.floor(Math.random() * 1e9);
const OWNER = `apipr_${suffix}`;

const { app } = await import("../src/index");

function req(method: string, path: string, token?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return app.handle(new Request(`http://localhost${path}`, { method, headers }));
}

describe("proposals routes", () => {
  test("tanpa token → 401", async () => {
    const res = await req("GET", "/sections/x/proposals");
    expect(res.status).toBe(401);
  });

  itest("pending untuk section tanpa proposal → 200 (null)", async () => {
    const res = await req("GET", `/sections/nonexistent_${suffix}/proposals`, `tok_${OWNER}`);
    expect(res.status).toBe(200);
  });

  itest("accept proposal id asing → 404 structured (proposal_not_found)", async () => {
    const res = await req(
      "POST",
      `/sections/x/proposals/nonexistent_${suffix}/accept`,
      `tok_${OWNER}`,
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code?: string };
    expect(typeof body.code).toBe("string");
  });
});
