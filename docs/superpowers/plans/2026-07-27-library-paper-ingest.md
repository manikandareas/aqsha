# Library Paper Ingest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Setiap item baru di Perpustakaan otomatis diresolusi metadatanya, dicoba diambil PDF open access-nya, lalu di-chunk dan di-embed — sehingga agen proyek menemukan kalimat yang tepat beserta identitas sitasinya — plus reader paper berutkanonik `/app/artifacts/[artifactId]` dan context menu di Perpustakaan.

**Architecture:** Satu item Perpustakaan = baris `citations` + satu `artifacts` akun-level (`workspace_id = NULL`, `source = 'reference'`). Satu antrean BullMQ `library-ingest` menjadi gerbang tunggal yang dipanggil dari keempat titik insert citation; worker-nya menjalankan state machine idempoten (ensure artifact → resolve metadata → ambil OA PDF → ekstrak teks → chunk+embed → ready). Pencarian agen proyek melebar lewat join `workspace_citation_links`, bukan menyalin `workspace_id`.

**Tech Stack:** Bun 1.3.10, Drizzle + Postgres/pgvector, BullMQ + ioredis, Elysia, SvelteKit 2 + Svelte 5 runes, TanStack Query, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-27-library-paper-ingest-design.md`

## Global Constraints

- Selalu `bun` (pinned 1.3.10). Jangan npm/pnpm/yarn.
- `apps/svelte` DILARANG mengimpor `@aqsha/db` atau `@aqsha/services`. Tipe dicermin manual di `src/lib/features/*/types.ts`.
- Logika bisnis hidup di `packages/services`; route API dan worker adalah pemanggil tipis.
- Error backend baru memakai `throwAppError`/`AppError` dari `packages/db/src/appError.ts`.
- Ikon di `apps/svelte` diimpor dari `$lib/icons`. Jangan pernah `lucide-react` atau impor ikon langsung.
- Komentar menjelaskan **kenapa**, bukan apa. Dilarang menyebut nomor task, fase, atau dokumen rencana di dalam komentar kode.
- Copywriting UI: sentence case, Bahasa Indonesia.
- `@aqsha/db` dan `@aqsha/services` build ke `dist/`. Sesudah mengubahnya, jalankan `bun run build:dist` sebelum menguji `apps/api`/`apps/agent`.
- Migrasi hidup di `packages/db/migrations` dengan entri di `meta/_journal.json`. JANGAN mengubah `when` migrasi lama.
- Uji DB di `packages/db/test` di-skip otomatis tanpa `DATABASE_URL` — pertahankan pola `const itest = DATABASE_URL ? test : test.skip`.
- Commit tiap akhir task. Jangan push kecuali diminta.

---

## File Structure

**Dibuat:**
- `packages/db/migrations/0047_library_paper_ingest.sql` — kolom status ingest, pelonggaran constraint.
- `packages/services/src/library/library-ingest.service.ts` — gerbang enqueue + state machine.
- `packages/services/src/library/index.ts` — barrel export.
- `apps/api/src/workers/library-ingest.worker.ts` — pemanggil tipis worker.
- `apps/svelte/src/routes/app/(product)/artifacts/[artifactId]/+page.svelte` — rute reader kanonik.
- `apps/svelte/src/lib/features/citations/components/library/LibraryCardContextMenu.svelte` — menu kartu.
- `apps/svelte/src/lib/features/citations/components/library/LibraryBackdropContextMenu.svelte` — menu latar grid.
- `apps/svelte/src/lib/features/citations/library-ingest-view.ts` — model murni status → tampilan kartu.
- `apps/svelte/src/lib/features/citations/clipboard-doi.ts` — parsing DOI dari teks clipboard.

**Diubah:**
- `packages/db/src/schema/citations.ts` — 4 kolom baru + CHECK + index.
- `packages/db/src/schema/artifacts.ts` — CHECK `source` menerima `reference`.
- `packages/db/src/schema/artifactPaperMetadata.ts` — `workspace_id` nullable.
- `packages/db/src/repositories/artifactRepo.ts` — `countActiveByOwner` mengecualikan `reference`.
- `packages/db/src/repositories/artifactEmbeddingRepo.ts` — scope disjungsi.
- `packages/db/src/repositories/citationRepo.ts` — `listByIngestStatus` untuk backfill. Status ingest ditulis lewat `updateById` yang sudah ada.
- `packages/services/src/clients/queue.ts` — `ARTIFACT_QUEUES.libraryIngest`.
- `packages/services/src/quota/rate-limits.ts` — batas unduhan open access per-owner.
- `packages/services/src/artifacts/model.ts` — `artifactSources` + `reference`.
- `packages/services/src/artifact.service.ts` — `finalizeUpload` / `ingestResolvedPdf` menerima `workspaceId` null.
- `packages/services/src/paper-metadata.service.ts` — `workspaceId` nullable.
- `packages/services/src/citations/citation-crud.methods.ts` — 3 enqueue + `createFromArtifact` longgar.
- `packages/services/src/citations/citation-import.service.ts` — enqueue sesudah `insertMany`.
- `packages/services/src/rag.service.ts` — `ThreadDocumentMatch` + identitas sitasi.
- `apps/api/src/workers/index.ts` — daftarkan worker.
- `apps/api/src/routes/artifacts.ts` — `POST /artifacts/upload` akun-level.
- `apps/agent/src/mastra/tools/search-thread-documents.ts` — teruskan `citationId`/`bibKey`.
- `apps/svelte/src/lib/features/citations/types.ts` — tipe status ingest.
- `apps/svelte/src/lib/features/citations/api.ts` — polling + mutation unggah.
- `apps/svelte/src/lib/features/citations/pages/LibraryPage.svelte` — unggah, context menu, polling.
- `apps/svelte/src/lib/features/citations/components/library/LibraryRow.svelte` — penanda status.
- `apps/svelte/src/lib/features/citations/components/CitationEmptyState.svelte` — CTA unggah.
- `apps/svelte/src/lib/features/citations/components/CitationDetailView.svelte` — tautan reader kanonik.
- `apps/svelte/src/routes/app/(product)/projects/[projectId]/artifacts/[artifactId]/+page.svelte` — redirect.

---

### Task 1: Migrasi 0047 — status ingest dan pelonggaran constraint

**Files:**
- Create: `packages/db/migrations/0047_library_paper_ingest.sql`
- Modify: `packages/db/migrations/meta/_journal.json`
- Modify: `packages/db/src/schema/citations.ts`
- Modify: `packages/db/src/schema/artifacts.ts:62`
- Modify: `packages/db/src/schema/artifactPaperMetadata.ts:25-27`
- Test: `packages/db/test/library-ingest.test.ts`

**Interfaces:**
- Produces: `citations.ingestStatus: 'pending'|'processing'|'ready'|'failed'`, `citations.textCoverage: 'none'|'abstract'|'full_text'`, `citations.ingestError: string | null`, `citations.ingestedAt: number | null`. Tipe TS `CitationIngestStatus` dan `CitationTextCoverage` diekspor dari `packages/db/src/schema/citations.ts`.

- [ ] **Step 1: Tulis uji yang gagal**

Buat `packages/db/test/library-ingest.test.ts`:

```ts
/**
 * Kolom status ingest + pelonggaran constraint — DB integration (butuh Postgres
 * live via DATABASE_URL; tanpa env → skip). Membuktikan tiga hal yang hanya
 * terbukti di DB nyata: default kolom baru, artifact `source='reference'`
 * diterima CHECK, dan paper metadata boleh tanpa workspace.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createDb } from "../src/client";
import { artifactPaperMetadata } from "../src/schema/artifactPaperMetadata";
import { artifacts } from "../src/schema/artifacts";
import { citations } from "../src/schema/citations";
import { users } from "../src/schema/users";

const DATABASE_URL = process.env.DATABASE_URL;
const itest = DATABASE_URL ? test : test.skip;
const SUFFIX = Math.floor(Math.random() * 1e9);
const OWNER = `iting_${SUFFIX}`;
const ARTIFACT = `iting_${SUFFIX}:art`;
const CITATION = `iting_${SUFFIX}:cit`;
const META = `iting_${SUFFIX}:meta`;
const NOW = 1_700_000_000_000;

const { db, client } = createDb(DATABASE_URL ?? "postgresql://x");

beforeAll(async () => {
  if (!DATABASE_URL) return;
  await db.insert(users).values({
    ownerUserId: OWNER,
    email: `${OWNER}@example.test`,
    createdAt: NOW,
    updatedAt: NOW,
  });
});

afterAll(async () => {
  if (!DATABASE_URL) return;
  await db.delete(artifactPaperMetadata).where(eq(artifactPaperMetadata.ownerUserId, OWNER));
  await db.delete(citations).where(eq(citations.ownerUserId, OWNER));
  await db.delete(artifacts).where(eq(artifacts.ownerUserId, OWNER));
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
```

- [ ] **Step 2: Jalankan uji untuk memastikan gagal**

```bash
cd packages/db && bun test test/library-ingest.test.ts
```

Expected: FAIL — TypeScript menolak `ingestStatus` (belum ada di skema) dan `workspaceId: null` pada `artifactPaperMetadata`.

- [ ] **Step 3: Tulis SQL migrasi**

Buat `packages/db/migrations/0047_library_paper_ingest.sql`:

```sql
ALTER TABLE "citations"
  ADD COLUMN "ingest_status" text NOT NULL DEFAULT 'pending',
  ADD COLUMN "text_coverage" text NOT NULL DEFAULT 'none',
  ADD COLUMN "ingest_error" text,
  ADD COLUMN "ingested_at" bigint;
--> statement-breakpoint
ALTER TABLE "citations"
  ADD CONSTRAINT "citations_ingest_status_check"
  CHECK ("citations"."ingest_status" in ('pending', 'processing', 'ready', 'failed'));
--> statement-breakpoint
ALTER TABLE "citations"
  ADD CONSTRAINT "citations_text_coverage_check"
  CHECK ("citations"."text_coverage" in ('none', 'abstract', 'full_text'));
--> statement-breakpoint
CREATE INDEX "citations_by_owner_ingest_status" ON "citations" ("owner_user_id", "ingest_status");
--> statement-breakpoint
ALTER TABLE "artifacts" DROP CONSTRAINT "artifacts_source_check";
--> statement-breakpoint
ALTER TABLE "artifacts"
  ADD CONSTRAINT "artifacts_source_check"
  CHECK ("artifacts"."source" in ('manual', 'upload', 'agent', 'url', 'reference'));
--> statement-breakpoint
ALTER TABLE "artifact_paper_metadata" ALTER COLUMN "workspace_id" DROP NOT NULL;
```

- [ ] **Step 4: Daftarkan migrasi di journal**

Hitung timestamp yang lebih besar dari entri terakhir (`1785078853233`):

```bash
cd packages/db && bun -e 'console.log(Date.now())'
```

Tambahkan entri ke akhir array `entries` di `packages/db/migrations/meta/_journal.json`, memakai angka hasil perintah di atas sebagai `when`:

```json
    {
      "idx": 47,
      "version": "7",
      "when": <hasil Date.now()>,
      "tag": "0047_library_paper_ingest",
      "breakpoints": true
    }
```

JANGAN mengubah entri lama.

- [ ] **Step 5: Perbarui skema Drizzle**

Di `packages/db/src/schema/citations.ts`, tambahkan tipe di dekat `CitationMetadataStatus`:

```ts
export type CitationIngestStatus = "pending" | "processing" | "ready" | "failed";
export type CitationTextCoverage = "none" | "abstract" | "full_text";
```

Tambahkan kolom sesudah `metadataStatus` di dalam definisi tabel:

```ts
    // Status pipeline ingest level ITEM perpustakaan (bukan level artifact): item
    // tanpa PDF pun harus bisa melaporkan kemajuannya. Hanya orkestrator ingest
    // yang menulis kolom-kolom ini.
    ingestStatus: text("ingest_status").$type<CitationIngestStatus>().notNull().default("pending"),
    textCoverage: text("text_coverage").$type<CitationTextCoverage>().notNull().default("none"),
    ingestError: text("ingest_error"),
    ingestedAt: bigint("ingested_at", { mode: "number" }),
```

Tambahkan CHECK dan index di array konfigurasi tabel (blok kedua argumen `pgTable`):

```ts
    check(
      "citations_ingest_status_check",
      sql`${t.ingestStatus} in ('pending', 'processing', 'ready', 'failed')`,
    ),
    check(
      "citations_text_coverage_check",
      sql`${t.textCoverage} in ('none', 'abstract', 'full_text')`,
    ),
    index("citations_by_owner_ingest_status").on(t.ownerUserId, t.ingestStatus),
```

Di `packages/db/src/schema/artifacts.ts:62`, ganti CHECK `source`:

```ts
    check(
      "artifacts_source_check",
      sql`${t.source} in ('manual', 'upload', 'agent', 'url', 'reference')`,
    ),
```

Di `packages/db/src/schema/artifactPaperMetadata.ts`, hapus `.notNull()` pada `workspaceId`:

```ts
    workspaceId: text("workspace_id").references(() => workspaces.id),
```

- [ ] **Step 6: Jalankan migrasi lalu uji**

```bash
cd packages/db && bun run migrate && bun test test/library-ingest.test.ts
```

Expected: PASS — tiga uji hijau (atau skip bila `DATABASE_URL` kosong).

- [ ] **Step 7: Typecheck**

```bash
cd packages/db && bun run typecheck
```

Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add packages/db
git commit -m "feat(db): tambah status ingest item perpustakaan dan longgarkan constraint paper akun-level"
```

---

### Task 2: Kapasitas library mengecualikan artifact referensi

**Files:**
- Modify: `packages/db/src/repositories/artifactRepo.ts:15`
- Test: `packages/db/test/library-ingest.test.ts` (tambah describe baru)

**Interfaces:**
- Consumes: `artifacts.source = 'reference'` dari Task 1.
- Produces: `ArtifactRepo.countActiveByOwner(db, ownerUserId, capAt)` yang TIDAK menghitung artifact `source = 'reference'`.

- [ ] **Step 1: Tulis uji yang gagal**

Tambahkan di akhir `packages/db/test/library-ingest.test.ts` (impor `ArtifactRepo` dari `../src/repositories/artifactRepo` di bagian atas file):

```ts
describe("kapasitas library", () => {
  itest("artifact referensi tidak menambah hitungan kapasitas", async () => {
    // ARTIFACT dari describe sebelumnya adalah source='reference'.
    const count = await ArtifactRepo.countActiveByOwner(db, OWNER, 50);
    expect(count).toBe(0);
  });
});
```

- [ ] **Step 2: Jalankan uji untuk memastikan gagal**

```bash
cd packages/db && bun test test/library-ingest.test.ts
```

Expected: FAIL — `expected 0, received 1`.

- [ ] **Step 3: Implementasi**

Di `packages/db/src/repositories/artifactRepo.ts`, ubah `countActiveByOwner` agar mengecualikan artifact referensi. Pastikan `ne` ikut diimpor dari `drizzle-orm`:

```ts
  /**
   * Hitung artifact yang memakan kuota library. Artifact `reference` adalah bayangan
   * item perpustakaan (satu per referensi, dibuat otomatis), jadi mengikutsertakannya
   * membuat satu import .bib menghabiskan kuota paket dalam sekali jalan.
   */
  async countActiveByOwner(db: DbOrTx, ownerUserId: string, capAt: number): Promise<number> {
    const rows = await db
      .select({ id: artifacts.id })
      .from(artifacts)
      .where(
        and(
          eq(artifacts.ownerUserId, ownerUserId),
          eq(artifacts.status, "active"),
          ne(artifacts.source, "reference"),
        ),
      )
      .limit(capAt + 1);
    return rows.length;
  },
