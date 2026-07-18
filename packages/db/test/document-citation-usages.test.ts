/**
 * document_citation_usages — DB integration (butuh Postgres live via DATABASE_URL;
 * tanpa env → skip). Invariant yang hanya terbukti di DB nyata:
 *
 *  1. `listByWorkspace` harus mengikuti chapter (workspace_sections) yang MASIH HIDUP,
 *     bukan sekadar kolom `workspace_id` yang didenormalisasi di baris usage. Hapus
 *     section (`WorkspaceSectionRepo.deleteById`) tidak menghapus artifact atau usage
 *     terkait (tanpa cascade di `workspace_sections.document_artifact_id`), jadi baris
 *     usage lama jadi "hantu" kalau query hanya menyaring `workspace_id`.
 *
 * Isolasi: prefix `itdcu_<suffix>`; bersihkan FK-child sebelum users.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createDb } from "../src/client";
import { ArtifactRepo } from "../src/repositories/artifactRepo";
import { CitationRepo } from "../src/repositories/citationRepo";
import { DocumentCitationUsageRepo } from "../src/repositories/documentCitationUsageRepo";
import { WorkspaceSectionRepo } from "../src/repositories/workspaceSectionRepo";
import type { NewDocumentCitationUsage } from "../src/schema/documentCitationUsages";
import { documentCitationUsages } from "../src/schema/documentCitationUsages";
import { users } from "../src/schema/users";
import { workspaces } from "../src/schema/workspaces";

const DATABASE_URL = process.env.DATABASE_URL;
const itest = DATABASE_URL ? test : test.skip;
const SUFFIX = Math.floor(Math.random() * 1e9);
const OWNER = `itdcu_${SUFFIX}`;
const WS = `itdcu_${SUFFIX}:ws`;
const NOW = 1_700_000_000_000;

const { db, client } = createDb(DATABASE_URL ?? "postgresql://x");

const ARTIFACT_LIVE = `${WS}:art-live`;
const ARTIFACT_DELETED = `${WS}:art-deleted`;
const SECTION_LIVE = `${WS}:sect-live`;
const SECTION_DELETED = `${WS}:sect-deleted`;
const CITATION_LIVE = `${WS}:cit-live`;
const CITATION_GHOST = `${WS}:cit-ghost`;

async function cleanup() {
  if (!DATABASE_URL) return;
  await client`delete from document_citation_usages where workspace_id like ${`itdcu_${SUFFIX}%`}`;
  await client`delete from workspace_sections where workspace_id like ${`itdcu_${SUFFIX}%`}`;
  await client`delete from citations where owner_user_id like ${`itdcu_${SUFFIX}%`}`;
  await client`delete from artifacts where owner_user_id like ${`itdcu_${SUFFIX}%`}`;
  await client`delete from workspaces where owner_user_id like ${`itdcu_${SUFFIX}%`}`;
  await client`delete from users where owner_user_id like ${`itdcu_${SUFFIX}%`}`;
}

beforeAll(async () => {
  if (!DATABASE_URL) return;
  await cleanup();
  await db.insert(users).values({
    ownerUserId: OWNER,
    clerkUserId: OWNER,
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.insert(workspaces).values({
    id: WS,
    ownerUserId: OWNER,
    name: "Proyek Uji",
    kind: "undergraduate_thesis",
    stage: "exploration",
    createdAt: NOW,
    updatedAt: NOW,
  });

  // Dua bab, masing-masing dengan artifact dan citation sendiri.
  for (const artifactId of [ARTIFACT_LIVE, ARTIFACT_DELETED]) {
    await ArtifactRepo.insert(db, {
      id: artifactId,
      ownerUserId: OWNER,
      workspaceId: WS,
      artifactType: "markdown",
      artifactFamily: "text",
      source: "manual",
      title: `Dokumen ${artifactId}`,
      status: "active",
      createdAt: NOW,
      updatedAt: NOW,
    });
  }

  for (const citationId of [CITATION_LIVE, CITATION_GHOST]) {
    await CitationRepo.insert(db, {
      id: citationId,
      ownerUserId: OWNER,
      artifactId: null,
      source: "manual",
      provider: null,
      externalId: null,
      documentType: "article-journal",
      title: `Sitasi ${citationId}`,
      authorsJson: [{ family: "Penulis", given: "A." }],
      publishedYear: 2024,
      venue: "Jurnal Uji",
      publisher: null,
      doi: null,
      url: null,
      tags: [],
      cslJson: { type: "article-journal", title: `Sitasi ${citationId}` },
      canonicalKey: `t:${citationId}`,
      metadataStatus: "verified",
      createdAt: NOW,
      updatedAt: NOW,
    });
  }

  await WorkspaceSectionRepo.insertMany(db, [
    {
      id: SECTION_LIVE,
      workspaceId: WS,
      title: "Bab hidup",
      sortOrder: 0,
      status: "draft",
      role: null,
      documentArtifactId: ARTIFACT_LIVE,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: SECTION_DELETED,
      workspaceId: WS,
      title: "Bab yang akan dihapus",
      sortOrder: 1,
      status: "draft",
      role: null,
      documentArtifactId: ARTIFACT_DELETED,
      createdAt: NOW,
      updatedAt: NOW,
    },
  ]);

  const usageRow = (
    over: Partial<NewDocumentCitationUsage> & {
      id: string;
      documentArtifactId: string;
      citationId: string;
    },
  ): NewDocumentCitationUsage => ({
    ownerUserId: OWNER,
    workspaceId: WS,
    occurrenceOrder: 0,
    inlineNodeId: null,
    locatorJson: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  });
  await db.insert(documentCitationUsages).values([
    usageRow({
      id: `${WS}:usage-live`,
      documentArtifactId: ARTIFACT_LIVE,
      citationId: CITATION_LIVE,
    }),
    usageRow({
      id: `${WS}:usage-ghost`,
      documentArtifactId: ARTIFACT_DELETED,
      citationId: CITATION_GHOST,
    }),
  ]);
});

afterAll(async () => {
  await cleanup();
  if (DATABASE_URL) await client.end();
});

describe("DocumentCitationUsageRepo.listByWorkspace", () => {
  itest("mengecualikan usage dari bab yang sudah dihapus (ghost), tetap sertakan bab hidup", async () => {
    // Section delete TIDAK menghapus artifact/usage terkait (tanpa cascade) — baris
    // usage bab ini jadi orphan begitu section-nya hilang.
    await WorkspaceSectionRepo.deleteById(db, SECTION_DELETED);

    const rows = await DocumentCitationUsageRepo.listByWorkspace(db, OWNER, WS);
    expect(rows.map((r) => r.citationId).sort()).toEqual([CITATION_LIVE]);
    expect(rows.some((r) => r.citationId === CITATION_GHOST)).toBe(false);
  });
});
