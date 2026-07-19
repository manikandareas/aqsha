/**
 * SectionLatexService — DB integration (skip tanpa DATABASE_URL). Membuktikan:
 * lazy-create atomik (artifact latex v1 + revisi + pointer + status draft),
 * CAS stale_write dua arah, retensi revisi, reconcile usages dari \cite scan,
 * guard bibliography & ukuran, guard race lazy-create.
 */
import { afterAll, describe, expect, test } from "bun:test";
import {
  ArtifactContentRepo,
  ArtifactRepo,
  CitationRepo,
  createDb,
  DocumentCitationUsageRepo,
  DocumentRevisionRepo,
  WorkspaceSectionRepo,
} from "@aqsha/db";
import { AppError } from "@aqsha/db";
import { CitationService } from "../src/citations/citation.service";
import {
  DOCUMENT_REVISION_RETENTION,
  SectionLatexService,
} from "../src/section-latex.service";

const DATABASE_URL = process.env.DATABASE_URL;
const itest = DATABASE_URL ? test : test.skip;
const SUFFIX = Math.floor(Math.random() * 1e9);
const OWNER = `itsl_${SUFFIX}`;
const WS = `itsl_${SUFFIX}:ws`;
const SEC = `itsl_${SUFFIX}:sec`;
const SEC_BIB = `itsl_${SUFFIX}:secbib`;
const CIT = `itsl_${SUFFIX}:cit`;
const NOW = 1_700_000_000_000;
const { db, client } = createDb(DATABASE_URL ?? "postgresql://x");

async function seed() {
  await client`insert into users (owner_user_id, clerk_user_id, email, created_at, updated_at)
    values (${OWNER}, ${OWNER}, ${`${OWNER}@test.local`}, ${NOW}, ${NOW})`;
  await client`insert into workspaces (id, owner_user_id, name, kind, stage, status, created_at, updated_at)
    values (${WS}, ${OWNER}, ${"Skripsi Uji"}, ${"undergraduate_thesis"}, ${"writing"}, ${"active"}, ${NOW}, ${NOW})`;
  await WorkspaceSectionRepo.insertMany(db, [
    { id: SEC, workspaceId: WS, title: "Bab 1", sortOrder: 0, status: "empty", role: null, documentArtifactId: null, createdAt: NOW, updatedAt: NOW },
    { id: SEC_BIB, workspaceId: WS, title: "Daftar Pustaka", sortOrder: 1, status: "empty", role: "bibliography", documentArtifactId: null, createdAt: NOW, updatedAt: NOW },
  ]);
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
  await client`delete from document_citation_usages where owner_user_id like 'itsl_%'`;
  await client`delete from document_revisions where owner_user_id like 'itsl_%'`;
  await client`delete from workspace_sections where workspace_id like 'itsl_%'`;
  await client`delete from artifact_contents where owner_user_id like 'itsl_%'`;
  await client`delete from artifacts where owner_user_id like 'itsl_%'`;
  await client`delete from citations where owner_user_id like 'itsl_%'`;
  await client`delete from workspaces where owner_user_id like 'itsl_%'`;
  await client`delete from users where owner_user_id like 'itsl_%'`;
  await client.end();
});

