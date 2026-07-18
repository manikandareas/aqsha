# Research-First Fase 5: Model Dokumen LaTeX Kanonik + Assembly + Storage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mengganti storage byte-DOCX per bab dengan sumber LaTeX teks kanonik: save atomik ber-CAS + revision log, kunci sitasi persisten, assembly per-bab/full-document, dan endpoint compile + storage hasil build (PDF+SyncTeX) yang siap dikonsumsi Fase 6.

**Architecture:** Spec `docs/superpowers/specs/2026-07-18-research-first-phase5-latex-document-model-design.md`. Sumber = artifact type `latex` (teks inline-only di `artifact_contents`, save satu transaksi); kunci `\cite{}` = `citations.bib_key` beku; assembly stateless (`buildPreamble` + `\input` file per bab demi SyncTeX bersih); compile sinkron via `LatexCompileService` gate Fase 4; hasil build latest-only di `latex_builds` + R2.

**Tech Stack:** Bun 1.3.10, Drizzle ORM (postgres), Elysia + t-schema, `@citation-js/core`, Tectonic + biber 2.17 (via `LatexCompileService`), bun:test.

## Global Constraints

- Selalu `bun` — jangan npm/pnpm/yarn. Migration: `bun run db:generate` lalu `bun run db:migrate` dari root. Setelah mengubah `packages/db`/`packages/services`: `bun run build:dist` sebelum api/agent dev.
- Migrasi Drizzle **tanpa backfill** (app Svelte belum cutover).
- Service = object-literal, `db` arg pertama; error terminal `throwAppError` dari `@aqsha/db` (code snake_case + status); hasil produk yang disengaja = union return (`stale_write`, `status:'error'`).
- Komentar kode: why-only, TANPA referensi plan/fase/ticket (aturan `CLAUDE.md`).
- ID `crypto.randomUUID()`; timestamp epoch-ms `bigint({ mode: "number" })`.
- Modul `src/latex/` TIDAK boleh masuk barrel root `@aqsha/services` (runner.ts pakai `Bun.spawn`; barrel root ikut ter-typecheck `apps/web`). File latex TANPA dependency Bun (assembly, cite-scan) boleh di-import langsung per-file dari barrel root — jangan lewat `./latex/index`.
- Nilai enum DB persis: revision author `user | agent | system`; build status `ok | error`; artifact type baru `latex`.
- Konstanta spec: cap sumber 2 MB (`latex_source_too_large`, 413); retensi revisi 20; `\setcounter` heading = `sortOrder` (0-based di DB → nomor bab tampil `sortOrder+1`; spec menulis "sortOrder−1" dengan asumsi 1-based — nilai efektif sama).
- Test DB-integration: skip tanpa `DATABASE_URL`, prefix isolasi unik, cleanup FK-child dulu (pola `packages/db/test/citations.test.ts`). Test compile: gate `Bun.which("tectonic")` + biber (pola `latex-gate.test.ts`). Test storage: gate `S3_BUCKET` dkk.
- Edit file `.svelte`/`.svelte.ts`: WAJIB pakai skill `svelte-code-writer`.

## Peta File

| File | Tanggung jawab |
|---|---|
| `packages/db/src/schema/{artifacts,citations}.ts` | CHECK + `latex`; kolom `bib_key` + unique partial |
| `packages/db/src/schema/documentRevisions.ts` (baru) | Revision log append-only |
| `packages/db/src/schema/latexBuilds.ts` (baru) | Hasil compile latest-only per scope |
| `packages/db/src/repositories/{documentRevisionRepo,latexBuildRepo}.ts` (baru) | Query Drizzle saja |
| `packages/db/src/repositories/{citationRepo,workspaceSectionRepo,artifactRepo}.ts` | `listTakenBibKeys`/`findByBibKeys`; `setDocumentArtifactIfNull`; `updateIfVersion` |
| `packages/services/src/citations/citation-bib.ts` | `proposeBibKeys` (hormati taken) + `composeBibliography` (kunci eksternal) |
| `packages/services/src/citations/citation.service.ts` | `ensureBibKeys` + rework `exportBib` |
| `packages/services/src/latex/cite-scan.ts` (baru) | Scan `\cite` keluarga biblatex (pure, tanpa Bun) |
| `packages/services/src/section-latex.service.ts` (rename dari `section-document.service.ts`) | get/save sumber: CAS + revisi + reconcile usages |
| `packages/services/src/latex/assembly.service.ts` (baru) | Preamble + assembly per-bab/full (pure) |
| `packages/services/src/latex/build.service.ts` (baru) | Orkestrasi compile → simpan hasil |
| `apps/api/src/routes/workspaces.ts` | Route document (JSON) + compile + build |
| `packages/services/src/quota/rate-limits.ts` | Rule `latex:compile` |
| `apps/svelte/src/lib/features/sections/*` | Cabut SuperDoc; stub halaman bab + hooks kontrak baru |

---

### Task 1: Schema DB + migrasi + repo baru

**Files:**
- Modify: `packages/db/src/schema/artifacts.ts:54-57` (CHECK type)
- Modify: `packages/db/src/schema/citations.ts` (kolom + index)
- Create: `packages/db/src/schema/documentRevisions.ts`
- Create: `packages/db/src/schema/latexBuilds.ts`
- Modify: `packages/db/src/schema/index.ts`
- Create: `packages/db/src/repositories/documentRevisionRepo.ts`
- Create: `packages/db/src/repositories/latexBuildRepo.ts`
- Modify: `packages/db/src/repositories/citationRepo.ts`, `workspaceSectionRepo.ts`, `artifactRepo.ts`, `index.ts`
- Test: `packages/db/test/latex-document-model.test.ts`

**Interfaces:**
- Produces: tabel + tipe `DocumentRevision`/`NewDocumentRevision`/`DOCUMENT_REVISION_AUTHORS`/`DocumentRevisionAuthor`, `LatexBuild`/`NewLatexBuild`/`LatexBuildErrorItem`; `Citation.bibKey`; repo `DocumentRevisionRepo{insert, listByArtifact, findByVersion, deleteOlderThan}`, `LatexBuildRepo{findBySection, findFullByWorkspace, insert, updateById}`, `CitationRepo.listTakenBibKeys(db, ownerUserId): Promise<string[]>`, `CitationRepo.findByBibKeys(db, ownerUserId, keys): Promise<Citation[]>`, `WorkspaceSectionRepo.setDocumentArtifactIfNull(db, id, artifactId, now): Promise<boolean>`, `ArtifactRepo.updateIfVersion(db, id, expectedVersion, patch): Promise<boolean>`. Dipakai Task 2, 4, 7.

- [ ] **Step 1: Update CHECK `artifacts_artifact_type_check`**

Di `packages/db/src/schema/artifacts.ts`, ganti isi CHECK type (biarkan komentar 0028 di atasnya):

```ts
    check(
      "artifacts_artifact_type_check",
      sql`${t.artifactType} in ('markdown', 'plain_text', 'pdf', 'docx', 'image', 'spreadsheet', 'html', 'svg', 'mermaid', 'json', 'csv', 'code', 'url', 'latex')`,
    ),
```

Perbarui juga komentar kolom `contentVersion` (baris 40-42) menjadi:

```ts
    // Versi konten dokumen authored (sumber LaTeX bab): +1 tiap save, guard stale_write.
    // Null untuk artifact non-authored (upload/url/markdown lama).
```

- [ ] **Step 2: Kolom `bib_key` di `citations.ts`**

Tambahkan setelah `canonicalKey`:

```ts
    // Kunci \cite{} persisten: di-assign sekali (lazy) lalu beku — kunci yang tertanam
    // di sumber LaTeX tidak boleh bergeser saat himpunan perpustakaan berubah.
    bibKey: text("bib_key"),
```

Tambahkan di array constraint (setelah `citations_by_owner_artifact`):

```ts
    uniqueIndex("citations_by_owner_bib_key")
      .on(t.ownerUserId, t.bibKey)
      .where(sql`${t.bibKey} is not null`),
```

- [ ] **Step 3: Buat `packages/db/src/schema/documentRevisions.ts`**

```ts
import { sql } from "drizzle-orm";
import { bigint, check, index, integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { artifacts } from "./artifacts";
import { users } from "./users";

export const DOCUMENT_REVISION_AUTHORS = ["user", "agent", "system"] as const;
export type DocumentRevisionAuthor = (typeof DOCUMENT_REVISION_AUTHORS)[number];

/**
 * document_revisions — jejak revisi sumber LaTeX per artifact dokumen (append-only,
 * retensi terbatas oleh service). Jaring pengaman pemulihan + basis three-way merge
 * saat stale_write (client memegang baseVersion N bisa meminta revisi N sebagai base
 * merge). Bukan riwayat versi user-facing.
 */
export const documentRevisions = pgTable(
  "document_revisions",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.ownerUserId, { onDelete: "cascade" }),
    artifactId: text("artifact_id")
      .notNull()
      .references(() => artifacts.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    source: text("source").notNull(),
    author: text("author").notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => [
    check("document_revisions_author_check", sql`${t.author} in ('user', 'agent', 'system')`),
    uniqueIndex("document_revisions_by_artifact_version").on(t.artifactId, t.version),
    index("document_revisions_by_owner_artifact").on(t.ownerUserId, t.artifactId),
  ],
);

export type DocumentRevision = typeof documentRevisions.$inferSelect;
export type NewDocumentRevision = typeof documentRevisions.$inferInsert;
```

- [ ] **Step 4: Buat `packages/db/src/schema/latexBuilds.ts`**

```ts
import { sql } from "drizzle-orm";
import { bigint, check, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";
import { workspaces } from "./workspaces";
import { workspaceSections } from "./workspaceSections";

/** Shape error compile (salinan lokal — db tidak boleh depend ke @aqsha/services). */
export type LatexBuildErrorItem = {
  line: number | null;
  message: string;
  severity: "error" | "warning";
};

/**
 * latex_builds — hasil compile TERAKHIR per scope (latest-only): satu baris per bab
 * (`section_id` terisi) + satu baris full-document per proyek (`section_id` null).
 * `source_versions` = peta sectionId→contentVersion yang ter-compile, supaya pembaca
 * selalu bisa mendeteksi build basi tanpa reload buta. Saat status='error', pdf/synctex
 * key MEMPERTAHANKAN build sukses terakhir (viewer tetap punya PDF; errors/log_tail
 * menjelaskan kegagalan terbaru).
 */
export const latexBuilds = pgTable(
  "latex_builds",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.ownerUserId, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sectionId: text("section_id").references(() => workspaceSections.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    pdfR2Key: text("pdf_r2_key"),
    synctexR2Key: text("synctex_r2_key"),
    errors: jsonb("errors").$type<LatexBuildErrorItem[]>(),
    logTail: text("log_tail"),
    sourceVersions: jsonb("source_versions").$type<Record<string, number>>().notNull(),
    builtAt: bigint("built_at", { mode: "number" }).notNull(),
  },
  (t) => [
    check("latex_builds_status_check", sql`${t.status} in ('ok', 'error')`),
    uniqueIndex("latex_builds_by_section").on(t.sectionId).where(sql`${t.sectionId} is not null`),
    uniqueIndex("latex_builds_full_by_workspace")
      .on(t.workspaceId)
      .where(sql`${t.sectionId} is null`),
  ],
);

export type LatexBuild = typeof latexBuilds.$inferSelect;
export type NewLatexBuild = typeof latexBuilds.$inferInsert;
```

- [ ] **Step 5: Export schema baru**

Di `packages/db/src/schema/index.ts`, setelah `export * from "./documentCitationUsages";`:

```ts
export * from "./documentRevisions";
export * from "./latexBuilds";
```

- [ ] **Step 6: Buat `packages/db/src/repositories/documentRevisionRepo.ts`**

```ts
import { and, desc, eq, lt } from "drizzle-orm";
import {
  type DocumentRevision,
  documentRevisions,
  type NewDocumentRevision,
} from "../schema/documentRevisions";
import type { DbOrTx } from "../types";

/** Repo document_revisions — query Drizzle saja; retensi dihitung service. */
export const DocumentRevisionRepo = {
  async insert(db: DbOrTx, row: NewDocumentRevision): Promise<void> {
    await db.insert(documentRevisions).values(row);
  },

  async listByArtifact(
    db: DbOrTx,
    ownerUserId: string,
    artifactId: string,
    limit = 20,
  ): Promise<DocumentRevision[]> {
    return db
      .select()
      .from(documentRevisions)
      .where(
        and(
          eq(documentRevisions.ownerUserId, ownerUserId),
          eq(documentRevisions.artifactId, artifactId),
        ),
      )
      .orderBy(desc(documentRevisions.version))
      .limit(limit);
  },

  async findByVersion(
    db: DbOrTx,
    ownerUserId: string,
    artifactId: string,
    version: number,
  ): Promise<DocumentRevision | null> {
    const rows = await db
      .select()
      .from(documentRevisions)
      .where(
        and(
          eq(documentRevisions.ownerUserId, ownerUserId),
          eq(documentRevisions.artifactId, artifactId),
          eq(documentRevisions.version, version),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  },

  /** Retensi: hapus revisi ber-version < minVersionKept (dipanggil dalam tx save). */
  async deleteOlderThan(db: DbOrTx, artifactId: string, minVersionKept: number): Promise<void> {
    await db
      .delete(documentRevisions)
      .where(
        and(
          eq(documentRevisions.artifactId, artifactId),
          lt(documentRevisions.version, minVersionKept),
        ),
      );
  },
};
```

