/**
 * Fondasi model dokumen Typst — DB integration (skip tanpa DATABASE_URL). Invariant
 * yang hanya terbukti di Postgres nyata:
 *  1. artifact type 'typst' lolos CHECK.
 *  2. document_revisions unique (artifact_id, version) + deleteOlderThan (retensi).
 *  3. citations bib_key unique parsial per owner (null bebas).
 *  4. WorkspaceRepo.setDocumentArtifactIfNull: klaim pertama true, kedua false (guard race lazy-create).
 *  5. ArtifactRepo.updateIfVersion: cocok → true; versi bergeser → false (CAS).
 */
import { afterAll, describe, expect, test } from "bun:test";
import { createDb } from "../src/client";
import { ArtifactRepo } from "../src/repositories/artifactRepo";
import { CitationRepo } from "../src/repositories/citationRepo";
import { DocumentRevisionRepo } from "../src/repositories/documentRevisionRepo";
import { WorkspaceRepo } from "../src/repositories/workspaceRepo";
import { users } from "../src/schema/users";
import { workspaces } from "../src/schema/workspaces";

const DATABASE_URL = process.env.DATABASE_URL;
const itest = DATABASE_URL ? test : test.skip;
const SUFFIX = Math.floor(Math.random() * 1e9);
const OWNER = `ittyp_${SUFFIX}`;
const WS = `ittyp_${SUFFIX}:ws`;
const ART = `ittyp_${SUFFIX}:art`;
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
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
  });
  await ArtifactRepo.insert(db, {
    id: ART,
    ownerUserId: OWNER,
    workspaceId: WS,
    folderId: null,
    threadId: null,
    artifactType: "typst",
    artifactFamily: "text",
    source: "manual",
    title: "Dokumen",
    language: "typst",
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
  await client`delete from document_revisions where owner_user_id like 'ittyp_%'`;
  await client`delete from artifacts where owner_user_id like 'ittyp_%'`;
  await client`delete from citations where owner_user_id like 'ittyp_%'`;
  await client`update workspaces set document_artifact_id = null where owner_user_id like 'ittyp_%'`;
  await client`delete from workspaces where owner_user_id like 'ittyp_%'`;
  await client`delete from users where owner_user_id like 'ittyp_%'`;
  await client.end();
});

describe("model dokumen typst (fondasi DB)", () => {
  itest("setup seed", async () => {
    await seed();
  });

  itest("artifact type 'typst' lolos CHECK", async () => {
    const row = await ArtifactRepo.findById(db, ART);
    expect(row?.artifactType).toBe("typst");
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
    expect(await WorkspaceRepo.setDocumentArtifactIfNull(db, WS, ART, NOW)).toBe(true);
    expect(await WorkspaceRepo.setDocumentArtifactIfNull(db, WS, ART, NOW)).toBe(false);
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
