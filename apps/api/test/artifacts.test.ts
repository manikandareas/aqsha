import { createDb } from "@aqsha/db";
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { processArtifactCleanup } from "../src/workers/artifact-cleanup.worker";

// Mock Clerk token: `Bearer tok_<sub>` → { sub }. Token lain → null (401).
mock.module("../src/clients/clerkToken", () => ({
  verifyClerkToken: async (token: string) =>
    token.startsWith("tok_") ? { sub: token.slice(4), email: null } : null,
}));

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;
const itest = DATABASE_URL ? test : test.skip;
const rltest = DATABASE_URL && REDIS_URL ? test : test.skip;
// Upload live butuh object storage nyata (presign→PUT→finalize). Tanpa kredensial → skip.
const hasS3 = Boolean(
  process.env.S3_BUCKET &&
    process.env.S3_ENDPOINT &&
    !process.env.S3_ENDPOINT.includes("CHANGEME"),
);
const s3test = DATABASE_URL && hasS3 ? test : test.skip;

// Prefix `arttest_` SENGAJA di luar `user_itest_%` — cleanup users-onboarding
// (delete user_itest_%) tak mengenal tabel artifacts → kalau prefix overlap, dia
// gagal FK saat hapus workspaces yang masih direferensi artifacts.
const suffix = Math.floor(Math.random() * 1e9);
const OWNER = `arttest_${suffix}`;
const OTHER = `arttest_other_${suffix}`;
const OWNER_RL = `arttest_rl_${suffix}`;
const WS_A = `wsA_${suffix}`;
const WS_B = `wsB_${suffix}`;
const WS_RL = `wsRL_${suffix}`;
const FOLDER = `f_${suffix}`;

const { app } = await import("../src/index");

const tok = (owner: string) => `tok_${owner}`;
function req(method: string, path: string, token?: string, body?: unknown) {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  return app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}
const get = (path: string, token?: string) => req("GET", path, token);
// biome-ignore lint/suspicious/noExplicitAny: test reads dynamic JSON bodies
function readJson(res: Response): Promise<any> {
  return res.json();
}

async function cleanup() {
  if (!DATABASE_URL) return;
  const { client } = createDb(DATABASE_URL);
  const like = "arttest_%";
  // Child rows via correlated subquery (server-side filter, FK-safe, tanpa array binding).
  await client`delete from artifact_embeddings where artifact_id in (select id from artifacts where owner_user_id like ${like})`;
  await client`delete from artifact_contents where artifact_id in (select id from artifacts where owner_user_id like ${like})`;
  await client`delete from artifact_extractions where artifact_id in (select id from artifacts where owner_user_id like ${like})`;
  await client`delete from artifact_paper_metadata where artifact_id in (select id from artifacts where owner_user_id like ${like})`;
  await client`delete from artifact_urls where artifact_id in (select id from artifacts where owner_user_id like ${like})`;
  await client`delete from artifacts where owner_user_id like ${like}`;
  await client`delete from workspace_folders where owner_user_id like ${like}`;
  await client`delete from workspaces where owner_user_id like ${like}`;
  await client`delete from users where owner_user_id like ${like}`;
  await client.end();
}

async function seed() {
  if (!DATABASE_URL) return;
  const { client } = createDb(DATABASE_URL);
  const now = Date.now();
  for (const o of [OWNER, OTHER, OWNER_RL]) {
    await client`insert into users (owner_user_id, clerk_user_id, created_at, updated_at) values (${o}, ${o}, ${now}, ${now})`;
  }
  for (const [id, owner] of [
    [WS_A, OWNER],
    [WS_B, OWNER],
    [WS_RL, OWNER_RL],
  ] as const) {
    await client`insert into workspaces (id, owner_user_id, name, status, created_at, updated_at) values (${id}, ${owner}, 'WS', 'active', ${now}, ${now})`;
  }
  await client`insert into workspace_folders (id, owner_user_id, workspace_id, name, status, created_at, updated_at) values (${FOLDER}, ${OWNER}, ${WS_A}, 'Bab 1', 'active', ${now}, ${now})`;
  await client.end();
}

beforeAll(async () => {
  await cleanup();
  await seed();
});
afterAll(cleanup);

describe("api artifacts — auth", () => {
  itest("401 tanpa Bearer", async () => {
    const res = await get(`/artifacts/${WS_A}`);
    expect(res.status).toBe(401);
    expect((await readJson(res)).code).toBe("unauthenticated");
  });
});