- [ ] **Step 7: Buat `packages/db/src/repositories/latexBuildRepo.ts`**

```ts
import { and, eq, isNull } from "drizzle-orm";
import { type LatexBuild, latexBuilds, type NewLatexBuild } from "../schema/latexBuilds";
import type { DbOrTx } from "../types";

/** Repo latex_builds (latest-only per scope) — upsert manual di service (select → update/insert). */
export const LatexBuildRepo = {
  async findBySection(
    db: DbOrTx,
    ownerUserId: string,
    sectionId: string,
  ): Promise<LatexBuild | null> {
    const rows = await db
      .select()
      .from(latexBuilds)
      .where(and(eq(latexBuilds.ownerUserId, ownerUserId), eq(latexBuilds.sectionId, sectionId)))
      .limit(1);
    return rows[0] ?? null;
  },

  async findFullByWorkspace(
    db: DbOrTx,
    ownerUserId: string,
    workspaceId: string,
  ): Promise<LatexBuild | null> {
    const rows = await db
      .select()
      .from(latexBuilds)
      .where(
        and(
          eq(latexBuilds.ownerUserId, ownerUserId),
          eq(latexBuilds.workspaceId, workspaceId),
          isNull(latexBuilds.sectionId),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  },

  async insert(db: DbOrTx, row: NewLatexBuild): Promise<void> {
    await db.insert(latexBuilds).values(row);
  },

  async updateById(db: DbOrTx, id: string, patch: Partial<NewLatexBuild>): Promise<void> {
    await db.update(latexBuilds).set(patch).where(eq(latexBuilds.id, id));
  },
};
```

- [ ] **Step 8: Tambah method repo existing**

`packages/db/src/repositories/citationRepo.ts` — tambah `isNotNull` ke import drizzle-orm, lalu dua method setelah `listAllActive`:

```ts
  /**
   * Semua bib_key terpakai owner — TERMASUK citation soft-deleted: kunci direservasi
   * selamanya supaya \cite{} lama di sumber tak pernah menunjuk entri berbeda.
   */
  async listTakenBibKeys(db: DbOrTx, ownerUserId: string): Promise<string[]> {
    const rows = await db
      .select({ bibKey: citations.bibKey })
      .from(citations)
      .where(and(eq(citations.ownerUserId, ownerUserId), isNotNull(citations.bibKey)));
    return rows.flatMap((r) => (r.bibKey ? [r.bibKey] : []));
  },

  async findByBibKeys(db: DbOrTx, ownerUserId: string, keys: string[]): Promise<Citation[]> {
    if (keys.length === 0) return [];
    return db
      .select()
      .from(citations)
      .where(and(eq(citations.ownerUserId, ownerUserId), inArray(citations.bibKey, keys)));
  },
```

`packages/db/src/repositories/workspaceSectionRepo.ts` — tambah `and`, `isNull` ke import drizzle-orm, lalu method setelah `update`:

```ts
  /** Klaim pointer dokumen HANYA bila masih kosong — guard race lazy-create dua penulis. */
  async setDocumentArtifactIfNull(
    db: DbOrTx,
    id: string,
    artifactId: string,
    now: number,
  ): Promise<boolean> {
    const rows = await db
      .update(workspaceSections)
      .set({ documentArtifactId: artifactId, updatedAt: now })
      .where(and(eq(workspaceSections.id, id), isNull(workspaceSections.documentArtifactId)))
      .returning({ id: workspaceSections.id });
    return rows.length > 0;
  },
```

`packages/db/src/repositories/artifactRepo.ts` — tambah method setelah `update` (baris ~172):

```ts
  /** CAS: patch hanya bila content_version masih = expected; false = penulis lain menang. */
  async updateIfVersion(
    db: DbOrTx,
    id: string,
    expectedVersion: number,
    patch: Partial<NewArtifact>,
  ): Promise<boolean> {
    const rows = await db
      .update(artifacts)
      .set(patch)
      .where(and(eq(artifacts.id, id), eq(artifacts.contentVersion, expectedVersion)))
      .returning({ id: artifacts.id });
    return rows.length > 0;
  },
```

(Pastikan `and` sudah ter-import di artifactRepo — cek head file, tambah bila belum.)

`packages/db/src/repositories/index.ts` — setelah `export * from "./documentCitationUsageRepo";`:

```ts
export * from "./documentRevisionRepo";
export * from "./latexBuildRepo";
```

- [ ] **Step 9: Generate & inspeksi migration**

Run: `bun run db:generate`
Expected: file baru `packages/db/migrations/0042_*.sql` berisi: `CREATE TABLE "document_revisions"` + `CREATE TABLE "latex_builds"` (dengan unique index parsial), `ALTER TABLE "citations" ADD COLUMN "bib_key" text` + `CREATE UNIQUE INDEX "citations_by_owner_bib_key" ... WHERE "bib_key" is not null`, dan drop+add constraint `artifacts_artifact_type_check` dengan `'latex'`. Baca file — pastikan TIDAK ada DROP tabel/kolom tak terduga.

- [ ] **Step 10: Jalankan migration**

Run: `bun run db:migrate`
Expected: exit 0, migration 0042 applied.

- [ ] **Step 11: Tulis test DB-integration (gagal dulu wajar bila schema salah)**

Buat `packages/db/test/latex-document-model.test.ts` (pola `citations.test.ts`: gated, prefix isolasi, cleanup):

```ts
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
```

- [ ] **Step 12: Jalankan test**

Run: `cd packages/db && bun test test/latex-document-model.test.ts`
Expected: PASS semua (atau semua skip tanpa `DATABASE_URL` — jalankan dengan env dev dari `packages/db/.env`).

- [ ] **Step 13: Build dist + commit**

```bash
bun run build:dist
git add packages/db docs/superpowers/plans/2026-07-18-research-first-phase5-latex-document-model.md
git commit -m "feat(db): fondasi model dokumen latex — bib_key, document_revisions, latex_builds"
```

---

### Task 2: Kunci sitasi persisten — `proposeBibKeys`/`composeBibliography` + `CitationService.ensureBibKeys`

**Files:**
- Modify: `packages/services/src/citations/citation-bib.ts`
- Modify: `packages/services/src/citations/citation.service.ts` (method `exportBib` ~baris 863 + method baru)
- Modify: `packages/services/src/citations/index.ts` (export baru)
- Modify: `packages/services/src/artifacts/model.ts` (type `latex`)
- Test: `packages/services/test/citation-bib.test.ts` (tambah), `packages/services/test/citation-bibkey.test.ts` (baru, DB-gated)

**Interfaces:**
- Consumes: `CitationRepo.listTakenBibKeys`/`findByIds`/`updateById` (Task 1).
- Produces: `proposeBibKeys(items: Array<{id: string; csl: CslItem}>, taken: Set<string>): Record<string, string>`; `composeBibliography(items: Array<{key: string; csl: CslItem}>): string`; `CitationService.ensureBibKeys(db, { ownerUserId, citationIds }): Promise<Record<string, string>>`; `buildBibliographyFile` tetap (kompat gate test); `artifactTypes` memuat `"latex"` (family `text`, language `latex`). Dipakai Task 4, 7.

- [ ] **Step 1: `latex` di model artifact services**

Di `packages/services/src/artifacts/model.ts`: tambah `"latex",` ke array `artifactTypes` (setelah `"url"`). Di `artifactFamilyForType` tambahkan `case "latex":` ke grup yang return `"text"` (bersama `markdown`/`plain_text`). Di `defaultLanguageForArtifactType` tambahkan `case "latex": return "latex";`. JANGAN tambah ke `uploadAllowedArtifactTypes` maupun `agentWritableArtifactTypes` (sumber bab lahir dari jalur section, bukan upload/propose_artifact).

- [ ] **Step 2: Tulis failing test unit kunci**

Tambahkan di `packages/services/test/citation-bib.test.ts`:

```ts
import { composeBibliography, proposeBibKeys } from "../src/citations/citation-bib";

describe("proposeBibKeys", () => {
  const csl = (family: string, year: number) => ({
    type: "book",
    title: "T",
    author: [{ family }],
    issued: { "date-parts": [[year]] },
  });

  test("menghormati taken set — kunci terpakai tak diberikan ulang", () => {
    const taken = new Set(["sugiyono2019"]);
    const keys = proposeBibKeys([{ id: "a", csl: csl("Sugiyono", 2019) }], taken);
    expect(keys.a).toBe("sugiyono2019a");
    expect(taken.has("sugiyono2019a")).toBe(true);
  });

  test("stabil: item lama tak bergeser saat item baru masuk belakangan", () => {
    const taken = new Set<string>();
    const first = proposeBibKeys([{ id: "a", csl: csl("Creswell", 2018) }], taken);
    const second = proposeBibKeys([{ id: "b", csl: csl("Creswell", 2018) }], taken);
    expect(first.a).toBe("creswell2018");
    expect(second.b).toBe("creswell2018a");
  });
});

describe("composeBibliography", () => {
  test("memakai kunci eksternal apa adanya", () => {
    const bib = composeBibliography([
      { key: "kuncicustom99", csl: { type: "book", title: "Judul", author: [{ family: "Penulis" }] } },
    ]);
    expect(bib).toMatch(/@\w+\{kuncicustom99,/);
  });
});
```

- [ ] **Step 3: Verifikasi gagal**

Run: `cd packages/services && bun test test/citation-bib.test.ts`
Expected: FAIL — `proposeBibKeys`/`composeBibliography` belum ada.

- [ ] **Step 4: Implementasi di `citation-bib.ts`**

Ganti `generateBibKeys` + `buildBibliographyFile` (pertahankan `stripDiacritics`, `collisionSuffix`, `baseBibKey`, type `BibliographyExport`):

```ts
/**
 * Usulkan kunci sitasi untuk item TANPA kunci, menghormati (dan menambah ke) `taken`
 * — himpunan kunci yang sudah direservasi owner. Deterministik terhadap input
 * (diurut by id), hanya [a-z0-9], tabrakan → suffix a/b/c….
 */
export function proposeBibKeys(
  items: Array<{ id: string; csl: CslItem }>,
  taken: Set<string>,
): Record<string, string> {
  const sorted = [...items].sort((a, b) => a.id.localeCompare(b.id));
  const keyById: Record<string, string> = {};
  for (const item of sorted) {
    const base = baseBibKey(item.csl);
    let key = base;
    for (let n = 1; taken.has(key); n++) key = `${base}${collisionSuffix(n)}`;
    taken.add(key);
    keyById[item.id] = key;
  }
  return keyById;
}

/** CSL-JSON + kunci eksternal (bib_key persisten) → isi file .bib dialek biblatex. */
export function composeBibliography(items: Array<{ key: string; csl: CslItem }>): string {
  if (items.length === 0) return "";
  const withKeys = items.map(({ key, csl }) => ({
    // citation-js menolak item tanpa type; fallback generik untuk data lama.
    type: "document",
    ...csl,
    id: key,
    "citation-key": key,
  }));
  const cite = new Cite(withKeys, { generateGraph: false });
  return cite.format("biblatex") as string;
}

/** Kompat: propose dari nol (taken kosong) — untuk pemakai tanpa kunci persisten. */
export function generateBibKeys(
  items: Array<{ id: string; csl: CslItem }>,
): Record<string, string> {
  return proposeBibKeys(items, new Set());
}

/** CSL-JSON perpustakaan → .bib + peta id→kunci (kunci di-propose lokal, non-persisten). */
export function buildBibliographyFile(
  items: Array<{ id: string; csl: CslItem }>,
): BibliographyExport {
  const keyById = generateBibKeys(items);
  const bib = composeBibliography(items.map(({ id, csl }) => ({ key: keyById[id]!, csl })));
  return { bib, keyById };
}
```

- [ ] **Step 5: `ensureBibKeys` + rework `exportBib` di `citation.service.ts`**

Tambah import `proposeBibKeys, composeBibliography` dari `./citation-bib`. Tambah method di `CitationService` (dekat `exportBib`):

