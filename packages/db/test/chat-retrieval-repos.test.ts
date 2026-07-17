/**
 * Slice 6.9 — DB integration (butuh Postgres+pgvector live via DATABASE_URL; tanpa
 * env → skip supaya `bun test` tetap hijau). Dua invariant repo retrieval Astra
 * chat yang HANYA terbukti di DB nyata (bukan repo-fake):
 *
 *  1. `ResearchSourceRepo.insertMany` IDEMPOTEN (`onConflictDoNothing` pada unique
 *     thread+turn+locator) → step tool riset yang RE-RUN saat resume durable tak gandakan.
 *  2. `ArtifactEmbeddingRepo.searchSimilar` ANN cosine + scope `threadId` via JOIN ke
 *     `artifacts` (artifact_embeddings tak punya thread_id) → attachment headless
 *     (workspaceId=null) tetap ke-temu lewat thread, lintas-thread TER-EXCLUDE.
 *
 * Isolasi: prefix `itchat_<suffix>` (DI LUAR broad cleanup `user_itest_%`), bersihkan
 * FK-child (research_sources, artifact_embeddings, artifacts, chat_threads) SEBELUM users.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createDb } from "../src/client";
import { ArtifactEmbeddingRepo } from "../src/repositories/artifactEmbeddingRepo";
import { ResearchSourceRepo } from "../src/repositories/researchSourceRepo";
import { ARTIFACT_EMBEDDING_DIMENSION } from "../src/schema/artifactEmbeddings";
import { artifacts } from "../src/schema/artifacts";
import { chatThreads } from "../src/schema/chatThreads";
import type { NewResearchSource } from "../src/schema/researchSources";
import { users } from "../src/schema/users";
import { workspaces } from "../src/schema/workspaces";

const DATABASE_URL = process.env.DATABASE_URL;
const itest = DATABASE_URL ? test : test.skip;
const SUFFIX = Math.floor(Math.random() * 1e9);
const OWNER = `itchat_${SUFFIX}`;
const WS = `itchat_${SUFFIX}:ws`;
const T1 = `itchat_${SUFFIX}:thread1`;
const T2 = `itchat_${SUFFIX}:thread2`;

const { db, client } = createDb(DATABASE_URL ?? "postgresql://x");

/** Vektor 1536-dim one-hot pada index `slot` (cosine distance: sama=0, ortogonal=1). */
function oneHot(slot: number): number[] {
  const v = new Array<number>(ARTIFACT_EMBEDDING_DIMENSION).fill(0);
  v[slot] = 1;
  return v;
}

function srcRow(over: Partial<NewResearchSource> & { locator: string; turnId: string }): NewResearchSource {
  return {
    id: crypto.randomUUID(),
    threadId: T1,
    ownerUserId: OWNER,
    citationNumber: null,
    origin: "web",
    provider: "firecrawl_search",
    title: "Sumber",
    url: null,
    doi: null,
    arxivId: null,
    snippet: "cuplikan",
    evidenceStrength: "medium",
    discoveryQuery: "energi surya",
    createdAt: 1_700_000_000_000,
    ...over,
  };
}

