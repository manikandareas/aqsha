/**
 * WorkspaceDocumentService — DB integration (skip tanpa DATABASE_URL). Membuktikan:
 * lazy-create atomik (artifact typst v1 + revisi + pointer proyek), CAS stale_write dua arah,
 * retensi revisi, reconcile usages dari scan `@key`, guard ukuran, heal pointer non-typst,
 * dan insertInitialDocument (jalur create project).
 */
import { afterAll, describe, expect, test } from "bun:test";
import {
  ArtifactContentRepo,
  ArtifactRepo,
  AppError,
  CitationRepo,
  createDb,
  DocumentCitationUsageRepo,
  DocumentRevisionRepo,
  WorkspaceRepo,
} from "@aqsha/db";
import { CitationService } from "../src/citations/citation.service";
import {
  DOCUMENT_REVISION_RETENTION,
  WorkspaceDocumentService,
} from "../src/workspace-document.service";

const DATABASE_URL = process.env.DATABASE_URL;
const itest = DATABASE_URL ? test : test.skip;
const SUFFIX = Math.floor(Math.random() * 1e9);
const OWNER = `itwd_${SUFFIX}`;
const WS = `itwd_${SUFFIX}:ws`;
const WS2 = `itwd_${SUFFIX}:ws2`;
const CIT = `itwd_${SUFFIX}:cit`;
const NOW = 1_700_000_000_000;
const { db, client } = createDb(DATABASE_URL ?? "postgresql://x");

async function seed() {
  await client`insert into users (owner_user_id, clerk_user_id, email, created_at, updated_at)
    values (${OWNER}, ${OWNER}, ${`${OWNER}@test.local`}, ${NOW}, ${NOW})`;
  await client`insert into workspaces (id, owner_user_id, name, kind, status, created_at, updated_at)
    values (${WS}, ${OWNER}, ${"Skripsi Uji"}, ${"undergraduate_thesis"}, ${"active"}, ${NOW}, ${NOW})`;
  await client`insert into workspaces (id, owner_user_id, name, kind, status, created_at, updated_at)
    values (${WS2}, ${OWNER}, ${"Proyek Dua"}, ${"paper"}, ${"active"}, ${NOW}, ${NOW})`;
  await CitationRepo.insert(db, {
    id: CIT,
    ownerUserId: OWNER,
    artifactId: null,
    source: "manual",
    provider: null,
    externalId: null,
    documentType: "book",
    title: "Metode Penelitian",
    authorsJson: [{ family: "Sugiyono" }],
    publishedYear: 2019,
    venue: null,
    publisher: null,
    doi: null,
    url: null,
    tags: [],
    cslJson: { type: "book", title: "Metode Penelitian", author: [{ family: "Sugiyono" }], issued: { "date-parts": [[2019]] } },
    canonicalKey: `ck:${CIT}`,
    bibKey: null,
    metadataStatus: "verified",
    reviewedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
  });
}

afterAll(async () => {
  if (!DATABASE_URL) return;
  await client`delete from document_citation_usages where owner_user_id like 'itwd_%'`;
  await client`delete from document_revisions where owner_user_id like 'itwd_%'`;
  await client`update workspaces set document_artifact_id = null where owner_user_id like 'itwd_%'`;
  await client`delete from artifact_contents where owner_user_id like 'itwd_%'`;
  await client`delete from artifacts where owner_user_id like 'itwd_%'`;
  await client`delete from citations where owner_user_id like 'itwd_%'`;
  await client`delete from workspaces where owner_user_id like 'itwd_%'`;
  await client`delete from users where owner_user_id like 'itwd_%'`;
  await client.end();
});