```ts
  /**
   * Pastikan tiap citation punya bib_key persisten; kembalikan peta id→kunci.
   * Kunci di-assign SEKALI lalu beku — \cite{} yang tertanam di sumber tak boleh
   * bergeser. Race assign paralel ditangkap unique index → refresh taken + retry.
   */
  async ensureBibKeys(
    db: DbOrTx,
    input: { ownerUserId: string; citationIds: string[] },
  ): Promise<Record<string, string>> {
    const rows = await CitationRepo.findByIds(db, input.ownerUserId, input.citationIds);
    const keyById: Record<string, string> = {};
    const missing: typeof rows = [];
    for (const row of rows) {
      if (row.bibKey) keyById[row.id] = row.bibKey;
      else missing.push(row);
    }
    if (missing.length === 0) return keyById;

    const taken = new Set(await CitationRepo.listTakenBibKeys(db, input.ownerUserId));
    const proposed = proposeBibKeys(
      missing.map((r) => ({ id: r.id, csl: r.cslJson as CslItem })),
      taken,
    );
    const now = Date.now();
    for (const row of missing) {
      let key = proposed[row.id]!;
      for (let attempt = 0; ; attempt++) {
        try {
          await CitationRepo.updateById(db, row.id, { bibKey: key, updatedAt: now });
          break;
        } catch (err) {
          if ((err as { code?: string }).code !== "23505" || attempt >= 3) throw err;
          const fresh = new Set(await CitationRepo.listTakenBibKeys(db, input.ownerUserId));
          key = proposeBibKeys([{ id: row.id, csl: row.cslJson as CslItem }], fresh)[row.id]!;
        }
      }
      keyById[row.id] = key;
    }
    return keyById;
  },
```

Ganti isi `exportBib` menjadi:

```ts
  async exportBib(
    db: DbOrTx,
    input: { ownerUserId: string; citationIds?: string[] },
  ): Promise<BibliographyExport> {
    const rows = input.citationIds?.length
      ? (await CitationRepo.findByIds(db, input.ownerUserId, input.citationIds)).filter(
          (r) => !r.deletedAt,
        )
      : await CitationRepo.listAllActive(db, input.ownerUserId);
    const keyById = await this.ensureBibKeys(db, {
      ownerUserId: input.ownerUserId,
      citationIds: rows.map((r) => r.id),
    });
    const bib = composeBibliography(
      rows.map((r) => ({ key: keyById[r.id]!, csl: r.cslJson as CslItem })),
    );
    return { bib, keyById };
  },
```

Export `proposeBibKeys`/`composeBibliography` dari `packages/services/src/citations/index.ts` (samakan gaya export `buildBibliographyFile` existing).

- [ ] **Step 6: Test DB-gated `ensureBibKeys`**

Buat `packages/services/test/citation-bibkey.test.ts`:

```ts
/**
 * bib_key persisten — DB integration (skip tanpa DATABASE_URL). Membuktikan:
 * assign lazy sekali → beku; penambahan library TIDAK menggeser kunci lama;
 * tabrakan penulis+tahun → suffix; exportBib memakai kunci tersimpan.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { createDb, CitationRepo } from "@aqsha/db";
import { CitationService } from "../src/citations/citation.service";

const DATABASE_URL = process.env.DATABASE_URL;
const itest = DATABASE_URL ? test : test.skip;
const SUFFIX = Math.floor(Math.random() * 1e9);
const OWNER = `itbk_${SUFFIX}`;
const NOW = 1_700_000_000_000;
const { db, client } = createDb(DATABASE_URL ?? "postgresql://x");

function cit(id: string, family: string, year: number) {
  return {
    id: `${OWNER}:${id}`,
    ownerUserId: OWNER,
    artifactId: null,
    source: "manual" as const,
    provider: null,
    externalId: null,
    documentType: "book",
    title: `Judul ${id}`,
    authorsJson: [{ family }],
    publishedYear: year,
    venue: null,
    publisher: null,
    doi: null,
    url: null,
    tags: [],
    cslJson: { type: "book", title: `Judul ${id}`, author: [{ family }], issued: { "date-parts": [[year]] } },
    canonicalKey: `ck:${id}`,
    bibKey: null,
    metadataStatus: "verified" as const,
    reviewedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
  };
}

afterAll(async () => {
  if (!DATABASE_URL) return;
  await client`delete from citations where owner_user_id like 'itbk_%'`;
  await client`delete from users where owner_user_id like 'itbk_%'`;
  await client.end();
});

describe("CitationService.ensureBibKeys", () => {
  itest("assign lazy sekali, beku, tabrakan ber-suffix, export pakai kunci tersimpan", async () => {
    await client`insert into users (owner_user_id, clerk_user_id, email, created_at, updated_at)
      values (${OWNER}, ${OWNER}, ${`${OWNER}@test.local`}, ${NOW}, ${NOW})`;
    await CitationRepo.insert(db, cit("c1", "Sugiyono", 2019));
    const first = await CitationService.ensureBibKeys(db, {
      ownerUserId: OWNER,
      citationIds: [`${OWNER}:c1`],
    });
    expect(first[`${OWNER}:c1`]).toBe("sugiyono2019");

    // Item baru penulis+tahun sama → suffix; kunci lama TIDAK berubah.
    await CitationRepo.insert(db, cit("c2", "Sugiyono", 2019));
    const second = await CitationService.ensureBibKeys(db, {
      ownerUserId: OWNER,
      citationIds: [`${OWNER}:c1`, `${OWNER}:c2`],
    });
    expect(second[`${OWNER}:c1`]).toBe("sugiyono2019");
    expect(second[`${OWNER}:c2`]).toBe("sugiyono2019a");

    // Idempoten: panggilan ulang mengembalikan kunci sama tanpa menulis ulang.
    const third = await CitationService.ensureBibKeys(db, {
      ownerUserId: OWNER,
      citationIds: [`${OWNER}:c2`],
    });
    expect(third[`${OWNER}:c2`]).toBe("sugiyono2019a");

    const exported = await CitationService.exportBib(db, {
      ownerUserId: OWNER,
      citationIds: [`${OWNER}:c1`, `${OWNER}:c2`],
    });
    expect(exported.bib).toContain("@");
    expect(exported.keyById[`${OWNER}:c1`]).toBe("sugiyono2019");
    expect(exported.keyById[`${OWNER}:c2`]).toBe("sugiyono2019a");
  });
});
```

- [ ] **Step 7: Jalankan semua test terkait**

Run: `cd packages/services && bun test test/citation-bib.test.ts test/citation-bibkey.test.ts test/citation-service.test.ts test/latex-gate.test.ts`
Expected: PASS (gate test tetap hijau — `buildBibliographyFile` kompat; gate butuh toolchain, skip bila absen).

- [ ] **Step 8: Commit**

```bash
bun run build:dist
git add packages/services
git commit -m "feat(citations): bib_key persisten — proposeBibKeys/composeBibliography + ensureBibKeys"
```

---

### Task 3: `scanCiteKeys` — pemindai perintah sitasi biblatex

**Files:**
- Create: `packages/services/src/latex/cite-scan.ts`
- Test: `packages/services/test/latex-cite-scan.test.ts`

**Interfaces:**
- Produces: `scanCiteKeys(source: string): string[]` (urutan kemunculan, duplikat dipertahankan), `stripTexComments(source: string): string`. Pure, TANPA dependency Bun — aman di-import barrel root. Dipakai Task 4.

- [ ] **Step 1: Failing test**

Buat `packages/services/test/latex-cite-scan.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { scanCiteKeys, stripTexComments } from "../src/latex/cite-scan";

describe("stripTexComments", () => {
  test("buang komentar % sampai akhir baris, pertahankan \\%", () => {
    expect(stripTexComments("a % komentar \\cite{x}\nb \\% bukan komentar")).toBe(
      "a \nb \\% bukan komentar",
    );
  });
});

describe("scanCiteKeys", () => {
  test("urutan dokumen + duplikat dipertahankan", () => {
    expect(scanCiteKeys("\\cite{a} lalu \\cite{b} lalu \\cite{a}")).toEqual(["a", "b", "a"]);
  });

  test("keluarga perintah biblatex + multi-key koma", () => {
    const src =
      "\\parencite{a,b} \\textcite{c} \\autocite{d} \\footcite{e} \\fullcite{f} \\Cite{g} \\nocite{h}";
    expect(scanCiteKeys(src)).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]);
  });

  test("varian multi \\cites mengambil semua grup kurawal", () => {
    expect(scanCiteKeys("\\cites{a}{b,c}")).toEqual(["a", "b", "c"]);
  });

  test("perintah tunggal hanya mengambil grup pertama", () => {
    expect(scanCiteKeys("\\cite{a}{bukan-key}")).toEqual(["a"]);
  });

  test("prenote/postnote dilewati", () => {
    expect(scanCiteKeys("\\parencite[lihat][hlm. 3]{a}")).toEqual(["a"]);
  });

  test("baris ter-komentar diabaikan; \\nocite{*} dilewati", () => {
    expect(scanCiteKeys("% \\cite{mati}\n\\nocite{*}\n\\cite{hidup}")).toEqual(["hidup"]);
  });
});
```

- [ ] **Step 2: Verifikasi gagal**

Run: `cd packages/services && bun test test/latex-cite-scan.test.ts`
Expected: FAIL — modul belum ada.

- [ ] **Step 3: Implementasi `packages/services/src/latex/cite-scan.ts`**

```ts
/**
 * Pemindai perintah sitasi biblatex dari sumber LaTeX — dasar rekonsiliasi
 * document_citation_usages saat save. Pragmatis (regex, bukan parser TeX): cukup
 * untuk perintah sitasi umum; key yang tak dikenal di perpustakaan diabaikan caller.
 */

// Varian multi (\cites{a}{b}) mengambil SEMUA grup kurawal beruntun; perintah tunggal
// hanya grup pertama (grup kedua di prosa bukan bagian perintah).
const MULTI_CITE = new Set([
  "cites",
  "parencites",
  "textcites",
  "autocites",
  "footcites",
  "smartcites",
]);

// Alternation: bentuk plural lebih dulu supaya "cites" tak termakan "cite".
const CITE_RE =
  /\\(cites|Cites|parencites|Parencites|textcites|Textcites|autocites|Autocites|footcites|smartcites|cite|Cite|parencite|Parencite|textcite|Textcite|autocite|Autocite|footcite|fullcite|smartcite|Smartcite|nocite)\*?\s*((?:\[[^\]\n]*\]\s*)*)((?:\{[^{}]*\}\s*)+)/g;

/** Buang komentar TeX (% sampai akhir baris) dengan menghormati escape \%. */
export function stripTexComments(source: string): string {
  return source
    .split("\n")
    .map((line) => {
      let from = 0;
      while (true) {
        const idx = line.indexOf("%", from);
        if (idx === -1) return line;
        if (idx > 0 && line[idx - 1] === "\\") {
          from = idx + 1;
          continue;
        }
        return line.slice(0, idx);
      }
    })
    .join("\n");
}

/** Semua key sitasi dalam urutan kemunculan (duplikat dipertahankan). */
export function scanCiteKeys(source: string): string[] {
  const text = stripTexComments(source);
  const out: string[] = [];
  for (const match of text.matchAll(CITE_RE)) {
    const command = match[1]!;
    const braces = [...match[3]!.matchAll(/\{([^{}]*)\}/g)].map((b) => b[1] ?? "");
    const groups = MULTI_CITE.has(command.toLowerCase()) ? braces : braces.slice(0, 1);
    for (const group of groups) {
      for (const raw of group.split(",")) {
        const key = raw.trim();
        if (key && key !== "*") out.push(key);
      }
    }
  }
  return out;
}
```

- [ ] **Step 4: Verifikasi pass + commit**

Run: `cd packages/services && bun test test/latex-cite-scan.test.ts`
Expected: PASS.

```bash
git add packages/services/src/latex/cite-scan.ts packages/services/test/latex-cite-scan.test.ts
git commit -m "feat(latex): scanCiteKeys — pemindai perintah sitasi biblatex"
```

---

### Task 4: `SectionLatexService` (save atomik CAS + revisi + reconcile) + cutover route document

**Files:**
- Create: `packages/services/src/section-latex.service.ts` (menggantikan `section-document.service.ts` — file lama DIHAPUS)
- Delete: `packages/services/src/section-document.service.ts`, `packages/services/test/section-document.test.ts`
- Modify: `packages/services/src/index.ts:11-15` (barrel)
- Modify: `apps/api/src/routes/workspaces.ts` (route `PUT/GET /sections/:id/document`)
- Test: `packages/services/test/section-latex.test.ts`

**Interfaces:**
- Consumes: `scanCiteKeys` (Task 3), `CitationRepo.findByBibKeys` / `WorkspaceSectionRepo.setDocumentArtifactIfNull` / `ArtifactRepo.updateIfVersion` / `DocumentRevisionRepo` (Task 1), `CitationUsageService.reconcileClusters` (existing).
- Produces:
  - `SectionLatexService.getDocument(db, { ownerUserId, sectionId }): Promise<SectionDocumentPayload>` dengan `SectionDocumentPayload = { artifactId: string; source: string; contentVersion: number; updatedAt: number } | null`
  - `SectionLatexService.saveDocument(db, { ownerUserId, sectionId, source, baseVersion?, author }): Promise<SaveSectionDocumentResult>` dengan `SaveSectionDocumentResult = { status: "saved"; artifactId: string; contentVersion: number; sectionStatus: SectionStatus } | { status: "stale_write"; currentVersion: number }`
  - `type DocumentAuthor = "user" | "agent" | "system"`; `LATEX_SOURCE_MAX_BYTES = 2 * 1024 * 1024`; `DOCUMENT_REVISION_RETENTION = 20`.
  Dipakai Task 5 (svelte), 7 (build service).

