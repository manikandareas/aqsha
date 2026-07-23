/**
 * Citation Manager — itest route perpustakaan akun (`/citations*`) + koleksi per
 * proyek (`/workspaces/:id/citations*`) (butuh Postgres live via DATABASE_URL;
 * tanpa env → skip). Fokus kontrak API: owner CRUD round-trip, isolasi user lain,
 * import preview→commit multipart account-level (tanpa auto-link proyek), export,
 * link perpustakaan↔proyek, settings per proyek.
 */
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { createDb } from "@aqsha/db";

mock.module("../src/clients/clerkToken", () => ({
  verifyClerkToken: async (token: string) =>
    token.startsWith("tok_") ? { sub: token.slice(4), email: null } : null,
}));

const DATABASE_URL = process.env.DATABASE_URL;
const itest = DATABASE_URL ? test : test.skip;

const suffix = Math.floor(Math.random() * 1e9);
const OWNER = `user_itest_cit_a_${suffix}`;
const INTRUDER = `user_itest_cit_b_${suffix}`;

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

function reqMultipart(path: string, token: string, fileName: string, content: string) {
  const form = new FormData();
  form.append("file", new File([content], fileName, { type: "application/octet-stream" }));
  return app.handle(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: form,
    }),
  );
}

// biome-ignore lint/suspicious/noExplicitAny: test reads dynamic JSON bodies
function readJson(res: Response): Promise<any> {
  return res.json();
}

const BIB = `@article{doe2020,
 title = {Entry Uji Satu},
 author = {Doe, Jane and Roe, Rick},
 year = {2020},
 journal = {Jurnal Uji},
 doi = {10.9999/itest.1}
}
@book{moleong2017,
 title = {Metodologi penelitian kualitatif},
 author = {Moleong, Lexy J.},
 publisher = {Remaja Rosdakarya},
 year = {2017}
}
`;

async function cleanup() {
  if (!DATABASE_URL) return;
  const { client } = createDb(DATABASE_URL);
  await client`delete from workspace_citation_links where citation_id in (select id from citations where owner_user_id like 'user_itest_cit_%')`;
  await client`delete from citations where owner_user_id like 'user_itest_cit_%'`;
  await client`delete from citation_import_batches where owner_user_id like 'user_itest_cit_%'`;
  await client`delete from workspace_citation_settings where owner_user_id like 'user_itest_cit_%'`;
  await client`delete from artifact_paper_metadata where owner_user_id like 'user_itest_cit_%'`;
  await client`delete from artifacts where owner_user_id like 'user_itest_cit_%'`;
  await client`delete from workspace_folders where owner_user_id like 'user_itest_cit_%'`;
  await client`delete from workspaces where owner_user_id like 'user_itest_cit_%'`;
  await client`delete from user_onboarding where owner_user_id like 'user_itest_cit_%'`;
  await client`delete from user_feed_interests where owner_user_id like 'user_itest_cit_%'`;
  await client`delete from users where owner_user_id like 'user_itest_cit_%'`;
  await client.end();
}

/** Seed langsung artifact PDF + 1:1 paper metadata (createFromArtifact butuh keduanya). */
async function seedPaperArtifact(
  owner: string,
  workspaceId: string,
  over: { title?: string; doi?: string | null; year?: number | null } = {},
): Promise<string> {
  const { client } = createDb(DATABASE_URL as string);
  const artifactId = `art_itest_${owner}_${Math.floor(Math.random() * 1e9)}`;
  const metaId = `pm_itest_${owner}_${Math.floor(Math.random() * 1e9)}`;
  const now = Date.now();
  const title = over.title ?? "Paper Bridge";
  const authors = JSON.stringify([{ name: "Budi Santoso" }, { name: "Ani Wijaya" }]);
  await client`insert into artifacts
    (id, owner_user_id, workspace_id, artifact_type, artifact_family, source, title, indexing_status, status, created_at, updated_at)
    values (${artifactId}, ${owner}, ${workspaceId}, 'pdf', 'file', 'upload', ${title}, 'not_indexed', 'active', ${now}, ${now})`;
  await client`insert into artifact_paper_metadata
    (id, owner_user_id, artifact_id, workspace_id, metadata_source, title, authors, published_year, journal, doi, created_at, updated_at)
    values (${metaId}, ${owner}, ${artifactId}, ${workspaceId}, 'crossref', ${title}, ${authors}::jsonb, ${over.year ?? 2021}, 'Jurnal Bridge', ${over.doi ?? null}, ${now}, ${now})`;
  await client.end();
  return artifactId;
}

