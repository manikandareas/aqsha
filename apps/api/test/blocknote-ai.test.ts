import { afterAll, describe, expect, mock, test } from "bun:test";

// Mock Clerk token: `Bearer tok_<sub>` → { sub }. Token lain → null (401).
mock.module("../src/clients/clerkToken", () => ({
  verifyClerkToken: async (token: string) =>
    token.startsWith("tok_") ? { sub: token.slice(4), email: null } : null,
}));

const DATABASE_URL = process.env.DATABASE_URL;
const itest = DATABASE_URL ? test : test.skip;

const suffix = Math.floor(Math.random() * 1e9);
const OWNER = `bnai_${suffix}`;

const { app } = await import("../src/index");

function post(path: string, token?: string, body?: unknown) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return app.handle(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body ?? {}),
    }),
  );
}

// Route AI native BlockNote (`/blocknote-ai/chat`) = titik colok Astra. Gerbang auth + ownership
// dijalankan SEBELUM model (streamText) → bisa diuji tanpa gateway live. Happy-path stream =
// owner E2E (butuh creds gateway + Clerk).
describe("POST /blocknote-ai/chat", () => {
  test("tanpa token → 401", async () => {
    const res = await post("/blocknote-ai/chat", undefined, {
      artifactId: "x",
      messages: [],
    });
    expect(res.status).toBe(401);
  });

  itest("artifact bukan milik / tak ada → 404 structured (sebelum model)", async () => {
    const res = await post("/blocknote-ai/chat", `tok_${OWNER}`, {
      artifactId: `nonexistent_${suffix}`,
      messages: [],
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("artifact_not_found");
  });
});

afterAll(() => {
  // tidak ada resource yang dibuat (gerbang menolak sebelum write apa pun).
});