- [ ] **Step 1: Failing test integrasi**

Buat `packages/services/test/section-latex.test.ts`:

```ts
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
  });

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
});
```

- [ ] **Step 2: Verifikasi gagal**

Run: `cd packages/services && bun test test/section-latex.test.ts`
Expected: FAIL — `section-latex.service.ts` belum ada.

- [ ] **Step 3: Tulis `packages/services/src/section-latex.service.ts` + hapus file lama**

Hapus `packages/services/src/section-document.service.ts` dan `packages/services/test/section-document.test.ts`. Buat:

```ts
import {
  ArtifactContentRepo,
  ArtifactRepo,
  CitationRepo,
  type Db,
  type DbOrTx,
  DocumentRevisionRepo,
  type SectionStatus,
  throwAppError,
  WorkspaceSectionRepo,
} from "@aqsha/db";
import { previewFromText } from "./artifacts/model";
import { CitationUsageService, type ParsedCitationCluster } from "./citations/citation-usages";
import { scanCiteKeys } from "./latex/cite-scan";
import { SectionService } from "./section.service";

export const LATEX_SOURCE_MAX_BYTES = 2 * 1024 * 1024;
export const DOCUMENT_REVISION_RETENTION = 20;

export type DocumentAuthor = "user" | "agent" | "system";

export type SaveSectionDocumentResult =
  | { status: "saved"; artifactId: string; contentVersion: number; sectionStatus: SectionStatus }
  | { status: "stale_write"; currentVersion: number };

export type SectionDocumentPayload = {
  artifactId: string;
  source: string;
  contentVersion: number;
  updatedAt: number;
} | null;

/** Sentinel rollback: kalah race di dalam tx → keluar sebagai stale_write, bukan throw API. */
class StaleWriteRollback extends Error {}

/** \cite scan → cluster usage (satu kemunculan = satu cluster; key asing diabaikan). */
async function clustersFromSource(
  db: DbOrTx,
  ownerUserId: string,
  source: string,
): Promise<ParsedCitationCluster[]> {
  const keys = scanCiteKeys(source);
  if (keys.length === 0) return [];
  const rows = await CitationRepo.findByBibKeys(db, ownerUserId, [...new Set(keys)]);
  const idByKey = new Map(rows.flatMap((r) => (r.bibKey ? [[r.bibKey, r.id] as const] : [])));
  return keys.flatMap((key) => {
    const citationId = idByKey.get(key);
    return citationId ? [{ nodeId: "", citationIds: [citationId], locator: {} }] : [];
  });
}

export const SectionLatexService = {
  /** Sumber LaTeX bab + versi. Null = bab belum pernah ditulis (lazy-create saat save pertama). */
  async getDocument(
    db: DbOrTx,
    input: { ownerUserId: string; sectionId: string },
  ): Promise<SectionDocumentPayload> {
    const section = await SectionService.assertSectionOwner(db, input.ownerUserId, input.sectionId);
    if (!section.documentArtifactId) return null;
    const artifact = await ArtifactRepo.findById(db, section.documentArtifactId);
    if (!artifact || artifact.ownerUserId !== input.ownerUserId || artifact.status !== "active") {
      return null;
    }
    const content = await ArtifactContentRepo.findByArtifact(db, input.ownerUserId, artifact.id);
    return {
      artifactId: artifact.id,
      source: content?.plainText ?? "",
      contentVersion: artifact.contentVersion ?? 0,
      updatedAt: artifact.updatedAt,
    };
  },

  /**
   * Simpan sumber LaTeX satu bab — SATU transaksi atomik: teks + versi + revisi +
   * usages + status bab naik bersama, atau tidak sama sekali (sumber selalu inline
   * Postgres, tak pernah R2 — tak ada jendela blob/DB saling bohong).
   *
   * Versi optimistic: `baseVersion` wajib cocok → selain itu union `stale_write`
   * (semua penulis — user, agen, system — lewat jalur ini; konsumen dilarang
   * menimpa, wajib baca-ulang/merge). Race lazy-create dipagari klaim pointer
   * kondisional; race di dalam tx dipagari update versi kondisional.
   */
  async saveDocument(
    db: Db,
    input: {
      ownerUserId: string;
      sectionId: string;
      source: string;
      baseVersion?: number;
      author: DocumentAuthor;
    },
  ): Promise<SaveSectionDocumentResult> {
    const section = await SectionService.assertSectionOwner(db, input.ownerUserId, input.sectionId);
    if (section.role === "bibliography") {
      throwAppError({
        message: "Daftar pustaka digenerate otomatis dan tidak bisa diedit",
        code: "bibliography_not_editable",
        severity: "warning",
        status: 422,
      });
    }
    if (Buffer.byteLength(input.source, "utf8") > LATEX_SOURCE_MAX_BYTES) {
      throwAppError({
        message: "Sumber LaTeX terlalu besar. Maksimum 2 MB.",
        code: "latex_source_too_large",
        severity: "warning",
        status: 413,
      });
    }

    const now = Date.now();
    const clusters = await clustersFromSource(db, input.ownerUserId, input.source);
    const sectionStatus: SectionStatus =
      section.status === "empty" ? "draft" : (section.status as SectionStatus);

    if (!section.documentArtifactId) {
      const artifactId = crypto.randomUUID();
      try {
        await db.transaction(async (tx) => {
          await ArtifactRepo.insert(tx, {
            id: artifactId,
            ownerUserId: input.ownerUserId,
            workspaceId: section.workspaceId,
            folderId: null,
            threadId: null,
            artifactType: "latex",
            artifactFamily: "text",
            source: "manual",
            title: section.title,
            language: "latex",
            mimeType: null,
            fileName: null,
            byteSize: null,
            indexingStatus: "not_indexed",
            indexingFailureReason: null,
            detectedDocumentKind: null,
            storageR2Key: null,
            ragEntryId: null,
            plainTextPreview: previewFromText(input.source),
            indexedAt: null,
            contentVersion: 1,
            status: "active",
            deletedAt: null,
            createdAt: now,
            updatedAt: now,
          });
          await ArtifactContentRepo.insert(tx, {
            id: crypto.randomUUID(),
            ownerUserId: input.ownerUserId,
            workspaceId: section.workspaceId,
            threadId: null,
            artifactId,
            blocksJson: null,
            markdown: "",
            plainText: input.source,
            contextText: "",
            plainTextR2Key: null,
            blocksJsonR2Key: null,
            markdownR2Key: null,
            createdAt: now,
            updatedAt: now,
          });
          const claimed = await WorkspaceSectionRepo.setDocumentArtifactIfNull(
            tx,
            section.id,
            artifactId,
            now,
          );
          if (!claimed) throw new StaleWriteRollback();
          if (section.status === "empty") {
            await WorkspaceSectionRepo.update(tx, section.id, { status: "draft", updatedAt: now });
          }
          await DocumentRevisionRepo.insert(tx, {
            id: crypto.randomUUID(),
            ownerUserId: input.ownerUserId,
            artifactId,
            version: 1,
            source: input.source,
            author: input.author,
            createdAt: now,
          });
          await CitationUsageService.reconcileClusters(tx, {
            ownerUserId: input.ownerUserId,
            workspaceId: section.workspaceId,
            documentArtifactId: artifactId,
            clusters,
          });
        });
      } catch (err) {
        if (err instanceof StaleWriteRollback) {
          const current = await this.getDocument(db, {
            ownerUserId: input.ownerUserId,
            sectionId: input.sectionId,
          });
          return { status: "stale_write", currentVersion: current?.contentVersion ?? 0 };
        }
        throw err;
      }
      return { status: "saved", artifactId, contentVersion: 1, sectionStatus };
    }

    const artifact = await ArtifactRepo.findById(db, section.documentArtifactId);
    if (
      !artifact ||
      artifact.ownerUserId !== input.ownerUserId ||
      artifact.status !== "active" ||
      artifact.artifactType !== "latex"
    ) {
      throwAppError({
        message: "Dokumen bab tidak ditemukan",
        code: "section_document_not_found",
        severity: "error",
        status: 404,
      });
    }
    const currentVersion = artifact.contentVersion ?? 0;
    if (input.baseVersion === undefined || input.baseVersion !== currentVersion) {
      return { status: "stale_write", currentVersion };
    }
    const nextVersion = currentVersion + 1;
    try {
      await db.transaction(async (tx) => {
        const won = await ArtifactRepo.updateIfVersion(tx, artifact.id, currentVersion, {
          contentVersion: nextVersion,
          plainTextPreview: previewFromText(input.source),
          updatedAt: now,
        });
        if (!won) throw new StaleWriteRollback();
        await ArtifactContentRepo.updateByArtifact(tx, artifact.id, {
          plainText: input.source,
          plainTextR2Key: null,
          updatedAt: now,
        });
        await DocumentRevisionRepo.insert(tx, {
          id: crypto.randomUUID(),
          ownerUserId: input.ownerUserId,
          artifactId: artifact.id,
          version: nextVersion,
          source: input.source,
          author: input.author,
          createdAt: now,
        });
        await DocumentRevisionRepo.deleteOlderThan(
          tx,
          artifact.id,
          nextVersion - DOCUMENT_REVISION_RETENTION + 1,
        );
        if (section.status === "empty") {
          await WorkspaceSectionRepo.update(tx, section.id, { status: "draft", updatedAt: now });
        }
        await CitationUsageService.reconcileClusters(tx, {
          ownerUserId: input.ownerUserId,
          workspaceId: section.workspaceId,
          documentArtifactId: artifact.id,
          clusters,
        });
      });
    } catch (err) {
      if (err instanceof StaleWriteRollback) {
        const fresh = await ArtifactRepo.findById(db, artifact.id);
        return { status: "stale_write", currentVersion: fresh?.contentVersion ?? currentVersion };
      }
      throw err;
    }
    return { status: "saved", artifactId: artifact.id, contentVersion: nextVersion, sectionStatus };
  },
};
```

- [ ] **Step 4: Update barrel `packages/services/src/index.ts`**

Ganti blok export lama (baris 11-15) dengan:

```ts
export {
  DOCUMENT_REVISION_RETENTION,
  type DocumentAuthor,
  LATEX_SOURCE_MAX_BYTES,
  type SaveSectionDocumentResult,
  type SectionDocumentPayload,
  SectionLatexService,
} from "./section-latex.service";
```

- [ ] **Step 5: Cutover route `apps/api/src/routes/workspaces.ts`**

Ganti import (hapus `parseClustersJson`, `SectionDocumentService`, `MAX_UPLOAD_BYTES`; tambah `SectionLatexService`):

```ts
import {
  FolderService,
  SectionLatexService,
  SectionService,
  WorkspaceService,
} from "@aqsha/services";
```

Ganti route `.put("/sections/:id/document", …)` lama dengan dua route (author selalu `user` — nilai `agent`/`system` hanya dari pemanggilan service internal, tak pernah dari HTTP):

```ts
  .get(
    "/sections/:id/document",
    ({ ownerUserId, params }) => {
      const { db } = getDb();
      return SectionLatexService.getDocument(db, { ownerUserId, sectionId: params.id });
    },
    { auth: true },
  )
  .put(
    "/sections/:id/document",
    ({ ownerUserId, params, body }) => {
      const { db } = getDb();
      return SectionLatexService.saveDocument(db, {
        ownerUserId,
        sectionId: params.id,
        source: body.source,
        baseVersion: body.baseVersion,
        author: "user",
      });
    },
    {
      auth: true,
      // Tanpa rateLimit: dipanggil autosave debounced — limiter akan memutus penyimpanan.
      body: t.Object({
        source: t.String(),
        baseVersion: t.Optional(t.Numeric()),
      }),
    },
  )
```

- [ ] **Step 6: Jalankan test + typecheck services/api**

Run: `cd packages/services && bun test test/section-latex.test.ts && bunx tsc --noEmit`
Expected: test PASS; typecheck services exit 0.
Run: `cd apps/api && bunx tsc --noEmit`
Expected: exit 0. (`apps/svelte` sengaja BELUM — dibereskan Task 5.)

- [ ] **Step 7: Commit**

```bash
bun run build:dist
git add packages/services apps/api
git commit -m "feat(sections): sumber LaTeX kanonik — save atomik CAS + revision log + cite-scan usages"
```

---

### Task 5: Cabut SuperDoc dari `apps/svelte` (typecheck hijau kembali)