beforeAll(cleanup);
afterAll(cleanup);

let workspaceId = "";
let manualId = "";

describe("api citations — setup", () => {
  itest("provision owner + intruder + ambil workspace default", async () => {
    for (const owner of [OWNER, INTRUDER]) {
      const r = await req("POST", "/users/me/sync", tok(owner));
      expect(r.status).toBe(200);
    }
    const list = await req("GET", "/workspaces", tok(OWNER));
    expect(list.status).toBe(200);
    const body = await readJson(list);
    workspaceId = body.items?.[0]?.id ?? body[0]?.id;
    expect(workspaceId).toBeString();
  });
});

describe("api citations — CRUD perpustakaan owner", () => {
  itest("create manual → list → detail → patch tags → salin via render", async () => {
    const create = await req("POST", "/citations", tok(OWNER), {
      fields: {
        title: "Referensi Manual",
        authors: [{ family: "Sari", given: "Dewi" }],
        publishedYear: 2022,
        venue: "Jurnal Manual",
      },
      tags: ["metode"],
    });
    expect(create.status).toBe(200);
    const detail = await readJson(create);
    manualId = detail.id;
    expect(detail.metadataStatus).toBe("verified");
    expect(detail.tags).toEqual(["metode"]);

    const list = await req("GET", "/citations", tok(OWNER));
    const listBody = await readJson(list);
    expect(listBody.total).toBe(1);
    expect(listBody.items[0].title).toBe("Referensi Manual");

    const patch = await req("PATCH", `/citations/${manualId}`, tok(OWNER), {
      tags: ["metode", "bab-2"],
    });
    expect(patch.status).toBe(200);
    expect((await readJson(patch)).tags).toEqual(["metode", "bab-2"]);

    const render = await req("POST", `/workspaces/${workspaceId}/citations/render`, tok(OWNER), {
      citationIds: [manualId],
    });
    const rendered = await readJson(render);
    expect(rendered.styleId).toBe("apa-7");
    expect(rendered.entries[0].text).toContain("Sari, D. (2022)");
  });

  itest("create manual duplikat → 409 citation_duplicate", async () => {
    const dup = await req("POST", "/citations", tok(OWNER), {
      fields: {
        title: "Referensi Manual",
        authors: [{ family: "Sari", given: "Dewi" }],
        publishedYear: 2022,
      },
    });
    expect(dup.status).toBe(409);
    expect((await readJson(dup)).code).toBe("citation_duplicate");
  });

  itest("create manual onDuplicate return-existing → id sama, created:false, tanpa 409", async () => {
    const first = await req("POST", "/citations", tok(OWNER), {
      fields: { title: "Referensi Dedupe Return" },
    });
    expect(first.status).toBe(200);
    const firstBody = await readJson(first);
    expect(firstBody.created).toBe(true);

    const second = await req("POST", "/citations", tok(OWNER), {
      fields: { title: "Referensi Dedupe Return" },
      onDuplicate: "return-existing",
    });
    expect(second.status).toBe(200);
    const secondBody = await readJson(second);
    expect(secondBody.created).toBe(false);
    expect(secondBody.id).toBe(firstBody.id);

    // Bersihkan supaya hitungan total di describe berikutnya (import preview/commit) tak bergeser.
    await req("DELETE", `/citations/${firstBody.id}`, tok(OWNER));
  });

  itest("render account-level (tanpa workspace) → 200 default apa-7", async () => {
    const res = await req("POST", "/citations/render", tok(OWNER), {
      citationIds: [manualId],
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.styleId).toBe("apa-7");
  });

  itest("user lain: perpustakaannya sendiri kosong; detail/patch item owner → 404", async () => {
    const list = await readJson(await req("GET", "/citations", tok(INTRUDER)));
    expect(list.total).toBe(0);
    const detail = await req("GET", `/citations/${manualId}`, tok(INTRUDER));
    expect(detail.status).toBe(404);
    const patch = await req("PATCH", `/citations/${manualId}`, tok(INTRUDER), { tags: ["x"] });
    expect(patch.status).toBe(404);
  });
});

describe("api citations — link perpustakaan ↔ proyek", () => {
  itest("link → tampil di koleksi proyek dinormalisasi; filter/pagination; unlink → hilang", async () => {
    const link = await req(
      "POST",
      `/workspaces/${workspaceId}/citations/${manualId}/link`,
      tok(OWNER),
      {},
    );
    expect(link.status).toBe(200);

    const inProject = await readJson(
      await req("GET", `/workspaces/${workspaceId}/citations`, tok(OWNER)),
    );
    const linked = inProject.items.find((i: { id: string }) => i.id === manualId);
    expect(linked).toBeDefined();
    expect(linked.authors).toEqual([{ family: "Sari", given: "Dewi" }]);
    expect(linked.authorsJson).toBeUndefined();
    expect(linked.linkId).toBeUndefined();
    expect(inProject.total).toBeGreaterThanOrEqual(1);

    const filtered = await req(
      "GET",
      `/workspaces/${workspaceId}/citations?limit=1&q=Referensi&status=verified&source=manual&tag=metode`,
      tok(OWNER),
    );
    expect(filtered.status).toBe(200);
    const body = await readJson(filtered);
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(body.items[0]).toEqual(
      expect.objectContaining({
        id: manualId,
        authors: [{ family: "Sari", given: "Dewi" }],
      }),
    );
    expect(body.items[0].authorsJson).toBeUndefined();

    // Idempotent: link ulang tidak menggandakan.
    await req("POST", `/workspaces/${workspaceId}/citations/${manualId}/link`, tok(OWNER), {});
    const after = await readJson(
      await req("GET", `/workspaces/${workspaceId}/citations`, tok(OWNER)),
    );
    expect(after.items.filter((i: { id: string }) => i.id === manualId).length).toBe(1);

    const unlink = await req(
      "DELETE",
      `/workspaces/${workspaceId}/citations/${manualId}/link`,
      tok(OWNER),
    );
    expect(unlink.status).toBe(200);
    const empty = await readJson(
      await req("GET", `/workspaces/${workspaceId}/citations`, tok(OWNER)),
    );
    expect(empty.items.some((i: { id: string }) => i.id === manualId)).toBe(false);
  });

  itest("intruder tidak bisa membaca koleksi proyek owner", async () => {
    const res = await req("GET", `/workspaces/${workspaceId}/citations`, tok(INTRUDER));
    expect(res.status).toBe(404);
  });

  itest("candidates / scoped detail / bulk-unlink / scoped export", async () => {
    const other = await readJson(
      await req("POST", "/citations", tok(OWNER), {
        fields: {
          title: "Referensi Global Saja",
          authors: [{ family: "Global", given: "Only" }],
          publishedYear: 2021,
        },
      }),
    );
    const otherId = other.id as string;

    await req("POST", `/workspaces/${workspaceId}/citations/${manualId}/link`, tok(OWNER), {});

    const before = await readJson(
      await req("GET", `/workspaces/${workspaceId}/citations/candidates?q=Referensi`, tok(OWNER)),
    );
    const manualCand = before.items.find((i: { id: string }) => i.id === manualId);
    const otherCand = before.items.find((i: { id: string }) => i.id === otherId);
    expect(manualCand?.linked).toBe(true);
    expect(otherCand?.linked).toBe(false);

    const detail = await req(
      "GET",
      `/workspaces/${workspaceId}/citations/${manualId}`,
      tok(OWNER),
    );
    expect(detail.status).toBe(200);

    const forged = await req(
      "GET",
      `/workspaces/${workspaceId}/citations/${otherId}`,
      tok(OWNER),
    );
    expect(forged.status).toBe(404);

    const exportOk = await req(
      "GET",
      `/workspaces/${workspaceId}/citations/export?format=bibtex`,
      tok(OWNER),
    );
    expect(exportOk.status).toBe(200);
    const exportText = await exportOk.text();
    // biblatex braces title words: `Referensi {Manual}`
    expect(exportText).toContain("Sari2022Referensi");
    expect(exportText).not.toContain("Global");

    const exportForged = await req(
      "GET",
      `/workspaces/${workspaceId}/citations/export?format=bibtex&ids=${manualId},${otherId}`,
      tok(OWNER),
    );
    expect(exportForged.status).toBe(404);

    const unlink = await readJson(
      await req("POST", `/workspaces/${workspaceId}/citations/bulk-unlink`, tok(OWNER), {
        ids: [manualId],
      }),
    );
    expect(unlink.affected).toBe(1);

    const after = await readJson(
      await req("GET", `/workspaces/${workspaceId}/citations/candidates?q=Referensi+Manual`, tok(OWNER)),
    );
    expect(after.items.find((i: { id: string }) => i.id === manualId)?.linked).toBe(false);

    const stillGlobal = await req("GET", `/citations/${manualId}`, tok(OWNER));
    expect(stillGlobal.status).toBe(200);

    // Kembalikan total library ke 1 agar assert import berikutnya tetap valid.
    await req("DELETE", `/citations/${otherId}`, tok(OWNER));
  });
});

describe("api citations — import preview + commit", () => {
  let batchId = "";

  // Dijalankan sebelum preview/commit lain agar tidak kena rate limit citations:import.
  itest("scoped create + scoped import commit → langsung di proyek dan global", async () => {
    const createdRes = await req("POST", `/workspaces/${workspaceId}/citations`, tok(OWNER), {
      fields: {
        title: "Referensi Scoped Manual",
        authors: [{ family: "Scoped", given: "User" }],
        publishedYear: 2023,
      },
    });
    expect(createdRes.status).toBe(200);
    const created = await readJson(createdRes);
    expect(created.created).toBe(true);
    const scopedId = created.id as string;

    const inProject = await readJson(
      await req("GET", `/workspaces/${workspaceId}/citations?q=Scoped+Manual`, tok(OWNER)),
    );
    expect(inProject.items.some((i: { id: string }) => i.id === scopedId)).toBe(true);

    const global = await readJson(await req("GET", `/citations?q=Scoped+Manual`, tok(OWNER)));
    expect(global.items.filter((i: { id: string }) => i.id === scopedId).length).toBe(1);

    const scopedBib = `@article{scopedonly,
 title = {Entry Scoped Import},
 author = {Scoped, Import},
 year = {2018},
 journal = {Jurnal Scoped}
}
`;
    const previewRes = await reqMultipart(
      "/citations/imports/preview",
      tok(OWNER),
      "scoped.bib",
      scopedBib,
    );
    expect(previewRes.status).toBe(200);
    const preview = await readJson(previewRes);
    const commitRes = await req("POST", `/citations/imports/${preview.batchId}/commit`, tok(OWNER), {
      selectedIndexes: [0],
      duplicatePolicy: "skip",
      workspaceId,
    });
    expect(commitRes.status).toBe(200);
    const commit = await readJson(commitRes);
    expect(commit).toEqual(
      expect.objectContaining({ created: 1, merged: 0, skipped: 0, linked: 1 }),
    );

    const projectAfter = await readJson(
      await req("GET", `/workspaces/${workspaceId}/citations?q=Scoped+Import`, tok(OWNER)),
    );
    expect(projectAfter.total).toBeGreaterThanOrEqual(1);
    const stillGlobal = await readJson(
      await req("GET", `/citations?q=Scoped+Import`, tok(OWNER)),
    );
    expect(stillGlobal.items.length).toBe(1);
  });

  itest("preview multipart .bib → counts + records, belum membuat citation", async () => {
    const res = await reqMultipart(
      "/citations/imports/preview",
      tok(OWNER),
      "refs.bib",
      BIB,
    );
    expect(res.status).toBe(200);
    const preview = await readJson(res);
    batchId = preview.batchId;
    expect(preview.format).toBe("bibtex");
    expect(preview.records.length).toBe(2);
    expect(preview.counts.error).toBe(0);

    const list = await readJson(await req("GET", "/citations", tok(OWNER)));
    // manual + scoped manual + scoped import (preview ini tidak menambah)
    expect(list.total).toBe(3);
  });

  itest("file malformed → 400, tidak ada record dibuat", async () => {
    const res = await reqMultipart(
      "/citations/imports/preview",
      tok(OWNER),
      "bukan.bib",
      "isi acak tanpa format bibliografi",
    );
    expect(res.status).toBe(400);
    expect((await readJson(res)).code).toBe("citation_import_invalid");
  });

  itest("commit selected → created ke perpustakaan akun; batch tak bisa commit dua kali", async () => {
    const res = await req(
      "POST",
      `/citations/imports/${batchId}/commit`,
      tok(OWNER),
      { selectedIndexes: [0, 1], duplicatePolicy: "skip" },
    );
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ created: 2, merged: 0, skipped: 0, linked: 0 });

    // Hasil import masuk perpustakaan akun (bukan koleksi proyek — tanpa workspaceId).
    const list = await readJson(await req("GET", "/citations", tok(OWNER)));
    expect(list.total).toBe(5); // 3 sebelumnya + 2 hasil import global

    const again = await req(
      "POST",
      `/citations/imports/${batchId}/commit`,
      tok(OWNER),
      { selectedIndexes: [0], duplicatePolicy: "skip" },
    );
    // Suite padat bisa kena rate limit citations:import; unit test cover 409 committed.
    if (again.status !== 429) {
      expect(again.status).toBe(409);
      expect((await readJson(again)).code).toBe("citation_batch_committed");
    }
  });

  itest("intruder tidak bisa commit batch owner", async () => {
    const res = await req(
      "POST",
      `/citations/imports/${batchId}/commit`,
      tok(INTRUDER),
      { selectedIndexes: [0], duplicatePolicy: "skip" },
    );
    expect(res.status).toBe(404);
  });
});