```

Pertahankan `capAt + 1` seperti aslinya — probe itu yang membuat pemanggil bisa membedakan "tepat di batas" dari "melewati batas". Impor `ne` dari `drizzle-orm`.

- [ ] **Step 4: Jalankan uji**

```bash
cd packages/db && bun test test/library-ingest.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db
git commit -m "feat(db): kecualikan artifact referensi dari kuota library"
```

---

### Task 3: Longgarkan workspaceId pada jalur artifact dan citation

**Files:**
- Modify: `packages/services/src/artifact.service.ts:438` (`generateUploadUrl`), `:455` (`finalizeUpload`), `:1104` (`ingestResolvedPdf`)
- Modify: `packages/services/src/paper-metadata.service.ts:25-44`
- Modify: `packages/services/src/citations/citation-crud.methods.ts:255`
- Modify: `packages/services/src/artifacts/model.ts` (`artifactSources`)
- Test: `packages/services/test/library-ingest-service.test.ts`

**Interfaces:**
- Produces:
  - `ArtifactService.generateUploadUrl(db, ownerUserId, workspaceId?: string | null)`
  - `ArtifactService.finalizeUpload(db, { ownerUserId, ownerEmail?, workspaceId: string | null, folderId?, key, fileName, mimeType, size })`
  - `ArtifactService.ingestResolvedPdf(db, { ownerUserId, artifactId, workspaceId: string | null, bytes, byteSize, fileName, title? })`
  - `PaperMetadataService.upsert(db, { ...; workspaceId: string | null; ... })`
  - `citationCrudMethods.createFromArtifact(db, { ownerUserId, workspaceId?: string | null, artifactId, tags? })` — tanpa metadata paper, judul artifact dipakai sebagai placeholder.

- [ ] **Step 1: Tulis uji yang gagal**

Buat `packages/services/test/library-ingest-service.test.ts`:

```ts
/**
 * Jalur akun-level: unggah dan pembuatan citation tanpa workspace. Unit murni —
 * repo dan storage di-spy, tak menyentuh Postgres.
 */
import { beforeEach, describe, expect, spyOn, test } from "bun:test";
import { ArtifactPaperMetadataRepo, ArtifactRepo, CitationRepo } from "@aqsha/db";
import { citationCrudMethods } from "../src/citations/citation-crud.methods";

const OWNER = "user_1";
const ARTIFACT = "art_1";

describe("createFromArtifact akun-level", () => {
  beforeEach(() => {
    spyOn(ArtifactPaperMetadataRepo, "findByArtifact").mockResolvedValue(null);
    spyOn(ArtifactRepo, "findById").mockResolvedValue({
      id: ARTIFACT,
      ownerUserId: OWNER,
      workspaceId: null,
      title: "makalah-metodologi.pdf",
      status: "active",
    } as never);
    spyOn(CitationRepo, "insert").mockResolvedValue(undefined as never);
    spyOn(CitationRepo, "findById").mockResolvedValue(null as never);
  });

  test("tanpa metadata paper, judul artifact dipakai sebagai placeholder", async () => {
    const inserted: Array<{ title: string }> = [];
    (CitationRepo.insert as ReturnType<typeof spyOn>).mockImplementation(
      async (_db: unknown, row: { title: string }) => {
        inserted.push(row);
      },
    );
    await citationCrudMethods
      .createFromArtifact({} as never, { ownerUserId: OWNER, artifactId: ARTIFACT })
      .catch(() => {});
    expect(inserted[0]?.title).toBe("makalah-metodologi.pdf");
  });
});
```

- [ ] **Step 2: Jalankan uji untuk memastikan gagal**

```bash
cd packages/services && bun test test/library-ingest-service.test.ts
```

Expected: FAIL — `createFromArtifact` masih mewajibkan `workspaceId` dan melempar `citation_artifact_no_metadata`.

- [ ] **Step 3: Longgarkan `artifactSources`**

Di `packages/services/src/artifacts/model.ts`, tambahkan nilai baru pada konstanta sumber:

```ts
export const artifactSources = ["manual", "upload", "agent", "url", "reference"] as const;
```

- [ ] **Step 4: Longgarkan presign, `finalizeUpload`, dan `ingestResolvedPdf`**

Di `packages/services/src/artifact.service.ts`, jadikan `workspaceId` pada `generateUploadUrl` opsional — target penyimpanannya memang sudah owner-scoped, assert workspace hanyalah gerbang kepemilikan:

```ts
  async generateUploadUrl(
    db: DbOrTx,
    ownerUserId: string,
    workspaceId?: string | null,
  ): Promise<{ uploadUrl: string; key: string }> {
    // Unggahan perpustakaan tidak menuju proyek mana pun; assert hanya berlaku
    // saat penggugah menyebut workspace tujuan.
    if (workspaceId) {
      await WorkspaceService.assertWorkspaceOwner(db, ownerUserId, workspaceId, {
        requireActive: true,
      });
    }
    return StorageService.generateUploadTarget(ownerUserId);
  },
```

Ubah tipe `workspaceId` pada `finalizeUpload` menjadi `string | null` dan jadikan assert-nya bersyarat:

```ts
      workspaceId: string | null;
```

```ts
      // Paper perpustakaan hidup di level akun; assert workspace hanya relevan
      // saat artifact memang dititipkan ke sebuah proyek.
      if (input.workspaceId) {
        await WorkspaceService.assertWorkspaceOwner(tx, input.ownerUserId, input.workspaceId, {
          requireActive: true,
        });
      }
