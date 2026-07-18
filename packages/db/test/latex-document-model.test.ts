/**
 * Fondasi model dokumen LaTeX — DB integration (skip tanpa DATABASE_URL). Invariant
 * yang hanya terbukti di Postgres nyata:
 *  1. document_revisions unique (artifact_id, version) + deleteOlderThan (retensi).
 *  2. latex_builds unique parsial: satu baris per section + satu baris full per workspace.
 *  3. citations bib_key unique parsial per owner (null bebas).
 *  4. setDocumentArtifactIfNull: klaim pertama true, kedua false (guard race lazy-create).
 *  5. updateIfVersion: cocok → true; versi bergeser → false (CAS).
 */
import { afterAll, describe, expect, test } from "bun:test";
import { createDb } from "../src/client";
import { ArtifactRepo } from "../src/repositories/artifactRepo";
import { CitationRepo } from "../src/repositories/citationRepo";
import { DocumentRevisionRepo } from "../src/repositories/documentRevisionRepo";
import { LatexBuildRepo } from "../src/repositories/latexBuildRepo";
import { WorkspaceSectionRepo } from "../src/repositories/workspaceSectionRepo";
import { users } from "../src/schema/users";
import { workspaces } from "../src/schema/workspaces";
import { workspaceSections } from "../src/schema/workspaceSections";

const DATABASE_URL = process.env.DATABASE_URL;
const itest = DATABASE_URL ? test : test.skip;
const SUFFIX = Math.floor(Math.random() * 1e9);
const OWNER = `itlx_${SUFFIX}`;
const WS = `itlx_${SUFFIX}:ws`;
const SECTION = `itlx_${SUFFIX}:sec`;
const SECTION2 = `itlx_${SUFFIX}:sec2`;
const ART = `itlx_${SUFFIX}:art`;
const NOW = 1_700_000_000_000;

const { db, client } = createDb(DATABASE_URL ?? "postgresql://x");