describe("SectionLatexService", () => {
  itest("getDocument null sebelum save pertama", async () => {
    await seed();
    expect(await SectionLatexService.getDocument(db, { ownerUserId: OWNER, sectionId: SEC })).toBeNull();
  });

  itest("save pertama: lazy-create artifact latex v1 + revisi + draft + usages", async () => {
    const keys = await CitationService.ensureBibKeys(db, { ownerUserId: OWNER, citationIds: [CIT] });
    const source = `Paragraf pembuka \\cite{${keys[CIT]}} dan \\cite{takdikenal}.`;
    const result = await SectionLatexService.saveDocument(db, {
      ownerUserId: OWNER,
      sectionId: SEC,
      source,
      author: "user",
    });
    if (result.status !== "saved") throw new Error("harus saved");
    expect(result.contentVersion).toBe(1);
    expect(result.sectionStatus).toBe("draft");

    const artifact = await ArtifactRepo.findById(db, result.artifactId);
    expect(artifact?.artifactType).toBe("latex");
    expect(artifact?.contentVersion).toBe(1);
    const content = await ArtifactContentRepo.findByArtifact(db, OWNER, result.artifactId);
    expect(content?.plainText).toBe(source);
    expect(content?.plainTextR2Key).toBeNull();
    const revs = await DocumentRevisionRepo.listByArtifact(db, OWNER, result.artifactId);
    expect(revs.map((r) => r.version)).toEqual([1]);
    expect(revs[0]?.author).toBe("user");
    // Hanya key dikenal yang tercatat; key asing diabaikan.
    const usages = await DocumentCitationUsageRepo.listByDocument(db, OWNER, result.artifactId);
    expect(usages.map((u) => u.citationId)).toEqual([CIT]);
  });

  itest("CAS: baseVersion cocok → v2; basi/absen → stale_write", async () => {
    const stale = await SectionLatexService.saveDocument(db, {
      ownerUserId: OWNER,
      sectionId: SEC,
      source: "x",
      author: "user",
    });
    expect(stale).toEqual({ status: "stale_write", currentVersion: 1 });

    const saved = await SectionLatexService.saveDocument(db, {
      ownerUserId: OWNER,
      sectionId: SEC,
      source: "Versi dua tanpa sitasi.",
      baseVersion: 1,
      author: "agent",
    });
    if (saved.status !== "saved") throw new Error("harus saved");
    expect(saved.contentVersion).toBe(2);
    // Usages ikut teks terbaru (sitasi hilang → kosong).
    const usages = await DocumentCitationUsageRepo.listByDocument(db, OWNER, saved.artifactId);
    expect(usages).toEqual([]);

    const conflict = await SectionLatexService.saveDocument(db, {
      ownerUserId: OWNER,
      sectionId: SEC,
      source: "berbasis versi lama",
      baseVersion: 1,
      author: "user",
    });
    expect(conflict).toEqual({ status: "stale_write", currentVersion: 2 });
  });

  itest("retensi revisi: hanya N terakhir yang tersisa", async () => {
    let version = 2;
    for (let i = 0; i < DOCUMENT_REVISION_RETENTION + 5; i++) {
      const r = await SectionLatexService.saveDocument(db, {
        ownerUserId: OWNER,
        sectionId: SEC,
        source: `iterasi ${i}`,
        baseVersion: version,
        author: "agent",
      });
      if (r.status !== "saved") throw new Error("harus saved");
      version = r.contentVersion;
    }
    const doc = await SectionLatexService.getDocument(db, { ownerUserId: OWNER, sectionId: SEC });
    const revs = await DocumentRevisionRepo.listByArtifact(db, OWNER, doc!.artifactId, 100);
    expect(revs.length).toBe(DOCUMENT_REVISION_RETENTION);
    expect(revs[0]?.version).toBe(version);
    // Banyak save berurutan (retensi) × latensi DB dev remote > default 5s bun.
  }, 90_000);

  itest("guard: bibliography tak bisa ditulis; sumber kebesaran ditolak", async () => {
    await expect(
      SectionLatexService.saveDocument(db, {
        ownerUserId: OWNER,
        sectionId: SEC_BIB,
        source: "x",
        author: "user",
      }),
    ).rejects.toThrow(AppError);
    await expect(
      SectionLatexService.saveDocument(db, {
        ownerUserId: OWNER,
        sectionId: SEC,
        source: "y".repeat(2 * 1024 * 1024 + 1),
        baseVersion: 99,
        author: "user",
      }),
    ).rejects.toThrow(AppError);
  });

  itest("heal: pointer artifact non-LaTeX (docx lama) → getDocument null + save bikin latex baru & repoint", async () => {
    const SEC_DOCX = `itsl_${SUFFIX}:secdocx`;
    const ART_DOCX = `itsl_${SUFFIX}:artdocx`;
    await ArtifactRepo.insert(db, {
      id: ART_DOCX,
      ownerUserId: OWNER,
      workspaceId: WS,
      folderId: null,
      threadId: null,
      artifactType: "docx",
      artifactFamily: "file",
      source: "manual",
      title: "Bab lama",
      language: null,
      mimeType: null,
      fileName: null,
      byteSize: null,
      indexingStatus: "not_indexed",
      indexingFailureReason: null,
      detectedDocumentKind: null,
      storageR2Key: null,
      ragEntryId: null,
      plainTextPreview: null,
      indexedAt: null,
      contentVersion: 671,
      status: "active",
      deletedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await WorkspaceSectionRepo.insertMany(db, [
      { id: SEC_DOCX, workspaceId: WS, title: "Bab 2", sortOrder: 2, status: "draft", role: null, documentArtifactId: ART_DOCX, createdAt: NOW, updatedAt: NOW },
    ]);

    // Pointer non-LaTeX dibaca sebagai kosong (bukan phantom versi 671).
    expect(
      await SectionLatexService.getDocument(db, { ownerUserId: OWNER, sectionId: SEC_DOCX }),
    ).toBeNull();

    // Save menyembuhkan: artifact latex baru + repoint section, baseVersion diabaikan.
    const healed = await SectionLatexService.saveDocument(db, {
      ownerUserId: OWNER,
      sectionId: SEC_DOCX,
      source: "Isi bab hasil pemulihan.",
      author: "agent",
    });
    if (healed.status !== "saved") throw new Error("harus saved");
    expect(healed.contentVersion).toBe(1);
    expect(healed.artifactId).not.toBe(ART_DOCX);

    const newArtifact = await ArtifactRepo.findById(db, healed.artifactId);
    expect(newArtifact?.artifactType).toBe("latex");
    const section = await WorkspaceSectionRepo.findById(db, SEC_DOCX);
    expect(section?.documentArtifactId).toBe(healed.artifactId);

    const doc = await SectionLatexService.getDocument(db, { ownerUserId: OWNER, sectionId: SEC_DOCX });
    expect(doc?.source).toBe("Isi bab hasil pemulihan.");
    expect(doc?.contentVersion).toBe(1);
  });
});