**Files:**
- Delete: `apps/svelte/src/lib/features/sections/superdoc-client.ts`, `components/SectionDocumentEditor.svelte`, `autosave.svelte.ts`, `autosave.spec.ts`
- Modify: `apps/svelte/src/lib/features/sections/api.ts`, `pages/SectionEditorPage.svelte`, `apps/svelte/package.json` (hapus dep `superdoc`)

**Interfaces:**
- Consumes: endpoint `GET/PUT /sections/:id/document` (Task 4) via Eden Treaty.
- Produces: `useSectionDocument(sectionId)` (query GET) + `useSaveSectionDocument(sectionId, workspaceId)` (mutation `{ source, baseVersion? }`); halaman bab jadi stub read-only (viewer PDF + editor menyusul di fase berikutnya). Konsumen UI penuh = Fase 6/7.

Catatan: editor SuperDoc = artefak gate NO-GO — dead code + dependency AGPL; dicabut supaya typecheck repo hijau terhadap kontrak route baru. WAJIB pakai skill `svelte-code-writer` untuk file `.svelte`/`.svelte.ts`.

- [ ] **Step 1: Hapus file SuperDoc + dependency**

```bash
rm apps/svelte/src/lib/features/sections/superdoc-client.ts \
   apps/svelte/src/lib/features/sections/autosave.svelte.ts \
   apps/svelte/src/lib/features/sections/autosave.spec.ts \
   apps/svelte/src/lib/features/sections/components/SectionDocumentEditor.svelte
```

Hapus baris `"superdoc": "1.45.0",` dari `apps/svelte/package.json`, lalu `bun install` dari root.

- [ ] **Step 2: Tulis ulang hooks `api.ts`**

Ganti `useSaveSectionDocument` + type di `apps/svelte/src/lib/features/sections/api.ts` (pertahankan `useWorkspaceBibliography` apa adanya):

```ts
export type SectionDocumentPayload = {
	artifactId: string;
	source: string;
	contentVersion: number;
	updatedAt: number;
} | null;

export type SaveSectionDocumentResult =
	| { status: 'saved'; artifactId: string; contentVersion: number; sectionStatus: string }
	| { status: 'stale_write'; currentVersion: number };

/** Sumber LaTeX bab (null = belum pernah ditulis). */
export function useSectionDocument(sectionId: () => string) {
	const api = getApiClient();
	return createQuery(() => ({
		queryKey: queryKeys.workspaces.sectionDocument(sectionId()),
		queryFn: async () =>
			unwrap(await api.sections({ id: sectionId() }).document.get()) as SectionDocumentPayload
	}));
}

/**
 * Simpan sumber LaTeX bab. `baseVersion` mismatch → `stale_write` (union, bukan throw).
 * PENTING (aturan spec): respons save TIDAK boleh memicu refetch/replace buffer editor —
 * hanya perbarui baseVersion pemanggil; buffer client = source of truth selama mengetik.
 */
export function useSaveSectionDocument(sectionId: () => string, workspaceId: () => string) {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (input: { source: string; baseVersion?: number }) =>
			unwrap(
				await api.sections({ id: sectionId() }).document.put({
					source: input.source,
					...(input.baseVersion !== undefined ? { baseVersion: input.baseVersion } : {})
				})
			) as SaveSectionDocumentResult,
		onSuccess: (result: SaveSectionDocumentResult) => {
			if (result.status !== 'saved') return;
			qc.invalidateQueries({ queryKey: queryKeys.workspaces.sections(workspaceId()) });
			qc.invalidateQueries({ queryKey: queryKeys.citations.bibliography(workspaceId()) });
		}
	}));
}
```

Tambahkan key `sectionDocument: (sectionId: string) => [...]` di objek `queryKeys.workspaces` (`apps/svelte/src/lib/query.ts` — ikuti pola key `sections` yang ada di file itu).

- [ ] **Step 3: Stub `SectionEditorPage.svelte`**

Tulis ulang `apps/svelte/src/lib/features/sections/pages/SectionEditorPage.svelte` menjadi halaman read-only ringan: pakai `useSectionDocument`; render judul bab (props `projectId`/`sectionId` tetap), badge versi (`Sumber v{contentVersion}`) bila dokumen ada, teks kosong-state "Bab ini belum ditulis" bila null, dan satu kalimat "Viewer PDF dan penyuntingan hadir di fase berikutnya." Gaya: token DS existing (lihat `DESIGN.md`), tanpa komponen baru. Tidak ada composer/simpan di stub ini.

- [ ] **Step 4: Sapu sisa referensi**

Run: `grep -rn "superdoc\|SectionDocumentEditor\|autosave" apps/svelte/src --include="*.ts" --include="*.svelte"`
Expected: 0 hasil (perbaiki sisa yang muncul, mis. import di `document-authoring.ts` / `ArtifactDetailView.svelte` bila menyentuh file terhapus).

- [ ] **Step 5: Typecheck svelte + seluruh repo**

Run: `cd apps/svelte && bun run check`
Expected: exit 0 (error pra-eksis di `apps/web` bukan urusan task ini; `apps/svelte` harus bersih).

- [ ] **Step 6: Commit**

```bash
git add apps/svelte bun.lock
git commit -m "chore(svelte): cabut editor SuperDoc — stub halaman bab + hooks kontrak sumber LaTeX"
```

---

### Task 6: `LatexAssemblyService` — preamble + assembly per-bab & full-document

**Files:**
- Create: `packages/services/src/latex/assembly.service.ts`
- Modify: `packages/services/src/latex/index.ts` (export)
- Test: `packages/services/test/latex-assembly.test.ts`

**Interfaces:**
- Produces (pure, tanpa Bun):
  - `escapeLatex(value: string): string`
  - `buildPreamble(input: AssemblyProjectInput): string`
  - `assembleSection(project: AssemblyProjectInput, section: AssemblySectionInput): AssembledDocument`
  - `assembleWorkspace(project: AssemblyProjectInput, sections: AssemblySectionInput[]): AssembledDocument`
  - `sectionFilePath(sectionId: string): string`
  - Types: `AssemblyProjectInput = { title: string; author?: string | null; kind: string; styleId: string }`; `AssemblySectionInput = { id: string; title: string; sortOrder: number; role: string | null; source: string | null }`; `AssembledDocument = { mainTex: string; extraFiles: Record<string, Uint8Array> }`.
  Dipakai Task 7.

- [ ] **Step 1: Failing test**

Buat `packages/services/test/latex-assembly.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  assembleSection,
  assembleWorkspace,
  buildPreamble,
  escapeLatex,
  sectionFilePath,
} from "../src/latex/assembly.service";

const decoder = new TextDecoder();
const PROJECT = {
  title: "Analisis A & B",
  author: "Vito",
  kind: "undergraduate_thesis",
  styleId: "apa-7",
};

describe("escapeLatex", () => {
  test("meng-escape karakter spesial TeX", () => {
    expect(escapeLatex("A & B_50% #1 $x$ {y} ~z^ \\w")).toBe(
      "A \\& B\\_50\\% \\#1 \\$x\\$ \\{y\\} \\textasciitilde{}z\\textasciicircum{} \\textbackslash{}w",
    );
  });
});

describe("buildPreamble", () => {
  test("thesis kind → report; style biblatex ter-mapping; judul di-escape", () => {
    const p = buildPreamble(PROJECT);
    expect(p).toContain("\\documentclass[12pt]{report}");
    expect(p).toContain("style=apa");
    expect(p).toContain("\\addbibresource{refs.bib}");
    expect(p).toContain("Analisis A \\& B");
  });

  test("kind non-thesis → article; style tak dikenal → authoryear", () => {
    const p = buildPreamble({ ...PROJECT, kind: "journal_article", styleId: "aneh" });
    expect(p).toContain("\\documentclass[12pt]{article}");
    expect(p).toContain("style=authoryear");
  });

  test("ieee → numeric-compatible mapping ieee; vancouver → numeric", () => {
    expect(buildPreamble({ ...PROJECT, styleId: "ieee" })).toContain("style=ieee");
    expect(buildPreamble({ ...PROJECT, styleId: "vancouver" })).toContain("style=numeric");
  });
});

describe("assembleSection", () => {
  test("body verbatim di file terpisah; heading+setcounter di mainTex", () => {
    const source = "Baris pertama.\nBaris kedua \\cite{a}.";
    const { mainTex, extraFiles } = assembleSection(PROJECT, {
      id: "sec-1",
      title: "Pendahuluan & Latar",
      sortOrder: 2,
      role: null,
      source,
    });
    const filePath = sectionFilePath("sec-1");
    // File bab = sumber user apa adanya → baris N file = baris N sumber (SyncTeX bersih).
    expect(decoder.decode(extraFiles[filePath])).toBe(source);
    expect(mainTex).toContain(`\\setcounter{chapter}{2}`);
    expect(mainTex).toContain("\\chapter{Pendahuluan \\& Latar}");
    expect(mainTex).toContain(`\\input{${filePath}}`);
    expect(mainTex).toContain("\\printbibliography");
  });
});

describe("assembleWorkspace", () => {
  const sections = [
    { id: "s2", title: "Bab 2", sortOrder: 1, role: null, source: "Isi bab dua." },
    { id: "s1", title: "Bab 1", sortOrder: 0, role: null, source: "Isi bab satu." },
    { id: "sbib", title: "Daftar Pustaka", sortOrder: 2, role: "bibliography", source: null },
    { id: "skosong", title: "Bab Kosong", sortOrder: 3, role: null, source: null },
  ];

  test("urut sortOrder; bibliography → \\printbibliography di posisinya; bab kosong dilewati", () => {
    const { mainTex, extraFiles } = assembleWorkspace(PROJECT, sections);
    const i1 = mainTex.indexOf("\\chapter{Bab 1}");
    const i2 = mainTex.indexOf("\\chapter{Bab 2}");
    const ibib = mainTex.indexOf("\\printbibliography");
    expect(i1).toBeGreaterThan(-1);
    expect(i1).toBeLessThan(i2);
    expect(i2).toBeLessThan(ibib);
    expect(mainTex).toContain("\\maketitle");
    expect(mainTex).not.toContain("Bab Kosong");
    expect(Object.keys(extraFiles).sort()).toEqual(["sections/s1.tex", "sections/s2.tex"]);
  });

  test("tanpa section bibliography → \\printbibliography fallback di akhir", () => {
    const { mainTex } = assembleWorkspace(PROJECT, sections.slice(0, 2));
    expect(mainTex).toContain("\\printbibliography");
  });
});
```

- [ ] **Step 2: Verifikasi gagal**

Run: `cd packages/services && bun test test/latex-assembly.test.ts`
Expected: FAIL — modul belum ada.

- [ ] **Step 3: Implementasi `packages/services/src/latex/assembly.service.ts`**

