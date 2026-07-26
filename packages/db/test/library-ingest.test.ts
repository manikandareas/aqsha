/**
 * Kolom status ingest + pelonggaran constraint — DB integration (butuh Postgres
 * live via DATABASE_URL; tanpa env → skip). Membuktikan tiga hal yang hanya
 * terbukti di DB nyata: default kolom baru, artifact `source='reference'`
 * diterima CHECK, dan paper metadata boleh tanpa workspace.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createDb } from "../src/client";
import { ArtifactEmbeddingRepo } from "../src/repositories/artifactEmbeddingRepo";
import { ArtifactRepo } from "../src/repositories/artifactRepo";
import { artifactEmbeddings } from "../src/schema/artifactEmbeddings";
import { artifactPaperMetadata } from "../src/schema/artifactPaperMetadata";
import { artifacts } from "../src/schema/artifacts";
import { citations } from "../src/schema/citations";
import { users } from "../src/schema/users";
import { workspaceCitationLinks } from "../src/schema/workspaceCitationLinks";
import { workspaces } from "../src/schema/workspaces";

const DATABASE_URL = process.env.DATABASE_URL;
const itest = DATABASE_URL ? test : test.skip;
const SUFFIX = Math.floor(Math.random() * 1e9);
const OWNER = `iting_${SUFFIX}`;
const ARTIFACT = `iting_${SUFFIX}:art`;
const CITATION = `iting_${SUFFIX}:cit`;
const META = `iting_${SUFFIX}:meta`;
const WS = `iting_${SUFFIX}:ws`;
const NOW = 1_700_000_000_000;

const { db, client } = createDb(DATABASE_URL ?? "postgresql://x");

beforeAll(async () => {
  if (!DATABASE_URL) return;
  await db.insert(users).values({
    ownerUserId: OWNER,
    clerkUserId: OWNER,
    email: `${OWNER}@example.test`,
    createdAt: NOW,
    updatedAt: NOW,
  });
});

afterAll(async () => {
  if (!DATABASE_URL) return;
  await db.delete(artifactPaperMetadata).where(eq(artifactPaperMetadata.ownerUserId, OWNER));
  await db.delete(artifactEmbeddings).where(eq(artifactEmbeddings.ownerUserId, OWNER));
  // Tautan proyek mereferensi citation, jadi ia harus mati lebih dulu.
  await db.delete(workspaceCitationLinks).where(eq(workspaceCitationLinks.workspaceId, WS));
  await db.delete(citations).where(eq(citations.ownerUserId, OWNER));
  await db.delete(artifacts).where(eq(artifacts.ownerUserId, OWNER));
  await db.delete(workspaces).where(eq(workspaces.ownerUserId, OWNER));
  await db.delete(users).where(eq(users.ownerUserId, OWNER));
  await client.end();
});

describe("library ingest schema", () => {
  itest("artifact referensi akun-level diterima CHECK source", async () => {
    await db.insert(artifacts).values({
      id: ARTIFACT,
      ownerUserId: OWNER,
      workspaceId: null,
      folderId: null,
      threadId: null,
      artifactType: "plain_text",
      artifactFamily: "text",
      source: "reference",
      title: "Paper uji",
      language: null,
      mimeType: null,
      fileName: null,
      byteSize: null,
      indexingStatus: "not_indexed",
      indexingFailureReason: null,
      detectedDocumentKind: null,
      storageR2Key: null,
      contentVersion: null,
      ragEntryId: null,
      plainTextPreview: null,
      indexedAt: null,
      status: "active",
      deletedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const [row] = await db.select().from(artifacts).where(eq(artifacts.id, ARTIFACT));
    expect(row?.source).toBe("reference");
  });

  itest("citation baru default pending dengan cakupan none", async () => {
    await db.insert(citations).values({
      id: CITATION,
      ownerUserId: OWNER,
      artifactId: ARTIFACT,
      source: "manual",
      provider: null,
      externalId: null,
      documentType: "article-journal",
      title: "Judul uji",
      authorsJson: [],
      publishedYear: null,
      venue: null,
      publisher: null,
      doi: null,
      url: null,
      tags: [],
      cslJson: {},
      canonicalKey: `key-${SUFFIX}`,
      bibKey: null,
      metadataStatus: "incomplete",
      reviewedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
    });
    const [row] = await db.select().from(citations).where(eq(citations.id, CITATION));
    expect(row?.ingestStatus).toBe("pending");
    expect(row?.textCoverage).toBe("none");
    expect(row?.ingestError).toBeNull();
    expect(row?.ingestedAt).toBeNull();
  });

  itest("paper metadata boleh tanpa workspace", async () => {
    await db.insert(artifactPaperMetadata).values({
      id: META,
      ownerUserId: OWNER,
      artifactId: ARTIFACT,
      workspaceId: null,
      metadataSource: "crossref",
      title: "Judul resolved",
      abstract: null,
      doi: "10.1234/uji",
      authors: [],
      affiliations: [],
      keywords: [],
      journal: null,
      publisher: null,
      publishedYear: null,
      arxivId: null,
      sourceUrl: null,
      oaStatus: null,
      pdfStatus: null,
      confidence: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const [row] = await db
      .select()
      .from(artifactPaperMetadata)
      .where(eq(artifactPaperMetadata.id, META));
    expect(row?.workspaceId).toBeNull();
  });
});

describe("kapasitas library", () => {
  itest("artifact referensi tidak menambah hitungan kapasitas", async () => {
    // ARTIFACT dari describe sebelumnya adalah source='reference'.
    const count = await ArtifactRepo.countActiveByOwner(db, OWNER, 50);
    expect(count).toBe(0);
  });
});

describe("scope pencarian lewat tautan proyek", () => {
  const LINKED = `iting_${SUFFIX}:art_linked`;
  const UNLINKED = `iting_${SUFFIX}:art_unlinked`;
  const VECTOR = Array.from({ length: 1536 }, () => 0.01);

  itest("hanya chunk paper tertaut yang ikut hasil", async () => {
    await db.insert(workspaces).values({
      id: WS,
      ownerUserId: OWNER,
      name: "Proyek uji",
      status: "active",
      createdAt: NOW,
      updatedAt: NOW,
    } as never);
    for (const [artifactId, citationId, linked] of [
      [LINKED, `${LINKED}:cit`, true],
      [UNLINKED, `${UNLINKED}:cit`, false],
    ] as const) {
      await db.insert(artifacts).values({
        id: artifactId,
        ownerUserId: OWNER,
        workspaceId: null,
        artifactType: "plain_text",
        artifactFamily: "text",
        source: "reference",
        title: `Paper ${artifactId}`,
        indexingStatus: "ready",
        status: "active",
        createdAt: NOW,
        updatedAt: NOW,
      } as never);
      await db.insert(citations).values({
        id: citationId,
        ownerUserId: OWNER,
        artifactId,
        source: "manual",
        documentType: "article-journal",
        title: `Judul ${citationId}`,
        authorsJson: [],
        tags: [],
        cslJson: {},
        canonicalKey: citationId,
        bibKey: linked ? "sari2024" : null,
        metadataStatus: "verified",
        createdAt: NOW,
        updatedAt: NOW,
      } as never);
      await db.insert(artifactEmbeddings).values({
        id: `${artifactId}:chunk`,
        ownerUserId: OWNER,
        artifactId,
        workspaceId: null,
        chunkIndex: 0,
        content: "metodologi campuran untuk riset pendidikan",
        embedding: VECTOR,
        createdAt: NOW,
      } as never);
      if (linked) {
        await db.insert(workspaceCitationLinks).values({
          id: `${citationId}:link`,
          workspaceId: WS,
          citationId,
          createdAt: NOW,
        });
      }
    }

    const matches = await ArtifactEmbeddingRepo.searchSimilar(db, {
      ownerUserId: OWNER,
      queryVector: VECTOR,
      workspaceId: WS,
      limit: 10,
    });
    const ids = matches.map((m) => m.artifactId);
    expect(ids).toContain(LINKED);
    expect(ids).not.toContain(UNLINKED);
    expect(matches.find((m) => m.artifactId === LINKED)?.bibKey).toBe("sari2024");
  });
});
