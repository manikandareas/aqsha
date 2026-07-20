/**
 * document_citation_usages — DB integration (butuh Postgres live via DATABASE_URL;
 * tanpa env → skip). Invariant yang hanya terbukti di DB nyata: `listByWorkspace`
 * menyaring ke satu proyek (satu dokumen kontinu) via `workspace_id`, terurut
 * `occurrence_order`; `replaceForDocument` mengganti seluruh usage; dan
 * `countDocumentsUsingCitation` menghitung dokumen distinct.
 *
 * Isolasi: prefix `itdcu_<suffix>`; bersihkan FK-child sebelum users.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createDb } from "../src/client";
import { ArtifactRepo } from "../src/repositories/artifactRepo";
import { CitationRepo } from "../src/repositories/citationRepo";
import { DocumentCitationUsageRepo } from "../src/repositories/documentCitationUsageRepo";
import type { NewDocumentCitationUsage } from "../src/schema/documentCitationUsages";
import { documentCitationUsages } from "../src/schema/documentCitationUsages";
import { users } from "../src/schema/users";
import { workspaces } from "../src/schema/workspaces";

const DATABASE_URL = process.env.DATABASE_URL;
const itest = DATABASE_URL ? test : test.skip;
const SUFFIX = Math.floor(Math.random() * 1e9);
const OWNER = `itdcu_${SUFFIX}`;
const WS_A = `itdcu_${SUFFIX}:wsA`;
const WS_B = `itdcu_${SUFFIX}:wsB`;
const ART_A = `itdcu_${SUFFIX}:artA`;
const ART_B = `itdcu_${SUFFIX}:artB`;
const CIT_1 = `itdcu_${SUFFIX}:cit1`;
const CIT_2 = `itdcu_${SUFFIX}:cit2`;
const NOW = 1_700_000_000_000;

const { db, client } = createDb(DATABASE_URL ?? "postgresql://x");

async function cleanup() {
  if (!DATABASE_URL) return;
  await client`delete from document_citation_usages where owner_user_id like ${`itdcu_${SUFFIX}%`}`;
  await client`delete from citations where owner_user_id like ${`itdcu_${SUFFIX}%`}`;
  await client`update workspaces set document_artifact_id = null where owner_user_id like ${`itdcu_${SUFFIX}%`}`;
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
  await db.insert(workspaces).values([
    { id: WS_A, ownerUserId: OWNER, name: "Proyek A", kind: "undergraduate_thesis", createdAt: NOW, updatedAt: NOW },
    { id: WS_B, ownerUserId: OWNER, name: "Proyek B", kind: "paper", createdAt: NOW, updatedAt: NOW },
  ]);

  for (const [artifactId, workspaceId] of [
    [ART_A, WS_A],
    [ART_B, WS_B],
  ] as const) {
    await ArtifactRepo.insert(db, {
      id: artifactId,
      ownerUserId: OWNER,
      workspaceId,
      artifactType: "typst",
      artifactFamily: "text",
      source: "manual",
      title: `Dokumen ${artifactId}`,
      status: "active",
      createdAt: NOW,
      updatedAt: NOW,
    });
  }

  for (const citationId of [CIT_1, CIT_2]) {
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

  const usageRow = (
    over: Partial<NewDocumentCitationUsage> & {
      id: string;
      workspaceId: string;
      documentArtifactId: string;
      citationId: string;
      occurrenceOrder: number;
    },
  ): NewDocumentCitationUsage => ({
    ownerUserId: OWNER,
    inlineNodeId: null,
    locatorJson: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  });
  await db.insert(documentCitationUsages).values([
    usageRow({ id: `${WS_A}:u1`, workspaceId: WS_A, documentArtifactId: ART_A, citationId: CIT_2, occurrenceOrder: 1 }),
    usageRow({ id: `${WS_A}:u0`, workspaceId: WS_A, documentArtifactId: ART_A, citationId: CIT_1, occurrenceOrder: 0 }),
    usageRow({ id: `${WS_B}:u0`, workspaceId: WS_B, documentArtifactId: ART_B, citationId: CIT_1, occurrenceOrder: 0 }),
  ]);
});

afterAll(async () => {
  await cleanup();
  if (DATABASE_URL) await client.end();
});

describe("DocumentCitationUsageRepo", () => {
  itest("listByWorkspace menyaring ke satu proyek, terurut occurrence_order", async () => {
    const rowsA = await DocumentCitationUsageRepo.listByWorkspace(db, OWNER, WS_A);
    expect(rowsA.map((r) => r.citationId)).toEqual([CIT_1, CIT_2]);
    const rowsB = await DocumentCitationUsageRepo.listByWorkspace(db, OWNER, WS_B);
    expect(rowsB.map((r) => r.citationId)).toEqual([CIT_1]);
  });

  itest("countDocumentsUsingCitation menghitung dokumen distinct", async () => {
    expect(await DocumentCitationUsageRepo.countDocumentsUsingCitation(db, OWNER, CIT_1)).toBe(2);
    expect(await DocumentCitationUsageRepo.countDocumentsUsingCitation(db, OWNER, CIT_2)).toBe(1);
  });

  itest("replaceForDocument mengganti seluruh usage satu dokumen", async () => {
    await DocumentCitationUsageRepo.replaceForDocument(db, {
      ownerUserId: OWNER,
      documentArtifactId: ART_A,
      rows: [
        {
          id: `${WS_A}:u-new`,
          ownerUserId: OWNER,
          workspaceId: WS_A,
          documentArtifactId: ART_A,
          citationId: CIT_2,
          occurrenceOrder: 0,
          inlineNodeId: null,
          locatorJson: null,
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    });
    const rowsA = await DocumentCitationUsageRepo.listByWorkspace(db, OWNER, WS_A);
    expect(rowsA.map((r) => r.citationId)).toEqual([CIT_2]);
  });
});