```ts
/**
 * Assembly dokumen LaTeX: preamble stateless + body per-bab + titik sisip bibliografi.
 * Pure (tanpa Bun/IO) supaya deterministik & teruji unit.
 *
 * Kontrak body: sumber bab TIDAK memuat \chapter — heading disisipkan di mainTex dari
 * judul section (rename di UI otomatis sinkron; agen hanya menulis isi). Body ditulis
 * verbatim ke file terpisah `sections/<id>.tex` yang di-\input → SyncTeX mengatribusi
 * baris langsung ke file bab tanpa aritmetika offset.
 */

export type AssemblyProjectInput = {
  title: string;
  author?: string | null;
  kind: string;
  styleId: string;
};

export type AssemblySectionInput = {
  id: string;
  title: string;
  sortOrder: number;
  role: string | null;
  source: string | null;
};

export type AssembledDocument = {
  mainTex: string;
  extraFiles: Record<string, Uint8Array>;
};

const REPORT_KINDS = new Set(["undergraduate_thesis", "masters_thesis", "dissertation"]);

// Mapping CitationStyleId → style biblatex. Paket apa/ieee/chicago harus tercache di
// bundle offline Tectonic; miss muncul sebagai latex_bundle_missing (sinyal ops).
// vancouver belum punya paket di bundle → numeric (fallback terdekat).
const BIBLATEX_STYLE: Record<string, string> = {
  "apa-7": "apa",
  ieee: "ieee",
  "chicago-author-date": "chicago-authordate",
  vancouver: "numeric",
};
const FALLBACK_STYLE = "authoryear";

const encoder = new TextEncoder();

export function escapeLatex(value: string): string {
  // Single-pass supaya hasil escape tidak ter-escape ulang oleh pass berikutnya.
  return value.replace(/[\\&%$#_{}~^]/g, (ch) => {
    switch (ch) {
      case "\\":
        return "\\textbackslash{}";
      case "~":
        return "\\textasciitilde{}";
      case "^":
        return "\\textasciicircum{}";
      default:
        return `\\${ch}`;
    }
  });
}

function headingCommand(kind: string): "chapter" | "section" {
  return REPORT_KINDS.has(kind) ? "chapter" : "section";
}

export function sectionFilePath(sectionId: string): string {
  return `sections/${sectionId}.tex`;
}

export function buildPreamble(input: AssemblyProjectInput): string {
  const documentclass = REPORT_KINDS.has(input.kind) ? "report" : "article";
  const style = BIBLATEX_STYLE[input.styleId] ?? FALLBACK_STYLE;
  return [
    `\\documentclass[12pt]{${documentclass}}`,
    "\\usepackage{amsmath}",
    "\\usepackage{graphicx}",
    `\\usepackage[backend=biber,style=${style}]{biblatex}`,
    "\\addbibresource{refs.bib}",
    `\\title{${escapeLatex(input.title)}}`,
    `\\author{${escapeLatex(input.author ?? "")}}`,
    "\\date{}",
  ].join("\n");
}

/** Dokumen per-bab (loop edit cepat): nomor bab dipaksa mengikuti posisi di kerangka. */
export function assembleSection(
  project: AssemblyProjectInput,
  section: AssemblySectionInput,
): AssembledDocument {
  const heading = headingCommand(project.kind);
  const filePath = sectionFilePath(section.id);
  const mainTex = [
    buildPreamble(project),
    "\\begin{document}",
    // sort_order 0-based; \chapter menaikkan counter → nomor tampil sortOrder+1,
    // sama dengan posisinya di dokumen penuh.
    `\\setcounter{${heading}}{${Math.max(0, section.sortOrder)}}`,
    `\\${heading}{${escapeLatex(section.title)}}`,
    `\\input{${filePath}}`,
    "\\printbibliography",
    "\\end{document}",
    "",
  ].join("\n");
  return { mainTex, extraFiles: { [filePath]: encoder.encode(section.source ?? "") } };
}

/** Dokumen penuh: semua bab urut kerangka; section role=bibliography → \printbibliography. */
export function assembleWorkspace(
  project: AssemblyProjectInput,
  sections: AssemblySectionInput[],
): AssembledDocument {
  const heading = headingCommand(project.kind);
  const ordered = [...sections].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
  );
  const lines = [buildPreamble(project), "\\begin{document}", "\\maketitle"];
  const extraFiles: Record<string, Uint8Array> = {};
  let hasBibliography = false;
  for (const section of ordered) {
    if (section.role === "bibliography") {
      lines.push("\\printbibliography");
      hasBibliography = true;
      continue;
    }
    if (section.source == null) continue;
    const filePath = sectionFilePath(section.id);
    lines.push(`\\${heading}{${escapeLatex(section.title)}}`, `\\input{${filePath}}`);
    extraFiles[filePath] = encoder.encode(section.source);
  }
  if (!hasBibliography) lines.push("\\printbibliography");
  lines.push("\\end{document}", "");
  return { mainTex: lines.join("\n"), extraFiles };
}
```

- [ ] **Step 4: Export dari `packages/services/src/latex/index.ts`**

Tambahkan:

```ts
export {
  type AssembledDocument,
  type AssemblyProjectInput,
  type AssemblySectionInput,
  assembleSection,
  assembleWorkspace,
  buildPreamble,
  escapeLatex,
  sectionFilePath,
} from "./assembly.service";
export { scanCiteKeys, stripTexComments } from "./cite-scan";
```

- [ ] **Step 5: Verifikasi pass + commit**

Run: `cd packages/services && bun test test/latex-assembly.test.ts && bunx tsc --noEmit`
Expected: PASS + exit 0.

```bash
git add packages/services
git commit -m "feat(latex): assembly service — preamble stateless + per-bab/full-document"
```

---

### Task 7: `LatexBuildService` — compile → simpan hasil (latest-only + R2)

**Files:**
- Create: `packages/services/src/latex/build.service.ts`
- Modify: `packages/services/src/latex/index.ts` (export)
- Test: `packages/services/test/latex-build-service.test.ts` (guard-path, DB-gated tanpa toolchain)

**Interfaces:**
- Consumes: `assembleSection`/`assembleWorkspace` (Task 6), `LatexCompileService.compile` (existing), `SectionLatexService.getDocument` (Task 4), `CitationService.ensureBibKeys` + `composeBibliography` (Task 2), `LatexBuildRepo`/`WorkspaceCitationLinkRepo`/`WorkspaceCitationSettingsRepo`/`CitationRepo` (Task 1/existing), `StorageService.storeBytes`/`getSignedReadUrl`/`deleteObject`.
- Produces:
  - `LatexBuildService.compileSection(db, { ownerUserId, sectionId }): Promise<LatexBuildOutcome>`
  - `LatexBuildService.compileWorkspace(db, { ownerUserId, workspaceId }): Promise<LatexBuildOutcome>`
  - `LatexBuildService.getSectionBuild(db, { ownerUserId, sectionId }): Promise<LatexBuildView | null>`
  - `LatexBuildService.getWorkspaceBuild(db, { ownerUserId, workspaceId }): Promise<LatexBuildView | null>`
  - `LatexBuildOutcome = { status: "ok"; buildId: string } | { status: "error"; errors: CompileError[] }`
  - `LatexBuildView = { id: string; status: "ok" | "error"; errors: CompileError[] | null; logTail: string | null; sourceVersions: Record<string, number>; builtAt: number; pdfUrl: string | null }`
  Dipakai Task 8 (route), Task 9 (e2e).

- [ ] **Step 1: Failing test guard-path**

Buat `packages/services/test/latex-build-service.test.ts`:

```ts
/**
 * LatexBuildService guard-path — DB integration (skip tanpa DATABASE_URL), TANPA
 * toolchain/S3: bab tanpa dokumen → section_document_not_found; section bibliography →
 * bibliography_not_editable; getBuild tanpa build → null. Jalur sukses ada di e2e.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { AppError, createDb, WorkspaceSectionRepo } from "@aqsha/db";
import { LatexBuildService } from "../src/latex/build.service";

const DATABASE_URL = process.env.DATABASE_URL;
const itest = DATABASE_URL ? test : test.skip;
const SUFFIX = Math.floor(Math.random() * 1e9);
const OWNER = `itlb_${SUFFIX}`;
const WS = `itlb_${SUFFIX}:ws`;
const SEC = `itlb_${SUFFIX}:sec`;
const SEC_BIB = `itlb_${SUFFIX}:secbib`;
const NOW = 1_700_000_000_000;
const { db, client } = createDb(DATABASE_URL ?? "postgresql://x");

afterAll(async () => {
  if (!DATABASE_URL) return;
  await client`delete from workspace_sections where workspace_id like 'itlb_%'`;
  await client`delete from workspaces where owner_user_id like 'itlb_%'`;
  await client`delete from users where owner_user_id like 'itlb_%'`;
  await client.end();
});

describe("LatexBuildService guard", () => {
  itest("bab tanpa dokumen → section_document_not_found; bibliography → tolak; build null", async () => {
    await client`insert into users (owner_user_id, clerk_user_id, email, created_at, updated_at)
      values (${OWNER}, ${OWNER}, ${`${OWNER}@test.local`}, ${NOW}, ${NOW})`;
    await client`insert into workspaces (id, owner_user_id, name, kind, stage, status, created_at, updated_at)
      values (${WS}, ${OWNER}, ${"Uji"}, ${"undergraduate_thesis"}, ${"writing"}, ${"active"}, ${NOW}, ${NOW})`;
    await WorkspaceSectionRepo.insertMany(db, [
      { id: SEC, workspaceId: WS, title: "Bab 1", sortOrder: 0, status: "empty", role: null, documentArtifactId: null, createdAt: NOW, updatedAt: NOW },
      { id: SEC_BIB, workspaceId: WS, title: "Daftar Pustaka", sortOrder: 1, status: "empty", role: "bibliography", documentArtifactId: null, createdAt: NOW, updatedAt: NOW },
    ]);
    await expect(
      LatexBuildService.compileSection(db, { ownerUserId: OWNER, sectionId: SEC }),
    ).rejects.toThrow(AppError);
    await expect(
      LatexBuildService.compileSection(db, { ownerUserId: OWNER, sectionId: SEC_BIB }),
    ).rejects.toThrow(AppError);
    expect(await LatexBuildService.getSectionBuild(db, { ownerUserId: OWNER, sectionId: SEC })).toBeNull();
    expect(
      await LatexBuildService.getWorkspaceBuild(db, { ownerUserId: OWNER, workspaceId: WS }),
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Verifikasi gagal**

Run: `cd packages/services && bun test test/latex-build-service.test.ts`
Expected: FAIL — modul belum ada.

- [ ] **Step 3: Implementasi `packages/services/src/latex/build.service.ts`**

```ts
import {
  CitationRepo,
  type Db,
  type LatexBuild,
  LatexBuildRepo,
  type NewLatexBuild,
  throwAppError,
  WorkspaceCitationLinkRepo,
  WorkspaceCitationSettingsRepo,
  WorkspaceSectionRepo,
} from "@aqsha/db";
import { composeBibliography } from "../citations/citation-bib";
import type { CslItem } from "../citations/citation-normalize";
import { CitationService } from "../citations/citation.service";
import { SectionLatexService } from "../section-latex.service";
import { SectionService } from "../section.service";
import { StorageService } from "../storage.service";
import { WorkspaceService } from "../workspace.service";
import {
  type AssembledDocument,
  type AssemblyProjectInput,
  assembleSection,
  assembleWorkspace,
} from "./assembly.service";
import { type LatexCompileResult, LatexCompileService } from "./compile.service";
import type { CompileError } from "./types";

const LOG_TAIL_CHARS = 4000;

export type LatexBuildOutcome =
  | { status: "ok"; buildId: string }
  | { status: "error"; errors: CompileError[] };

export type LatexBuildView = {
  id: string;
  status: "ok" | "error";
  errors: CompileError[] | null;
  logTail: string | null;
  sourceVersions: Record<string, number>;
  builtAt: number;
  pdfUrl: string | null;
};

/** .bib proyek = seluruh sitasi ter-link workspace, kunci persisten; biblatex hanya
 * merender yang disitasi sehingga tak perlu subset per-bab. */
async function projectBib(db: Db, ownerUserId: string, workspaceId: string): Promise<string> {
  const links = await WorkspaceCitationLinkRepo.listByWorkspace(db, workspaceId);
  const ids = [...new Set(links.map((l) => l.citationId))];
  if (ids.length === 0) return "";
  const keyById = await CitationService.ensureBibKeys(db, { ownerUserId, citationIds: ids });
  const rows = (await CitationRepo.findByIds(db, ownerUserId, ids)).filter((r) => !r.deletedAt);
  return composeBibliography(
    rows.map((r) => ({ key: keyById[r.id]!, csl: r.cslJson as CslItem })),
  );
}

async function projectInput(
  db: Db,
  ownerUserId: string,
  workspaceId: string,
): Promise<AssemblyProjectInput> {
  const workspace = await WorkspaceService.assertWorkspaceOwner(db, ownerUserId, workspaceId);
  const settings = await WorkspaceCitationSettingsRepo.findByWorkspace(db, workspaceId);
  return {
    title: workspace.name || workspace.topicNote || "Tanpa judul",
    author: null,
    kind: workspace.kind,
    styleId: settings?.defaultStyleId ?? "apa-7",
  };
}

async function deleteStaleKeys(keys: Array<string | null | undefined>): Promise<void> {
  for (const key of keys) {
    if (!key) continue;
    try {
      await StorageService.deleteObject(key);
    } catch (err) {
      console.error("[latex-build] stale key delete failed", key, err);
    }
  }
}

/** Upsert baris latest-only per scope + simpan blob. Saat error, pdf/synctex key
 * build sukses terakhir DIPERTAHANKAN (viewer tetap punya PDF; errors menjelaskan). */
async function persistBuild(
  db: Db,
  input: {
    ownerUserId: string;
    workspaceId: string;
    sectionId: string | null;
    result: LatexCompileResult;
    sourceVersions: Record<string, number>;
  },
): Promise<LatexBuildOutcome> {
  const existing = input.sectionId
    ? await LatexBuildRepo.findBySection(db, input.ownerUserId, input.sectionId)
    : await LatexBuildRepo.findFullByWorkspace(db, input.ownerUserId, input.workspaceId);
  const now = Date.now();

  if (!input.result.ok) {
    const patch = {
      status: "error" as const,
      errors: input.result.errors,
      logTail: input.result.log.slice(-LOG_TAIL_CHARS),
      sourceVersions: input.sourceVersions,
      builtAt: now,
    };
    if (existing) {
      await LatexBuildRepo.updateById(db, existing.id, patch);
    } else {
      await insertBuild(db, {
        id: crypto.randomUUID(),
        ownerUserId: input.ownerUserId,
        workspaceId: input.workspaceId,
        sectionId: input.sectionId,
        pdfR2Key: null,
        synctexR2Key: null,
        ...patch,
      });
    }
    return { status: "error", errors: input.result.errors };
  }

  // Blob dulu, pointer kemudian: upload gagal → throw, pointer lama tetap valid.
  const idSlot = input.sectionId ?? input.workspaceId;
  const pdfKey = await StorageService.storeBytes(
    input.ownerUserId,
    idSlot,
    "latex-pdf",
    input.result.pdf,
    "application/pdf",
  );
  const synctexKey = input.result.synctex
    ? await StorageService.storeBytes(
        input.ownerUserId,
        idSlot,
        "latex-synctex",
        input.result.synctex,
        "application/gzip",
      )
    : null;
  const patch = {
    status: "ok" as const,
    pdfR2Key: pdfKey,
    synctexR2Key: synctexKey,
    errors: null,
    logTail: null,
    sourceVersions: input.sourceVersions,
    builtAt: now,
  };
  let buildId: string;
  if (existing) {
    await LatexBuildRepo.updateById(db, existing.id, patch);
    buildId = existing.id;
  } else {
    buildId = crypto.randomUUID();
    await insertBuild(db, {
      id: buildId,
      ownerUserId: input.ownerUserId,
      workspaceId: input.workspaceId,
      sectionId: input.sectionId,
      ...patch,
    });
  }
  await deleteStaleKeys([existing?.pdfR2Key, existing?.synctexR2Key]);
  return { status: "ok", buildId };
}