describe("api artifacts — document CRUD round-trip", () => {
  let docId = "";

  itest("createDocument → get → list", async () => {
    const c = await req("POST", `/workspaces/${WS_A}/documents`, tok(OWNER), { title: "Catatan" });
    expect(c.status).toBe(200);
    docId = (await readJson(c)).artifactId;
    expect(docId).toBeString();

    const g = await readJson(await get(`/artifacts/${docId}`, tok(OWNER)));
    expect(g.artifact._id).toBe(docId);
    expect(g.artifact.artifactType).toBe("markdown");
    expect(g.artifact.title).toBe("Catatan");

    const l = await readJson(await get(`/workspaces/${WS_A}/artifacts`, tok(OWNER)));
    expect(l.items.some((a: { _id: string }) => a._id === docId)).toBe(true);
  });

  itest("updateDocument persists + render-payload reflects", async () => {
    const u = await req("PUT", `/artifacts/${docId}/document`, tok(OWNER), {
      title: "Catatan Riset",
      blocksJson: JSON.stringify([{ type: "paragraph", content: "halo" }]),
      markdown: "# Halo",
      plainText: "halo dunia",
    });
    expect(u.status).toBe(200);

    const rp = await readJson(await get(`/artifacts/${docId}/render-payload`, tok(OWNER)));
    expect(rp.artifactType).toBe("markdown");
    expect(rp.markdown).toBe("# Halo");
    expect(rp.plainText).toBe("halo dunia");
    expect(JSON.parse(rp.blocksJson)[0].content).toBe("halo");

    const g = await readJson(await get(`/artifacts/${docId}`, tok(OWNER)));
    expect(g.artifact.title).toBe("Catatan Riset");
  });

  itest("PATCH rename", async () => {
    const r = await req("PATCH", `/artifacts/${docId}`, tok(OWNER), { title: "Final" });
    expect(r.status).toBe(200);
    const g = await readJson(await get(`/artifacts/${docId}`, tok(OWNER)));
    expect(g.artifact.title).toBe("Final");
  });

  itest("PATCH move WS_A → WS_B cascades content workspace_id", async () => {
    const r = await req("PATCH", `/artifacts/${docId}`, tok(OWNER), { targetWorkspaceId: WS_B });
    expect(r.status).toBe(200);
    const inA = await readJson(await get(`/workspaces/${WS_A}/artifacts`, tok(OWNER)));
    expect(inA.items.some((a: { _id: string }) => a._id === docId)).toBe(false);
    const inB = await readJson(await get(`/workspaces/${WS_B}/artifacts`, tok(OWNER)));
    expect(inB.items.some((a: { _id: string }) => a._id === docId)).toBe(true);
    // cascade: side-table workspace_id ikut pindah
    const { client } = createDb(DATABASE_URL!);
    const rows = await client`select workspace_id from artifact_contents where artifact_id = ${docId}`;
    await client.end();
    expect(rows[0]?.workspace_id).toBe(WS_B);
  });

  itest("folder filter: create-in-folder + list?folderId", async () => {
    const c = await req("POST", `/workspaces/${WS_A}/documents`, tok(OWNER), {
      folderId: FOLDER,
      title: "Di folder",
    });
    expect(c.status).toBe(200);
    const inFolder = (await readJson(c)).artifactId;
    const l = await readJson(await get(`/workspaces/${WS_A}/artifacts?folderId=${FOLDER}`, tok(OWNER)));
    expect(l.items.every((a: { folderId: string }) => a.folderId === FOLDER)).toBe(true);
    expect(l.items.some((a: { _id: string }) => a._id === inFolder)).toBe(true);
  });

  itest("context-picker returns items", async () => {
    const cp = await readJson(await get(`/workspaces/${WS_A}/artifacts/context-picker`, tok(OWNER)));
    expect(Array.isArray(cp.items)).toBe(true);
  });

  itest("ownership: cross-owner get → null, PATCH → 404", async () => {
    const cross = await get(`/artifacts/${docId}`, tok(OTHER));
    expect(cross.status).toBe(200);
    const txt = await cross.text();
    expect(txt === "" || txt === "null").toBe(true);

    const hijack = await req("PATCH", `/artifacts/${docId}`, tok(OTHER), { title: "X" });
    expect(hijack.status).toBe(404);
    expect((await readJson(hijack)).code).toBe("artifact_not_found");
  });

  itest("remove soft-deletes → disappears from list", async () => {
    const r = await req("DELETE", `/artifacts/${docId}`, tok(OWNER));
    expect(r.status).toBe(200);
    const inB = await readJson(await get(`/workspaces/${WS_B}/artifacts`, tok(OWNER)));
    expect(inB.items.some((a: { _id: string }) => a._id === docId)).toBe(false);
  });

  itest("updateDocument on pdf-type → artifact_not_editable_markdown (guard)", async () => {
    // seed a pdf-type artifact directly
    const { client } = createDb(DATABASE_URL!);
    const pdfId = `pdf_${suffix}`;
    const now = Date.now();
    await client`insert into artifacts (id, owner_user_id, workspace_id, artifact_type, artifact_family, source, title, indexing_status, status, created_at, updated_at) values (${pdfId}, ${OWNER}, ${WS_A}, 'pdf', 'file', 'upload', 'P', 'ready', 'active', ${now}, ${now})`;
    await client.end();
    const u = await req("PUT", `/artifacts/${pdfId}/document`, tok(OWNER), { plainText: "x" });
    expect(u.status).toBe(400);
    expect((await readJson(u)).code).toBe("artifact_not_editable_markdown");
  });
});