describe("api citations — export + settings + delete", () => {
  itest("export bibtex (semua) mengandung entry import", async () => {
    const res = await req("GET", "/citations/export?format=bibtex", tok(OWNER));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("sitasi.bib");
    // Exporter membungkus kata kapital dengan brace ({Uji}) — assert per-entry key + field stabil.
    const content = await res.text();
    expect(content).toContain("@article{doe2020");
    expect(content).toContain("doi = {10.9999/itest.1}");
    expect(content).toContain("author = {Sari, Dewi}");
  });

  itest("settings default apa-7 → patch ieee → render ikut style baru", async () => {
    const initial = await readJson(
      await req("GET", `/workspaces/${workspaceId}/citation-settings`, tok(OWNER)),
    );
    expect(initial).toEqual({ defaultStyleId: "apa-7", bibliographySort: "author" });

    const patched = await readJson(
      await req("PATCH", `/workspaces/${workspaceId}/citation-settings`, tok(OWNER), {
        defaultStyleId: "ieee",
      }),
    );
    expect(patched.defaultStyleId).toBe("ieee");

    const render = await readJson(
      await req("POST", `/workspaces/${workspaceId}/citations/render`, tok(OWNER), {
        citationIds: [manualId],
      }),
    );
    expect(render.styleId).toBe("ieee");
    expect(render.entries[0].text).toStartWith("[1]");
  });

  itest("soft delete → hilang dari list, detail masih bisa dibuka (missing state)", async () => {
    const del = await req("DELETE", `/citations/${manualId}`, tok(OWNER));
    expect(del.status).toBe(200);
    const list = await readJson(await req("GET", "/citations", tok(OWNER)));
    expect(list.items.map((i: { id: string }) => i.id)).not.toContain(manualId);
    const detail = await readJson(await req("GET", `/citations/${manualId}`, tok(OWNER)));
    expect(detail.deletedAt).toBeNumber();
  });
});