/** Race dua compile paralel pada scope sama → unique index; kalah insert = jadi update. */
async function insertBuild(db: Db, row: NewLatexBuild): Promise<void> {
  try {
    await LatexBuildRepo.insert(db, row);
  } catch (err) {
    if ((err as { code?: string }).code !== "23505") throw err;
    const racer = row.sectionId
      ? await LatexBuildRepo.findBySection(db, row.ownerUserId, row.sectionId)
      : await LatexBuildRepo.findFullByWorkspace(db, row.ownerUserId, row.workspaceId);
    if (!racer) throw err;
    const { id: _id, ownerUserId: _o, workspaceId: _w, sectionId: _s, ...patch } = row;
    await LatexBuildRepo.updateById(db, racer.id, patch);
  }
}

function toView(row: LatexBuild, pdfUrl: string | null): LatexBuildView {
  return {
    id: row.id,
    status: row.status as "ok" | "error",
    errors: (row.errors as CompileError[] | null) ?? null,
    logTail: row.logTail,
    sourceVersions: row.sourceVersions,
    builtAt: row.builtAt,
    pdfUrl,
  };
}

async function viewOf(row: LatexBuild | null): Promise<LatexBuildView | null> {
  if (!row) return null;
  const pdfUrl = row.pdfR2Key ? await StorageService.getSignedReadUrl(row.pdfR2Key) : null;
  return toView(row, pdfUrl);
}

export const LatexBuildService = {
  /** Compile satu bab (loop edit cepat) — sinkron; hasil dipersist latest-only. */
  async compileSection(
    db: Db,
    input: { ownerUserId: string; sectionId: string },
  ): Promise<LatexBuildOutcome> {
    const section = await SectionService.assertSectionOwner(db, input.ownerUserId, input.sectionId);
    if (section.role === "bibliography") {
      throwAppError({
        message: "Daftar pustaka dirender saat compile dokumen penuh",
        code: "bibliography_not_editable",
        severity: "warning",
        status: 422,
      });
    }
    const doc = await SectionLatexService.getDocument(db, {
      ownerUserId: input.ownerUserId,
      sectionId: input.sectionId,
    });
    if (!doc) {
      throwAppError({
        message: "Bab belum punya sumber untuk di-compile",
        code: "section_document_not_found",
        severity: "warning",
        status: 404,
      });
    }
    const project = await projectInput(db, input.ownerUserId, section.workspaceId);
    const bib = await projectBib(db, input.ownerUserId, section.workspaceId);
    const assembled: AssembledDocument = assembleSection(project, {
      id: section.id,
      title: section.title,
      sortOrder: section.sortOrder,
      role: section.role,
      source: doc.source,
    });
    const result = await LatexCompileService.compile({
      mainTex: assembled.mainTex,
      extraFiles: assembled.extraFiles,
      bib,
    });
    return persistBuild(db, {
      ownerUserId: input.ownerUserId,
      workspaceId: section.workspaceId,
      sectionId: section.id,
      result,
      sourceVersions: { [section.id]: doc.contentVersion },
    });
  },

  /** Compile dokumen penuh (preview akhir/ekspor) — bab tanpa sumber dilewati. */
  async compileWorkspace(
    db: Db,
    input: { ownerUserId: string; workspaceId: string },
  ): Promise<LatexBuildOutcome> {
    const project = await projectInput(db, input.ownerUserId, input.workspaceId);
    const sections = await WorkspaceSectionRepo.listByWorkspace(db, input.workspaceId);
    const sourceVersions: Record<string, number> = {};
    const assemblyInputs = [];
    for (const section of sections) {
      if (section.role === "bibliography") {
        assemblyInputs.push({
          id: section.id,
          title: section.title,
          sortOrder: section.sortOrder,
          role: section.role,
          source: null,
        });
        continue;
      }
      const doc = await SectionLatexService.getDocument(db, {
        ownerUserId: input.ownerUserId,
        sectionId: section.id,
      });
      if (doc) sourceVersions[section.id] = doc.contentVersion;
      assemblyInputs.push({
        id: section.id,
        title: section.title,
        sortOrder: section.sortOrder,
        role: section.role,
        source: doc?.source ?? null,
      });
    }
    const bib = await projectBib(db, input.ownerUserId, input.workspaceId);
    const assembled = assembleWorkspace(project, assemblyInputs);
    const result = await LatexCompileService.compile({
      mainTex: assembled.mainTex,
      extraFiles: assembled.extraFiles,
      bib,
    });
    return persistBuild(db, {
      ownerUserId: input.ownerUserId,
      workspaceId: input.workspaceId,
      sectionId: null,
      result,
      sourceVersions,
    });
  },

  async getSectionBuild(
    db: Db,
    input: { ownerUserId: string; sectionId: string },
  ): Promise<LatexBuildView | null> {
    await SectionService.assertSectionOwner(db, input.ownerUserId, input.sectionId);
    return viewOf(await LatexBuildRepo.findBySection(db, input.ownerUserId, input.sectionId));
  },

  async getWorkspaceBuild(
    db: Db,
    input: { ownerUserId: string; workspaceId: string },
  ): Promise<LatexBuildView | null> {
    await WorkspaceService.assertWorkspaceOwner(db, input.ownerUserId, input.workspaceId);
    return viewOf(await LatexBuildRepo.findFullByWorkspace(db, input.ownerUserId, input.workspaceId));
  },
};
```

Export dari `packages/services/src/latex/index.ts`:

```ts
export {
  LatexBuildService,
  type LatexBuildOutcome,
  type LatexBuildView,
} from "./build.service";
```

- [ ] **Step 4: Verifikasi pass + commit**

Run: `cd packages/services && bun test test/latex-build-service.test.ts && bunx tsc --noEmit`
Expected: PASS + exit 0.

```bash
bun run build:dist
git add packages/services
git commit -m "feat(latex): build service — compile per-bab/full + storage hasil latest-only"
```

---

### Task 8: Route compile/build + rate limit

**Files:**
- Modify: `packages/services/src/quota/rate-limits.ts` (rule `latex:compile`)
- Modify: `apps/api/src/routes/workspaces.ts`
- Test: `apps/api/test/latex-routes.test.ts`

**Interfaces:**
- Consumes: `LatexBuildService` (Task 7) via `@aqsha/services/latex`; `SectionLatexService` (Task 4).
- Produces endpoint: `POST /sections/:id/compile`, `GET /sections/:id/build`, `POST /workspaces/:id/compile`, `GET /workspaces/:id/build` (semua `auth: true`; compile ber-rate-limit `latex:compile`).

- [ ] **Step 1: Rule rate limit**

Di `packages/services/src/quota/rate-limits.ts`: tambah `| "latex:compile"` ke union `RateLimitRule`, dan entri di `RATE_LIMIT_RULES`:

```ts
  // Compile LaTeX sinkron memakan CPU detik-an per panggilan; 10/menit/user cukup untuk
  // loop edit manusia + agen, sekaligus mencegah antrean compile menumpuk.
  "latex:compile": { points: 10, duration: 60 },
```

- [ ] **Step 2: Route baru di `apps/api/src/routes/workspaces.ts`**

Tambah import: `import { LatexBuildService } from "@aqsha/services/latex";`

Tambahkan setelah route `PUT /sections/:id/document`:

```ts
  .post(
    "/sections/:id/compile",
    ({ ownerUserId, params }) => {
      const { db } = getDb();
      return LatexBuildService.compileSection(db, { ownerUserId, sectionId: params.id });
    },
    { auth: true, rateLimit: "latex:compile" },
  )
  .get(
    "/sections/:id/build",
    ({ ownerUserId, params }) => {
      const { db } = getDb();
      return LatexBuildService.getSectionBuild(db, { ownerUserId, sectionId: params.id });
    },
    { auth: true },
  )
  .post(
    "/workspaces/:id/compile",
    ({ ownerUserId, params }) => {
      const { db } = getDb();
      return LatexBuildService.compileWorkspace(db, { ownerUserId, workspaceId: params.id });
    },
    { auth: true, rateLimit: "latex:compile" },
  )
  .get(
    "/workspaces/:id/build",
    ({ ownerUserId, params }) => {
      const { db } = getDb();
      return LatexBuildService.getWorkspaceBuild(db, { ownerUserId, workspaceId: params.id });
    },
    { auth: true },
  )
```

- [ ] **Step 3: Test route document + build (DB-gated, tanpa toolchain)**

Buat `apps/api/test/latex-routes.test.ts` (pola `threads.test.ts`: mock Clerk, helper `req`, seed via SQL, cleanup):

```ts
/**
 * Route dokumen LaTeX + build — DB integration (skip tanpa DATABASE_URL); compile
 * TIDAK diuji di sini (butuh toolchain+S3 — e2e services). Membuktikan wiring route:
 * GET document null → PUT save → GET berisi → PUT basi → stale_write; GET build null.
 */
import { afterAll, describe, expect, mock, test } from "bun:test";
import { createDb } from "@aqsha/db";

mock.module("../src/clients/clerkToken", () => ({
  verifyClerkToken: async (token: string) =>
    token.startsWith("tok_") ? { sub: token.slice(4), email: null } : null,
}));

const DATABASE_URL = process.env.DATABASE_URL;
const itest = DATABASE_URL ? test : test.skip;
const suffix = Math.floor(Math.random() * 1e9);
const OWNER = `user_itest_lx_${suffix}`;
const WS = `ws_itest_lx_${suffix}`;
const SEC = `sec_itest_lx_${suffix}`;
const NOW = 1_700_000_000_000;

const { app } = await import("../src/index");