```

Enqueue `paperEnrichment` di akhir `finalizeUpload` hanya berlaku untuk unggahan proyek; biarkan apa adanya tetapi jaga tipenya:

```ts
    if (artifactType === "pdf" && input.workspaceId && enrichText && enrichText.trim()) {
```

Lakukan hal yang sama pada `ingestResolvedPdf`: ubah `workspaceId: string` menjadi `workspaceId: string | null` dan teruskan apa adanya ke `extractIndexAndPatch` (fungsi itu sudah menerima `string | null`).

- [ ] **Step 5: Longgarkan `PaperMetadataService`**

Di `packages/services/src/paper-metadata.service.ts`, ubah `PaperMetadataInput`:

```ts
  workspaceId: string | null;
```

dan pada cabang insert:

```ts
        workspaceId: input.workspaceId,
```

- [ ] **Step 6: Longgarkan `createFromArtifact`**

Di `packages/services/src/citations/citation-crud.methods.ts`, ubah tanda tangan dan prasyaratnya:

```ts
  async createFromArtifact(
    db: DbOrTx,
    input: {
      ownerUserId: string;
      workspaceId?: string | null;
      artifactId: string;
      tags?: string[];
    },
  ): Promise<CreateFromArtifactResult> {
    if (input.workspaceId) {
      await WorkspaceService.assertWorkspaceOwner(db, input.ownerUserId, input.workspaceId, {
        requireActive: true,
      });
    }
    const meta = await ArtifactPaperMetadataRepo.findByArtifact(
      db,
      input.ownerUserId,
      input.artifactId,
    );
    // Metadata paper belum tentu ada: unggahan baru masuk sebelum resolver jalan.
    // Judul artifact menjadi placeholder, dan pipeline ingest yang memperbaikinya.
    const scopedMeta = meta && (!input.workspaceId || meta.workspaceId === input.workspaceId)
      ? meta
      : null;
    const artifact = await ArtifactRepo.findById(db, input.artifactId);
    if (!artifact || artifact.ownerUserId !== input.ownerUserId) {
      throwAppError({
        message: "Artifact tidak ditemukan",
        code: "artifact_not_found",
        status: 404,
        severity: "warning",
      });
    }
    const title = scopedMeta?.title?.trim() || artifact.title.trim();
    if (!title) {
      throwAppError({
        message: "Artifact ini belum punya judul untuk disitasi",
        code: "citation_artifact_no_metadata",
        status: 404,
        severity: "warning",
      });
    }
```

Ganti pembangunan CSL-nya agar bekerja tanpa metadata paper. Sisa fungsi (blok idempoten `findActiveByArtifact`, dedupe `findActiveByCanonicalKeys`, dan insert) TIDAK berubah:

```ts
    // Metadata paper mungkin belum ada saat unggahan baru masuk; CSL minimal dari
    // judul artifact cukup untuk membuat item, dan pipeline ingest melengkapinya.
    const csl = scopedMeta
      ? buildCslFromPaperMetadata(scopedMeta)
      : { type: "document", title };
```

- [ ] **Step 7: Jalankan uji**

```bash
cd packages/services && bun test test/library-ingest-service.test.ts
```

Expected: PASS.

- [ ] **Step 8: Pastikan uji lama tidak rusak**

```bash
cd packages/services && bun test test/artifact-service.test.ts test/citation-service.test.ts
```

Expected: PASS (jumlah gagal tidak bertambah dibanding baseline sebelum task ini).

- [ ] **Step 9: Commit**

```bash
git add packages/services
git commit -m "feat(services): terima artifact dan citation tanpa workspace"
```

---

### Task 4: Antrean library-ingest dan gerbang enqueue

**Files:**
- Modify: `packages/services/src/clients/queue.ts:11-18`
- Create: `packages/services/src/library/library-ingest.service.ts`
- Create: `packages/services/src/library/index.ts`
- Modify: `packages/services/src/index.ts`
- Modify: `packages/services/src/citations/citation-crud.methods.ts:167,240,343`
- Modify: `packages/services/src/citations/citation-import.service.ts:461`
- Test: `packages/services/test/library-ingest-service.test.ts`

**Interfaces:**
- Produces:
  - `ARTIFACT_QUEUES.libraryIngest = "library-ingest"`
  - `LibraryIngestService.enqueue(input: { ownerUserId: string; citationIds: string[] }): Promise<void>`
  - `type LibraryIngestJob = { ownerUserId: string; citationId: string }`

- [ ] **Step 1: Tulis uji yang gagal**

Tambahkan di `packages/services/test/library-ingest-service.test.ts`:

```ts
import * as queue from "../src/clients/queue";
import { LibraryIngestService } from "../src/library/library-ingest.service";

describe("gerbang enqueue", () => {
  test("satu job per citation dengan jobId stabil", async () => {
    const calls: Array<{ name: string; data: unknown; opts?: { jobId?: string } }> = [];
    spyOn(queue, "enqueue").mockImplementation(
      async (name: string, data: Record<string, unknown>, opts?: { jobId?: string }) => {
        calls.push({ name, data, opts });
        return "job";
      },
    );
    await LibraryIngestService.enqueue({ ownerUserId: OWNER, citationIds: ["c1", "c2"] });
    expect(calls).toHaveLength(2);
    expect(calls[0]?.name).toBe("library-ingest");
    expect(calls[0]?.opts?.jobId).toBe("library-ingest:c1");
    expect(calls[1]?.data).toEqual({ ownerUserId: OWNER, citationId: "c2" });
  });

  test("daftar kosong tidak menyentuh antrean", async () => {
    const spy = spyOn(queue, "enqueue").mockResolvedValue("job" as never);
    await LibraryIngestService.enqueue({ ownerUserId: OWNER, citationIds: [] });
    expect(spy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Jalankan uji untuk memastikan gagal**

```bash
cd packages/services && bun test test/library-ingest-service.test.ts
```

Expected: FAIL — modul `../src/library/library-ingest.service` belum ada.

- [ ] **Step 3: Daftarkan antrean**

Di `packages/services/src/clients/queue.ts`, tambahkan di dalam `ARTIFACT_QUEUES`:

```ts
  // Gerbang tunggal post-processing item perpustakaan: resolve metadata, ambil PDF
  // open access, ekstrak teks, embed. Semua jalur pembuatan referensi bermuara ke sini.
  libraryIngest: "library-ingest",
```

- [ ] **Step 4: Tulis service gerbang**

Buat `packages/services/src/library/library-ingest.service.ts`:

```ts
import { ARTIFACT_QUEUES, enqueue, removeJob } from "../clients/queue";

export type LibraryIngestJob = { ownerUserId: string; citationId: string };

/** jobId stabil supaya enqueue ganda atas item yang sama tidak menggandakan kerja. */
function jobIdFor(citationId: string): string {
  return `${ARTIFACT_QUEUES.libraryIngest}:${citationId}`;
}

export const LibraryIngestService = {
  /**
   * Gerbang tunggal post-processing perpustakaan. Dipanggil tepat sesudah item
   * dibuat, dari jalur mana pun. Satu job per item — satu DOI busuk tidak boleh
   * menjatuhkan sisa batch import.
   */
  async enqueue(input: { ownerUserId: string; citationIds: string[] }): Promise<void> {
    for (const citationId of input.citationIds) {
      const jobId = jobIdFor(citationId);
      // BullMQ menahan job selesai/gagal (removeOnComplete/Fail), dan `add` dengan
      // jobId yang masih tertahan adalah no-op senyap — buang dulu agar re-ingest jalan.
      await removeJob(ARTIFACT_QUEUES.libraryIngest, jobId).catch(() => {});
      await enqueue(
        ARTIFACT_QUEUES.libraryIngest,
        { ownerUserId: input.ownerUserId, citationId } satisfies LibraryIngestJob,
        { jobId },
      );
    }
  },
};
```

Buat `packages/services/src/library/index.ts`:

```ts
export { LibraryIngestService, type LibraryIngestJob } from "./library-ingest.service";
```

Tambahkan di `packages/services/src/index.ts`:

```ts
export * from "./library";
```

- [ ] **Step 5: Sambungkan keempat titik insert**

Di `packages/services/src/citations/citation-crud.methods.ts`, sesudah masing-masing `await CitationRepo.insert(db, row);` (tiga lokasi), tambahkan:

```ts
    await LibraryIngestService.enqueue({
      ownerUserId: input.ownerUserId,
      citationIds: [row.id],
    });
```

Di `packages/services/src/citations/citation-import.service.ts`, sesudah transaksi yang memuat `CitationRepo.insertMany(tx, rowsToInsert)` selesai (di luar transaksi — enqueue adalah IO jaringan):

```ts
  await LibraryIngestService.enqueue({
    ownerUserId: input.ownerUserId,
    citationIds: rowsToInsert.map((row) => row.id),
  });
```

Impor `LibraryIngestService` dari `../library/library-ingest.service` di kedua file.

- [ ] **Step 6: Jalankan uji**

```bash
cd packages/services && bun test test/library-ingest-service.test.ts
```

Expected: PASS.

- [ ] **Step 7: Uji regresi citations**

```bash
cd packages/services && bun test test/citations-import.test.ts test/citation-service.test.ts test/citation-search-batch.test.ts
```

Expected: PASS. Bila ada uji yang gagal karena `enqueue` menyentuh Redis, tambahkan `spyOn(queue, "enqueue").mockResolvedValue("job")` pada setup uji tersebut.

- [ ] **Step 8: Commit**

```bash
git add packages/services
git commit -m "feat(services): gerbang tunggal enqueue post-processing perpustakaan"
```

---

### Task 5: Worker library-ingest — kerangka state machine

**Files:**
- Modify: `packages/services/src/library/library-ingest.service.ts`
- Create: `apps/api/src/workers/library-ingest.worker.ts`
- Modify: `apps/api/src/workers/index.ts`
- Test: `packages/services/test/library-ingest-service.test.ts`

**Interfaces:**
- Consumes: `CitationRepo.findById(db, ownerUserId, id)` dan `CitationRepo.updateById(db, id, patch: Partial<NewCitation>)` — keduanya SUDAH ADA; tidak ada method repo baru di task ini. Perhatikan urutan argumen `findById`: `ownerUserId` mendahului `id`.
- Produces:
  - `LibraryIngestService.run(db, job: LibraryIngestJob): Promise<void>` — state machine lengkap; pada task ini baru transisi status dan pembuatan artifact bayangan.
  - `LibraryIngestService.ensureArtifact(db, { ownerUserId, citation }): Promise<string>` — mengembalikan `artifactId`.

- [ ] **Step 1: Tulis uji yang gagal**

Tambahkan di `packages/services/test/library-ingest-service.test.ts`:

```ts
describe("state machine", () => {
  test("item tanpa artifact mendapat artifact referensi akun-level", async () => {
    const inserted: Array<{ source: string; workspaceId: string | null }> = [];
    spyOn(ArtifactRepo, "insert").mockImplementation(
      async (_db: unknown, row: { source: string; workspaceId: string | null }) => {
        inserted.push(row);
      },
    );
    spyOn(CitationRepo, "updateById").mockResolvedValue(undefined as never);
    const artifactId = await LibraryIngestService.ensureArtifact({} as never, {
      ownerUserId: OWNER,
      citation: {
        id: "c1",
        ownerUserId: OWNER,
        artifactId: null,
        title: "Judul referensi",
        authorsJson: [],
        venue: "Jurnal",
        doi: null,
        url: null,
        cslJson: {},
        deletedAt: null,
      } as never,
    });
    expect(artifactId).toBeTruthy();
    expect(inserted[0]?.source).toBe("reference");
    expect(inserted[0]?.workspaceId).toBeNull();
  });

  test("citation terhapus tidak diproses", async () => {
    spyOn(CitationRepo, "findById").mockResolvedValue({
      id: "c2",
      ownerUserId: OWNER,
      deletedAt: 1,
    } as never);
    const patch = spyOn(CitationRepo, "updateById").mockResolvedValue(undefined as never);
    await LibraryIngestService.run({} as never, { ownerUserId: OWNER, citationId: "c2" });
    expect(patch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Jalankan uji untuk memastikan gagal**

```bash
cd packages/services && bun test test/library-ingest-service.test.ts
```

Expected: FAIL — `ensureArtifact` dan `run` belum ada.

- [ ] **Step 3: Tulis kerangka state machine**

Tambahkan ke `packages/services/src/library/library-ingest.service.ts`:

```ts
import { ArtifactRepo, type Citation, CitationRepo, type Db } from "@aqsha/db";
import { artifactFamilyForType } from "../artifacts/model";

/** Teks fallback saat item belum punya PDF: cukup untuk satu chunk yang bermakna. */
function referenceText(citation: Citation): string {
  const authors = (citation.authorsJson ?? [])
    .map((a) => a.literal ?? [a.family, a.given].filter(Boolean).join(", "))
    .filter(Boolean)
    .join("; ");
  const abstract =
    typeof (citation.cslJson as { abstract?: unknown })?.abstract === "string"
      ? ((citation.cslJson as { abstract: string }).abstract)
      : "";
  return [citation.title, authors, citation.venue, citation.publishedYear, abstract]
    .filter(Boolean)
    .join("\n");
}
```

dan method berikut di dalam objek `LibraryIngestService`:

```ts
  /**
   * Setiap item perpustakaan punya tepat satu artifact bayangan. Ia lahir sebagai
   * teks (judul, penulis, abstrak) dan di-upgrade menjadi PDF bila jalur open access
   * berhasil — sehingga embedding tetap satu tabel dan reader berlaku untuk item mana pun.
   */
  async ensureArtifact(
    db: Db,
    input: { ownerUserId: string; citation: Citation },
  ): Promise<string> {
    if (input.citation.artifactId) return input.citation.artifactId;
    const artifactId = crypto.randomUUID();
    const now = Date.now();
    await ArtifactRepo.insert(db, {
      id: artifactId,
      ownerUserId: input.ownerUserId,
      workspaceId: null,
      folderId: null,
      threadId: null,
      artifactType: "plain_text",
      artifactFamily: artifactFamilyForType("plain_text"),
      source: "reference",
      title: input.citation.title,
      language: null,
      mimeType: null,
      fileName: null,
      byteSize: null,
      indexingStatus: "pending",
      indexingFailureReason: null,
      detectedDocumentKind: null,
      storageR2Key: null,
      contentVersion: null,
      ragEntryId: null,
      plainTextPreview: null,
      indexedAt: null,
      status: "active",
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await CitationRepo.updateById(db, input.citation.id, {
      artifactId,
      updatedAt: Date.now(),
    });
    return artifactId;
  },

  /**
   * State machine ingest. Idempoten: setiap langkah aman diulang, dan retry BullMQ
   * membaca ulang state dari DB alih-alih mempercayai payload job yang bisa basi.
   */
  async run(db: Db, job: LibraryIngestJob): Promise<void> {
    const citation = await CitationRepo.findById(db, job.ownerUserId, job.citationId);
    if (!citation || citation.deletedAt) return;

    await CitationRepo.updateById(db, citation.id, {
      ingestStatus: "processing",
      ingestError: null,
      updatedAt: Date.now(),
    });
    try {
      await this.ensureArtifact(db, { ownerUserId: job.ownerUserId, citation });
      await CitationRepo.updateById(db, citation.id, {
        ingestStatus: "ready",
        ingestedAt: Date.now(),
        ingestError: null,
        updatedAt: Date.now(),
      });
    } catch (error) {
      await CitationRepo.updateById(db, citation.id, {
        ingestStatus: "failed",
        ingestError: error instanceof Error ? error.message : "Ingest gagal",
        updatedAt: Date.now(),
      });
      throw error;
    }
  },
```

`findById` sudah men-scope owner, jadi tidak perlu memeriksa `ownerUserId` lagi sesudahnya.

- [ ] **Step 4: Tulis worker**

Buat `apps/api/src/workers/library-ingest.worker.ts`:

```ts
import { LibraryIngestService } from "@aqsha/services";
import type { Job } from "bullmq";
import { getDb } from "../clients/db";

export type LibraryIngestJob = { ownerUserId: string; citationId: string };

/**
 * Worker `library-ingest`: post-processing satu item perpustakaan. Seluruh logika
 * ada di service; worker hanya menyediakan koneksi DB dan membiarkan BullMQ
 * mengurus retry.
 */
export async function processLibraryIngest(job: Job<LibraryIngestJob>): Promise<void> {
  const { db } = getDb();
  await LibraryIngestService.run(db, job.data);
}
```

Di `apps/api/src/workers/index.ts`, tambahkan impor dan daftarkan worker di array `workers`:

```ts
import { type LibraryIngestJob, processLibraryIngest } from "./library-ingest.worker";
```

```ts
  // Concurrency 2 — tiap job memanggil Crossref/OpenAlex dan mungkin mengunduh PDF.
  new Worker<LibraryIngestJob>(ARTIFACT_QUEUES.libraryIngest, processLibraryIngest, {
    connection,
    concurrency: 2,
  }),
```

- [ ] **Step 5: Jalankan uji**

```bash
cd packages/services && bun test test/library-ingest-service.test.ts
```

Expected: PASS.

- [ ] **Step 6: Build dist lalu typecheck api**

```bash
bun run build:dist && cd apps/api && bun run typecheck
```

Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add packages apps/api
git commit -m "feat: worker library-ingest dengan artifact bayangan per item perpustakaan"
```

---

### Task 6: Langkah resolve metadata

**Files:**
- Modify: `packages/services/src/library/library-ingest.service.ts`
- Test: `packages/services/test/library-ingest-service.test.ts`

**Interfaces:**
- Consumes: `classifyPaperText`, `resolvePaper` dari `../papers`, `PaperMetadataService.upsert` dari Task 3, `ResolvedPaper.pdfCandidates: string[]`.
- Produces: `LibraryIngestService.resolveMetadata(db, { ownerUserId, citation, artifactId }): Promise<ResolvedPaper | null>` — best-effort, tidak pernah melempar.

- [ ] **Step 1: Tulis uji yang gagal**

Tambahkan di `packages/services/test/library-ingest-service.test.ts`:

```ts
describe("resolve metadata", () => {
  test("judul turunan nama file diperlakukan sebagai placeholder", async () => {
    const patches: Array<Record<string, unknown>> = [];
    spyOn(CitationRepo, "updateById").mockImplementation(
      async (_db: unknown, _id: string, patch: Record<string, unknown>) => {
        patches.push(patch);
      },
    );
    spyOn(PaperMetadataService, "upsert").mockResolvedValue({ ok: true } as never);
    const citation = {
      id: "c3",
      ownerUserId: OWNER,
      source: "artifact",
      title: "makalah-metodologi.pdf",
      doi: "10.1234/uji",
      venue: null,
      publishedYear: null,
      authorsJson: [],
      cslJson: {},
    };
    await LibraryIngestService.resolveMetadata({} as never, {
      ownerUserId: OWNER,
      citation: citation as never,
      artifactId: "art_3",
      resolve: async () =>
        ({
          title: "Metodologi Penelitian Kualitatif",
          authors: [{ name: "Sari, R." }],
          metadataSource: "crossref",
          affiliations: [],
          pdfCandidates: [],
        }) as never,
    });
    expect(patches[0]?.title).toBe("Metodologi Penelitian Kualitatif");
  });

  test("judul yang diisi pengguna tidak ditimpa", async () => {
    const patches: Array<Record<string, unknown>> = [];
    spyOn(CitationRepo, "updateById").mockImplementation(
      async (_db: unknown, _id: string, patch: Record<string, unknown>) => {
        patches.push(patch);
      },
    );
    spyOn(PaperMetadataService, "upsert").mockResolvedValue({ ok: true } as never);
    await LibraryIngestService.resolveMetadata({} as never, {
      ownerUserId: OWNER,
      citation: {
        id: "c4",
        ownerUserId: OWNER,
        source: "manual",
        title: "Judul pilihan saya",
        doi: "10.1234/uji",
        venue: null,
        publishedYear: null,
        authorsJson: [],
        cslJson: {},
      } as never,
      artifactId: "art_4",
      resolve: async () =>
        ({
          title: "Judul resmi penerbit",
          authors: [],
          metadataSource: "crossref",
          affiliations: [],
          pdfCandidates: [],
        }) as never,
    });
    expect(patches[0]?.title).toBeUndefined();
  });

  test("resolver gagal tidak melempar", async () => {
    spyOn(PaperMetadataService, "upsert").mockResolvedValue({ ok: true } as never);
    const result = await LibraryIngestService.resolveMetadata({} as never, {
      ownerUserId: OWNER,
      citation: { id: "c5", ownerUserId: OWNER, doi: "10.1/x", cslJson: {} } as never,
      artifactId: "art_5",
      resolve: async () => {
        throw new Error("provider mati");
      },
    });
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Jalankan uji untuk memastikan gagal**

```bash
cd packages/services && bun test test/library-ingest-service.test.ts
```

Expected: FAIL — `resolveMetadata` belum ada.

- [ ] **Step 3: Implementasi**

Tambahkan ke `packages/services/src/library/library-ingest.service.ts`:

```ts
import { classifyPaperText, type ClassifiedUrl } from "../papers/identifiers";
import { resolvePaper } from "../papers/resolve";
import type { ResolvedPaper } from "../papers/model";
import { PaperMetadataService } from "../paper-metadata.service";

/**
 * Judul unggahan lahir dari nama file, dan itu placeholder — bukan pilihan pengguna.
 * Tanpa pengecualian ini paper selamanya bernama `skripsi-final-v2.pdf`.
 */
function titleIsPlaceholder(citation: Citation): boolean {
  return citation.source === "artifact" && /\.(pdf|docx?)$/i.test(citation.title.trim());
}

function identifierFor(citation: Citation): ClassifiedUrl | null {
  const probe = [citation.doi, citation.url, citation.title].filter(Boolean).join("\n");
  return classifyPaperText(probe);
}
```

```ts
  /**
   * Best-effort: identifier tak ditemukan atau provider mati BUKAN kegagalan item.
   * Patch hanya field yang kosong supaya entri manual pengguna tak pernah tertimpa.
   * `resolve` dapat disuntik untuk pengujian.
   */
  async resolveMetadata(
    db: Db,
    input: {
      ownerUserId: string;
      citation: Citation;
      artifactId: string;
      resolve?: (classified: ClassifiedUrl) => Promise<ResolvedPaper | null>;
    },
  ): Promise<ResolvedPaper | null> {
    const classified = identifierFor(input.citation);
    if (!classified) return null;
    const run = input.resolve ?? ((c: ClassifiedUrl) => resolvePaper({ classified: c }));
    let resolved: ResolvedPaper | null = null;
    try {
      resolved = await run(classified);
    } catch {
      return null;
    }
    if (!resolved) return null;

    const patch: Record<string, unknown> = {};
    if (resolved.title && (!input.citation.title || titleIsPlaceholder(input.citation))) {
      patch.title = resolved.title;
    }
    if (resolved.doi && !input.citation.doi) patch.doi = resolved.doi;
    if (resolved.journal && !input.citation.venue) patch.venue = resolved.journal;
    if (resolved.publisher && !input.citation.publisher) patch.publisher = resolved.publisher;
    if (resolved.publishedYear && !input.citation.publishedYear) {
      patch.publishedYear = resolved.publishedYear;
    }
    if (resolved.authors.length > 0 && (input.citation.authorsJson ?? []).length === 0) {
      patch.authorsJson = resolved.authors.map((a) => ({ literal: a.name }));
    }
    if (Object.keys(patch).length > 0) {
      patch.metadataStatus = "verified";
      patch.updatedAt = Date.now();
      await CitationRepo.updateById(db, input.citation.id, patch);
    }

    await PaperMetadataService.upsert(db, {
      ownerUserId: input.ownerUserId,
      artifactId: input.artifactId,
      workspaceId: null,
      metadataSource: resolved.metadataSource,
      ...(resolved.title ? { title: resolved.title } : {}),
      ...(resolved.abstract ? { abstract: resolved.abstract } : {}),
      ...(resolved.doi ? { doi: resolved.doi } : {}),
      authors: resolved.authors,
      affiliations: resolved.affiliations,
      ...(resolved.journal ? { journal: resolved.journal } : {}),
      ...(resolved.publisher ? { publisher: resolved.publisher } : {}),
      ...(resolved.publishedYear ? { publishedYear: resolved.publishedYear } : {}),
      ...(resolved.arxivId ? { arxivId: resolved.arxivId } : {}),
      ...(resolved.landingPageUrl ? { sourceUrl: resolved.landingPageUrl } : {}),
      ...(resolved.oaStatus ? { oaStatus: resolved.oaStatus } : {}),
      confidence: 0.95,
    });
    return resolved;
  },
```

Sambungkan di `run`, sesudah `ensureArtifact`:

```ts
      const resolved = await this.resolveMetadata(db, {
        ownerUserId: job.ownerUserId,
        citation,
        artifactId,
      });
```

- [ ] **Step 4: Jalankan uji**

```bash
cd packages/services && bun test test/library-ingest-service.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages
git commit -m "feat(services): resolve metadata item perpustakaan tanpa menimpa entri pengguna"
```

---

### Task 7: Langkah ambil PDF open access

**Files:**
- Modify: `packages/services/src/library/library-ingest.service.ts`
- Modify: `packages/services/src/quota/rate-limits.ts`
- Test: `packages/services/test/library-ingest-service.test.ts`

**Interfaces:**
- Consumes: `downloadOaPdf({ candidates })` dan `pdfFileName(resolved)` dari `../papers/download`, `ArtifactService.ingestResolvedPdf` dari Task 3, `getRateLimiter(rule)` dari `../quota/rate-limits`.
- Produces: `LibraryIngestService.fetchOpenAccessPdf(db, { ownerUserId, citation, artifactId, resolved, download? }): Promise<boolean>` — `true` bila artifact naik jadi PDF.

- [ ] **Step 1: Tulis uji yang gagal**

Tambahkan impor berikut di bagian atas `packages/services/test/library-ingest-service.test.ts` bila belum ada:

```ts
import { ArtifactService } from "../src/artifact.service";
import * as rateLimits from "../src/quota/rate-limits";
```

lalu tambahkan describe baru:

```ts
describe("ambil PDF open access", () => {
  // Limiter memakai Redis; di unit test kita hanya butuh gerbangnya selalu terbuka.
  beforeEach(() => {
    spyOn(rateLimits, "getRateLimiter").mockReturnValue({
      consume: async () => ({}),
    } as never);
  });

  test("tanpa kandidat, tidak mengunduh apa pun", async () => {
    const ingest = spyOn(ArtifactService, "ingestResolvedPdf").mockResolvedValue({
      indexed: true,
    } as never);
    const upgraded = await LibraryIngestService.fetchOpenAccessPdf({} as never, {
      ownerUserId: OWNER,
      citation: { id: "c6", ownerUserId: OWNER, title: "Judul" } as never,
      artifactId: "art_6",
      resolved: { pdfCandidates: [], authors: [], affiliations: [] } as never,
    });
    expect(upgraded).toBe(false);
    expect(ingest).not.toHaveBeenCalled();
  });

  test("unduhan gagal bukan kegagalan item", async () => {
    const upgraded = await LibraryIngestService.fetchOpenAccessPdf({} as never, {
      ownerUserId: OWNER,
      citation: { id: "c7", ownerUserId: OWNER, title: "Judul" } as never,
      artifactId: "art_7",
      resolved: { pdfCandidates: ["https://contoh.test/a.pdf"], authors: [], affiliations: [] } as never,
      download: async () => {
        throw new Error("jaringan mati");
      },
    });
    expect(upgraded).toBe(false);
  });

  test("unduhan berhasil menaikkan artifact jadi PDF", async () => {
    const ingest = spyOn(ArtifactService, "ingestResolvedPdf").mockResolvedValue({
      indexed: true,
    } as never);
    const upgraded = await LibraryIngestService.fetchOpenAccessPdf({} as never, {
      ownerUserId: OWNER,
      citation: { id: "c8", ownerUserId: OWNER, title: "Judul paper" } as never,
      artifactId: "art_8",
      resolved: { pdfCandidates: ["https://contoh.test/a.pdf"], authors: [], affiliations: [] } as never,
      download: async () => ({
        bytes: new Uint8Array([1, 2, 3]),
        byteSize: 3,
        sourceUrl: "https://contoh.test/a.pdf",
      }),
    });
    expect(upgraded).toBe(true);
    expect(ingest).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Jalankan uji untuk memastikan gagal**

```bash
cd packages/services && bun test test/library-ingest-service.test.ts
```

Expected: FAIL — `fetchOpenAccessPdf` belum ada.

- [ ] **Step 3: Tambahkan batas laju**

Di `packages/services/src/quota/rate-limits.ts`, tambahkan kunci baru pada union dan katalognya:

```ts
  | "library:oa-download"
```

```ts
  // Unduhan PDF open access per-owner: menahan fan-out saat import besar
  // memicu ratusan job sekaligus.
  "library:oa-download": { points: 30, duration: 60 },
```

- [ ] **Step 4: Implementasi**

Tambahkan ke `packages/services/src/library/library-ingest.service.ts`:

```ts
import { ArtifactService } from "../artifact.service";
import { downloadOaPdf, pdfFileName } from "../papers/download";
import { getRateLimiter } from "../quota/rate-limits";
```

```ts
  /**
   * Best-effort: tak ada kandidat open access, unduhan gagal, atau host diblokir
   * penjaga SSRF semuanya berarti item tetap hidup dengan cakupan abstrak.
   */
  async fetchOpenAccessPdf(
    db: Db,
    input: {
      ownerUserId: string;
      citation: Citation;
      artifactId: string;
      resolved: ResolvedPaper;
      download?: typeof downloadOaPdf;
    },
  ): Promise<boolean> {
    const candidates = input.resolved.pdfCandidates ?? [];
    if (candidates.length === 0) return false;
    // Import besar melepas ratusan job sekaligus; tanpa gerbang ini satu akun bisa
    // memicu fan-out unduhan ke penerbit dalam hitungan detik. Kehabisan jatah bukan
    // kegagalan item — ia sekadar tidak jadi mengunduh kali ini.
    try {
      await getRateLimiter("library:oa-download").consume(input.ownerUserId, 1);
    } catch {
      return false;
    }
    const run = input.download ?? downloadOaPdf;
    let pdf: Awaited<ReturnType<typeof downloadOaPdf>> = null;
    try {
      pdf = await run({ candidates });
    } catch {
      return false;
    }
    if (!pdf) return false;
    await ArtifactService.ingestResolvedPdf(db, {
      ownerUserId: input.ownerUserId,
      artifactId: input.artifactId,
      workspaceId: null,
      bytes: pdf.bytes,
      byteSize: pdf.byteSize,
      fileName: pdfFileName(input.resolved),
      title: input.citation.title,
    });
    return true;
  },
```

Sambungkan di `run`, sesudah `resolveMetadata`:

```ts
      const upgraded = resolved
        ? await this.fetchOpenAccessPdf(db, {
            ownerUserId: job.ownerUserId,
            citation,
            artifactId,
            resolved,
          })
        : false;
```

- [ ] **Step 5: Jalankan uji**

```bash
cd packages/services && bun test test/library-ingest-service.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/services
git commit -m "feat(services): naikkan item perpustakaan jadi paper penuh lewat PDF open access"
```

---

### Task 8: Langkah embed dan penetapan cakupan teks

**Files:**
- Modify: `packages/services/src/library/library-ingest.service.ts`
- Test: `packages/services/test/library-ingest-service.test.ts`

**Interfaces:**
- Consumes: `RagService.index(db, { ownerUserId, artifactId, workspaceId, text })` yang mengembalikan `string | null`.
- Produces: `run()` menyelesaikan item dengan `ingestStatus: 'ready'` dan `textCoverage` yang benar; kegagalan embedding menghasilkan `'failed'` dan melempar ulang.

- [ ] **Step 1: Tulis uji yang gagal**

Tambahkan impor `import { RagService } from "../src/rag.service";` di bagian atas `packages/services/test/library-ingest-service.test.ts`, lalu describe baru:

```ts
describe("embed dan cakupan", () => {
  test("tanpa PDF, cakupan abstrak dari judul dan penulis", async () => {
    const patches: Array<Record<string, unknown>> = [];
    spyOn(CitationRepo, "findById").mockResolvedValue({
      id: "c9",
      ownerUserId: OWNER,
      artifactId: "art_9",
      title: "Judul referensi",
      venue: "Jurnal",
      publishedYear: 2024,
      authorsJson: [{ family: "Sari", given: "R." }],
      cslJson: { abstract: "Ringkasan penelitian." },
      doi: null,
      url: null,
      deletedAt: null,
    } as never);
    spyOn(CitationRepo, "updateById").mockImplementation(
      async (_db: unknown, _id: string, patch: Record<string, unknown>) => {
        patches.push(patch);
      },
    );
    const indexed: string[] = [];
    spyOn(RagService, "index").mockImplementation(
      async (_db: unknown, args: { text: string }) => {
        indexed.push(args.text);
        return "artifact:art_9";
      },
    );
    await LibraryIngestService.run({} as never, { ownerUserId: OWNER, citationId: "c9" });
    expect(indexed[0]).toContain("Ringkasan penelitian.");
    const final = patches.at(-1) as { ingestStatus: string; textCoverage: string };
    expect(final.ingestStatus).toBe("ready");
    expect(final.textCoverage).toBe("abstract");
  });

  test("embedding gagal menandai item failed lalu melempar", async () => {
    const patches: Array<Record<string, unknown>> = [];
    spyOn(CitationRepo, "findById").mockResolvedValue({
      id: "c10",
      ownerUserId: OWNER,
      artifactId: "art_10",
      title: "Judul",
      authorsJson: [],
      cslJson: {},
      deletedAt: null,
    } as never);
    spyOn(CitationRepo, "updateById").mockImplementation(
      async (_db: unknown, _id: string, patch: Record<string, unknown>) => {
        patches.push(patch);
      },
    );
    spyOn(RagService, "index").mockRejectedValue(new Error("embedding ditolak"));
    await expect(
      LibraryIngestService.run({} as never, { ownerUserId: OWNER, citationId: "c10" }),
    ).rejects.toThrow("embedding ditolak");
    const final = patches.at(-1) as { ingestStatus: string; ingestError: string };
    expect(final.ingestStatus).toBe("failed");
    expect(final.ingestError).toBe("embedding ditolak");
  });
});
```

- [ ] **Step 2: Jalankan uji untuk memastikan gagal**

```bash
cd packages/services && bun test test/library-ingest-service.test.ts
```

Expected: FAIL — `run` belum meng-embed apa pun dan belum menetapkan `textCoverage`.

- [ ] **Step 3: Implementasi**

Lengkapi `run` di `packages/services/src/library/library-ingest.service.ts`:

```ts
  async run(db: Db, job: LibraryIngestJob): Promise<void> {
    const citation = await CitationRepo.findById(db, job.ownerUserId, job.citationId);
    if (!citation || citation.deletedAt) return;

    await CitationRepo.updateById(db, citation.id, {
      ingestStatus: "processing",
      ingestError: null,
      updatedAt: Date.now(),
    });
    try {
      const artifactId = await this.ensureArtifact(db, {
        ownerUserId: job.ownerUserId,
        citation,
      });
      const resolved = await this.resolveMetadata(db, {
        ownerUserId: job.ownerUserId,
        citation,
        artifactId,
      });
      const upgraded = resolved
        ? await this.fetchOpenAccessPdf(db, {
            ownerUserId: job.ownerUserId,
            citation,
            artifactId,
            resolved,
          })
        : false;

      // `ingestResolvedPdf` sudah mengekstrak dan meng-index teks penuh; jalur tanpa
      // PDF meng-embed satu chunk dari metadata supaya item tetap dapat ditemukan.
      let coverage: CitationTextCoverage = "full_text";
      if (!upgraded) {
        // Baca ulang: langkah resolve mungkin baru saja mengisi judul, penulis, dan
        // venue — teks yang di-embed harus versi terbarunya, bukan snapshot awal.
        const fresh =
          (await CitationRepo.findById(db, job.ownerUserId, citation.id)) ?? citation;
        const text = referenceText(fresh);
        const entry = await RagService.index(db, {
          ownerUserId: job.ownerUserId,
          artifactId,
          workspaceId: null,
          text,
        });
        coverage = entry ? "abstract" : "none";
      }

      await CitationRepo.updateById(db, citation.id, {
        ingestStatus: "ready",
        textCoverage: coverage,
        ingestedAt: Date.now(),
        ingestError: null,
        updatedAt: Date.now(),
      });
    } catch (error) {
      await CitationRepo.updateById(db, citation.id, {
        ingestStatus: "failed",
        ingestError: error instanceof Error ? error.message : "Ingest gagal",
        updatedAt: Date.now(),
      });
      throw error;
    }
  },
```

Impor `RagService` dari `../rag.service` dan tipe `CitationTextCoverage` dari `@aqsha/db`.

- [ ] **Step 4: Jalankan uji**

```bash
cd packages/services && bun test test/library-ingest-service.test.ts
```

Expected: PASS — seluruh describe hijau.

- [ ] **Step 5: Commit**

```bash
git add packages/services
git commit -m "feat(services): embed item perpustakaan dan catat cakupan teksnya"
```

---

### Task 9: Pencarian melebar lewat tautan proyek

**Files:**
- Modify: `packages/db/src/repositories/artifactEmbeddingRepo.ts:44-127`
- Modify: `packages/services/src/rag.service.ts:16-23,96-163`
- Test: `packages/db/test/library-ingest.test.ts`

**Interfaces:**
- Produces:
  - `ArtifactEmbeddingMatch` dan `ArtifactEmbeddingLexicalMatch` bertambah `citationId: string | null` dan `bibKey: string | null`.
  - `ThreadDocumentMatch` bertambah `citationId?: string`, `bibKey?: string`.

- [ ] **Step 1: Tulis uji yang gagal**

Tambahkan describe baru di `packages/db/test/library-ingest.test.ts` (impor `ArtifactEmbeddingRepo`, `artifactEmbeddings`, `workspaceCitationLinks`, `workspaces`):

```ts
describe("scope pencarian lewat tautan proyek", () => {
  const WS = `iting_${SUFFIX}:ws`;
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
```

- [ ] **Step 2: Jalankan uji untuk memastikan gagal**

```bash
cd packages/db && bun test test/library-ingest.test.ts
```

Expected: FAIL — chunk `LINKED` tidak muncul (filter masih `workspace_id` saja) dan `bibKey` belum ada.

- [ ] **Step 3: Ubah scope repo**

Di `packages/db/src/repositories/artifactEmbeddingRepo.ts`, tambahkan impor `citations` dan `workspaceCitationLinks`, lalu helper scope:

```ts
/**
 * Paper perpustakaan hidup di level akun (`workspace_id` null), jadi keanggotaan
 * proyeknya dibaca dari tautan referensi — bukan dari kolom pada chunk. Satu paper
 * karena itu bisa dipakai banyak proyek tanpa duplikasi, dan melepas tautan langsung
 * mempersempit hasil tanpa reindex.
 */
function workspaceScope(workspaceId: string) {
  return or(
    eq(artifactEmbeddings.workspaceId, workspaceId),
    sql`exists (
      select 1 from ${citations} c
        join ${workspaceCitationLinks} l on l.citation_id = c.id
       where c.artifact_id = ${artifactEmbeddings.artifactId}
         and l.workspace_id = ${workspaceId}
         and c.deleted_at is null
    )`,
  );
}
```

Ganti baris filter workspace di `searchSimilar` (`:60`) dan `searchLexical` (`:106`) menjadi:

```ts
    if (args.workspaceId) where.push(workspaceScope(args.workspaceId));
```

Tambahkan identitas sitasi pada kedua `select`, dengan left join yang tidak mempersempit hasil:

```ts
        citationId: sql<string | null>`(select c.id from ${citations} c
            where c.artifact_id = ${artifactEmbeddings.artifactId}
              and c.deleted_at is null limit 1)`,
        bibKey: sql<string | null>`(select c.bib_key from ${citations} c
            where c.artifact_id = ${artifactEmbeddings.artifactId}
              and c.deleted_at is null limit 1)`,
```

dan sertakan keduanya di objek hasil `map`. Perbarui kedua tipe match:

```ts
export type ArtifactEmbeddingMatch = {
  artifactId: string;
  chunkIndex: number;
  content: string;
  title: string;
  citationId: string | null;
  bibKey: string | null;
  distance: number;
};
```

(dan padanannya pada `ArtifactEmbeddingLexicalMatch` dengan `rank`). Impor `or` dari `drizzle-orm`.

- [ ] **Step 4: Teruskan identitas sitasi di RagService**

Di `packages/services/src/rag.service.ts`, perluas tipe dan fusi:

```ts
export type ThreadDocumentMatch = {
  artifactId: string;
  title: string;
  chunkIndex: number;
  content: string;
  score: number;
  /** Terisi bila chunk berasal dari item perpustakaan. */
  citationId?: string;
  /**
   * Kunci `@key` hanya sah bila sudah ter-assign; saat null, pemanggil WAJIB
   * mengambilnya dari daftar referensi proyek agar tidak lahir sitasi yatim.
   */
  bibKey?: string;
};
```

```ts
type RankedChunk = {
  artifactId: string;
  chunkIndex: number;
  content: string;
  title: string;
  citationId: string | null;
  bibKey: string | null;
};
```

dan pada pemetaan hasil `fuseByReciprocalRank`:

```ts
    .map(({ chunk, score }) => ({
      artifactId: chunk.artifactId,
      title: chunk.title,
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
      score: Number(score.toFixed(4)),
      ...(chunk.citationId ? { citationId: chunk.citationId } : {}),
      ...(chunk.bibKey ? { bibKey: chunk.bibKey } : {}),
    }));
```

- [ ] **Step 5: Jalankan uji**

```bash
cd packages/db && bun test test/library-ingest.test.ts && cd ../services && bun run typecheck
```

Expected: PASS dan typecheck exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages
git commit -m "feat: agen proyek menjangkau paper perpustakaan yang tertaut"
```

---

### Task 10: Tool agen meneruskan identitas sitasi

**Files:**
- Modify: `apps/agent/src/mastra/tools/search-thread-documents.ts:44-50,16-17`
- Test: `apps/agent` typecheck (tidak ada runner uji di app ini)

**Interfaces:**
- Consumes: `ThreadDocumentMatch.citationId`, `.bibKey` dari Task 9.

- [ ] **Step 1: Perbarui pemetaan hasil**

Di `apps/agent/src/mastra/tools/search-thread-documents.ts`, ganti pemetaan `matches`:

```ts
      matches: matches.map((m) => ({
        artifactId: m.artifactId,
        title: m.title,
        score: Number(m.score.toFixed(3)),
        content: m.content,
        // Identitas sitasi hanya muncul untuk item perpustakaan. `bibKey` boleh absen
        // saat belum ter-assign — jangan pernah mengarangnya.
        ...(m.citationId ? { citationId: m.citationId } : {}),
        ...(m.bibKey ? { bibKey: m.bibKey } : {}),
      })),
```

- [ ] **Step 2: Perbarui deskripsi tool**

Ganti `description` agar model tahu cara memakainya:

```ts
  description:
    "Cari di dokumen milik pengguna — lampiran percakapan dan paper perpustakaan yang tertaut ke proyek aktif. Hasil dapat menyertakan `bibKey` yang siap dipakai sebagai `@key`; bila `bibKey` tidak ada, ambil key dari list_project_references dan jangan pernah mengarangnya.",
```

- [ ] **Step 3: Build dist lalu typecheck**

```bash
bun run build:dist && cd apps/agent && bun run typecheck
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/agent
git commit -m "feat(agent): sertakan identitas sitasi pada hasil pencarian dokumen"
```

---

### Task 11: Endpoint unggah akun-level

**Files:**
- Modify: `apps/api/src/routes/artifacts.ts`
- Test: `apps/api/test/artifacts-upload.test.ts` (buat bila belum ada; ikuti pola uji route yang sudah ada di `apps/api/test`)

**Interfaces:**
- Produces: `POST /artifacts/upload` dengan body `{ key: string; fileName: string; mimeType: string; size: number }` → `{ artifactId, title, indexed }`, lalu membuat citation dan menjalankan gerbang ingest.

- [ ] **Step 1: Tulis uji yang gagal**

Buat `apps/api/test/artifacts-upload.test.ts`:

```ts
/**
 * Unggah akun-level: PDF perpustakaan tidak butuh workspace. Route diuji sebagai
 * kontrak tipis — service di-spy.
 */
import { describe, expect, spyOn, test } from "bun:test";
import { ArtifactService, citationCrudMethods } from "@aqsha/services";
import { artifacts } from "../src/routes/artifacts";

describe("POST /artifacts/upload", () => {
  test("meneruskan workspaceId null ke finalizeUpload", async () => {
    const finalize = spyOn(ArtifactService, "finalizeUpload").mockResolvedValue({
      artifactId: "art_1",
      title: "Paper",
      indexed: true,
    } as never);
    spyOn(citationCrudMethods, "createFromArtifact").mockResolvedValue({
      citation: { id: "c1" },
      created: true,
      linkedExisting: false,
    } as never);

    await artifacts.handle(
      new Request("http://localhost/artifacts/upload", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer test" },
        body: JSON.stringify({
          key: "k",
          fileName: "paper.pdf",
          mimeType: "application/pdf",
          size: 1024,
        }),
      }),
    );

    expect(finalize).toHaveBeenCalled();
    const call = (finalize as ReturnType<typeof spyOn>).mock.calls[0]?.[1] as {
      workspaceId: string | null;
    };
    expect(call.workspaceId).toBeNull();
  });
});
```

- [ ] **Step 2: Jalankan uji untuk memastikan gagal**

```bash
cd apps/api && bun test test/artifacts-upload.test.ts
```

Expected: FAIL — route `POST /artifacts/upload` belum terdaftar (404).

- [ ] **Step 3: Implementasi route**

Di `apps/api/src/routes/artifacts.ts`, tambahkan sesudah route `/artifacts/upload-url`:

```ts
  .post(
    "/artifacts/upload",
    async ({ ownerUserId, email, body }) => {
      const { db } = getDb();
      // Paper perpustakaan tidak dititipkan ke proyek mana pun; citation yang lahir
      // dari sini otomatis melewati gerbang ingest.
      const uploaded = await ArtifactService.finalizeUpload(db, {
        ownerUserId,
        ownerEmail: email,
        workspaceId: null,
        key: body.key,
        fileName: body.fileName,
        mimeType: body.mimeType,
        size: body.size,
      });
      const citation = await citationCrudMethods.createFromArtifact(db, {
        ownerUserId,
        artifactId: uploaded.artifactId,
      });
      return { ...uploaded, citationId: citation.citation.id };
    },
    {
      auth: true,
      rateLimit: "artifacts:upload",
      body: t.Object({
        key: t.String({ minLength: 1 }),
        fileName: t.String({ minLength: 1 }),
        mimeType: t.String({ minLength: 1 }),
        size: t.Number(),
      }),
    },
  )
```

`authMacro` menyediakan `{ ownerUserId, clerkUserId, email }` — bukan `ownerEmail`; pemetaan di atas sudah benar. Impor `citationCrudMethods` dari `@aqsha/services`.

Di route yang sama, jadikan `workspaceId` pada presign opsional agar Perpustakaan bisa memakainya:

```ts
  .post(
    "/artifacts/upload-url",
    ({ ownerUserId, body }) => {
      const { db } = getDb();
      return ArtifactService.generateUploadUrl(db, ownerUserId, body.workspaceId ?? null);
    },
    {
      auth: true,
      body: t.Object({ workspaceId: t.Optional(t.String()) }),
    },
  )
```

- [ ] **Step 4: Jalankan uji**

```bash
cd apps/api && bun test test/artifacts-upload.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api
git commit -m "feat(api): endpoint unggah PDF akun-level untuk perpustakaan"
```

---

### Task 12: Rute reader kanonik dan redirect

**Files:**
- Create: `apps/svelte/src/routes/app/(product)/artifacts/[artifactId]/+page.svelte`
- Modify: `apps/svelte/src/routes/app/(product)/projects/[projectId]/artifacts/[artifactId]/+page.svelte`
- Modify: `apps/svelte/src/lib/features/citations/components/CitationDetailView.svelte:272-300`
- Test: `apps/svelte/src/lib/features/citations/pages/library-page-contract.spec.ts`

**Interfaces:**
- Produces: rute `/app/artifacts/[artifactId]`; rute proyek meredirect ke sana dengan query `project`.

- [ ] **Step 1: Tulis uji yang gagal**

Tambahkan di `apps/svelte/src/lib/features/citations/pages/library-page-contract.spec.ts`:

```ts
const canonicalReader = read('../../../../routes/app/(product)/artifacts/[artifactId]/+page.svelte');
const projectReader = read(
	'../../../../routes/app/(product)/projects/[projectId]/artifacts/[artifactId]/+page.svelte'
);
const detailView = read('../components/CitationDetailView.svelte');

describe('reader route contracts', () => {
	it('canonical reader needs no workspace', () => {
		expect(canonicalReader).toContain('ArtifactReaderPageShell');
		expect(canonicalReader).not.toContain('projectId');
	});

	it('project reader redirects to the canonical route', () => {
		expect(projectReader).toContain('redirect(');
		expect(projectReader).toContain('project=');
	});

	it('detail view links to the reader without requiring a workspace', () => {
		expect(detailView).toContain("resolve('/app/(product)/artifacts/[artifactId]'");
		expect(detailView).not.toContain('citation.artifactId && workspaceId');
	});
});
```

- [ ] **Step 2: Jalankan uji untuk memastikan gagal**

```bash
cd apps/svelte && bun run test
```

Expected: FAIL — file rute kanonik belum ada (`ENOENT`).

- [ ] **Step 3: Buat rute kanonik**

Buat `apps/svelte/src/routes/app/(product)/artifacts/[artifactId]/+page.svelte`:

```svelte
<script lang="ts">
	import { page } from '$app/state';
	import ArtifactReaderPageShell from '$lib/features/workspaces/components/ArtifactReaderPageShell.svelte';

	// Paper hidup di level akun; workspace-nya diturunkan shell dari artifact itu sendiri.
	// `project` hanya menandai asal navigasi untuk breadcrumb, bukan syarat memuat.
	const artifactId = $derived(page.params.artifactId ?? '');
	const projectId = $derived(page.url.searchParams.get('project'));
</script>

<ArtifactReaderPageShell workspaceId={projectId} {artifactId} />
```

Ubah `ArtifactReaderPageShell.svelte` agar prop `workspaceId` menerima `string | null`:

```ts
	let { workspaceId, artifactId }: { workspaceId: string | null; artifactId: string } = $props();
```

dan teruskan `workspaceId ?? undefined` ke `useArtifactDetailData` bila hook itu mensyaratkan string.

- [ ] **Step 4: Ubah rute proyek menjadi redirect**

Ganti isi `apps/svelte/src/routes/app/(product)/projects/[projectId]/artifacts/[artifactId]/+page.svelte` dengan file `+page.ts` di direktori yang sama:

```ts
import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import type { PageLoad } from './$types';

// Satu dokumen, satu alamat. Rute lama tetap hidup sebagai pengalih supaya tautan
// yang sudah tersebar tidak mati, membawa asal proyeknya lewat query.
export const load: PageLoad = ({ params }) => {
	const target = resolve('/app/(product)/artifacts/[artifactId]', {
		artifactId: params.artifactId
	});
	redirect(307, `${target}?project=${encodeURIComponent(params.projectId)}`);
};
```

Hapus `+page.svelte` lama di direktori tersebut.

- [ ] **Step 5: Perbarui tautan di panel detail**

Di `apps/svelte/src/lib/features/citations/components/CitationDetailView.svelte`, ganti blok artifact (`:272`) agar hanya bergantung pada `artifactId`:

```svelte
				{#if citation.artifactId}
					<div class="grid grid-cols-[6rem_1fr] items-baseline gap-2">
						<dt class="text-[12px] font-semibold text-muted-foreground">Paper</dt>
						<dd class="min-w-0 font-medium text-foreground">
							<span class="flex flex-wrap items-center gap-2">
								<a
									href={resolve('/app/(product)/artifacts/[artifactId]', {
										artifactId: citation.artifactId
									})}
									class="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
								>
									<Icon icon={BookOpenIcon} class="size-3.5" />
									Buka di reader
								</a>
								{#if !citation.deletedAt}
									<button
										type="button"
										onclick={() =>
											updateCitation.mutate({ citationId: citation.id, artifactId: null })}
										class="text-[12px] font-medium text-muted-foreground transition-colors hover:text-destructive"
									>
										Lepas tautan
									</button>
								{/if}
							</span>
						</dd>
					</div>
				{/if}
```

- [ ] **Step 6: Jalankan uji dan check**

```bash
cd apps/svelte && bun run test && bun run check
```

Expected: uji PASS, `svelte-check` 0 error.

- [ ] **Step 7: Commit**

```bash
git add apps/svelte
git commit -m "feat(svelte): rute reader paper kanonik lepas dari proyek"
```

---

### Task 13: Model murni status kartu dan DOI clipboard

**Files:**
- Create: `apps/svelte/src/lib/features/citations/library-ingest-view.ts`
- Create: `apps/svelte/src/lib/features/citations/library-ingest-view.spec.ts`
- Create: `apps/svelte/src/lib/features/citations/clipboard-doi.ts`
- Create: `apps/svelte/src/lib/features/citations/clipboard-doi.spec.ts`
- Modify: `apps/svelte/src/lib/features/citations/types.ts`

**Interfaces:**
- Produces:
  - `type CitationIngestStatus = 'pending' | 'processing' | 'ready' | 'failed'`, `type CitationTextCoverage = 'none' | 'abstract' | 'full_text'` di `types.ts`, dan keduanya masuk ke `CitationListItem`.
  - `ingestBadge(item: { ingestStatus; textCoverage }): { label: string; tone: 'muted' | 'progress' | 'danger' } | null`
  - `hasPendingIngest(items: Array<{ ingestStatus }>): boolean`
  - `extractDoiFromText(text: string): string | null`

- [ ] **Step 1: Tulis uji yang gagal**

Buat `apps/svelte/src/lib/features/citations/library-ingest-view.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { hasPendingIngest, ingestBadge } from './library-ingest-view';

describe('ingest badge', () => {
	it('item selesai dengan teks penuh tidak menampilkan badge', () => {
		expect(ingestBadge({ ingestStatus: 'ready', textCoverage: 'full_text' })).toBeNull();
	});

	it('item selesai tanpa PDF menyatakan cakupan abstrak', () => {
		expect(ingestBadge({ ingestStatus: 'ready', textCoverage: 'abstract' })).toEqual({
			label: 'Abstrak saja',
			tone: 'muted'
		});
	});

	it('item yang sedang diproses memakai nada progress', () => {
		expect(ingestBadge({ ingestStatus: 'processing', textCoverage: 'none' })?.tone).toBe(
			'progress'
		);
	});

	it('item gagal memakai nada danger', () => {
		expect(ingestBadge({ ingestStatus: 'failed', textCoverage: 'none' })).toEqual({
			label: 'Gagal diproses',
			tone: 'danger'
		});
	});
});

describe('polling gate', () => {
	it('berhenti saat semua item selesai', () => {
		expect(
			hasPendingIngest([{ ingestStatus: 'ready' }, { ingestStatus: 'failed' }])
		).toBe(false);
	});

	it('lanjut selama masih ada yang antre', () => {
		expect(hasPendingIngest([{ ingestStatus: 'ready' }, { ingestStatus: 'pending' }])).toBe(true);
	});
});
```

Buat `apps/svelte/src/lib/features/citations/clipboard-doi.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { extractDoiFromText } from './clipboard-doi';

describe('extractDoiFromText', () => {
	it('mengambil DOI telanjang', () => {
		expect(extractDoiFromText('10.1016/j.jclepro.2021.127593')).toBe(
			'10.1016/j.jclepro.2021.127593'
		);
	});

	it('mengambil DOI dari URL doi.org', () => {
		expect(extractDoiFromText('https://doi.org/10.1234/abc.def')).toBe('10.1234/abc.def');
	});

	it('mengabaikan teks tanpa DOI', () => {
		expect(extractDoiFromText('catatan rapat minggu depan')).toBeNull();
	});

	it('mengabaikan teks kosong', () => {
		expect(extractDoiFromText('   ')).toBeNull();
	});
});
```

- [ ] **Step 2: Jalankan uji untuk memastikan gagal**

```bash
cd apps/svelte && bun run test
```

Expected: FAIL — kedua modul belum ada.

- [ ] **Step 3: Implementasi model status**

Buat `apps/svelte/src/lib/features/citations/library-ingest-view.ts`:

```ts
import type { CitationIngestStatus, CitationTextCoverage } from './types';

export type IngestBadge = { label: string; tone: 'muted' | 'progress' | 'danger' };

/**
 * Item yang beres dengan teks penuh adalah keadaan normal, jadi ia tidak diberi
 * penanda apa pun — badge hanya untuk hal yang perlu diketahui pengguna.
 */
export function ingestBadge(item: {
	ingestStatus: CitationIngestStatus;
	textCoverage: CitationTextCoverage;
}): IngestBadge | null {
	if (item.ingestStatus === 'failed') return { label: 'Gagal diproses', tone: 'danger' };
	if (item.ingestStatus === 'pending' || item.ingestStatus === 'processing') {
		return { label: 'Diproses…', tone: 'progress' };
	}
	if (item.textCoverage === 'full_text') return null;
	if (item.textCoverage === 'abstract') return { label: 'Abstrak saja', tone: 'muted' };
	return { label: 'Belum terindeks', tone: 'muted' };
}

/** Polling hanya hidup selama masih ada pekerjaan; kalau tidak, ia berhenti sendiri. */
export function hasPendingIngest(items: Array<{ ingestStatus: CitationIngestStatus }>): boolean {
	return items.some((i) => i.ingestStatus === 'pending' || i.ingestStatus === 'processing');
}
```

Buat `apps/svelte/src/lib/features/citations/clipboard-doi.ts`:

```ts
/** Cermin `DOI_RE` di services — apps/svelte tidak boleh mengimpor paket itu. */
const DOI_RE = /10\.\d{4,9}\/[-._;()/:a-z0-9]+/i;

/**
 * Dipakai aksi "Tempel DOI". Pembacaan clipboard baru terjadi saat aksi dipilih,
 * bukan saat menu dibuka, karena izin clipboard tidak seragam antar-browser dan
 * menu yang isinya berubah-ubah tanpa sebab sulit dipahami pengguna.
 */
export function extractDoiFromText(text: string): string | null {
	const match = text.trim().match(DOI_RE);
	if (!match) return null;
	return match[0].replace(/[.,;)]+$/, '');
}
```

- [ ] **Step 4: Perluas tipe citation**

Di `apps/svelte/src/lib/features/citations/types.ts`, tambahkan tipe dan field:

```ts
export type CitationIngestStatus = 'pending' | 'processing' | 'ready' | 'failed';
export type CitationTextCoverage = 'none' | 'abstract' | 'full_text';
```

dan di dalam `CitationListItem`:

```ts
	ingestStatus: CitationIngestStatus;
	textCoverage: CitationTextCoverage;
```

- [ ] **Step 5: Jalankan uji**

```bash
cd apps/svelte && bun run test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/svelte
git commit -m "feat(svelte): model status ingest dan pembacaan DOI dari clipboard"
```

---

### Task 14: Unggah PDF dari Perpustakaan

**Files:**
- Modify: `apps/svelte/src/lib/features/citations/api.ts`
- Modify: `apps/svelte/src/lib/features/citations/pages/LibraryPage.svelte:245-269,430-500`
- Modify: `apps/svelte/src/lib/features/citations/components/CitationEmptyState.svelte`
- Test: `apps/svelte/src/lib/features/citations/pages/library-page-contract.spec.ts`

**Interfaces:**
- Consumes: `POST /artifacts/upload` dari Task 11.
- Produces: `useUploadLibraryPdf()` — mutation menerima `File`, melakukan presign lalu finalize, dan menginvalidasi daftar sitasi.

- [ ] **Step 1: Tulis uji yang gagal**

Tambahkan di `apps/svelte/src/lib/features/citations/pages/library-page-contract.spec.ts`:

```ts
	it('library offers PDF upload as the primary add action', () => {
		expect(libraryPage).toContain('Unggah PDF');
		expect(libraryPage).toContain('useUploadLibraryPdf');
		expect(read('../components/CitationEmptyState.svelte')).toContain('onUploadPdf');
	});
```

- [ ] **Step 2: Jalankan uji untuk memastikan gagal**

```bash
cd apps/svelte && bun run test
```

Expected: FAIL — penanda `Unggah PDF` belum ada.

- [ ] **Step 3: Tambahkan hook unggah**

Di `apps/svelte/src/lib/features/citations/api.ts`, tambahkan:

```ts
/**
 * Unggah PDF ke perpustakaan akun: presign → PUT langsung ke object storage →
 * finalize. Finalize-lah yang membuat citation dan memicu post-processing, jadi
 * daftar cukup diinvalidasi sekali di akhir.
 */
export function useUploadLibraryPdf() {
	const api = getApiClient();
	const invalidate = useInvalidateCitations();
	return createMutation(() => ({
		mutationFn: async (file: File) => {
			const presigned = unwrap(await api.artifacts['upload-url'].post({})) as {
				uploadUrl: string;
				key: string;
			};
			const put = await fetch(presigned.uploadUrl, {
				method: 'PUT',
				body: file,
				headers: { 'content-type': file.type || 'application/pdf' }
			});
			if (!put.ok) throw new Error('Unggahan gagal');
			return unwrap(
				await api.artifacts.upload.post({
					key: presigned.key,
					fileName: file.name,
					mimeType: file.type || 'application/pdf',
					size: file.size
				})
			);
		},
		onSuccess: () => {
			invalidate();
			toast.success('PDF diunggah — metadata sedang diproses');
		},
		onError: (error) => toast.error(readableApiErrorMessage(error, 'Unggahan gagal'))
	}));
}
```

Body presign dikirim kosong karena `workspaceId` sudah opsional sesudah Task 11 — unggahan perpustakaan tidak menuju proyek mana pun.

- [ ] **Step 4: Pasang di halaman**

Di `LibraryPage.svelte`, tambahkan state dan mutation:

```ts
	const uploadPdf = useUploadLibraryPdf();
	let fileInputEl = $state<HTMLInputElement | null>(null);

	function pickPdf() {
		fileInputEl?.click();
	}

	function uploadFiles(files: File[]) {
		for (const file of files) uploadPdf.mutate(file);
	}
```

Tambahkan item pertama di dropdown `+`:

```svelte
							<DropdownMenu.Item onSelect={pickPdf}>
								<Icon icon={UploadIcon} class="size-4" />
								Unggah PDF
							</DropdownMenu.Item>
							<DropdownMenu.Separator />
```

Tambahkan input tersembunyi di dekat akhir markup halaman:

```svelte
<input
	bind:this={fileInputEl}
	type="file"
	accept="application/pdf"
	multiple
	class="hidden"
	onchange={(event) => {
		const files = [...(event.currentTarget.files ?? [])];
		event.currentTarget.value = '';
		uploadFiles(files);
	}}
/>
```

Teruskan `onUploadPdf={pickPdf}` ke `CitationEmptyState`, dan di komponen itu tambahkan prop serta jadikan tombol unggah sebagai CTA utama (varian default), menggeser Import ke `variant="secondary"`.

- [ ] **Step 5: Jalankan uji dan check**

```bash
cd apps/svelte && bun run test && bun run check
```

Expected: uji PASS, `svelte-check` 0 error.

- [ ] **Step 6: Commit**

```bash
git add apps/svelte
git commit -m "feat(svelte): unggah PDF langsung dari perpustakaan"
```

---

### Task 15: Context menu kartu dan latar grid

**Files:**
- Create: `apps/svelte/src/lib/features/citations/components/library/LibraryCardContextMenu.svelte`
- Create: `apps/svelte/src/lib/features/citations/components/library/LibraryBackdropContextMenu.svelte`
- Modify: `apps/svelte/src/lib/features/citations/components/library/LibraryRow.svelte`
- Modify: `apps/svelte/src/lib/features/citations/pages/LibraryPage.svelte`
- Test: `apps/svelte/src/lib/features/citations/components/library/library-actions.spec.ts`

**Interfaces:**
- Consumes: `extractDoiFromText` dari Task 13, `membershipAction` yang sudah ada di `LibraryRow`.
- Produces: dua komponen menu yang menerima callback aksi; keduanya tidak memutuskan scope sendiri.

- [ ] **Step 1: Tulis uji yang gagal**

Tambahkan di `apps/svelte/src/lib/features/citations/components/library/library-actions.spec.ts`:

```ts
	it('card context menu mirrors the row actions', () => {
		const menu = read('./LibraryCardContextMenu.svelte');
		expect(menu).toContain('Buka paper');
		expect(menu).toContain('Salin sitasi');
		expect(menu).toContain('membershipAction');
	});

	it('backdrop menu offers add actions and clipboard DOI', () => {
		const menu = read('./LibraryBackdropContextMenu.svelte');
		expect(menu).toContain('Unggah PDF');
		expect(menu).toContain('Tempel DOI');
		expect(menu).toContain('extractDoiFromText');
	});

	it('backdrop trigger wraps the grid, not the document', () => {
		expect(read('../../pages/LibraryPage.svelte')).toContain('LibraryBackdropContextMenu');
	});
```

- [ ] **Step 2: Jalankan uji untuk memastikan gagal**

```bash
cd apps/svelte && bun run test
```

Expected: FAIL — kedua komponen belum ada.

- [ ] **Step 3: Buat menu kartu**

Buat `apps/svelte/src/lib/features/citations/components/library/LibraryCardContextMenu.svelte`:

```svelte
<script lang="ts">
	import * as ContextMenu from '@aqsha/ui-svelte/components/context-menu';
	import {
		CopyIcon,
		ExternalLinkIcon,
		Icon,
		PencilIcon,
		Trash2Icon,
		type IconSvgElement
	} from '$lib/icons';

	/**
	 * Menu kartu perpustakaan. Isi aksinya disuplai pemanggil supaya menu tidak
	 * menyimpulkan scope sendiri — perilaku "tambah ke proyek" vs "lepas dari proyek"
	 * ditentukan halaman, bukan komponen ini.
	 */
	let {
		title,
		externalHref,
		membershipAction,
		onOpenReader,
		onOpenDetail,
		onEdit,
		onCopy,
		onSelectMany,
		onDelete,
		children
	}: {
		title: string;
		externalHref: string | null;
		membershipAction: { label: string; icon: IconSvgElement; run: () => void };
		onOpenReader: () => void;
		onOpenDetail: () => void;
		onEdit: () => void;
		onCopy: () => void;
		onSelectMany: () => void;
		onDelete: () => void;
		children: import('svelte').Snippet;
	} = $props();
</script>

<ContextMenu.Root>
	<ContextMenu.Trigger class="block">
		{@render children()}
	</ContextMenu.Trigger>
	<ContextMenu.Content class="w-56">
		<ContextMenu.Label class="truncate">{title}</ContextMenu.Label>
		<ContextMenu.Item onSelect={onOpenReader}>Buka paper</ContextMenu.Item>
		<ContextMenu.Item onSelect={onOpenDetail}>Lihat detail</ContextMenu.Item>
		<ContextMenu.Separator />
		<ContextMenu.Item onSelect={onCopy}>
			<Icon icon={CopyIcon} class="size-4" />
			Salin sitasi
		</ContextMenu.Item>
		<ContextMenu.Item onSelect={onEdit}>
			<Icon icon={PencilIcon} class="size-4" />
			Edit
		</ContextMenu.Item>
		<ContextMenu.Item onSelect={membershipAction.run}>
			<Icon icon={membershipAction.icon} class="size-4" />
			{membershipAction.label}
		</ContextMenu.Item>
		{#if externalHref}
			<ContextMenu.Item onSelect={() => window.open(externalHref, '_blank', 'noopener')}>
				<Icon icon={ExternalLinkIcon} class="size-4" />
				Buka sumber
			</ContextMenu.Item>
		{/if}
		<ContextMenu.Separator />
		<ContextMenu.Item onSelect={onSelectMany}>Pilih beberapa</ContextMenu.Item>
		<ContextMenu.Item variant="destructive" onSelect={onDelete}>
			<Icon icon={Trash2Icon} class="size-4" />
			Hapus
		</ContextMenu.Item>
	</ContextMenu.Content>
</ContextMenu.Root>
```

- [ ] **Step 4: Buat menu latar**

Buat `apps/svelte/src/lib/features/citations/components/library/LibraryBackdropContextMenu.svelte`:

```svelte
<script lang="ts">
	import * as ContextMenu from '@aqsha/ui-svelte/components/context-menu';
	import { Icon, LinkIcon, PenLineIcon, UploadIcon } from '$lib/icons';
	import { extractDoiFromText } from '../../clipboard-doi';

	/**
	 * Menu latar grid — bukan seluruh dokumen, supaya klik kanan di header, teks, dan
	 * tautan tetap memberi menu asli browser.
	 */
	let {
		onUploadPdf,
		onAddByDoi,
		onAddManual,
		onImportFile,
		onSelectMany,
		children
	}: {
		onUploadPdf: () => void;
		onAddByDoi: (doi: string | null) => void;
		onAddManual: () => void;
		onImportFile: () => void;
		onSelectMany: () => void;
		children: import('svelte').Snippet;
	} = $props();

	// Clipboard dibaca saat aksi dipilih, bukan saat menu dibuka: izin clipboard tidak
	// seragam antar-browser, dan menu yang isinya berubah tanpa sebab sulit dipahami.
	async function pasteDoi() {
		try {
			const text = await navigator.clipboard.readText();
			onAddByDoi(extractDoiFromText(text));
		} catch {
			onAddByDoi(null);
		}
	}
</script>

<ContextMenu.Root>
	<ContextMenu.Trigger class="block min-h-full">
		{@render children()}
	</ContextMenu.Trigger>
	<ContextMenu.Content class="w-52">
		<ContextMenu.Item onSelect={onUploadPdf}>
			<Icon icon={UploadIcon} class="size-4" />
			Unggah PDF
		</ContextMenu.Item>
		<ContextMenu.Item onSelect={() => onAddByDoi(null)}>
			<Icon icon={LinkIcon} class="size-4" />
			Tambah dari DOI
		</ContextMenu.Item>
		<ContextMenu.Item onSelect={pasteDoi}>Tempel DOI</ContextMenu.Item>
		<ContextMenu.Item onSelect={onAddManual}>
			<Icon icon={PenLineIcon} class="size-4" />
			Isi manual
		</ContextMenu.Item>
		<ContextMenu.Item onSelect={onImportFile}>Import file</ContextMenu.Item>
		<ContextMenu.Separator />
		<ContextMenu.Item onSelect={onSelectMany}>Pilih beberapa</ContextMenu.Item>
	</ContextMenu.Content>
</ContextMenu.Root>
```

- [ ] **Step 5: Pasang keduanya**

Di `LibraryRow.svelte`, bungkus `LibraryCardFrame` dengan `LibraryCardContextMenu`, teruskan prop yang sudah dimiliki baris (`item.title`, `externalHref`, `membershipAction`, `onOpen`, `onCopy`, `onEdit`, `onDelete`) plus dua callback baru `onOpenReader` dan `onSelectMany` yang ditambahkan ke daftar props komponen.

Di `LibraryPage.svelte`, bungkus `<ul>` grid dengan `LibraryBackdropContextMenu`, teruskan `onUploadPdf={pickPdf}`, `onAddByDoi={(doi) => { doiPrefill = doi; dialog = 'doi'; }}`, `onAddManual={() => (dialog = 'manual')}`, `onImportFile={() => (dialog = 'import')}`, dan `onSelectMany={() => (selectionMode = true)}`. Tambahkan state `let doiPrefill = $state<string | null>(null);` dan teruskan sebagai prop `prefill` ke `CitationDoiDialog` (tambahkan prop itu di `CitationDoiContent.svelte` sebagai nilai awal input).

Teruskan juga `onOpenReader` per baris dari halaman:

```ts
	function readerHref(item: CitationListItem): string | null {
		if (!item.artifactId) return null;
		const base = resolve('/app/(product)/artifacts/[artifactId]', { artifactId: item.artifactId });
		return workspaceId ? `${base}?project=${encodeURIComponent(workspaceId)}` : base;
	}
```

- [ ] **Step 6: Jalankan uji dan check**

```bash
cd apps/svelte && bun run test && bun run check
```

Expected: uji PASS, `svelte-check` 0 error.

- [ ] **Step 7: Commit**

```bash
git add apps/svelte
git commit -m "feat(svelte): context menu kartu dan latar di perpustakaan"
```

---

### Task 16: Penanda status di kartu dan polling

**Files:**
- Modify: `apps/svelte/src/lib/features/citations/components/library/LibraryRow.svelte`
- Modify: `apps/svelte/src/lib/features/citations/api.ts` (`useCitationsList`)
- Test: `apps/svelte/src/lib/features/citations/components/library/library-actions.spec.ts`

**Interfaces:**
- Consumes: `ingestBadge`, `hasPendingIngest` dari Task 13.

- [ ] **Step 1: Tulis uji yang gagal**

Tambahkan di `library-actions.spec.ts`:

```ts
	it('card renders the ingest badge from the pure model', () => {
		expect(read('./LibraryRow.svelte')).toContain('ingestBadge');
	});

	it('list polls only while ingest work remains', () => {
		expect(read('../../api.ts')).toContain('hasPendingIngest');
		expect(read('../../api.ts')).toContain('refetchInterval');
	});
```

- [ ] **Step 2: Jalankan uji untuk memastikan gagal**

```bash
cd apps/svelte && bun run test
```

Expected: FAIL — penanda belum dipasang.

- [ ] **Step 3: Pasang badge di kartu**

Di `LibraryRow.svelte`, impor dan turunkan badge:

```ts
	import { ingestBadge } from '../../library-ingest-view';

	const badge = $derived(ingestBadge(item));
	const badgeClass: Record<'muted' | 'progress' | 'danger', string> = {
		muted: 'bg-white/15 text-white/75',
		progress: 'bg-white/25 text-white animate-pulse',
		danger: 'bg-destructive/25 text-white'
	};
```

Tambahkan di baris bawah kartu, sebelum ikon status metadata:

```svelte
					{#if badge}
						<span
							class={cn(
								'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold',
								badgeClass[badge.tone]
							)}
						>
							{badge.label}
						</span>
					{/if}
```

- [ ] **Step 4: Pasang polling**

Di `apps/svelte/src/lib/features/citations/api.ts`, di dalam `useCitationsList`, tambahkan pada objek opsi query:

```ts
		// Post-processing selesai dalam hitungan detik; polling ringan lebih murah
		// daripada kanal realtime baru, dan berhenti sendiri saat tak ada yang antre.
		refetchInterval: (query) => {
			const items = query.state.data?.pages.flatMap((p) => p.items) ?? [];
			return hasPendingIngest(items) ? 4000 : false;
		},
```

Impor `hasPendingIngest` dari `./library-ingest-view`.

- [ ] **Step 5: Jalankan uji dan check**

```bash
cd apps/svelte && bun run test && bun run check
```

Expected: uji PASS, `svelte-check` 0 error.

- [ ] **Step 6: Commit**

```bash
git add apps/svelte
git commit -m "feat(svelte): tampilkan kemajuan ingest di kartu perpustakaan"
```

---

### Task 17: Hapus item perpustakaan ikut menyingkirkan artifact bayangannya

**Files:**
- Modify: `packages/services/src/citations/citation-crud.methods.ts:713-727` (`bulkSoftDelete`)
- Test: `packages/services/test/library-ingest-service.test.ts`

**Interfaces:**
- Consumes: `CitationRepo.findByIds(db, ownerUserId, ids)`, `ArtifactRepo.update(db, artifactId, patch)`.
- Produces: `bulkSoftDelete` men-soft-delete artifact `source = 'reference'` milik citation yang dihapus.

Penghapusan permanen tidak butuh pekerjaan baru — `purgeArtifactStorage` sudah membersihkan embedding (`artifact.service.ts:1716`).

- [ ] **Step 1: Tulis uji yang gagal**

Tambahkan di `packages/services/test/library-ingest-service.test.ts`:

```ts
describe("hapus item perpustakaan", () => {
  test("artifact referensi ikut di-soft-delete", async () => {
    const updates: Array<{ id: string; patch: { status?: string } }> = [];
    spyOn(CitationRepo, "findByIds").mockResolvedValue([
      { id: "c11", ownerUserId: OWNER, artifactId: "art_11" },
    ] as never);
    spyOn(CitationRepo, "softDeleteMany").mockResolvedValue(1 as never);
    spyOn(ArtifactRepo, "findById").mockResolvedValue({
      id: "art_11",
      ownerUserId: OWNER,
      source: "reference",
      status: "active",
    } as never);
    spyOn(ArtifactRepo, "update").mockImplementation(
      async (_db: unknown, id: string, patch: { status?: string }) => {
        updates.push({ id, patch });
      },
    );

    await citationCrudMethods.bulkSoftDelete({} as never, {
      ownerUserId: OWNER,
      ids: ["c11"],
    });
    expect(updates[0]).toEqual({
      id: "art_11",
      patch: expect.objectContaining({ status: "deleted" }),
    });
  });

  test("artifact unggahan proyek tidak ikut terhapus", async () => {
    const updates: string[] = [];
    spyOn(CitationRepo, "findByIds").mockResolvedValue([
      { id: "c12", ownerUserId: OWNER, artifactId: "art_12" },
    ] as never);
    spyOn(CitationRepo, "softDeleteMany").mockResolvedValue(1 as never);
    spyOn(ArtifactRepo, "findById").mockResolvedValue({
      id: "art_12",
      ownerUserId: OWNER,
      source: "upload",
      status: "active",
    } as never);
    spyOn(ArtifactRepo, "update").mockImplementation(async (_db: unknown, id: string) => {
      updates.push(id);
    });

    await citationCrudMethods.bulkSoftDelete({} as never, {
      ownerUserId: OWNER,
      ids: ["c12"],
    });
    expect(updates).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Jalankan uji untuk memastikan gagal**

```bash
cd packages/services && bun test test/library-ingest-service.test.ts
```

Expected: FAIL — `bulkSoftDelete` belum menyentuh artifact sama sekali.

- [ ] **Step 3: Implementasi**

Di `packages/services/src/citations/citation-crud.methods.ts`, lengkapi `bulkSoftDelete`:

```ts
  /** Soft delete banyak citation (bulk bar). Guard owner+aktif di repo. */
  async bulkSoftDelete(
    db: DbOrTx,
    input: { ownerUserId: string; ids: string[] },
  ): Promise<{ affected: number }> {
    const uniqueIds = [...new Set(input.ids)];
    if (uniqueIds.length === 0) return { affected: 0 };
    const rows = await CitationRepo.findByIds(db, input.ownerUserId, uniqueIds);
    const now = Date.now();
    const affected = await CitationRepo.softDeleteMany(db, input.ownerUserId, uniqueIds, now);

    // Artifact bayangan hanya milik item perpustakaan, jadi ia ikut mati bersama
    // referensinya — dan filter `status = 'active'` pada pencarian menyingkirkan
    // chunk-nya tanpa perlu menghapus embedding. Artifact yang diunggah ke proyek
    // punya hidupnya sendiri dan tidak boleh tersentuh.
    for (const row of rows) {
      if (!row.artifactId) continue;
      const artifact = await ArtifactRepo.findById(db, row.artifactId);
      if (!artifact || artifact.ownerUserId !== input.ownerUserId) continue;
      if (artifact.source !== "reference" || artifact.status !== "active") continue;
      await ArtifactRepo.update(db, artifact.id, {
        status: "deleted",
        deletedAt: now,
        updatedAt: now,
      });
    }
    return { affected };
  },
```

Pastikan `ArtifactRepo` sudah diimpor di file ini; bila belum, tambahkan ke impor `@aqsha/db` yang ada.

- [ ] **Step 4: Jalankan uji**

```bash
cd packages/services && bun test test/library-ingest-service.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/services
git commit -m "feat(services): hapus artifact bayangan bersama item perpustakaannya"
```

---

### Task 18: Perintah backfill perpustakaan lama

**Files:**
- Create: `apps/api/src/scripts/backfill-library-ingest.ts`
- Modify: `apps/api/package.json` (scripts)
- Test: manual — dijalankan terhadap database dev

**Interfaces:**
- Consumes: `LibraryIngestService.enqueue` dari Task 4, `CitationRepo.listByIngestStatus` yang ditambahkan di task ini.

- [ ] **Step 1: Tulis skrip**

Buat `apps/api/src/scripts/backfill-library-ingest.ts`:

```ts
import { CitationRepo } from "@aqsha/db";
import { LibraryIngestService } from "@aqsha/services";
import { getDb } from "../clients/db";
import { logger } from "../lib/log";

/**
 * Antrekan ulang item perpustakaan yang belum pernah diproses. Dijalankan manual dan
 * bertahap — migrasi sengaja tidak melakukan ini supaya menjalankannya tidak berarti
 * tiba-tiba mengunduh ribuan PDF. Aman diulang: jobId per item bersifat stabil.
 */
const BATCH = Number(process.env.BACKFILL_BATCH ?? 50);

async function main(): Promise<void> {
  const { db } = getDb();
  const pending = await CitationRepo.listByIngestStatus(db, "pending", BATCH);
  if (pending.length === 0) {
    logger.info("backfill_library_ingest_empty");
    return;
  }
  const byOwner = new Map<string, string[]>();
  for (const row of pending) {
    byOwner.set(row.ownerUserId, [...(byOwner.get(row.ownerUserId) ?? []), row.id]);
  }
  for (const [ownerUserId, citationIds] of byOwner) {
    await LibraryIngestService.enqueue({ ownerUserId, citationIds });
  }
  logger.info({ queued: pending.length, notable: true }, "backfill_library_ingest_queued");
}

await main();
process.exit(0);
```

Tambahkan repo pendukung di `packages/db/src/repositories/citationRepo.ts` (pastikan `and`, `eq`, dan `isNull` ikut diimpor dari `drizzle-orm`):

```ts
  /**
   * Item yang belum pernah diproses, untuk backfill bertahap. Sengaja LINTAS OWNER —
   * ini perkakas operasional yang dijalankan dari shell, bukan jalur permintaan
   * pengguna, jadi tidak ada scope owner yang bisa disimpulkan.
   */
  async listByIngestStatus(
    db: DbOrTx,
    ingestStatus: CitationIngestStatus,
    limit: number,
  ): Promise<Array<{ id: string; ownerUserId: string }>> {
    return db
      .select({ id: citations.id, ownerUserId: citations.ownerUserId })
      .from(citations)
      .where(and(eq(citations.ingestStatus, ingestStatus), isNull(citations.deletedAt)))
      .limit(limit);
  },
```

Tambahkan script di `apps/api/package.json`:

```json
    "backfill:library-ingest": "bun run src/scripts/backfill-library-ingest.ts",
```

- [ ] **Step 2: Build dist lalu jalankan sekali terhadap dev**

```bash
bun run build:dist && cd apps/api && BACKFILL_BATCH=5 bun run backfill:library-ingest
```

Expected: log `backfill_library_ingest_queued` dengan `queued` ≤ 5, atau `backfill_library_ingest_empty`.

- [ ] **Step 3: Commit**

```bash
git add packages/db apps/api
git commit -m "feat(api): perintah backfill bertahap untuk item perpustakaan lama"
```

---

### Task 19: Gerbang verifikasi menyeluruh

**Files:**
- Test: seluruh workspace

- [ ] **Step 1: Jalankan gerbang uji repo**

```bash
bun run build:dist && bun run test
```

Expected: PASS. Bandingkan kegagalan dengan baseline sebelum pekerjaan ini dimulai; tidak boleh ada kegagalan baru.

- [ ] **Step 2: Typecheck seluruh workspace**

```bash
bun run typecheck
```

Expected: `@aqsha/db`, `@aqsha/services`, `@aqsha/api`, `@aqsha/agent`, dan `apps/svelte` bersih. `@aqsha/web` diketahui gagal sebagai baseline dan tidak disentuh pekerjaan ini — pastikan kegagalannya identik dengan sebelum perubahan.

- [ ] **Step 3: Check svelte**

```bash
cd apps/svelte && bun run check
```

Expected: 0 error.

- [ ] **Step 4: Verifikasi manual jalur utuh**

Jalankan `bun dev`, lalu:

1. Buka Perpustakaan, unggah satu PDF paper ber-DOI. Kartu muncul dengan badge "Diproses…", lalu berubah menjadi tanpa badge (teks penuh) dalam beberapa detik.
2. Tambah satu item lewat DOI paper yang tidak open access. Kartu berakhir dengan badge "Abstrak saja".
3. Klik kanan kartu → "Buka paper" membuka `/app/artifacts/<id>`; URL lama `/app/projects/<p>/artifacts/<id>` meredirect ke sana dengan `?project=`.
4. Klik kanan latar grid → "Tempel DOI" dengan DOI di clipboard membuka dialog yang sudah terisi.
5. Tautkan satu paper ke sebuah proyek, lalu di chat proyek minta Astra mencari topik yang hanya ada di paper itu — hasilnya memuat cuplikan dari paper tersebut. Lepaskan tautannya, ulangi, dan cuplikan itu hilang.

- [ ] **Step 5: Commit catatan verifikasi bila ada perbaikan**

```bash
git add -A
git commit -m "fix: perbaikan hasil verifikasi jalur ingest perpustakaan"
```

(Lewati bila tidak ada perbaikan yang dibutuhkan.)