describe("api citations — artifact bridge", () => {
  let artifactId = "";
  let citationId = "";

  itest("createFromArtifact: seed paper → tambah (source artifact, tertaut + linked) → idempotent", async () => {
    artifactId = await seedPaperArtifact(OWNER, workspaceId, {
      title: "Paper Bridge Satu",
      doi: "10.5555/bridge.1",
      year: 2021,
    });
    const res = await req("POST", `/workspaces/${workspaceId}/citations/from-artifact`, tok(OWNER), {
      artifactId,
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.created).toBe(true);
    expect(body.citation.source).toBe("artifact");
    expect(body.citation.artifactId).toBe(artifactId);
    expect(body.citation.metadataStatus).toBe("needs_review");
    citationId = body.citation.id;

    // Ikut masuk koleksi proyek.
    const inProject = await readJson(
      await req("GET", `/workspaces/${workspaceId}/citations`, tok(OWNER)),
    );
    expect(inProject.items.some((i: { id: string }) => i.id === citationId)).toBe(true);

    const again = await readJson(
      await req("POST", `/workspaces/${workspaceId}/citations/from-artifact`, tok(OWNER), {
        artifactId,
      }),
    );
    expect(again.created).toBe(false);
    expect(again.linkedExisting).toBe(true);
    expect(again.citation.id).toBe(citationId);
  });

  itest("intruder from-artifact → 404 (metadata owner-scoped)", async () => {
    const res = await req(
      "POST",
      `/workspaces/${workspaceId}/citations/from-artifact`,
      tok(INTRUDER),
      { artifactId },
    );
    expect(res.status).toBe(404);
  });

  itest("artifact tanpa metadata → 404 citation_artifact_no_metadata", async () => {
    const res = await req("POST", `/workspaces/${workspaceId}/citations/from-artifact`, tok(OWNER), {
      artifactId: "art_tidak_ada",
    });
    expect(res.status).toBe(404);
    expect((await readJson(res)).code).toBe("citation_artifact_no_metadata");
  });
});

describe("api citations — duplicates + bulk", () => {
  let dupA = "";
  let dupB = "";
  let bulkA = "";
  let bulkB = "";

  itest("dua duplikat (allowDuplicate) → grup duplikat → merge menyisakan satu", async () => {
    const fields = {
      title: "Referensi Kembar",
      authors: [{ family: "Kembar", given: "Satu" }],
      publishedYear: 2019,
    };
    dupA = (await readJson(await req("POST", "/citations", tok(OWNER), { fields }))).id;
    dupB = (
      await readJson(await req("POST", "/citations", tok(OWNER), { fields, allowDuplicate: true }))
    ).id;

    const groups = await readJson(await req("GET", "/citations/duplicates", tok(OWNER)));
    const group = groups.find(
      (g: { members: Array<{ id: string }> }) =>
        g.members.some((m) => m.id === dupA) && g.members.some((m) => m.id === dupB),
    );
    expect(group).toBeDefined();

    const merged = await req("POST", "/citations/merge", tok(OWNER), { ids: [dupA, dupB] });
    expect(merged.status).toBe(200);
    const target = await readJson(merged);
    const survivorId = target.id;
    const goneId = survivorId === dupA ? dupB : dupA;
    const gone = await readJson(await req("GET", `/citations/${goneId}`, tok(OWNER)));
    expect(gone.deletedAt).toBeNumber();
  });

  itest("bulk-tag menambah tag ke terpilih, bulk-delete menghapus terpilih", async () => {
    bulkA = (
      await readJson(
        await req("POST", "/citations", tok(OWNER), {
          fields: { title: "Bulk Satu", authors: [{ family: "A" }], publishedYear: 2018 },
        }),
      )
    ).id;
    bulkB = (
      await readJson(
        await req("POST", "/citations", tok(OWNER), {
          fields: { title: "Bulk Dua", authors: [{ family: "B" }], publishedYear: 2017 },
        }),
      )
    ).id;

    const tagged = await readJson(
      await req("POST", "/citations/bulk-tag", tok(OWNER), {
        ids: [bulkA, bulkB],
        tags: ["batch-x"],
      }),
    );
    expect(tagged.affected).toBe(2);
    const detailA = await readJson(await req("GET", `/citations/${bulkA}`, tok(OWNER)));
    expect(detailA.tags).toContain("batch-x");

    const deleted = await readJson(
      await req("POST", "/citations/bulk-delete", tok(OWNER), { ids: [bulkA, bulkB] }),
    );
    expect(deleted.affected).toBe(2);
    const list = await readJson(await req("GET", "/citations", tok(OWNER)));
    const ids = list.items.map((i: { id: string }) => i.id);
    expect(ids).not.toContain(bulkA);
    expect(ids).not.toContain(bulkB);
  });

  itest("intruder merge citation owner → 404 (item bukan miliknya)", async () => {
    const merge = await req("POST", "/citations/merge", tok(INTRUDER), { ids: [dupA, dupB] });
    expect(merge.status).toBe(404);
  });
});

describe("api citations — bibliography proyek (GET /workspaces/:id/bibliography)", () => {
  itest("proyek tanpa usage sitasi (belum ada bab tersimpan) → entries kosong", async () => {
    const res = await req("GET", `/workspaces/${workspaceId}/bibliography`, tok(OWNER));
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.entries).toEqual([]);
    expect(body.styleId).toBeString();
  });

  itest("intruder tidak bisa membaca bibliography proyek owner", async () => {
    const res = await req("GET", `/workspaces/${workspaceId}/bibliography`, tok(INTRUDER));
    expect(res.status).toBe(404);
  });
});