function req(method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { authorization: `Bearer tok_${OWNER}` };
  if (body !== undefined) headers["content-type"] = "application/json";
  return app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

async function seed() {
  const { client } = createDb(DATABASE_URL!);
  await client`insert into users (owner_user_id, clerk_user_id, email, created_at, updated_at)
    values (${OWNER}, ${OWNER}, ${`${OWNER}@test.local`}, ${NOW}, ${NOW})`;
  await client`insert into workspaces (id, owner_user_id, name, kind, stage, status, created_at, updated_at)
    values (${WS}, ${OWNER}, ${"Skripsi"}, ${"undergraduate_thesis"}, ${"writing"}, ${"active"}, ${NOW}, ${NOW})`;
  await client`insert into workspace_sections (id, workspace_id, title, sort_order, status, created_at, updated_at)
    values (${SEC}, ${WS}, ${"Bab 1"}, ${0}, ${"empty"}, ${NOW}, ${NOW})`;
  await client.end();
}

afterAll(async () => {
  if (!DATABASE_URL) return;
  const { client } = createDb(DATABASE_URL);
  await client`delete from document_citation_usages where owner_user_id like 'user_itest_lx_%'`;
  await client`delete from document_revisions where owner_user_id like 'user_itest_lx_%'`;
  await client`delete from latex_builds where owner_user_id like 'user_itest_lx_%'`;
  await client`delete from workspace_sections where workspace_id like 'ws_itest_lx_%'`;
  await client`delete from artifact_contents where owner_user_id like 'user_itest_lx_%'`;
  await client`delete from artifacts where owner_user_id like 'user_itest_lx_%'`;
  await client`delete from workspaces where owner_user_id like 'user_itest_lx_%'`;
  await client`delete from users where owner_user_id like 'user_itest_lx_%'`;
  await client.end();
});

describe("route dokumen latex", () => {
  itest("roundtrip GET/PUT document + stale_write + build null", async () => {
    await seed();
    const empty = await req("GET", `/sections/${SEC}/document`);
    expect(empty.status).toBe(200);
    expect(await empty.json()).toBeNull();

    const saved = await req("PUT", `/sections/${SEC}/document`, {
      source: "Halo \\LaTeX.",
    });
    expect(saved.status).toBe(200);
    const savedBody = (await saved.json()) as { status: string; contentVersion: number };
    expect(savedBody.status).toBe("saved");
    expect(savedBody.contentVersion).toBe(1);

    const got = await req("GET", `/sections/${SEC}/document`);
    const gotBody = (await got.json()) as { source: string; contentVersion: number };
    expect(gotBody.source).toBe("Halo \\LaTeX.");
    expect(gotBody.contentVersion).toBe(1);

    const stale = await req("PUT", `/sections/${SEC}/document`, {
      source: "tanpa baseVersion",
    });
    expect(((await stale.json()) as { status: string }).status).toBe("stale_write");

    const build = await req("GET", `/sections/${SEC}/build`);
    expect(build.status).toBe(200);
    expect(await build.json()).toBeNull();
    const wsBuild = await req("GET", `/workspaces/${WS}/build`);
    expect(await wsBuild.json()).toBeNull();
  });
});
```

- [ ] **Step 4: Jalankan + commit**

Run: `bun run build:dist && cd apps/api && bun test test/latex-routes.test.ts && bunx tsc --noEmit`
Expected: PASS + exit 0.

```bash
git add packages/services apps/api
git commit -m "feat(api): endpoint compile/build latex + rate limit latex:compile"
```

---

### Task 9: E2E gaya gate + verifikasi penuh + dokumen

**Files:**
- Test: `packages/services/test/latex-phase5-e2e.test.ts`
- Modify: `docs/superpowers/specs/2026-07-17-research-first-repositioning-design.md` (roadmap baris Fase 5 → ✅), `docs/superpowers/specs/2026-07-18-research-first-phase-planning-context.md` (header: Fase 5 selesai)

**Interfaces:**
- Consumes: seluruh hasil Task 1–8.

- [ ] **Step 1: Tulis e2e (gated DATABASE_URL + toolchain + S3)**

Buat `packages/services/test/latex-phase5-e2e.test.ts`:

```ts
/**
 * E2E Fase 5 (gaya gate Fase 4): save 2 bab ber-\cite → compileSection & compileWorkspace
 * → PDF tersimpan + bibliografi ter-render + synctex menunjuk file bab + source_versions
 * terisi. Gated: DATABASE_URL + toolchain tectonic/biber + S3 (MinIO dev).
 */
import { afterAll, describe, expect, test } from "bun:test";
import { createDb, WorkspaceSectionRepo } from "@aqsha/db";
import { PDFDocument } from "pdf-lib";
import { CitationService } from "../src/citations/citation.service";
import { LatexBuildService } from "../src/latex/build.service";
import { parseSynctex, synctexInverseLookup } from "../src/latex/synctex";
import { SectionLatexService } from "../src/section-latex.service";
import { StorageService } from "../src/storage.service";

const hasToolchain =
  Bun.which("tectonic") !== null &&
  (Bun.which("tectonic-biber") !== null || Bun.which("biber") !== null);
const hasInfra = Boolean(process.env.DATABASE_URL && process.env.S3_BUCKET);
const itest = hasToolchain && hasInfra ? test : test.skip;

const SUFFIX = Math.floor(Math.random() * 1e9);
const OWNER = `ite2e_${SUFFIX}`;
const WS = `ite2e_${SUFFIX}:ws`;
const SEC1 = `ite2e_${SUFFIX}:sec1`;
const SEC2 = `ite2e_${SUFFIX}:sec2`;
const SECBIB = `ite2e_${SUFFIX}:secbib`;
const CIT = `ite2e_${SUFFIX}:cit`;
const NOW = 1_700_000_000_000;
const { db, client } = createDb(process.env.DATABASE_URL ?? "postgresql://x");

afterAll(async () => {
  if (!process.env.DATABASE_URL) return;
  await client`delete from latex_builds where owner_user_id like 'ite2e_%'`;
  await client`delete from document_citation_usages where owner_user_id like 'ite2e_%'`;
  await client`delete from document_revisions where owner_user_id like 'ite2e_%'`;
  await client`delete from workspace_citation_links where workspace_id like 'ite2e_%'`;
  await client`delete from workspace_sections where workspace_id like 'ite2e_%'`;
  await client`delete from artifact_contents where owner_user_id like 'ite2e_%'`;
  await client`delete from artifacts where owner_user_id like 'ite2e_%'`;
  await client`delete from citations where owner_user_id like 'ite2e_%'`;
  await client`delete from workspaces where owner_user_id like 'ite2e_%'`;
  await client`delete from users where owner_user_id like 'ite2e_%'`;
  await client.end();
});

describe("fase 5 e2e: sumber → assembly → compile → build tersimpan", () => {
  itest("compileSection & compileWorkspace menghasilkan build ok + synctex ke file bab", async () => {
    await client`insert into users (owner_user_id, clerk_user_id, email, created_at, updated_at)
      values (${OWNER}, ${OWNER}, ${`${OWNER}@test.local`}, ${NOW}, ${NOW})`;
    await client`insert into workspaces (id, owner_user_id, name, kind, stage, status, created_at, updated_at)
      values (${WS}, ${OWNER}, ${"Skripsi E2E"}, ${"undergraduate_thesis"}, ${"writing"}, ${"active"}, ${NOW}, ${NOW})`;
    await WorkspaceSectionRepo.insertMany(db, [
      { id: SEC1, workspaceId: WS, title: "Pendahuluan", sortOrder: 0, status: "empty", role: null, documentArtifactId: null, createdAt: NOW, updatedAt: NOW },
      { id: SEC2, workspaceId: WS, title: "Metode", sortOrder: 1, status: "empty", role: null, documentArtifactId: null, createdAt: NOW, updatedAt: NOW },
      { id: SECBIB, workspaceId: WS, title: "Daftar Pustaka", sortOrder: 2, status: "empty", role: "bibliography", documentArtifactId: null, createdAt: NOW, updatedAt: NOW },
    ]);
    await client`insert into citations (id, owner_user_id, source, document_type, title, authors_json, published_year, tags, csl_json, canonical_key, metadata_status, created_at, updated_at)
      values (${CIT}, ${OWNER}, ${"manual"}, ${"book"}, ${"Metode Penelitian"}, ${JSON.stringify([{ family: "Sugiyono" }])}, ${2019}, ${[]}, ${JSON.stringify({ type: "book", title: "Metode Penelitian Kuantitatif", author: [{ family: "Sugiyono" }], issued: { "date-parts": [[2019]] }, publisher: "Alfabeta" })}, ${`ck:${CIT}`}, ${"verified"}, ${NOW}, ${NOW})`;
    await client`insert into workspace_citation_links (id, workspace_id, citation_id, created_at)
      values (${`${WS}:link`}, ${WS}, ${CIT}, ${NOW})`;

    const keys = await CitationService.ensureBibKeys(db, { ownerUserId: OWNER, citationIds: [CIT] });
    const key = keys[CIT]!;
    const s1 = await SectionLatexService.saveDocument(db, {
      ownerUserId: OWNER,
      sectionId: SEC1,
      source: `Penelitian ini memakai metode kuantitatif \\cite{${key}}.\nBaris kedua bab satu.`,
      author: "user",
    });
    const s2 = await SectionLatexService.saveDocument(db, {
      ownerUserId: OWNER,
      sectionId: SEC2,
      source: "Bab metode tanpa sitasi.",
      author: "agent",
    });
    if (s1.status !== "saved" || s2.status !== "saved") throw new Error("save gagal");

    // Per-bab.
    const sectionOutcome = await LatexBuildService.compileSection(db, {
      ownerUserId: OWNER,
      sectionId: SEC1,
    });
    expect(sectionOutcome.status).toBe("ok");
    const sectionBuild = await LatexBuildService.getSectionBuild(db, {
      ownerUserId: OWNER,
      sectionId: SEC1,
    });
    expect(sectionBuild?.status).toBe("ok");
    expect(sectionBuild?.sourceVersions).toEqual({ [SEC1]: 1 });
    expect(sectionBuild?.pdfUrl).toBeTruthy();

    // Full-document: 2 bab + bibliografi ter-render.
    const fullOutcome = await LatexBuildService.compileWorkspace(db, {
      ownerUserId: OWNER,
      workspaceId: WS,
    });
    expect(fullOutcome.status).toBe("ok");
    const fullBuild = await LatexBuildService.getWorkspaceBuild(db, {
      ownerUserId: OWNER,
      workspaceId: WS,
    });
    expect(fullBuild?.sourceVersions).toEqual({ [SEC1]: 1, [SEC2]: 1 });

    // PDF valid & >1 halaman (maketitle + 2 bab + bibliografi).
    const row = await client`select pdf_r2_key, synctex_r2_key from latex_builds
      where owner_user_id = ${OWNER} and section_id is null`;
    const pdfBytes = await StorageService.readBytes(row[0]!.pdf_r2_key as string);
    const pdf = await PDFDocument.load(pdfBytes);
    expect(pdf.getPageCount()).toBeGreaterThan(1);

    // SyncTeX mengatribusi baris ke file bab (kontrak lapisan anotasi).
    const synctexBytes = await StorageService.readBytes(row[0]!.synctex_r2_key as string);
    const data = parseSynctex(Buffer.from(synctexBytes));
    const hit = synctexInverseLookup(data, { page: 2, x: 100, y: 200 });
    expect(hit?.file ?? "").toContain("sections/");

    // Build error path: sumber rusak → status error + errors[], pdf lama dipertahankan.
    const broken = await SectionLatexService.saveDocument(db, {
      ownerUserId: OWNER,
      sectionId: SEC1,
      source: "\\begin{tabel salah",
      baseVersion: 1,
      author: "agent",
    });
    if (broken.status !== "saved") throw new Error("save v2 gagal");
    const errOutcome = await LatexBuildService.compileSection(db, {
      ownerUserId: OWNER,
      sectionId: SEC1,
    });
    expect(errOutcome.status).toBe("error");
    if (errOutcome.status === "error") expect(errOutcome.errors.length).toBeGreaterThan(0);
    const afterError = await LatexBuildService.getSectionBuild(db, {
      ownerUserId: OWNER,
      sectionId: SEC1,
    });
    expect(afterError?.status).toBe("error");
    expect(afterError?.pdfUrl).toBeTruthy();
    expect(afterError?.sourceVersions).toEqual({ [SEC1]: 2 });
  }, 180_000);
});
```

Catatan `parseSynctex`: cek signature aktual di `packages/services/src/latex/synctex.ts` sebelum memakai (gate test `latex-gate.test.ts` adalah contoh pemakaian benar — samakan bentuk argumen di test ini dengan pola gate).

- [ ] **Step 2: Jalankan e2e**

Run: `cd packages/services && bun test test/latex-phase5-e2e.test.ts`
Expected: PASS dengan env dev lengkap (`DATABASE_URL` + MinIO `S3_*` dari `.env` + tectonic/biber lokal); skip bersih tanpa env.

- [ ] **Step 3: Verifikasi menyeluruh**

```bash
bun run build:dist
bun run typecheck   # error pra-eksis apps/web (drift Eden, dicatat gate report) boleh tersisa; TIDAK boleh ada error baru di db/services/api/svelte
bun run test        # db + chat-core + services + api hijau (env-gated boleh skip)
```

- [ ] **Step 4: Update dokumen fase**

- `docs/superpowers/specs/2026-07-17-research-first-repositioning-design.md`: baris roadmap Fase 5 → tambah `✅ **selesai**`.
- `docs/superpowers/specs/2026-07-18-research-first-phase-planning-context.md`: header "Fase 1–4 selesai" → "Fase 1–5 selesai"; blok Fase 5 diberi catatan selesai + rujukan spec/plan fase 5.
- Changelog produk: TIDAK perlu entri (backend-only, belum user-facing — `docs/product/versioning-and-changelog.md`).

- [ ] **Step 5: Commit penutup**

```bash
git add packages/services docs/superpowers/specs
git commit -m "test(latex): e2e fase 5 — save→assembly→compile→build tersimpan; tandai fase 5 selesai"
```

---

## Self-Review Checklist (dijalankan penulis plan)

- **Spec coverage**: data model & migrasi (Task 1), inline-only + CAS + revisi (Task 4), bib_key persisten (Task 2), cite-scan usages (Task 3+4), assembly per-bab/full + escaping + `\input` per bab (Task 6), build storage latest-only + keep-last-good PDF (Task 7), endpoint 6 route + author='user' (Task 4+8), aturan konkurensi terekam di komentar service + hook svelte (Task 4+5), testing unit/integrasi/e2e (semua), risiko paket biblatex diverifikasi e2e (style apa di preamble e2e). OS sandbox = dependency, tak ada task (sesuai spec).
- **Placeholder**: tidak ada TBD/TODO; semua step berkode.
- **Type consistency**: `SaveSectionDocumentResult`/`SectionDocumentPayload`/`DocumentAuthor` (Task 4) dipakai Task 5/7/8; `AssemblyProjectInput`/`AssemblySectionInput` (Task 6) dipakai Task 7; `LatexBuildOutcome`/`LatexBuildView` (Task 7) dipakai Task 8; repo signatures Task 1 dipakai Task 2/4/7.
