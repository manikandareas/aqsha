/**
 * Route dokumen LaTeX + build — DB integration (skip tanpa DATABASE_URL); compile
 * TIDAK diuji di sini (butuh toolchain+S3 — e2e services). Membuktikan wiring route:
 * GET document null → PUT save → GET berisi → PUT basi → stale_write; GET build null.
 */
import { afterAll, describe, expect, mock, test } from "bun:test";
import { createDb } from "@aqsha/db";

mock.module("../src/clients/clerkToken", () => ({
  verifyClerkToken: async (token: string) =>
    token.startsWith("tok_") ? { sub: token.slice(4), email: null } : null,
}));

const DATABASE_URL = process.env.DATABASE_URL;
const itest = DATABASE_URL ? test : test.skip;
const suffix = Math.floor(Math.random() * 1e9);
const OWNER = `user_itest_lx_${suffix}`;
const WS = `ws_itest_lx_${suffix}`;
const SEC = `sec_itest_lx_${suffix}`;
const NOW = 1_700_000_000_000;

const { app } = await import("../src/index");

function req(method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { authorization: `Bearer tok_${OWNER}` };
  if (body !== undefined) headers["content-type"] = "application/json";
  return app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

// Handler yang mengembalikan null → Elysia mengirim body kosong (bukan literal "null"),
// jadi res.json() throw. Perlakukan body kosong sebagai null.
async function jsonOrNull(res: Response): Promise<unknown> {
  const text = await res.text();
  return text === "" ? null : JSON.parse(text);
}

async function seed() {
  const { client } = createDb(DATABASE_URL!);
  await client`insert into users (owner_user_id, clerk_user_id, email, created_at, updated_at)
    values (${OWNER}, ${OWNER}, ${`${OWNER}@test.local`}, ${NOW}, ${NOW})`;
  await client`insert into workspaces (id, owner_user_id, name, kind, stage, status, created_at, updated_at)
    values (${WS}, ${OWNER}, ${"Skripsi"}, ${"undergraduate_thesis"}, ${"writing"}, ${"active"}, ${NOW}, ${NOW})`;
  await client`insert into workspace_sections (id, workspace_id, title, sort_order, status, created_at, updated_at)
    values (${SEC}, ${WS}, ${"Bab 1"}, ${0}, ${"empty"}, ${NOW}, ${NOW})`;
  await client.end();
}

afterAll(async () => {
  if (!DATABASE_URL) return;
  const { client } = createDb(DATABASE_URL);
  await client`delete from document_citation_usages where owner_user_id like 'user_itest_lx_%'`;
  await client`delete from document_revisions where owner_user_id like 'user_itest_lx_%'`;
  await client`delete from latex_builds where owner_user_id like 'user_itest_lx_%'`;
  await client`delete from workspace_sections where workspace_id like 'ws_itest_lx_%'`;
  await client`delete from artifact_contents where owner_user_id like 'user_itest_lx_%'`;
  await client`delete from artifacts where owner_user_id like 'user_itest_lx_%'`;
  await client`delete from workspaces where owner_user_id like 'user_itest_lx_%'`;
  await client`delete from users where owner_user_id like 'user_itest_lx_%'`;
  await client.end();
});

describe("route dokumen latex", () => {
  itest("roundtrip GET/PUT document + stale_write + build null", async () => {
    await seed();
    const empty = await req("GET", `/sections/${SEC}/document`);
    expect(empty.status).toBe(200);
    expect(await jsonOrNull(empty)).toBeNull();

    const saved = await req("PUT", `/sections/${SEC}/document`, {
      source: "Halo \\LaTeX.",
    });
    expect(saved.status).toBe(200);
    const savedBody = (await saved.json()) as { status: string; contentVersion: number };
    expect(savedBody.status).toBe("saved");
    expect(savedBody.contentVersion).toBe(1);

    const got = await req("GET", `/sections/${SEC}/document`);
    const gotBody = (await got.json()) as { source: string; contentVersion: number };
    expect(gotBody.source).toBe("Halo \\LaTeX.");
    expect(gotBody.contentVersion).toBe(1);

    const stale = await req("PUT", `/sections/${SEC}/document`, {
      source: "tanpa baseVersion",
    });
    expect(((await stale.json()) as { status: string }).status).toBe("stale_write");

    const build = await req("GET", `/sections/${SEC}/build`);
    expect(build.status).toBe(200);
    expect(await jsonOrNull(build)).toBeNull();
    const wsBuild = await req("GET", `/workspaces/${WS}/build`);
    expect(await jsonOrNull(wsBuild)).toBeNull();
  });
});