async function seed() {
  await db.insert(users).values({
    ownerUserId: OWNER,
    clerkUserId: OWNER,
    email: `${OWNER}@test.local`,
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.insert(workspaces).values({
    id: WS,
    ownerUserId: OWNER,
    name: "Proyek Uji",
    kind: "undergraduate_thesis",
    stage: "writing",
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.insert(workspaceSections).values([
    { id: SECTION, workspaceId: WS, title: "Bab 1", sortOrder: 0, status: "empty", createdAt: NOW, updatedAt: NOW },
    { id: SECTION2, workspaceId: WS, title: "Bab 2", sortOrder: 1, status: "empty", createdAt: NOW, updatedAt: NOW },
  ]);
  await ArtifactRepo.insert(db, {
    id: ART,
    ownerUserId: OWNER,
    workspaceId: WS,
    folderId: null,
    threadId: null,
    artifactType: "latex",
    artifactFamily: "text",
    source: "manual",
    title: "Bab 1",
    language: "latex",
    mimeType: null,
    fileName: null,
    byteSize: null,
    indexingStatus: "not_indexed",
    indexingFailureReason: null,
    detectedDocumentKind: null,
    storageR2Key: null,
    ragEntryId: null,
    plainTextPreview: "",
    indexedAt: null,
    contentVersion: 1,
    status: "active",
    deletedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

afterAll(async () => {
  if (!DATABASE_URL) return;
  await client`delete from latex_builds where owner_user_id like 'itlx_%'`;
  await client`delete from document_revisions where owner_user_id like 'itlx_%'`;
  await client`delete from workspace_sections where workspace_id like 'itlx_%'`;
  await client`delete from artifacts where owner_user_id like 'itlx_%'`;
  await client`delete from citations where owner_user_id like 'itlx_%'`;
  await client`delete from workspaces where owner_user_id like 'itlx_%'`;
  await client`delete from users where owner_user_id like 'itlx_%'`;
  await client.end();
});

describe("model dokumen latex (fondasi DB)", () => {
  itest("setup seed", async () => {
    await seed();
  });

  itest("artifact type 'latex' lolos CHECK", async () => {
    const row = await ArtifactRepo.findById(db, ART);
    expect(row?.artifactType).toBe("latex");
  });

  itest("document_revisions: unique (artifact, version) + retensi deleteOlderThan", async () => {
    for (let v = 1; v <= 5; v++) {
      await DocumentRevisionRepo.insert(db, {
        id: `${ART}:rev${v}`,
        ownerUserId: OWNER,
        artifactId: ART,
        version: v,
        source: `isi v${v}`,
        author: "user",
        createdAt: NOW + v,
      });
    }
    await expect(
      DocumentRevisionRepo.insert(db, {
        id: `${ART}:revdup`,
        ownerUserId: OWNER,
        artifactId: ART,
        version: 3,
        source: "dup",
        author: "agent",
        createdAt: NOW,
      }),
    ).rejects.toThrow();
    await DocumentRevisionRepo.deleteOlderThan(db, ART, 4);
    const rows = await DocumentRevisionRepo.listByArtifact(db, OWNER, ART);
    expect(rows.map((r) => r.version)).toEqual([5, 4]);
  });

  itest("latex_builds: satu baris per section + satu baris full per workspace", async () => {
    const base = {
      ownerUserId: OWNER,
      workspaceId: WS,
      status: "ok",
      pdfR2Key: null,
      synctexR2Key: null,
      errors: null,
      logTail: null,
      sourceVersions: { [SECTION]: 1 },
      builtAt: NOW,
    };
    await LatexBuildRepo.insert(db, { id: `${WS}:b1`, sectionId: SECTION, ...base });
    await expect(
      LatexBuildRepo.insert(db, { id: `${WS}:b1dup`, sectionId: SECTION, ...base }),
    ).rejects.toThrow();
    // Section lain + full-doc boleh hidup berdampingan.
    await LatexBuildRepo.insert(db, { id: `${WS}:b2`, sectionId: SECTION2, ...base });
    await LatexBuildRepo.insert(db, { id: `${WS}:bfull`, sectionId: null, ...base });
    await expect(
      LatexBuildRepo.insert(db, { id: `${WS}:bfulldup`, sectionId: null, ...base }),
    ).rejects.toThrow();
    expect((await LatexBuildRepo.findBySection(db, OWNER, SECTION))?.id).toBe(`${WS}:b1`);
    expect((await LatexBuildRepo.findFullByWorkspace(db, OWNER, WS))?.id).toBe(`${WS}:bfull`);
  });

  itest("citations.bib_key unique parsial per owner", async () => {
    const cit = (id: string, bibKey: string | null) => ({
      id,
      ownerUserId: OWNER,
      artifactId: null,
      source: "manual" as const,
      provider: null,
      externalId: null,
      documentType: "book",
      title: `Judul ${id}`,
      authorsJson: [{ family: "Sugiyono" }],
      publishedYear: 2019,
      venue: null,
      publisher: null,
      doi: null,
      url: null,
      tags: [],
      cslJson: { type: "book", title: `Judul ${id}` },
      canonicalKey: `ck:${id}`,
      bibKey,
      metadataStatus: "verified" as const,
      reviewedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
    });
    await CitationRepo.insert(db, cit(`${OWNER}:c1`, "sugiyono2019"));
    await expect(CitationRepo.insert(db, cit(`${OWNER}:c2`, "sugiyono2019"))).rejects.toThrow();
    await CitationRepo.insert(db, cit(`${OWNER}:c3`, null));
    await CitationRepo.insert(db, cit(`${OWNER}:c4`, null));
    expect(await CitationRepo.listTakenBibKeys(db, OWNER)).toEqual(["sugiyono2019"]);
    const found = await CitationRepo.findByBibKeys(db, OWNER, ["sugiyono2019", "tak-ada"]);
    expect(found.map((r) => r.id)).toEqual([`${OWNER}:c1`]);
  });

  itest("setDocumentArtifactIfNull: klaim pertama menang, kedua kalah", async () => {
    expect(await WorkspaceSectionRepo.setDocumentArtifactIfNull(db, SECTION, ART, NOW)).toBe(true);
    expect(await WorkspaceSectionRepo.setDocumentArtifactIfNull(db, SECTION, ART, NOW)).toBe(false);
  });

  itest("updateIfVersion: CAS cocok → true, bergeser → false", async () => {
    expect(
      await ArtifactRepo.updateIfVersion(db, ART, 1, { contentVersion: 2, updatedAt: NOW }),
    ).toBe(true);
    expect(
      await ArtifactRepo.updateIfVersion(db, ART, 1, { contentVersion: 3, updatedAt: NOW }),
    ).toBe(false);
  });
});