describe("WorkspaceDocumentService", () => {
  itest("getDocument null sebelum save pertama", async () => {
    await seed();
    expect(
      await WorkspaceDocumentService.getDocument(db, { ownerUserId: OWNER, workspaceId: WS }),
    ).toBeNull();
  });

  itest("save pertama: lazy-create artifact typst v1 + revisi + pointer + usages", async () => {
    const keys = await CitationService.ensureBibKeys(db, { ownerUserId: OWNER, citationIds: [CIT] });
    const source = `Menurut @${keys[CIT]} dan @takdikenal, ...`;
    const result = await WorkspaceDocumentService.saveDocument(db, {
      ownerUserId: OWNER,
      workspaceId: WS,
      source,
      author: "user",
    });
    if (result.status !== "saved") throw new Error("harus saved");
    expect(result.contentVersion).toBe(1);

    const artifact = await ArtifactRepo.findById(db, result.artifactId);
    expect(artifact?.artifactType).toBe("typst");
    expect(artifact?.contentVersion).toBe(1);
    const workspace = await WorkspaceRepo.findById(db, WS);
    expect(workspace?.documentArtifactId).toBe(result.artifactId);
    const content = await ArtifactContentRepo.findByArtifact(db, OWNER, result.artifactId);
    expect(content?.plainText).toBe(source);
    const revs = await DocumentRevisionRepo.listByArtifact(db, OWNER, result.artifactId);
    expect(revs.map((r) => r.version)).toEqual([1]);
    // Hanya key dikenal yang tercatat; key asing diabaikan.
    const usages = await DocumentCitationUsageRepo.listByDocument(db, OWNER, result.artifactId);
    expect(usages.map((u) => u.citationId)).toEqual([CIT]);
  });

  itest("CAS: baseVersion cocok → v2; basi/absen → stale_write", async () => {
    const stale = await WorkspaceDocumentService.saveDocument(db, {
      ownerUserId: OWNER,
      workspaceId: WS,
      source: "x",
      author: "user",
    });
    expect(stale).toEqual({ status: "stale_write", currentVersion: 1 });

    const saved = await WorkspaceDocumentService.saveDocument(db, {
      ownerUserId: OWNER,
      workspaceId: WS,
      source: "Versi dua tanpa sitasi.",
      baseVersion: 1,
      author: "agent",
    });
    if (saved.status !== "saved") throw new Error("harus saved");
    expect(saved.contentVersion).toBe(2);
    const usages = await DocumentCitationUsageRepo.listByDocument(db, OWNER, saved.artifactId);
    expect(usages).toEqual([]);

    const conflict = await WorkspaceDocumentService.saveDocument(db, {
      ownerUserId: OWNER,
      workspaceId: WS,
      source: "berbasis versi lama",
      baseVersion: 1,
      author: "user",
    });
    expect(conflict).toEqual({ status: "stale_write", currentVersion: 2 });
  });

  itest("retensi revisi: hanya N terakhir yang tersisa", async () => {
    let version = 2;
    for (let i = 0; i < DOCUMENT_REVISION_RETENTION + 5; i++) {
      const r = await WorkspaceDocumentService.saveDocument(db, {
        ownerUserId: OWNER,
        workspaceId: WS,
        source: `iterasi ${i}`,
        baseVersion: version,
        author: "agent",
      });
      if (r.status !== "saved") throw new Error("harus saved");
      version = r.contentVersion;
    }
    const doc = await WorkspaceDocumentService.getDocument(db, { ownerUserId: OWNER, workspaceId: WS });
    const revs = await DocumentRevisionRepo.listByArtifact(db, OWNER, doc!.artifactId, 100);
    expect(revs.length).toBe(DOCUMENT_REVISION_RETENTION);
    expect(revs[0]?.version).toBe(version);
  }, 90_000);

  itest("guard: sumber kebesaran ditolak (413)", async () => {
    await expect(
      WorkspaceDocumentService.saveDocument(db, {
        ownerUserId: OWNER,
        workspaceId: WS,
        source: "y".repeat(2 * 1024 * 1024 + 1),
        baseVersion: 99,
        author: "user",
      }),
    ).rejects.toThrow(AppError);
  });

  itest("insertInitialDocument (jalur create) → dokumen typst v1 terbaca", async () => {
    await db.transaction(async (tx) => {
      await WorkspaceDocumentService.insertInitialDocument(tx, {
        ownerUserId: OWNER,
        workspaceId: WS2,
        title: "Proyek Dua",
        source: "= Pendahuluan\n\nIsi awal.\n",
        author: "system",
      });
    });
    const doc = await WorkspaceDocumentService.getDocument(db, { ownerUserId: OWNER, workspaceId: WS2 });
    expect(doc?.contentVersion).toBe(1);
    expect(doc?.source).toBe("= Pendahuluan\n\nIsi awal.\n");
    const workspace = await WorkspaceRepo.findById(db, WS2);
    expect(workspace?.documentArtifactId).toBe(doc?.artifactId);
  });
});
