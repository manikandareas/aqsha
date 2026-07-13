/**
 * Citation Manager Fase 1 — DB integration (butuh Postgres live via DATABASE_URL;
 * tanpa env → skip supaya `bun test` tetap hijau). Invariant yang hanya terbukti
 * di DB nyata:
 *
 *  1. Scoping owner+workspace pada list/count/canonical-lookup — citation workspace
 *     lain dan owner lain TIDAK bocor.
 *  2. Soft delete (`deleted_at`) menghilangkan baris dari list/count tapi tetap
 *     bisa diambil via `findById` (missing-state dokumen Fase 3).
 *  3. Unique partial index `(owner, workspace, provider, external_id)` menolak
 *     duplikat sync-id tapi membiarkan `external_id` null bebas.
 *  4. Upsert-patch `workspace_citation_settings` (insert lalu patch parsial).
 *
 * Isolasi: prefix `itcite_<suffix>`; bersihkan FK-child sebelum users.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createDb } from "../src/client";
import { decodeKeysetCursor } from "../src/cursor";
import { CitationImportBatchRepo } from "../src/repositories/citationImportBatchRepo";
import { WorkspaceCitationRepo } from "../src/repositories/workspaceCitationRepo";
import { WorkspaceCitationSettingsRepo } from "../src/repositories/workspaceCitationSettingsRepo";
import { users } from "../src/schema/users";
import type { NewWorkspaceCitation } from "../src/schema/workspaceCitations";
import { workspaces } from "../src/schema/workspaces";

const DATABASE_URL = process.env.DATABASE_URL;
const itest = DATABASE_URL ? test : test.skip;
const SUFFIX = Math.floor(Math.random() * 1e9);
const OWNER = `itcite_${SUFFIX}`;
const OTHER_OWNER = `itcite_${SUFFIX}_other`;
const WS1 = `itcite_${SUFFIX}:ws1`;
const WS2 = `itcite_${SUFFIX}:ws2`;
const WS_OTHER = `itcite_${SUFFIX}:ws_other`;

const { db, client } = createDb(DATABASE_URL ?? "postgresql://x");

const NOW = 1_700_000_000_000;

function citRow(over: Partial<NewWorkspaceCitation> & { id: string }): NewWorkspaceCitation {
  return {
    ownerUserId: OWNER,
    workspaceId: WS1,
    artifactId: null,
    source: "manual",
    provider: null,
    externalId: null,
    documentType: "article-journal",
    title: `Judul ${over.id}`,
    authorsJson: [{ family: "Penulis", given: "A." }],
    publishedYear: 2024,
    venue: "Jurnal Uji",
    publisher: null,
    doi: null,
    url: null,
    tags: [],
    cslJson: { type: "article-journal", title: `Judul ${over.id}` },
    canonicalKey: `t:${over.id}`,
    metadataStatus: "verified",
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

async function cleanup() {
  if (!DATABASE_URL) return;
  await client`delete from workspace_citations where owner_user_id like ${`itcite_${SUFFIX}%`}`;
  await client`delete from citation_import_batches where owner_user_id like ${`itcite_${SUFFIX}%`}`;
  await client`delete from workspace_citation_settings where owner_user_id like ${`itcite_${SUFFIX}%`}`;
  await client`delete from workspaces where owner_user_id like ${`itcite_${SUFFIX}%`}`;
  await client`delete from users where owner_user_id like ${`itcite_${SUFFIX}%`}`;
}

beforeAll(async () => {
  if (!DATABASE_URL) return;
  await cleanup();
  for (const owner of [OWNER, OTHER_OWNER]) {
    await db.insert(users).values({
      ownerUserId: owner,
      clerkUserId: owner,
      createdAt: NOW,
      updatedAt: NOW,
    });
  }
  for (const [owner, ws] of [
    [OWNER, WS1],
    [OWNER, WS2],
    [OTHER_OWNER, WS_OTHER],
  ] as const) {
    await db.insert(workspaces).values({
      id: ws,
      ownerUserId: owner,
      name: "Workspace uji",
      createdAt: NOW,
      updatedAt: NOW,
    });
  }
});

afterAll(async () => {
  await cleanup();
  if (DATABASE_URL) await client.end();
});

describe("WorkspaceCitationRepo scoping", () => {
  itest("list/count hanya melihat workspace+owner sendiri; soft-deleted hilang dari list", async () => {
    await WorkspaceCitationRepo.insertMany(db, [
      citRow({ id: `${OWNER}:c1`, updatedAt: NOW + 1 }),
      citRow({ id: `${OWNER}:c2`, updatedAt: NOW + 2, tags: ["metode"] }),
      citRow({ id: `${OWNER}:c3`, updatedAt: NOW + 3, workspaceId: WS2 }),
      citRow({
        id: `${OWNER}:c4`,
        updatedAt: NOW + 4,
        ownerUserId: OTHER_OWNER,
        workspaceId: WS_OTHER,
      }),
    ]);

    const list = await WorkspaceCitationRepo.listByWorkspace(db, {
      ownerUserId: OWNER,
      workspaceId: WS1,
      limit: 10,
      cursor: null,
    });
    expect(list.items.map((i) => i.id).sort()).toEqual([`${OWNER}:c1`, `${OWNER}:c2`]);
    expect(await WorkspaceCitationRepo.countActive(db, OWNER, WS1)).toBe(2);

    // Filter tag array-contains.
    const tagged = await WorkspaceCitationRepo.listByWorkspace(db, {
      ownerUserId: OWNER,
      workspaceId: WS1,
      limit: 10,
      cursor: null,
      filters: { tag: "metode" },
    });
    expect(tagged.items.map((i) => i.id)).toEqual([`${OWNER}:c2`]);

    // Soft delete → hilang dari list/count, masih ketemu via findById (missing-state).
    await WorkspaceCitationRepo.updateById(db, `${OWNER}:c2`, { deletedAt: NOW + 10 });
    expect(await WorkspaceCitationRepo.countActive(db, OWNER, WS1)).toBe(1);
    const found = await WorkspaceCitationRepo.findById(db, OWNER, `${OWNER}:c2`);
    expect(found?.deletedAt).toBe(NOW + 10);

    // Owner lain tidak bisa membaca via findById.
    expect(await WorkspaceCitationRepo.findById(db, OTHER_OWNER, `${OWNER}:c1`)).toBeNull();
  });

  itest("keyset pagination stabil (updated_at desc, id tiebreak)", async () => {
    const ids = Array.from({ length: 5 }, (_, i) => `${OWNER}:p${i}`);
    await WorkspaceCitationRepo.insertMany(
      db,
      // updatedAt SAMA semua → keyset jatuh ke tiebreaker id.
      ids.map((id) => citRow({ id, workspaceId: WS2, updatedAt: NOW + 100 })),
    );
    const page1 = await WorkspaceCitationRepo.listByWorkspace(db, {
      ownerUserId: OWNER,
      workspaceId: WS2,
      limit: 3,
      cursor: null,
    });
    expect(page1.items.length).toBe(3);
    expect(page1.nextCursor).not.toBeNull();
    const page2 = await WorkspaceCitationRepo.listByWorkspace(db, {
      ownerUserId: OWNER,
      workspaceId: WS2,
      limit: 3,
      cursor: decodeKeysetCursor(page1.nextCursor),
    });
    const seen = [...page1.items, ...page2.items].map((i) => i.id);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.length).toBeGreaterThanOrEqual(5);
  });

  itest("unique partial (owner,workspace,provider,external_id) menolak duplikat sync", async () => {
    await WorkspaceCitationRepo.insert(
      db,
      citRow({
        id: `${OWNER}:x1`,
        source: "provider_sync",
        provider: "zotero",
        externalId: "ZOT-1",
      }),
    );
    await expect(
      WorkspaceCitationRepo.insert(
        db,
        citRow({
          id: `${OWNER}:x2`,
          source: "provider_sync",
          provider: "zotero",
          externalId: "ZOT-1",
        }),
      ),
    ).rejects.toThrow();
    // external_id null bebas berulang.
    await WorkspaceCitationRepo.insert(db, citRow({ id: `${OWNER}:x3` }));
    await WorkspaceCitationRepo.insert(db, citRow({ id: `${OWNER}:x4` }));
  });

  itest("findActiveByCanonicalKeys scoped ke workspace", async () => {
    const hits = await WorkspaceCitationRepo.findActiveByCanonicalKeys(db, OWNER, WS1, [
      `t:${OWNER}:c1`,
      `t:${OWNER}:c3`, // hidup di WS2 → tidak boleh ikut
    ]);
    expect(hits.map((h) => h.id)).toEqual([`${OWNER}:c1`]);
  });
});

describe("WorkspaceCitationSettingsRepo", () => {
  itest("upsert insert lalu patch parsial", async () => {
    const base = {
      workspaceId: WS1,
      ownerUserId: OWNER,
      defaultStyleId: "apa-7",
      bibliographySort: "author",
      createdAt: NOW,
      updatedAt: NOW,
    };
    await WorkspaceCitationSettingsRepo.upsert(db, base, {});
    let row = await WorkspaceCitationSettingsRepo.findByWorkspace(db, WS1);
    expect(row?.defaultStyleId).toBe("apa-7");

    await WorkspaceCitationSettingsRepo.upsert(
      db,
      { ...base, updatedAt: NOW + 5 },
      { defaultStyleId: "ieee" },
    );
    row = await WorkspaceCitationSettingsRepo.findByWorkspace(db, WS1);
    expect(row?.defaultStyleId).toBe("ieee");
    expect(row?.bibliographySort).toBe("author");
    expect(row?.updatedAt).toBe(NOW + 5);
  });
});

describe("CitationImportBatchRepo", () => {
  itest("insert/find/update scoped owner", async () => {
    const id = `${OWNER}:batch1`;
    await CitationImportBatchRepo.insert(db, {
      id,
      ownerUserId: OWNER,
      workspaceId: WS1,
      sourceKind: "file",
      format: "bibtex",
      originalFilename: "refs.bib",
      totalCount: 3,
      validCount: 2,
      duplicateCount: 1,
      errorCount: 0,
      recordsJson: [{ index: 0 }],
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(await CitationImportBatchRepo.findById(db, OTHER_OWNER, id)).toBeNull();
    await CitationImportBatchRepo.updateById(db, id, {
      status: "committed",
      committedAt: NOW + 1,
      recordsJson: null,
    });
    const row = await CitationImportBatchRepo.findById(db, OWNER, id);
    expect(row?.status).toBe("committed");
    expect(row?.recordsJson).toBeNull();
  });
});