async function seedArtifact(id: string, threadId: string, embedSlot: number) {
  const now = 1_700_000_000_000;
  await db.insert(artifacts).values({
    id,
    ownerUserId: OWNER,
    workspaceId: null,
    folderId: null,
    threadId,
    artifactType: "markdown",
    artifactFamily: "text",
    source: "agent",
    title: `Art ${id}`,
    indexingStatus: "ready",
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  await ArtifactEmbeddingRepo.insertMany(db, [
    {
      id: crypto.randomUUID(),
      ownerUserId: OWNER,
      artifactId: id,
      workspaceId: null,
      chunkIndex: 0,
      content: `chunk ${id}`,
      embedding: oneHot(embedSlot),
      createdAt: now,
    },
  ]);
}

async function cleanup() {
  if (!DATABASE_URL) return;
  await client`delete from research_sources where owner_user_id = ${OWNER}`;
  await client`delete from artifact_embeddings where owner_user_id = ${OWNER}`;
  await client`delete from artifacts where owner_user_id = ${OWNER}`;
  await client`delete from chat_threads where owner_user_id = ${OWNER}`;
  await client`delete from workspaces where owner_user_id = ${OWNER}`;
  await client`delete from users where owner_user_id = ${OWNER}`;
}

beforeAll(async () => {
  if (!DATABASE_URL) return;
  await cleanup();
  await db.insert(users).values({ ownerUserId: OWNER, clerkUserId: OWNER, createdAt: 1, updatedAt: 1 });
  const now = 1_700_000_000_000;
  // chat_threads.workspace_id NOT NULL (FK cascade) → butuh proyek nyata sebelum thread.
  await db
    .insert(workspaces)
    .values({ id: WS, ownerUserId: OWNER, name: "Proyek uji", createdAt: now, updatedAt: now });
  for (const id of [T1, T2]) {
    await db
      .insert(chatThreads)
      .values({ id, ownerUserId: OWNER, workspaceId: WS, lastActivityAt: now, createdAt: now, updatedAt: now });
  }
  // Seed multi-statement ke DB integration remote → beri ruang di atas hook cap default 5s Bun.
}, 30000);
afterAll(async () => {
  await cleanup();
  await client.end();
}, 30000);

describe("ResearchSourceRepo.insertMany — idempoten (resume tak gandakan)", () => {
  itest("re-insert (thread+turn+locator) sama → 1 baris; locator beda → tambah", async () => {
    await ResearchSourceRepo.insertMany(db, [srcRow({ turnId: "turn1", locator: "https://a.test" })]);
    // RE-RUN step yang sama (resume durable) — id baru, key sama → onConflictDoNothing
    await ResearchSourceRepo.insertMany(db, [srcRow({ turnId: "turn1", locator: "https://a.test" })]);
    let rows = await ResearchSourceRepo.listByThread(db, T1);
    expect(rows.length).toBe(1);

    // locator berbeda → baris baru
    await ResearchSourceRepo.insertMany(db, [srcRow({ turnId: "turn1", locator: "https://b.test" })]);
    rows = await ResearchSourceRepo.listByThread(db, T1);
    expect(rows.length).toBe(2);
    // listByThread ordered by createdAt asc → tak crash, scope thread benar
    expect(rows.every((r) => r.threadId === T1)).toBe(true);
  });
});

describe("ResearchSourceRepo.listByThreadTurn + setCitationNumbers (penomoran sitasi G4)", () => {
  itest("list per turn (runId) + set citation_number batch tanpa menyentuh turn lain", async () => {
    const run = "run-cite";
    const a = srcRow({ turnId: run, locator: "https://c1.test", title: "A" });
    const b = srcRow({ turnId: run, locator: "https://c2.test", title: "B" });
    const other = srcRow({ turnId: "turn-other", locator: "https://c3.test", title: "C" });
    await ResearchSourceRepo.insertMany(db, [a, b, other]);

    const byTurn = await ResearchSourceRepo.listByThreadTurn(db, T1, run);
    expect(byTurn.length).toBe(2);
    expect(byTurn.every((r) => r.turnId === run)).toBe(true);
    expect(byTurn.every((r) => r.citationNumber === null)).toBe(true);

    await ResearchSourceRepo.setCitationNumbers(db, [
      { id: a.id, citationNumber: 1 },
      { id: b.id, citationNumber: 2 },
    ]);
    const after = await ResearchSourceRepo.listByThreadTurn(db, T1, run);
    const numById = new Map(after.map((r) => [r.id, r.citationNumber]));
    expect(numById.get(a.id)).toBe(1);
    expect(numById.get(b.id)).toBe(2);

    // turn lain tak tersentuh oleh UPDATE…CASE (scope inArray).
    const otherRows = await ResearchSourceRepo.listByThreadTurn(db, T1, "turn-other");
    expect(otherRows[0]?.citationNumber).toBe(null);
  });
});

describe("ResearchSourceRepo.setClassification — kolom evidence viz (mig 0027)", () => {
  itest("persist cited_by_count/topics_json saat insert + set klasifikasi batch by id", async () => {
    const run = "run-viz";
    const a = srcRow({
      turnId: run,
      locator: "https://v1.test",
      citedByCount: 42,
      topicsJson: JSON.stringify(["Solar energy", "Photovoltaics"]),
    });
    const b = srcRow({ turnId: run, locator: "https://v2.test" });
    await ResearchSourceRepo.insertMany(db, [a, b]);

    let rows = await ResearchSourceRepo.listByThreadTurn(db, T1, run);
    const rowA = rows.find((r) => r.id === a.id);
    const rowB = rows.find((r) => r.id === b.id);
    expect(rowA?.citedByCount).toBe(42);
    expect(rowA?.topicsJson).toBe(JSON.stringify(["Solar energy", "Photovoltaics"]));
    // Sebelum step analyze: klasifikasi null (jalur chat biasa & run lama aman).
    expect(rowA?.stance).toBe(null);
    expect(rowB?.citedByCount).toBe(null);

    await ResearchSourceRepo.setClassification(db, [
      { id: a.id, stance: "yes", studyDesign: "rct", outcomesJson: JSON.stringify(["mortality"]) },
      { id: b.id, stance: "not_applicable", studyDesign: "other", outcomesJson: null },
    ]);
    rows = await ResearchSourceRepo.listByThreadTurn(db, T1, run);
    const afterA = rows.find((r) => r.id === a.id);
    const afterB = rows.find((r) => r.id === b.id);
    expect(afterA?.stance).toBe("yes");
    expect(afterA?.studyDesign).toBe("rct");
    expect(afterA?.outcomesJson).toBe(JSON.stringify(["mortality"]));
    expect(afterB?.stance).toBe("not_applicable");
    expect(afterB?.outcomesJson).toBe(null);
  });
});

describe("ArtifactEmbeddingRepo.searchSimilar — ANN + scope threadId via JOIN", () => {
  itest("scope threadId → hanya artifact thread itu (lintas-thread excluded)", async () => {
    await seedArtifact(`${SUFFIX}-artA`, T1, 0);
    await seedArtifact(`${SUFFIX}-artB`, T2, 1);

    // query ~ artA (one-hot slot 0). Scope T1 → hanya artA.
    const scoped = await ArtifactEmbeddingRepo.searchSimilar(db, {
      ownerUserId: OWNER,
      queryVector: oneHot(0),
      threadId: T1,
      limit: 5,
    });
    expect(scoped.length).toBe(1);
    expect(scoped[0]?.artifactId).toBe(`${SUFFIX}-artA`);

    // tanpa threadId → scope owner saja → kedua artifact muncul, artA paling dekat
    const all = await ArtifactEmbeddingRepo.searchSimilar(db, {
      ownerUserId: OWNER,
      queryVector: oneHot(0),
      limit: 5,
    });
    expect(all.length).toBe(2);
    expect(all[0]?.artifactId).toBe(`${SUFFIX}-artA`); // distance terkecil dulu
    expect(all[0]!.distance).toBeLessThan(all[1]!.distance);
  });
});