describe("api citations — render dokumen", () => {
  let cA = "";
  let cB = "";

  itest("render-document: in-text per cluster + bibliography used-in-doc + missingIds", async () => {
    cA = (
      await readJson(
        await req("POST", "/citations", tok(OWNER), {
          fields: {
            title: "Dokumen Referensi A",
            authors: [{ family: "Alpha", given: "A." }],
            publishedYear: 2020,
            venue: "Jurnal A",
          },
        }),
      )
    ).id;
    cB = (
      await readJson(
        await req("POST", "/citations", tok(OWNER), {
          fields: {
            title: "Dokumen Referensi B",
            authors: [{ family: "Beta", given: "B." }],
            publishedYear: 2019,
            venue: "Jurnal B",
          },
        }),
      )
    ).id;

    const res = await req(
      "POST",
      `/workspaces/${workspaceId}/citations/render-document`,
      tok(OWNER),
      {
        styleId: "ieee",
        clusters: [
          { nodeId: "n1", citationIds: [cA] },
          { nodeId: "n2", citationIds: [cB, cA] },
          { nodeId: "n3", citationIds: ["missing_xyz"] },
        ],
      },
    );
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.styleId).toBe("ieee");
    const clusterText = (nodeId: string) =>
      body.clusters.find((c: { nodeId: string }) => c.nodeId === nodeId)?.text;
    expect(clusterText("n1")).toBe("[1]");
    // n2 memakai B (baru → 2) + A (sudah 1) → mengandung kedua nomor.
    expect(clusterText("n2")).toContain("[1]");
    expect(clusterText("n2")).toContain("[2]");
    // Cluster semua-missing → teks kosong (bukan menghilang diam-diam).
    expect(clusterText("n3")).toBe("");
    expect(body.missingIds).toEqual(["missing_xyz"]);
    // Bibliography IEEE terurut kemunculan → A lalu B; hanya yang dipakai.
    expect(body.bibliography.map((b: { id: string }) => b.id)).toEqual([cA, cB]);
  });

  itest("intruder render-document → 404", async () => {
    const res = await req(
      "POST",
      `/workspaces/${workspaceId}/citations/render-document`,
      tok(INTRUDER),
      { clusters: [{ nodeId: "n1", citationIds: [cA] }] },
    );
    expect(res.status).toBe(404);
  });
});