describe("api artifacts — save URL + cleanup worker", () => {
  itest("saveUrl creates pending url artifact + dedupes", async () => {
    const c = await req("POST", `/workspaces/${WS_A}/artifacts/url`, tok(OWNER), {
      url: "https://example.com/some-article?ref=1",
    });
    expect(c.status).toBe(200);
    const { artifactId } = await readJson(c);
    expect(artifactId).toBeString();

    const g = await readJson(await get(`/artifacts/${artifactId}`, tok(OWNER)));
    expect(g.artifact.artifactType).toBe("url");
    expect(g.artifact.indexingStatus).toBe("pending");
    expect(g.url.normalizedUrl).toBe("https://example.com/some-article?ref=1");

    // dedupe: same normalized url → same artifact
    const dup = await req("POST", `/workspaces/${WS_A}/artifacts/url`, tok(OWNER), {
      url: "https://example.com/some-article?ref=1",
    });
    expect((await readJson(dup)).artifactId).toBe(artifactId);

    // retry resets to pending
    const r = await req("POST", `/artifacts/${artifactId}/retry-url-extraction`, tok(OWNER));
    expect(r.status).toBe(200);
  });

  itest("saveUrl rejects invalid url", async () => {
    const bad = await req("POST", `/workspaces/${WS_A}/artifacts/url`, tok(OWNER), { url: "not-a-url" });
    expect(bad.status).toBe(400);
    expect((await readJson(bad)).code).toBe("url_invalid");
  });

  itest("cleanup worker hard-deletes artifact + children (leak fix)", async () => {
    const c = await req("POST", `/workspaces/${WS_A}/documents`, tok(OWNER), { title: "Sekali pakai" });
    const { artifactId } = await readJson(c);
    // Jalankan cleanup processor langsung (worker proses terpisah); purge tak butuh
    // soft-delete dulu. Hindari DELETE+enqueue (BullMQ) + client baru → cepat & non-flaky.
    // biome-ignore lint/suspicious/noExplicitAny: minimal Job shim for the processor
    await processArtifactCleanup({ data: { ownerUserId: OWNER, artifactId } } as any);
    // hard-deleted (parent + content) → get null (FK order: children dulu baru parent)
    const g = await get(`/artifacts/${artifactId}`, tok(OWNER));
    const txt = await g.text();
    expect(txt === "" || txt === "null").toBe(true);
  });
});

describe("api artifacts — upload pipeline (live S3/MinIO)", () => {
  s3test("presign → PUT → finalize → render text artifact", async () => {
    // step 1: presign
    const p = await req("POST", "/artifacts/upload-url", tok(OWNER), { workspaceId: WS_A });
    expect(p.status).toBe(200);
    const { uploadUrl, key } = await readJson(p);
    expect(key).toBeString();

    // step 2: PUT bytes langsung ke object storage
    const text = "Halo dunia riset.\nBaris kedua.";
    const put = await fetch(uploadUrl, { method: "PUT", body: new TextEncoder().encode(text) });
    expect(put.ok).toBe(true);

    // step 3: finalize
    const fin = await req("POST", `/workspaces/${WS_A}/artifacts/upload`, tok(OWNER), {
      key,
      fileName: "catatan.txt",
      mimeType: "text/plain",
      size: text.length,
    });
    expect(fin.status).toBe(200);
    const { artifactId, title } = await readJson(fin);
    expect(title).toBe("catatan");

    const g = await readJson(await get(`/artifacts/${artifactId}`, tok(OWNER)));
    expect(g.artifact.indexingStatus).toBe("ready");
    expect(g.artifact.artifactType).toBe("plain_text");

    const rp = await readJson(await get(`/artifacts/${artifactId}/render-payload`, tok(OWNER)));
    expect(rp.source).toContain("Halo dunia riset");
  });

  s3test("finalize rejects unsupported type", async () => {
    const p = await req("POST", "/artifacts/upload-url", tok(OWNER), { workspaceId: WS_A });
    const { uploadUrl, key } = await readJson(p);
    await fetch(uploadUrl, { method: "PUT", body: new TextEncoder().encode("<svg/>") });
    const fin = await req("POST", `/workspaces/${WS_A}/artifacts/upload`, tok(OWNER), {
      key,
      fileName: "x.svg",
      mimeType: "image/svg+xml",
      size: 6,
    });
    expect(fin.status).toBe(400);
    expect((await readJson(fin)).code).toBe("upload_unsupported_type");
  });
});

describe("api artifacts — rate limit (create 20/min)", () => {
  rltest("21st create within the minute → 429", async () => {
    // Paralel (bukan 20× sekuensial) supaya cepat di link latensi tinggi; limiter
    // tetap deterministik — 20 consume di window lalu ke-21 ditolak.
    const creates = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        req("POST", `/workspaces/${WS_RL}/documents`, tok(OWNER_RL), { title: `d${i}` }),
      ),
    );
    for (const r of creates) expect(r.status).toBe(200);
    const limited = await req("POST", `/workspaces/${WS_RL}/documents`, tok(OWNER_RL), {
      title: "over",
    });
    expect(limited.status).toBe(429);
    expect((await readJson(limited)).code).toBe("rate_limited");
  });
});
