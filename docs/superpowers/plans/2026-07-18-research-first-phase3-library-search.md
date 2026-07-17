# Research-First Repositioning — Fase 3: Perpustakaan & Pencarian — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menghidupkan permukaan sumber: `/app/library` full-page (citations-only, model Zotero), pencarian sumber in-project `/app/projects/[id]/search` dengan Simpan citation-first + auto-link, Simpan dari Explore via dialog proyek/perpustakaan, dan Explore tanpa berita — di atas backend Fase 1 plus tiga perubahan API kecil (de-workspace import/sync, create dedupe-return, render account-level).

**Architecture:** Backend dikerjakan dulu (services + route + migration → `bun run build:dist` agar tipe Eden segar), lalu frontend svelte: repoint hooks → library page → search in-project → explore sweep. Shell list library & kartu hasil pencarian dibangun baru (flat-card v2); dialogs/wizard/detail citations existing di-reuse. Spec: `docs/superpowers/specs/2026-07-18-research-first-phase3-library-search-design.md`; hasil Fase 2: `docs/superpowers/plans/2026-07-17-research-first-phase2-ia-svelte.md`.

**Tech Stack:** Bun 1.3.10, Drizzle ORM, Elysia + t-schema, bun:test; SvelteKit (runes-only), Svelte 5, TanStack svelte-query, Eden Treaty, `@aqsha/ui-svelte`, Tailwind v4.

## Global Constraints

- Selalu `bun` — jangan npm/pnpm/yarn. Migration via `bun run db:generate` + `bun run db:migrate` dari root (gotcha: bila drizzle-kit minta prompt interaktif, jalankan via python pty seperti Fase 1).
- `apps/svelte` TIDAK boleh import `@aqsha/db`/`@aqsha/services` — tipe lokal struktural.
- Sebelum menulis/mengedit file `.svelte`/`.svelte.ts`: invoke skill `svelte-code-writer` dan `svelte-core-bestpractices`. Ikuti pola runes existing (props via `$props()`, getter untuk input reaktif hooks, `$derived`/`$effect` disiplin).
- Navigasi selalu `resolve()` dengan route id ber-group: `resolve('/app/(product)/projects/[projectId]/search', { projectId })`. Query string ditambahkan setelah hasil `resolve()`.
- Error backend: `throwAppError` dari `@aqsha/db` (`code` snake_case + `status`); frontend: `readableApiErrorMessage` + toast.
- Copy UI bahasa Indonesia sentence case, tanpa all-caps. Enum DB bahasa Inggris.
- Komentar kode: jelaskan *why*, TANPA referensi plan/fase/ticket (aturan `CLAUDE.md`).
- Ikon: pakai export `$lib/icons` existing (daftar lengkap di `apps/svelte/src/lib/icons/index.ts`); cek dulu sebelum menambah.
- Grep verifikasi pakai `/usr/bin/grep` (shell `grep` = shim rtk).
- `git add` SELALU per-path eksplisit; review `git status` sebelum tiap commit.
- Verifikasi svelte per task: `cd apps/svelte && bun run check`. **2 error PRE-EXISTING di `DetailPanel.svelte:158-159` — di luar scope, jangan diperbaiki dan jangan dihitung sebagai error task.**
- `bun run typecheck` root: `apps/web` (Next.js) merah by design sejak Fase 1 — jangan diperbaiki.
- Setelah task backend terakhir (Task 3) WAJIB `bun run build:dist` sebelum menyentuh svelte (Eden client svelte membaca tipe dari source `App` api, tapi services/db dibaca api dari `dist/`).

**Deviasi sadar dari spec (keputusan plan, catat di PR):**
1. **Penanda `created`** diimplement sebagai field tambahan pada response create (`CitationDetail & { created: boolean }`) — additive, tidak memecah konsumen existing.
2. **Render account-level** = `workspaceId` jadi opsional pada `CitationService.render` + route baru `POST /citations/render` (bukan service terpisah); tanpa workspace → default `apa-7` + sort `author`.
3. **`useCitationRender`/`useCopyCitation` menerima `workspaceId: () => string | null`** — `null` = jalur account-level. Satu hook dua konteks, komponen detail tetap satu.
4. **Import commit TIDAK lagi auto-link ke proyek.** Endpoint jadi account-level murni; sebelumnya commit menautkan hasil ke koleksi workspace. Link dari konteks proyek tersedia via "Tambah dari perpustakaan" dan pencarian in-project.
5. **`LibraryPickerDialog` menautkan di level proyek saja** — penandaan bab memakai Select existing di panel Sumber (hemat satu langkah dialog).
6. **`FeedKind` frontend menyempit ke `'paper'`**; union type backend tetap memuat `'news'` (tabel masih menyimpan row berita lama — hanya tidak disajikan).
7. **`SaveToWorkspaceButton` (alur artifact-URL) dihapus** dari discovery; `useSaveUrl` dihapus HANYA bila tanpa consumer tersisa (cek grep dulu).

---

### Task 1: Backend — de-workspace import file & provider sync

**Files:**
- Modify: `packages/db/src/schema/citationImportBatches.ts`
- Create: `packages/db/migrations/00XX_*.sql` (via drizzle-kit)
- Modify: `packages/services/src/citations/citation-import.service.ts`
- Modify: `packages/services/src/integrations/citation-sync.service.ts`
- Modify: `apps/api/src/routes/citations.ts`
- Modify: `apps/api/src/routes/integrations.ts`
- Test: modify `packages/services/test/citations-import.test.ts`, `apps/api/test/citations.test.ts`

**Interfaces:**
- Produces (dipakai Task 4):
  - `POST /citations/imports/preview` body `{ file }` → `ImportPreviewResult` (rateLimit `citations:import`)
  - `POST /citations/imports/:batchId/commit` body `{ selectedIndexes, duplicatePolicy }` → `ImportCommitResult`
  - `POST /integrations/:provider/sync/preview` body `{ folderId? }` → `ImportPreviewResult`
  - `POST /integrations/:provider/sync/:batchId/commit` body `{ selectedIndexes, duplicatePolicy }` → `ImportCommitResult`
  - `CitationImportService.preview(db, { ownerUserId, fileName, content })`, `.commit(db, { ownerUserId, batchId, selectedIndexes, duplicatePolicy })`
  - `CitationSyncService.previewFolder(db, { ownerUserId, provider, folderId })`

- [ ] **Step 1: Schema `citationImportBatches.ts` — drop kolom workspace**

Di `packages/db/src/schema/citationImportBatches.ts`:
1. Hapus blok kolom:
```ts
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
```
2. Hapus `import { workspaces } from "./workspaces";`.
3. Ganti index:
```ts
    index("citation_import_batches_by_owner_workspace_created").on(
      t.ownerUserId,
      t.workspaceId,
      t.createdAt,
    ),
```
menjadi:
```ts
    index("citation_import_batches_by_owner_created").on(t.ownerUserId, t.createdAt),
```
4. Perbarui header comment: batch import/sync milik akun (perpustakaan account-level), bukan workspace.

- [ ] **Step 2: Generate + migrate**

Run: `bun run db:generate` lalu BACA SQL-nya — harus `DROP COLUMN workspace_id` + drop/create index, TANPA DROP tabel. Data batch dev boleh hilang (tanpa-backfill). Lalu `bun run db:migrate` → exit 0.

- [ ] **Step 3: Refactor `citation-import.service.ts`**

Aturan transformasi, terapkan konsisten (tsc menuntun):
1. `stageImportBatch` (~L155): hapus `workspaceId: string;` dari parameter object; hapus `workspaceId: input.workspaceId,` dari `CitationImportBatchRepo.insert` (~L248-254).
2. `preview` (~L280): hapus `workspaceId` dari input; hapus blok `WorkspaceService.assertWorkspaceOwner(...)` (~L289-291); hapus `workspaceId` dari panggilan `stageImportBatch` (~L315-323).
3. `commit` (~L327): hapus `workspaceId` dari input; hapus blok assert owner (~L337-339); guard batch (~L340-347) menjadi:
```ts
    const batch = await CitationImportBatchRepo.findById(db, input.ownerUserId, input.batchId);
    if (!batch) {
      throwAppError({
        message: "Batch import tidak ditemukan",
        code: "citation_batch_not_found",
        status: 404,
      });
    }
```
4. Hapus loop auto-link (~L452-459, blok `for (const citationId of linkedCitationIds) { await WorkspaceCitationLinkRepo.insert(...) }`) — import account-level tidak menautkan proyek (deviasi #4). Hapus import `WorkspaceCitationLinkRepo`; bila `linkedCitationIds` hanya dipakai loop itu, hapus juga pengumpulnya — tapi bila dipakai untuk hitung `merged`/hasil, pertahankan penghitungnya.
5. Hapus import `WorkspaceService` bila tak terpakai lagi.

- [ ] **Step 4: Refactor `citation-sync.service.ts`**

`previewFolder`: hapus `workspaceId` dari input (~L16-24); hapus blok assert owner (~L25-27); hapus `workspaceId` dari panggilan `stageImportBatch` (~L41-49). Hapus import `WorkspaceService` bila orphan.

- [ ] **Step 5: Route `citations.ts` — pindahkan imports ke account-level**

Ganti dua route `/workspaces/:id/citations/imports/*` (L360-397) menjadi (letakkan di antara route statis `/citations/*` lain, SEBELUM handler `/citations/:citationId` — path statis harus duluan):

```ts
  .post(
    "/citations/imports/preview",
    async ({ ownerUserId, body }) => {
      const { db } = getDb();
      return CitationImportService.preview(db, {
        ownerUserId,
        fileName: body.file.name,
        content: await body.file.text(),
      });
    },
    {
      auth: true,
      rateLimit: "citations:import",
      body: t.Object({ file: t.File({ maxSize: MAX_IMPORT_FILE_BYTES }) }),
    },
  )
  .post(
    "/citations/imports/:batchId/commit",
    ({ ownerUserId, params, body }) => {
      const { db } = getDb();
      return CitationImportService.commit(db, {
        ownerUserId,
        batchId: params.batchId,
        selectedIndexes: body.selectedIndexes,
        duplicatePolicy: body.duplicatePolicy,
      });
    },
    {
      auth: true,
      rateLimit: "citations:import",
      body: t.Object({
        selectedIndexes: t.Array(t.Number()),
        duplicatePolicy: t.Union([t.Literal("skip"), t.Literal("merge"), t.Literal("import")]),
      }),
    },
  )
```

Catatan: `/citations/imports/:batchId/commit` aman terhadap `/citations/:citationId` karena segmen `imports` literal lebih spesifik — tapi tetap deklarasikan sebelum `/:citationId` mengikuti konvensi file.

- [ ] **Step 6: Route `integrations.ts` — drop workspaceId dari body sync**

Pada `POST /integrations/:provider/sync/preview` (L121-141): hapus `workspaceId: body.workspaceId,` dari panggilan service dan `workspaceId: t.String(),` dari schema body. Pada `POST /integrations/:provider/sync/:batchId/commit` (L142-164): sama — hapus dari panggilan `CitationImportService.commit` dan dari schema body.

- [ ] **Step 7: Perbaiki test + typecheck**

- `packages/services/test/citations-import.test.ts`: hapus argumen `workspaceId` pada semua panggilan `preview`/`commit`/`stageImportBatch`; hapus assertion yang mengecek link `workspace_citation_links` hasil commit (auto-link dihapus); hapus insert fixture workspace bila hanya melayani import.
- `apps/api/test/citations.test.ts` describe `"api citations — import preview + commit"` (~L232): repoint URL ke `/citations/imports/preview` dan `/citations/imports/:batchId/commit`, hapus segmen workspace.

Run:
```bash
cd packages/db && bunx tsc --noEmit -p tsconfig.json && cd ../..
cd packages/services && bunx tsc --noEmit -p tsconfig.json && bun test test/citations-import.test.ts && cd ../..
cd apps/api && bunx tsc --noEmit -p tsconfig.json && bun test && cd ../..
```
Expected: 0 type error; test PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/db/src/schema/citationImportBatches.ts packages/db/migrations packages/services/src/citations/citation-import.service.ts packages/services/src/integrations/citation-sync.service.ts packages/services/test/citations-import.test.ts apps/api/src/routes/citations.ts apps/api/src/routes/integrations.ts apps/api/test/citations.test.ts
git commit -m "feat(api)!: account-level citation import and provider sync"
```

---

### Task 2: Backend — create dedupe-return + render account-level

**Files:**
- Modify: `packages/services/src/citations/citation.service.ts`
- Modify: `apps/api/src/routes/citations.ts`
- Test: modify `packages/services/test/citations-import.test.ts` (describe `CitationService guards`), `apps/api/test/citations.test.ts`

**Interfaces:**
- Produces (dipakai Task 4, 7):
  - `POST /citations` body tambah `onDuplicate?: 'return-existing'`; response `CitationDetail & { created: boolean }`.
  - `POST /citations/render` body `{ styleId?, citationIds? }` → `{ styleId, entries: [{id,text}], bibliography }` (default `apa-7`).
  - `CitationService.createManual/createByDoi` menerima `onDuplicate?: "return-existing"`, return `CitationDetail & { created: boolean }`.
  - `CitationService.render` menerima `workspaceId?: string`.

- [ ] **Step 1: Helper duplikat di `citation.service.ts`**

Cek dulu pemakai lain: `/usr/bin/grep -n "assertNotDuplicate" packages/services/src` — bila hanya `createManual`/`createByDoi`, ganti fungsi `assertNotDuplicate` (L143-160) dengan:

```ts
/** Duplikat aktif by canonical key milik owner; null bila tidak ada. */
async function findActiveDuplicate(
  db: DbOrTx,
  ownerUserId: string,
  canonicalKey: string,
): Promise<Citation | null> {
  const hits = await CitationRepo.findActiveByCanonicalKeys(db, ownerUserId, [canonicalKey]);
  return hits[0] ?? null;
}
```

(Bila ada pemakai lain, biarkan `assertNotDuplicate` hidup dan TAMBAHKAN `findActiveDuplicate` di sebelahnya.) Import type `Citation` dari `@aqsha/db` bila belum ada.

- [ ] **Step 2: `createManual` + `createByDoi` — cabang duplikat**

Di kedua method, ganti baris
`await assertNotDuplicate(db, input.ownerUserId, row.canonicalKey, input.allowDuplicate ?? false);`
dengan blok berikut, dan tambahkan `onDuplicate?: "return-existing";` pada parameter object masing-masing:

```ts
    if (!input.allowDuplicate) {
      const existing = await findActiveDuplicate(db, input.ownerUserId, row.canonicalKey);
      if (existing) {
        // "Simpan dari pencarian" tidak boleh membuat entri dobel — kembalikan
        // referensi existing sebagai hasil sukses alih-alih 409.
        if (input.onDuplicate === "return-existing") {
          const detail = await this.get(db, {
            ownerUserId: input.ownerUserId,
            citationId: existing.id,
          });
          return { ...detail, created: false };
        }
        throwAppError({
          message: `Referensi serupa sudah ada: "${existing.title}"`,
          code: "citation_duplicate",
          status: 409,
          severity: "warning",
        });
      }
    }
```

Return sukses normal kedua method menjadi:
```ts
    const detail = await this.get(db, { ownerUserId: input.ownerUserId, citationId: row.id });
    return { ...detail, created: true };
```
Return type kedua method: `Promise<CitationDetail & { created: boolean }>`.

- [ ] **Step 3: `render` — workspaceId opsional**

Ubah signature + resolusi settings (L829-847):

```ts
  async render(
    db: DbOrTx,
    input: {
      ownerUserId: string;
      workspaceId?: string;
      styleId?: string;
      citationIds?: string[];
    },
  ): Promise<{
    styleId: CitationStyleId;
    entries: Array<{ id: string; text: string }>;
    bibliography: string;
  }> {
    // Tanpa workspace (konteks perpustakaan akun) tidak ada settings proyek —
    // pakai default global.
    const settings = input.workspaceId
      ? await this.getSettings(db, {
          ownerUserId: input.ownerUserId,
          workspaceId: input.workspaceId,
        })
      : { defaultStyleId: DEFAULT_STYLE, bibliographySort: DEFAULT_SORT };
```
Sisa body tidak berubah.

- [ ] **Step 4: Routes**

Di `apps/api/src/routes/citations.ts`:

(a) `POST /citations` (L179-209): tambah `onDuplicate: body.onDuplicate,` pada KEDUA panggilan service, dan pada schema body:
```ts
        onDuplicate: t.Optional(t.Literal("return-existing")),
```

(b) Tambah route account-level render (sebelum `/citations/:citationId`, dekat route statis lain):
```ts
  .post(
    "/citations/render",
    ({ ownerUserId, body }) => {
      const { db } = getDb();
      return CitationService.render(db, {
        ownerUserId,
        styleId: body.styleId,
        citationIds: body.citationIds,
      });
    },
    {
      auth: true,
      body: t.Object({
        styleId: t.Optional(styleId),
        citationIds: t.Optional(t.Array(t.String())),
      }),
    },
  )
```
Route `/workspaces/:id/citations/render` existing TIDAK berubah.

- [ ] **Step 5: Test**

Tambah di `packages/services/test/citations-import.test.ts` describe `"CitationService guards"` (pola DB-test existing di file itu — skip tanpa `DATABASE_URL`):

```ts
  itest("createManual onDuplicate return-existing mengembalikan referensi lama", async () => {
    const first = await CitationService.createManual(db, {
      ownerUserId: OWNER,
      fields: { title: "Dedupe Return Existing" },
    });
    expect(first.created).toBe(true);
    const second = await CitationService.createManual(db, {
      ownerUserId: OWNER,
      fields: { title: "Dedupe Return Existing" },
      onDuplicate: "return-existing",
    });
    expect(second.created).toBe(false);
    expect(second.id).toBe(first.id);
  });

  itest("render tanpa workspace memakai default apa-7", async () => {
    const result = await CitationService.render(db, { ownerUserId: OWNER });
    expect(result.styleId).toBe("apa-7");
  });
```
(Samakan nama variabel `db`/`OWNER`/`itest` dengan yang dipakai file itu — baca dulu.)

Tambah di `apps/api/test/citations.test.ts` (describe CRUD): kasus `POST /citations` dua kali dengan `onDuplicate: "return-existing"` → id sama + `created:false`; kasus `POST /citations/render` → 200 + `styleId === "apa-7"`.

Run: `cd packages/services && bun test test/citations-import.test.ts && cd ../.. && cd apps/api && bun test && cd ../..`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/services/src/citations/citation.service.ts packages/services/test/citations-import.test.ts apps/api/src/routes/citations.ts apps/api/test/citations.test.ts
git commit -m "feat(api): citation create dedupe-return and account-level render"
```

---

### Task 3: Backend — feed tanpa berita + gate backend

**Files:**
- Modify: `packages/services/src/feed-hydration.service.ts`
- Modify: `packages/services/src/feed.service.ts`
- Delete (bila orphan setelah refactor): `packages/services/src/feed/providers/gdelt.ts` + modul enrichment news
- Test: modify `packages/services/test/feed-service.test.ts`, `feed-providers.test.ts`, `apps/api/test/feed.test.ts`

**Interfaces:**
- Produces: feed API tidak pernah menyajikan item `kind: 'news'`; lane hydration tersisa `refreshTrendingPapers`. Tabel `feed_*` TIDAK di-drop; union type `FeedKind` backend TIDAK berubah (row lama tetap valid).

- [ ] **Step 1: Cabut lane GDELT + enrichment**

Di `packages/services/src/feed-hydration.service.ts`:
1. `FEED_HYDRATION_LANES` (L45-50) menjadi:
```ts
export const FEED_HYDRATION_LANES = ["refreshTrendingPapers"] as const;
```
2. Hapus case `refreshGdeltNews` dan `enrichNewsArticles` dari switch `runLane` (~L184-196), fungsi `refreshGdeltNews` (~L109-135) beserta fungsi enrichment news yang dipanggilnya, konstanta `GDELT_TOPIC_SEEDS`, dan import dari `./feed/providers/gdelt`.
3. `enqueueHydrationLanes` (~L202-217) tidak perlu diubah (fan-out mengikuti array lane).

Lalu cek orphan: `/usr/bin/grep -rn "gdelt\|Gdelt" packages/services/src apps/api/src --include='*.ts'` — bila `feed/providers/gdelt.ts` (dan modul enrich news) tanpa consumer tersisa, `git rm` file-nya; hapus juga describe GDELT di `packages/services/test/feed-providers.test.ts`.

- [ ] **Step 2: Filter penyajian di `feed.service.ts`**

Temukan definisi daftar kind default: `/usr/bin/grep -n "FEED_KINDS" packages/services/src/feed.service.ts packages/services/src/feed/model.ts`. Terapkan:

1. `getFeed` (~L42-56): daftar kind yang diquery tidak pernah memuat news —
```ts
    const requestedKinds = (args.kinds && args.kinds.length > 0 ? args.kinds : FEED_KINDS).filter(
      // Berita tidak lagi disajikan — fokus penuh literatur; row lama tetap di tabel.
      (kind) => kind !== "news",
    );
```
2. `getFeedPaginated` (~L115, L129): tambahkan filter yang sama pada pipeline —
```ts
      .filter((item) => item.kind !== "news")
```
sebelum/berdampingan dengan filter `kindSet` existing.

- [ ] **Step 3: Perbaiki test feed**

- `packages/services/test/feed-service.test.ts` (`getFeedPaginated re-rank`): bila fixture menyemai item news, ganti kind jadi `paper` atau tambahkan assertion bahwa news tidak muncul.
- `apps/api/test/feed.test.ts`: sesuaikan bila ada fixture/assertion news.

Run: `cd packages/services && bun test && cd ../.. && cd apps/api && bun test && cd ../..`
Expected: PASS semua.

- [ ] **Step 4: Gate backend + build dist**

Run (dari root):
```bash
bun run build:dist && bun run typecheck && bun run test
```
Expected: hijau KECUALI `apps/web` di typecheck (by design — jangan diperbaiki; catat di PR).

- [ ] **Step 5: Commit**

```bash
git add packages/services apps/api
git status   # review: hanya file feed/hydration + test
git commit -m "feat(api)!: stop serving and hydrating news feed items"
```

---

### Task 4: Svelte — repoint hooks & komponen citations ke endpoint account-level

Refactor mekanis dituntun `bun run check`, pola Task 2 Fase 2.

**Files:**
- Modify: `apps/svelte/src/lib/features/citations/api.ts`
- Modify: `apps/svelte/src/lib/query/keys.ts`
- Modify: `apps/svelte/src/lib/features/citations/components/{CitationImportWizard,CitationImportWizardContent,ProviderSyncWizard,ProviderSyncWizardContent,ProviderSyncFlow,CitationDuplicatesDialog,CitationDetailView,CitationsPanel}.svelte`

**Interfaces:**
- Consumes: endpoint Task 1–2.
- Produces (dipakai Task 5–10):
  - `useImportPreview()` (tanpa param) — mutation `(file: File) => ImportPreviewResult`
  - `useImportCommit()` — mutation `({ batchId, selectedIndexes, duplicatePolicy }) => ImportCommitResult`
  - `useProviderSyncPreview(provider: () => IntegrationProviderKey)` — mutation `({ folderId })`
  - `useProviderSyncCommit(provider: () => IntegrationProviderKey)` — mutation `({ batchId, selectedIndexes, duplicatePolicy })`
  - `useCitationRender(workspaceId: () => string | null, params, enabled?)`, `useCopyCitation(workspaceId: () => string | null)`
  - `useCreateCitation()` input tambah `onDuplicate?: 'return-existing'`; hasil bertipe `CitationDetail & { created: boolean }`
  - Props komponen: `CitationImportWizard { open, onOpenChange, onDone }` (tanpa `workspaceId`); `ProviderSyncWizard { open, onOpenChange, onDone }`; `CitationDetailView { workspaceId: string | null, citationId, onBack, onAddToChat? }`; `CitationDuplicatesDialog { open, onOpenChange }`.
  - Key: `queryKeys.citations.render(workspaceId: string | null, params)`.

- [ ] **Step 1: `keys.ts`**

Ubah signature render:
```ts
		render: (workspaceId: string | null, params: { styleId: string | null; ids: string[] }) =>
			['citations', 'render', workspaceId, params] as const,
```

- [ ] **Step 2: Hooks `api.ts`**

(a) `useImportPreview` (L261-269) →
```ts
export function useImportPreview() {
	const api = getApiClient();
	return createMutation(() => ({
		mutationFn: async (file: File) =>
			unwrap(await api.citations.imports.preview.post({ file })) as ImportPreviewResult
	}));
}
```

(b) `useImportCommit` (L271-291) → tanpa `workspaceId`, path `api.citations.imports({ batchId: input.batchId }).commit.post({ selectedIndexes, duplicatePolicy })`.

(c) `useProviderSyncPreview` (L309-324) → hapus param `workspaceId`; body post hanya `{ folderId: input.folderId }`.

(d) `useProviderSyncCommit` (L326-351) → hapus param `workspaceId`; body post tanpa `workspaceId`.

(e) `useCitationRender` (L353-373) → `workspaceId: () => string | null`; queryFn bercabang:
```ts
		queryFn: async () => {
			const p = params();
			const body = {
				...(p.styleId ? { styleId: p.styleId } : {}),
				citationIds: p.ids
			};
			const wsId = workspaceId();
			return unwrap(
				wsId
					? await api.workspaces({ id: wsId }).citations.render.post(body)
					: await api.citations.render.post(body)
			) as CitationRenderResult;
		}
```
Perbarui doc comment: workspace-scoped bila ada proyek (gaya per proyek); `null` = perpustakaan akun (default apa-7).

(f) `useCopyCitation` (L405-422) → `workspaceId: () => string | null`; cabang sama seperti (e) untuk panggilan render.

(g) `useCreateCitation` (L110-123) → input tambah `onDuplicate?: 'return-existing';` dan cast hasil `as CitationDetail & { created: boolean }`.

- [ ] **Step 3: Sweep komponen**

1. `CitationImportWizard.svelte` + `CitationImportWizardContent.svelte`: hapus prop `workspaceId` (props L10-20 / L19-27) + pass-through; `useImportPreview()` / `useImportCommit()` tanpa argumen.
2. `ProviderSyncWizard.svelte` + `ProviderSyncWizardContent.svelte` + `ProviderSyncFlow.svelte`: hapus prop `workspaceId` di ketiganya; `useProviderSyncPreview(() => provider)` / `useProviderSyncCommit(() => provider)`.
3. `CitationDuplicatesDialog.svelte`: hapus prop `workspaceId` (sudah tak terpakai di body — dead prop).
4. `CitationDetailView.svelte`: tipe prop `workspaceId: string | null`; `useCitationRender(() => workspaceId, …)` dan `useCopyCitation(() => workspaceId)` tetap; **gate tautan artifact reader** (L274-276): bungkus dengan `{#if citation.artifactId && workspaceId}` (tanpa proyek tidak ada route reader).
5. `CitationsPanel.svelte`: sesuaikan pemanggilan komponen di atas (hapus prop `workspaceId` yang dihapus); `workspaceId` panel sendiri tetap `string`.

Jalankan `cd apps/svelte && bun run check` berulang sampai sisa merah hanya 2 pre-existing `DetailPanel.svelte`.

- [ ] **Step 4: Commit**

```bash
git add apps/svelte/src/lib/features/citations apps/svelte/src/lib/query/keys.ts
git commit -m "refactor(svelte): account-level import/sync/render citation hooks"
```

---

### Task 5: Svelte — URL model + halaman Perpustakaan (list, filter, detail)

**Files:**
- Create: `apps/svelte/src/lib/features/citations/library-url-model.ts`
- Create: `apps/svelte/src/lib/features/citations/library-url-model.spec.ts`
- Create: `apps/svelte/src/lib/features/citations/components/library/LibraryRow.svelte`
- Create: `apps/svelte/src/lib/features/citations/pages/LibraryPage.svelte`
- Modify: `apps/svelte/src/routes/app/(product)/library/+page.svelte`

**Interfaces:**
- Consumes: `useCitationsList`, `useCitationTags`, `CitationListFilters`/`EMPTY_CITATION_FILTERS` (dari `features/citations/api`), `CitationListItem`, `citationMetaLine`, `CITATION_STATUS_LABELS`, `CITATION_SOURCE_LABELS` (dari `features/citations/types`), `CitationDetailView { workspaceId: null, … }` (Task 4), `CitationEmptyState`, `DetailSplitLayout`.
- Produces (dipakai Task 6): `readLibraryUrl(params): LibraryUrlState`, `applyLibraryUrl(params, patch)`; `LibraryRow` props `{ item: CitationListItem; selectionMode: boolean; selected: boolean; onToggleSelect: () => void; onOpen: () => void; onCopy: () => void; onAddToProject: () => void }`; `LibraryPage.svelte` dengan seam aksi (snippet header + callback) yang diisi Task 6.

- [ ] **Step 1: Failing test codec URL**

`apps/svelte/src/lib/features/citations/library-url-model.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyLibraryUrl, readLibraryUrl } from './library-url-model';

describe('library-url-model', () => {
	it('membaca default kosong', () => {
		expect(readLibraryUrl(new URLSearchParams())).toEqual({
			q: '',
			status: null,
			source: null,
			tag: null,
			cite: null
		});
	});

	it('menolak nilai enum liar', () => {
		const params = new URLSearchParams('status=weird&source=doi');
		const state = readLibraryUrl(params);
		expect(state.status).toBeNull();
		expect(state.source).toBe('doi');
	});

	it('apply men-set dan menghapus param', () => {
		const params = new URLSearchParams('q=llm&cite=abc');
		const next = applyLibraryUrl(params, { q: '', cite: 'xyz', tag: 'ai' });
		expect(next.get('q')).toBeNull();
		expect(next.get('cite')).toBe('xyz');
		expect(next.get('tag')).toBe('ai');
	});
});
```

Run: `cd apps/svelte && bun run test -- library-url-model && cd ../..` (samakan invocation dengan spec existing — lihat script `test` di `apps/svelte/package.json`; pola file spec existing memakai vitest).
Expected: FAIL — module belum ada.

- [ ] **Step 2: Implement codec**

`apps/svelte/src/lib/features/citations/library-url-model.ts`:

```ts
import type { CitationListFilters } from './api';

// State URL /app/library: filter list + referensi yang terbuka di panel detail.
// Full page → URL state (shareable, back-button); beda dari CitationsPanel yang
// sengaja lokal karena berbagi halaman dengan q lain.
export type LibraryUrlState = CitationListFilters & { cite: string | null };

const STATUSES = ['verified', 'needs_review', 'incomplete'] as const;
const SOURCES = ['import', 'provider_sync', 'artifact', 'doi', 'manual'] as const;

function pick<T extends string>(value: string | null, allowed: readonly T[]): T | null {
	return value && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

export function readLibraryUrl(params: URLSearchParams): LibraryUrlState {
	return {
		q: params.get('q') ?? '',
		status: pick(params.get('status'), STATUSES),
		source: pick(params.get('source'), SOURCES),
		tag: params.get('tag'),
		cite: params.get('cite')
	};
}

export function applyLibraryUrl(
	params: URLSearchParams,
	patch: Partial<LibraryUrlState>
): URLSearchParams {
	const next = new URLSearchParams(params);
	for (const key of ['q', 'status', 'source', 'tag', 'cite'] as const) {
		if (!(key in patch)) continue;
		const value = patch[key];
		if (value) next.set(key, value);
		else next.delete(key);
	}
	return next;
}
```

Run test lagi → PASS (3 test).

- [ ] **Step 3: `LibraryRow.svelte`**

```svelte
<script lang="ts">
	import * as DropdownMenu from '@aqsha/ui-svelte/components/dropdown-menu';
	import { Badge } from '@aqsha/ui-svelte/components/badge';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Checkbox } from '@aqsha/ui-svelte/components/checkbox';
	import { cn } from '@aqsha/ui-svelte/utils';
	import { Icon, CopyIcon, ExternalLinkIcon, FolderIcon, MoreHorizontalIcon } from '$lib/icons';
	import {
		CITATION_SOURCE_LABELS,
		CITATION_STATUS_LABELS,
		citationMetaLine,
		type CitationListItem
	} from '../../types';

	/** Baris perpustakaan lebar penuh: status → judul → meta → source → tag → aksi hover. */
	let {
		item,
		selectionMode,
		selected,
		onToggleSelect,
		onOpen,
		onCopy,
		onAddToProject,
		onEdit,
		onDelete
	}: {
		item: CitationListItem;
		selectionMode: boolean;
		selected: boolean;
		onToggleSelect: () => void;
		onOpen: () => void;
		onCopy: () => void;
		onAddToProject: () => void;
		onEdit: () => void;
		onDelete: () => void;
	} = $props();

	const STATUS_DOT: Record<CitationListItem['metadataStatus'], string> = {
		verified: 'bg-mint',
		needs_review: 'bg-lemon',
		incomplete: 'bg-muted-foreground/40'
	};

	const externalHref = $derived(
		item.doi ? `https://doi.org/${item.doi}` : (item.url ?? null)
	);
</script>

<li
	class={cn(
		'group flex items-center gap-3 rounded-md border-2 border-border bg-card px-4 py-3',
		selected && 'border-ring'
	)}
>
	{#if selectionMode}
		<Checkbox
			checked={selected}
			onCheckedChange={onToggleSelect}
			aria-label={`Pilih ${item.title}`}
		/>
	{:else}
		<span
			aria-hidden="true"
			class={`size-2 shrink-0 rounded-full ${STATUS_DOT[item.metadataStatus]}`}
			title={CITATION_STATUS_LABELS[item.metadataStatus]}
		></span>
	{/if}
	<button type="button" class="min-w-0 flex-1 text-left" onclick={onOpen}>
		<p class="truncate text-sm font-medium leading-snug group-hover:underline">{item.title}</p>
		<p class="truncate text-label text-muted-foreground">{citationMetaLine(item)}</p>
	</button>
	<Badge variant="outline" class="hidden shrink-0 sm:inline-flex">
		{CITATION_SOURCE_LABELS[item.source]}
	</Badge>
	{#if item.tags.length > 0}
		<span class="hidden max-w-40 truncate text-label text-muted-foreground lg:inline">
			{item.tags.join(' · ')}
		</span>
	{/if}
	<div class="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
		<Button type="button" variant="ghost" size="icon" class="size-7" aria-label="Salin sitasi" onclick={onCopy}>
			<Icon icon={CopyIcon} class="size-3.5" />
		</Button>
		<Button
			type="button"
			variant="ghost"
			size="icon"
			class="size-7"
			aria-label="Tambahkan ke proyek"
			onclick={onAddToProject}
		>
			<Icon icon={FolderIcon} class="size-3.5" />
		</Button>
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button {...props} type="button" variant="ghost" size="icon" class="size-7" aria-label={`Aksi ${item.title}`}>
						<Icon icon={MoreHorizontalIcon} class="size-4" />
					</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end">
				<DropdownMenu.Item onSelect={onOpen}>Lihat detail</DropdownMenu.Item>
				<DropdownMenu.Item onSelect={onEdit}>Edit</DropdownMenu.Item>
				{#if externalHref}
					<DropdownMenu.Item onSelect={() => window.open(externalHref, '_blank', 'noopener')}>
						<Icon icon={ExternalLinkIcon} class="size-4" /> Buka sumber
					</DropdownMenu.Item>
				{/if}
				<DropdownMenu.Separator />
				<DropdownMenu.Item variant="destructive" onSelect={onDelete}>Hapus</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</div>
</li>
```

(Cek field `CitationListItem` — `metadataStatus`/`doi`/`url`/`tags` — terhadap `features/citations/types.ts` L12-26; sesuaikan nama bila beda. Cek export `Checkbox` di `@aqsha/ui-svelte`.)

- [ ] **Step 4: `LibraryPage.svelte` (list + filter + detail; seam aksi untuk Task 6)**

```svelte
<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { useClerkContext } from 'svelte-clerk';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import * as DropdownMenu from '@aqsha/ui-svelte/components/dropdown-menu';
	import { Input } from '@aqsha/ui-svelte/components/input';
	import DetailSplitLayout from '$lib/components/layout/DetailSplitLayout.svelte';
	import { Spinner } from '$lib/components/ui/spinner';
	import { PageTitle } from '$lib/seo';
	import { Icon, FilterIcon, SearchIcon, XIcon } from '$lib/icons';
	import CitationDetailView from '../components/CitationDetailView.svelte';
	import CitationEmptyState from '../components/CitationEmptyState.svelte';
	import LibraryRow from '../components/library/LibraryRow.svelte';
	import { useCitationsList, useCitationTags, useCopyCitation } from '../api';
	import {
		CITATION_SOURCE_LABELS,
		CITATION_STATUS_LABELS,
		type CitationListItem
	} from '../types';
	import { applyLibraryUrl, readLibraryUrl, type LibraryUrlState } from '../library-url-model';

	/**
	 * Perpustakaan referensi akun (lintas proyek). Filter + detail hidup di URL;
	 * file/PDF tetap aset per proyek — halaman ini murni referensi.
	 */
	const clerk = useClerkContext();
	const enabled = $derived(clerk.isLoaded && Boolean(clerk.auth.userId));

	const urlState = $derived(readLibraryUrl(page.url.searchParams));
	const filters = $derived({
		q: urlState.q,
		status: urlState.status,
		source: urlState.source,
		tag: urlState.tag
	});

	function navigate(patch: Partial<LibraryUrlState>): void {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient URL builder, not reactive state
		const url = new URL(page.url);
		url.search = applyLibraryUrl(url.searchParams, patch).toString();
		void goto(url, { replaceState: true, noScroll: true, keepFocus: true });
	}

	const list = useCitationsList(() => filters);
	const tags = useCitationTags();
	const copy = useCopyCitation(() => null);

	const items = $derived<CitationListItem[]>(list.data?.pages.flatMap((p) => p.items) ?? []);
	const total = $derived(list.data?.pages[0]?.total ?? 0);
	const hasFilter = $derived(
		Boolean(filters.q || filters.status || filters.source || filters.tag)
	);

	let searchDraft = $state('');
	$effect(() => {
		searchDraft = urlState.q;
	});
	function submitSearch(event: SubmitEvent) {
		event.preventDefault();
		navigate({ q: searchDraft.trim() });
	}
</script>

<PageTitle title="Perpustakaan" />

<div class="flex h-svh min-h-0 min-w-0 flex-col overflow-hidden bg-background">
	<DetailSplitLayout
		sideOpen={urlState.cite !== null}
		onSideOpenChange={(open) => {
			if (!open) navigate({ cite: null });
		}}
	>
		{#snippet main()}
			<header class="flex flex-wrap items-center justify-between gap-3 border-b-2 border-border px-6 py-4">
				<div>
					<h1 class="font-display text-2xl font-bold">Perpustakaan</h1>
					<p class="text-sm text-muted-foreground">
						{total} referensi lintas proyek — tambahkan ke proyek kapan pun.
					</p>
				</div>
				<!-- Aksi header (Tambah sumber, export, duplikat, mode pilih) — Task berikutnya -->
			</header>

			<div class="flex flex-wrap items-center gap-2 px-6 py-3">
				<form class="flex min-w-56 flex-1 items-center gap-2" onsubmit={submitSearch}>
					<Input bind:value={searchDraft} placeholder="Cari judul, penulis, DOI…" aria-label="Cari referensi" />
					<Button type="submit" variant="outline" size="icon" aria-label="Cari">
						<Icon icon={SearchIcon} class="size-4" />
					</Button>
				</form>
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button {...props} type="button" variant="outline" size="sm" class="gap-1.5">
								<Icon icon={FilterIcon} class="size-3.5" /> Filter
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end" class="w-56">
						<DropdownMenu.Group>
							<DropdownMenu.GroupHeading>Status</DropdownMenu.GroupHeading>
							{#each Object.entries(CITATION_STATUS_LABELS) as [value, label] (value)}
								<DropdownMenu.CheckboxItem
									checked={filters.status === value}
									onCheckedChange={(checked) =>
										navigate({ status: checked ? (value as LibraryUrlState['status']) : null })}
								>
									{label}
								</DropdownMenu.CheckboxItem>
							{/each}
						</DropdownMenu.Group>
						<DropdownMenu.Separator />
						<DropdownMenu.Group>
							<DropdownMenu.GroupHeading>Sumber</DropdownMenu.GroupHeading>
							{#each Object.entries(CITATION_SOURCE_LABELS) as [value, label] (value)}
								<DropdownMenu.CheckboxItem
									checked={filters.source === value}
									onCheckedChange={(checked) =>
										navigate({ source: checked ? (value as LibraryUrlState['source']) : null })}
								>
									{label}
								</DropdownMenu.CheckboxItem>
							{/each}
						</DropdownMenu.Group>
						{#if (tags.data ?? []).length > 0}
							<DropdownMenu.Separator />
							<DropdownMenu.Group>
								<DropdownMenu.GroupHeading>Tag</DropdownMenu.GroupHeading>
								{#each tags.data ?? [] as tag (tag)}
									<DropdownMenu.CheckboxItem
										checked={filters.tag === tag}
										onCheckedChange={(checked) => navigate({ tag: checked ? tag : null })}
									>
										{tag}
									</DropdownMenu.CheckboxItem>
								{/each}
							</DropdownMenu.Group>
						{/if}
					</DropdownMenu.Content>
				</DropdownMenu.Root>
				{#if hasFilter}
					<Button
						type="button"
						variant="ghost"
						size="sm"
						class="gap-1 text-muted-foreground"
						onclick={() => navigate({ q: '', status: null, source: null, tag: null })}
					>
						<Icon icon={XIcon} class="size-3.5" /> Bersihkan filter
					</Button>
				{/if}
			</div>

			<div class="min-h-0 flex-1 overflow-y-auto px-6 pb-8">
				{#if !enabled || list.isPending}
					<div class="flex items-center justify-center gap-2 py-16 text-muted-foreground">
						<Spinner class="size-4" />
						<span class="text-sm">Memuat perpustakaan…</span>
					</div>
				{:else if items.length === 0 && !hasFilter}
					<CitationEmptyState
						onImportFile={() => {}}
						onAddByDoi={() => {}}
						onAddManual={() => {}}
					/>
					<!-- Callback empty state diisi Task berikutnya bersama dialogs -->
				{:else if items.length === 0}
					<p class="py-16 text-center text-sm text-muted-foreground">
						Tidak ada referensi yang cocok dengan filter.
					</p>
				{:else}
					<ul class="grid gap-2">
						{#each items as item (item.id)}
							<LibraryRow
								{item}
								selectionMode={false}
								selected={false}
								onToggleSelect={() => {}}
								onOpen={() => navigate({ cite: item.id })}
								onCopy={() => copy.mutate(item.id)}
								onAddToProject={() => {}}
								onEdit={() => {}}
								onDelete={() => {}}
							/>
						{/each}
					</ul>
					{#if list.hasNextPage}
						<Button
							type="button"
							variant="outline"
							class="mx-auto mt-4 flex"
							disabled={list.isFetchingNextPage}
							onclick={() => list.fetchNextPage()}
						>
							{list.isFetchingNextPage ? 'Memuat…' : 'Muat lagi'}
						</Button>
					{/if}
				{/if}
			</div>
		{/snippet}
		{#snippet side()}
			{#if urlState.cite}
				{#key urlState.cite}
					<CitationDetailView
						workspaceId={null}
						citationId={urlState.cite}
						onBack={() => navigate({ cite: null })}
					/>
				{/key}
			{/if}
		{/snippet}
	</DetailSplitLayout>
</div>
```

Catatan: callback kosong (`() => {}`) pada empty state / row adalah seam yang DIISI Task 6 — jangan dihapus. Cek props persis `DetailSplitLayout` (`sideOpen`/`onSideOpenChange`/snippet `main`/`side`) dan sub-API `DropdownMenu` (`Group`/`GroupHeading`/`CheckboxItem`) terhadap pemakaian existing; sesuaikan bila beda. Ingat gotcha: `DetailSplitLayout` WAJIB ancestor `h-svh min-h-0 overflow-hidden` (sudah di kode).

- [ ] **Step 5: Wire route**

Ganti isi `apps/svelte/src/routes/app/(product)/library/+page.svelte`:

```svelte
<script lang="ts">
	import LibraryPage from '$lib/features/citations/pages/LibraryPage.svelte';
</script>

<LibraryPage />
```

- [ ] **Step 6: Verifikasi + commit**

Run: `cd apps/svelte && bun run check && bun run test -- library-url-model && cd ../..`
Expected: check bersih (minus 2 pre-existing), spec PASS.
Manual (dev server): `/app/library` menampilkan daftar referensi (seed via import/DOI dari konteks lama bila kosong); filter status/source/tag & search mengubah URL dan hasil; klik baris membuka detail panel (`?cite=`), back-button menutupnya; salin sitasi menghasilkan teks APA.

```bash
git add apps/svelte/src/lib/features/citations/library-url-model.ts apps/svelte/src/lib/features/citations/library-url-model.spec.ts apps/svelte/src/lib/features/citations/components/library/LibraryRow.svelte apps/svelte/src/lib/features/citations/pages/LibraryPage.svelte "apps/svelte/src/routes/app/(product)/library/+page.svelte"
git commit -m "feat(svelte): full-page citation library with url-backed filters and detail"
```

---

### Task 6: Svelte — aksi Perpustakaan (tambah sumber, bulk, duplikat, tambahkan-ke-proyek)

**Files:**
- Create: `apps/svelte/src/lib/features/workspaces/components/ProjectSectionPicker.svelte`
- Create: `apps/svelte/src/lib/features/citations/components/library/AddToProjectDialog.svelte`
- Create: `apps/svelte/src/lib/features/citations/components/library/LibraryBulkBar.svelte`
- Modify: `apps/svelte/src/lib/features/citations/pages/LibraryPage.svelte`

**Interfaces:**
- Consumes: `CitationDoiDialog`, `CitationFormDialog`, `CitationImportWizard` (Task 4), `ProviderSyncWizard` (Task 4), `CitationDuplicatesDialog` (Task 4), `CitationExportMenu { disabled?, ids? }`, `useCreateCitation`, `useUpdateCitation`, `useDeleteCitation`, `useCitationDetail`, `useBulkTagCitations`, `useBulkDeleteCitations`, `useMergeManyCitations`, `useLinkCitation`, `WorkspacePicker { excludeId?, onSelect, disabled? }`, `useWorkspace`/`useSections` (features/workspaces/api), `ConfirmDialog`.
- Produces (dipakai Task 9, 10): `ProjectSectionPicker` props `{ disabled?: boolean; confirmLabel?: string; onConfirm: (target: { workspaceId: string; sectionId: string | null }) => void }`; `AddToProjectDialog` props `{ open: boolean; onOpenChange: (open: boolean) => void; citationId: string | null }`.

- [ ] **Step 1: `ProjectSectionPicker.svelte`**

```svelte
<script lang="ts">
	import * as Select from '@aqsha/ui-svelte/components/select';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import WorkspacePicker from './WorkspacePicker.svelte';
	import { useSections, useWorkspace } from '../api';
	import { projectDisplayTitle } from '../types';

	/**
	 * Picker dua langkah proyek → bab (opsional). Bab bibliography disembunyikan
	 * (kontennya digenerate, bukan target penandaan sumber).
	 */
	let {
		disabled = false,
		confirmLabel = 'Tambahkan',
		onConfirm
	}: {
		disabled?: boolean;
		confirmLabel?: string;
		onConfirm: (target: { workspaceId: string; sectionId: string | null }) => void;
	} = $props();

	const NO_SECTION = '__none__';
	let workspaceId = $state<string | null>(null);
	let sectionId = $state<string | null>(null);

	const workspace = useWorkspace(
		() => workspaceId ?? '',
		() => workspaceId !== null
	);
	const sections = useSections(
		() => workspaceId ?? '',
		() => workspaceId !== null
	);
	const sectionOptions = $derived((sections.data ?? []).filter((s) => s.role !== 'bibliography'));
</script>

{#if workspaceId === null}
	<WorkspacePicker {disabled} onSelect={(id) => (workspaceId = id)} />
{:else}
	<div class="grid gap-3">
		<button
			type="button"
			class="w-fit text-label text-muted-foreground hover:text-foreground hover:underline"
			onclick={() => {
				workspaceId = null;
				sectionId = null;
			}}
		>
			← Ganti proyek
		</button>
		<p class="text-sm font-medium">
			{workspace.data ? projectDisplayTitle(workspace.data) : 'Proyek'}
		</p>
		{#if sectionOptions.length > 0}
			<Select.Root
				type="single"
				value={sectionId ?? NO_SECTION}
				onValueChange={(v) => (sectionId = v === NO_SECTION ? null : v)}
			>
				<Select.Trigger class="w-full" aria-label="Tandai untuk bab">
					{sectionOptions.find((s) => s.id === sectionId)?.title ?? 'Seluruh proyek'}
				</Select.Trigger>
				<Select.Content>
					<Select.Item value={NO_SECTION} label="Seluruh proyek" />
					{#each sectionOptions as s (s.id)}
						<Select.Item value={s.id} label={s.title} />
					{/each}
				</Select.Content>
			</Select.Root>
		{/if}
		<Button
			type="button"
			{disabled}
			onclick={() => workspaceId && onConfirm({ workspaceId, sectionId })}
		>
			{confirmLabel}
		</Button>
	</div>
{/if}
```

- [ ] **Step 2: `AddToProjectDialog.svelte`**

```svelte
<script lang="ts">
	import * as Dialog from '@aqsha/ui-svelte/components/dialog';
	import { toast } from 'svelte-sonner';
	import ProjectSectionPicker from '$lib/features/workspaces/components/ProjectSectionPicker.svelte';
	import { useLinkCitation } from '../../api';

	/** Tautkan satu referensi perpustakaan ke proyek (+ opsional bab). Link, bukan salinan. */
	let {
		open,
		onOpenChange,
		citationId
	}: {
		open: boolean;
		onOpenChange: (open: boolean) => void;
		citationId: string | null;
	} = $props();

	const link = useLinkCitation();
</script>

<Dialog.Root {open} {onOpenChange}>
	{#if open && citationId}
		<Dialog.Content class="sm:max-w-sm">
			<Dialog.Header>
				<Dialog.Title>Tambahkan ke proyek</Dialog.Title>
				<Dialog.Description>
					Referensi tetap di perpustakaan — proyek hanya menautkannya.
				</Dialog.Description>
			</Dialog.Header>
			<ProjectSectionPicker
				disabled={link.isPending}
				onConfirm={({ workspaceId, sectionId }) =>
					link.mutate(
						{ workspaceId, citationId, sectionId },
						{
							onSuccess: () => {
								toast.success('Ditambahkan ke proyek');
								onOpenChange(false);
							}
						}
					)}
			/>
		</Dialog.Content>
	{/if}
</Dialog.Root>
```

- [ ] **Step 3: `LibraryBulkBar.svelte`**

```svelte
<script lang="ts">
	import * as Popover from '@aqsha/ui-svelte/components/popover';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Input } from '@aqsha/ui-svelte/components/input';
	import { Icon, LayersIcon, Trash2Icon, XIcon } from '$lib/icons';
	import CitationExportMenu from '../CitationExportMenu.svelte';

	/** Bar aksi massal saat mode pilih aktif. Merge butuh ≥2; target dipilih server (terlengkap). */
	let {
		ids,
		onTag,
		onMerge,
		onDelete,
		onClear
	}: {
		ids: string[];
		onTag: (tags: string[]) => void;
		onMerge: () => void;
		onDelete: () => void;
		onClear: () => void;
	} = $props();

	let tagOpen = $state(false);
	let tagDraft = $state('');

	function submitTags(event: SubmitEvent) {
		event.preventDefault();
		const tags = tagDraft
			.split(',')
			.map((t) => t.trim())
			.filter(Boolean);
		if (tags.length === 0) return;
		onTag(tags);
		tagDraft = '';
		tagOpen = false;
	}
</script>

<div
	class="sticky bottom-4 mx-auto flex w-fit items-center gap-2 rounded-md border-2 border-border bg-card px-3 py-2 shadow-soft-card"
	role="toolbar"
	aria-label="Aksi referensi terpilih"
>
	<span class="text-label font-medium">{ids.length} dipilih</span>
	<Popover.Root bind:open={tagOpen}>
		<Popover.Trigger>
			{#snippet child({ props })}
				<Button {...props} type="button" variant="outline" size="sm">Beri tag</Button>
			{/snippet}
		</Popover.Trigger>
		<Popover.Content class="grid w-64 gap-2">
			<form class="grid gap-2" onsubmit={submitTags}>
				<label class="text-label font-medium" for="bulk-tags">Tag (pisahkan koma)</label>
				<Input id="bulk-tags" bind:value={tagDraft} placeholder="metodologi, bab-2" />
				<Button type="submit" size="sm">Terapkan</Button>
			</form>
		</Popover.Content>
	</Popover.Root>
	<CitationExportMenu {ids} />
	<Button type="button" variant="outline" size="sm" class="gap-1.5" disabled={ids.length < 2} onclick={onMerge}>
		<Icon icon={LayersIcon} class="size-3.5" /> Gabungkan
	</Button>
	<Button type="button" variant="outline" size="sm" class="gap-1.5 text-destructive" onclick={onDelete}>
		<Icon icon={Trash2Icon} class="size-3.5" /> Hapus
	</Button>
	<Button type="button" variant="ghost" size="icon" class="size-7" aria-label="Batal pilih" onclick={onClear}>
		<Icon icon={XIcon} class="size-4" />
	</Button>
</div>
```

(`shadow-soft-card` di sini sah — bulk bar = elemen melayang, sesuai aturan flat-card. Cek props `CitationExportMenu { disabled?, ids? }`.)

- [ ] **Step 4: Isi seam `LibraryPage.svelte`**

Tambahkan ke script `LibraryPage.svelte` (sesuaikan import):

```ts
	import { SvelteSet } from 'svelte/reactivity';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import CitationDoiDialog from '../components/CitationDoiDialog.svelte';
	import CitationFormDialog from '../components/CitationFormDialog.svelte';
	import CitationImportWizard from '../components/CitationImportWizard.svelte';
	import ProviderSyncWizard from '../components/ProviderSyncWizard.svelte';
	import CitationDuplicatesDialog from '../components/CitationDuplicatesDialog.svelte';
	import CitationExportMenu from '../components/CitationExportMenu.svelte';
	import AddToProjectDialog from '../components/library/AddToProjectDialog.svelte';
	import LibraryBulkBar from '../components/library/LibraryBulkBar.svelte';
	import {
		useBulkDeleteCitations,
		useBulkTagCitations,
		useCitationDetail,
		useCreateCitation,
		useDeleteCitation,
		useMergeManyCitations,
		useUpdateCitation
	} from '../api';

	type DialogKind = 'doi' | 'manual' | 'import' | 'provider' | 'duplicates' | null;
	let dialog = $state<DialogKind>(null);
	let addToProjectId = $state<string | null>(null);
	let editTargetId = $state<string | null>(null);
	let deleteTarget = $state<CitationListItem | null>(null);
	let confirmBulkDelete = $state(false);

	let selectionMode = $state(false);
	const selectedIds = new SvelteSet<string>();
	function clearSelection() {
		selectionMode = false;
		selectedIds.clear();
	}

	const createCitation = useCreateCitation();
	const updateCitation = useUpdateCitation();
	const deleteCitation = useDeleteCitation();
	const bulkTag = useBulkTagCitations();
	const bulkDelete = useBulkDeleteCitations();
	const mergeMany = useMergeManyCitations();
	const editTarget = useCitationDetail(
		() => editTargetId ?? '',
		() => editTargetId !== null
	);
```

Header aksi (ganti komentar seam di `<header>`):

```svelte
				<div class="flex items-center gap-2">
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<Button {...props} type="button" class="gap-1.5">
									<Icon icon={PlusIcon} class="size-4" /> Tambah sumber
								</Button>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end">
							<DropdownMenu.Item onSelect={() => (dialog = 'doi')}>Dari DOI</DropdownMenu.Item>
							<DropdownMenu.Item onSelect={() => (dialog = 'manual')}>Isi manual</DropdownMenu.Item>
							<DropdownMenu.Item onSelect={() => (dialog = 'import')}>Import file (.bib/.ris)</DropdownMenu.Item>
							<DropdownMenu.Item onSelect={() => (dialog = 'provider')}>Tarik dari Mendeley/Zotero</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
					<CitationExportMenu disabled={items.length === 0} />
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<Button {...props} type="button" variant="outline" size="icon" aria-label="Opsi lain">
									<Icon icon={MoreHorizontalIcon} class="size-4" />
								</Button>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end">
							<DropdownMenu.Item onSelect={() => (selectionMode = true)}>Pilih beberapa</DropdownMenu.Item>
							<DropdownMenu.Item onSelect={() => (dialog = 'duplicates')}>Kelola duplikat</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				</div>
```

Wiring row & empty state (ganti callback kosong):

```svelte
							<LibraryRow
								{item}
								{selectionMode}
								selected={selectedIds.has(item.id)}
								onToggleSelect={() =>
									selectedIds.has(item.id) ? selectedIds.delete(item.id) : selectedIds.add(item.id)}
								onOpen={() => navigate({ cite: item.id })}
								onCopy={() => copy.mutate(item.id)}
								onAddToProject={() => (addToProjectId = item.id)}
								onEdit={() => (editTargetId = item.id)}
								onDelete={() => (deleteTarget = item)}
							/>
```

```svelte
					<CitationEmptyState
						onImportFile={() => (dialog = 'import')}
						onAddByDoi={() => (dialog = 'doi')}
						onAddManual={() => (dialog = 'manual')}
					/>
```

Bulk bar (setelah `</ul>`, di dalam blok else list):

```svelte
					{#if selectionMode && selectedIds.size > 0}
						<LibraryBulkBar
							ids={[...selectedIds]}
							onTag={(tags) => bulkTag.mutate({ ids: [...selectedIds], tags }, { onSuccess: clearSelection })}
							onMerge={() => mergeMany.mutate({ ids: [...selectedIds] }, { onSuccess: clearSelection })}
							onDelete={() => (confirmBulkDelete = true)}
							onClear={clearSelection}
						/>
					{/if}
```

Dialogs di akhir template:

```svelte
<CitationDoiDialog
	open={dialog === 'doi'}
	onOpenChange={(open) => (dialog = open ? 'doi' : null)}
	onSubmit={async (value) => {
		await createCitation.mutateAsync({ doi: value.doi, allowDuplicate: value.allowDuplicate });
		dialog = null;
	}}
/>
<CitationFormDialog
	open={dialog === 'manual' || editTargetId !== null}
	citation={editTargetId !== null ? (editTarget.data ?? null) : null}
	onOpenChange={(open) => {
		if (!open) {
			dialog = dialog === 'manual' ? null : dialog;
			editTargetId = null;
		}
	}}
	onSubmit={async (value) => {
		if (editTargetId) {
			await updateCitation.mutateAsync({ citationId: editTargetId, ...value });
			editTargetId = null;
		} else {
			await createCitation.mutateAsync(value);
			dialog = null;
		}
	}}
/>
<CitationImportWizard
	open={dialog === 'import'}
	onOpenChange={(open) => (dialog = open ? 'import' : null)}
	onDone={() => (dialog = null)}
/>
<ProviderSyncWizard
	open={dialog === 'provider'}
	onOpenChange={(open) => (dialog = open ? 'provider' : null)}
	onDone={() => (dialog = null)}
/>
<CitationDuplicatesDialog
	open={dialog === 'duplicates'}
	onOpenChange={(open) => (dialog = open ? 'duplicates' : null)}
/>
<AddToProjectDialog
	open={addToProjectId !== null}
	onOpenChange={(open) => {
		if (!open) addToProjectId = null;
	}}
	citationId={addToProjectId}
/>
<ConfirmDialog
	open={deleteTarget !== null}
	onOpenChange={(open) => {
		if (!open) deleteTarget = null;
	}}
	title="Hapus referensi?"
	description={`"${deleteTarget?.title ?? ''}" dihapus dari perpustakaan (bisa dilihat lagi lewat filter di masa depan — soft delete).`}
	confirmLabel="Hapus"
	onConfirm={async () => {
		if (!deleteTarget) return;
		await deleteCitation.mutateAsync({ citationId: deleteTarget.id });
		if (urlState.cite === deleteTarget.id) navigate({ cite: null });
		deleteTarget = null;
	}}
/>
<ConfirmDialog
	open={confirmBulkDelete}
	onOpenChange={(open) => (confirmBulkDelete = open)}
	title={`Hapus ${selectedIds.size} referensi?`}
	description="Referensi terpilih dihapus dari perpustakaan."
	confirmLabel="Hapus"
	onConfirm={async () => {
		await bulkDelete.mutateAsync({ ids: [...selectedIds] });
		confirmBulkDelete = false;
		clearSelection();
	}}
/>
```

Cocokkan signature mutation (`useUpdateCitation`/`useDeleteCitation`/`useBulkTagCitations`/`useMergeManyCitations`) dengan `api.ts` nyata — nama field input mengikuti file itu. Cek props `ConfirmDialog`/`CitationDoiDialog`/`CitationFormDialog` persis (sudah dicantumkan di Interfaces; verifikasi ulang saat wiring). Tambah import ikon `PlusIcon`, `MoreHorizontalIcon` ke `$lib/icons` import list halaman.

- [ ] **Step 5: Verifikasi manual + commit**

Run: `cd apps/svelte && bun run check && cd ../..` → bersih.
Manual: Tambah dari DOI (coba DOI dobel → 409 → "tambah tetap"); isi manual; import file .bib (preview → commit → muncul di list); provider sync (bila ada koneksi di settings); "Pilih beberapa" → tag/export/merge/hapus; "Tambahkan ke proyek" dari baris & detail → muncul di panel Sumber proyek; kelola duplikat menggabungkan grup.

```bash
git add apps/svelte/src/lib/features/workspaces/components/ProjectSectionPicker.svelte apps/svelte/src/lib/features/citations/components/library apps/svelte/src/lib/features/citations/pages/LibraryPage.svelte
git commit -m "feat(svelte): library actions - add sources, bulk ops, duplicates, add-to-project"
```

---

### Task 7: Svelte — pipeline Simpan citation-first (`source-save` + `useSaveSource`)

**Files:**
- Create: `apps/svelte/src/lib/features/discovery/source-save.ts`
- Create: `apps/svelte/src/lib/features/discovery/source-save.spec.ts`
- Modify: `apps/svelte/src/lib/features/discovery/model.ts` (bila `DiscoveryItem` belum membawa field sitasi)
- Modify: `apps/svelte/src/lib/features/citations/api.ts`

**Interfaces:**
- Consumes: `SearchPaper` (`features/discovery/api`), `ManualCitationFields` + `CitationDetail` (`features/citations`), `POST /citations` `onDuplicate` (Task 2), `POST /workspaces/:id/citations/:citationId/link` (Fase 1).
- Produces (dipakai Task 8, 9):
  - `SourceSaveInput = { title: string; doi?: string | null; url?: string | null; authors?: string[]; year?: number | null; venue?: string | null }`
  - `paperToCitationInput(source: SourceSaveInput): { doi: string } | { fields: ManualCitationFields }`
  - `useSaveSource()` — mutation `({ source: SourceSaveInput; workspaceId?: string | null; sectionId?: string | null }) => CitationDetail & { created: boolean }`; invalidasi `citations.all` + `citations.links(workspaceId)`; toast error via `readableApiErrorMessage`.

- [ ] **Step 1: Failing spec**

`apps/svelte/src/lib/features/discovery/source-save.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { paperToCitationInput } from './source-save';

describe('paperToCitationInput', () => {
	it('DOI menang — resolusi metadata kanonik di server', () => {
		expect(
			paperToCitationInput({ title: 'X', doi: '10.1234/abc', authors: ['A'], year: 2024 })
		).toEqual({ doi: '10.1234/abc' });
	});

	it('tanpa DOI → fields manual dari metadata hasil pencarian', () => {
		expect(
			paperToCitationInput({
				title: 'Judul Paper',
				url: 'https://example.org/p',
				authors: ['Ada Lovelace', 'Alan Turing'],
				year: 2023,
				venue: 'Jurnal Contoh'
			})
		).toEqual({
			fields: {
				title: 'Judul Paper',
				authors: [{ literal: 'Ada Lovelace' }, { literal: 'Alan Turing' }],
				publishedYear: 2023,
				venue: 'Jurnal Contoh',
				url: 'https://example.org/p'
			}
		});
	});

	it('field kosong tidak ikut terkirim', () => {
		expect(paperToCitationInput({ title: 'Minimal' })).toEqual({
			fields: { title: 'Minimal' }
		});
	});
});
```

Run: `cd apps/svelte && bun run test -- source-save && cd ../..` → FAIL (module belum ada).

- [ ] **Step 2: Implement `source-save.ts`**

```ts
import type { ManualCitationFields } from '$lib/features/citations/api';

/**
 * Input minimum "Simpan" citation-first dari hasil pencarian/feed. DOI menang:
 * server me-resolve metadata kanonik; tanpa DOI kirim metadata hasil apa adanya.
 */
export type SourceSaveInput = {
	title: string;
	doi?: string | null;
	url?: string | null;
	authors?: string[];
	year?: number | null;
	venue?: string | null;
};

export function paperToCitationInput(
	source: SourceSaveInput
): { doi: string } | { fields: ManualCitationFields } {
	if (source.doi) return { doi: source.doi };
	return {
		fields: {
			title: source.title,
			...(source.authors?.length
				? { authors: source.authors.map((name) => ({ literal: name })) }
				: {}),
			...(source.year != null ? { publishedYear: source.year } : {}),
			...(source.venue ? { venue: source.venue } : {}),
			...(source.url ? { url: source.url } : {})
		}
	};
}
```

(Cek nama & bentuk `ManualCitationFields` di `features/citations/api.ts`/`types.ts`; bila bernama lain — mis. `ManualCitationInput` — ikuti nama nyatanya dan sesuaikan spec.)

Run spec → PASS (3 test).

- [ ] **Step 3: `useSaveSource` di `features/citations/api.ts`**

Tambahkan di akhir file:

```ts
// ── Simpan citation-first dari pencarian/feed ────────────────────────────────

/**
 * Simpan sumber hasil pencarian: buat citation di perpustakaan akun (duplikat →
 * pakai yang lama, tanpa entri dobel) lalu opsional auto-link ke proyek/bab.
 */
export function useSaveSource() {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (input: {
			source: SourceSaveInput;
			workspaceId?: string | null;
			sectionId?: string | null;
		}) => {
			const citation = unwrap(
				await api.citations.post({
					...paperToCitationInput(input.source),
					onDuplicate: 'return-existing'
				})
			) as CitationDetail & { created: boolean };
			if (input.workspaceId) {
				unwrap(
					await api
						.workspaces({ id: input.workspaceId })
						.citations({ citationId: citation.id })
						.link.post({ sectionId: input.sectionId ?? null })
				);
			}
			return citation;
		},
		onSuccess: (_d: unknown, input: { workspaceId?: string | null }) => {
			qc.invalidateQueries({ queryKey: queryKeys.citations.all });
			if (input.workspaceId) {
				qc.invalidateQueries({ queryKey: queryKeys.citations.links(input.workspaceId) });
			}
		},
		onError: (e) => toast.error(readableApiErrorMessage(e, 'Gagal menyimpan sumber.'))
	}));
}
```

Import `paperToCitationInput` + `SourceSaveInput` dari `$lib/features/discovery/source-save` (satu arah — discovery TIDAK meng-import citations api, jadi tanpa siklus). Cocokkan bentuk chaining Eden link dengan hook `useLinkCitation` existing di file yang sama.

- [ ] **Step 4: Pastikan `DiscoveryItem` membawa field sitasi**

`/usr/bin/grep -n "doi\|authors\|year\|venue" apps/svelte/src/lib/features/discovery/model.ts` — tipe `DiscoveryItem` + mapper `feedItemToDiscoveryItem`/`paperToDiscoveryItem` harus meneruskan `doi`, `authors`, `year`, `venue`, `url`, `title` (sumbernya ada di `FeedItem` dan `SearchPaper`). Bila belum, tambahkan field opsional tersebut ke tipe + kedua mapper (passthrough, tanpa transformasi).

- [ ] **Step 5: Verifikasi + commit**

Run: `cd apps/svelte && bun run check && bun run test -- source-save && cd ../..` → bersih + PASS.

```bash
git add apps/svelte/src/lib/features/discovery/source-save.ts apps/svelte/src/lib/features/discovery/source-save.spec.ts apps/svelte/src/lib/features/discovery/model.ts apps/svelte/src/lib/features/citations/api.ts
git commit -m "feat(svelte): citation-first source save pipeline"
```

---

### Task 8: Svelte — halaman pencarian in-project + entry points

**Files:**
- Create: `apps/svelte/src/lib/features/discovery/components/SourceResultCard.svelte`
- Create: `apps/svelte/src/lib/features/workspaces/pages/ProjectSearchPage.svelte`
- Create: `apps/svelte/src/routes/app/(product)/projects/[projectId]/search/+page.svelte`
- Modify: `apps/svelte/src/lib/features/workspaces/components/SectionOutline.svelte`
- Modify: `apps/svelte/src/lib/features/workspaces/components/ProjectSourcesPanel.svelte`

**Interfaces:**
- Consumes: `usePaperSearch(q, fromYear, enabled)`, `SearchPaper`, `useSaveSource` (Task 7), `useWorkspace`/`useSections`, `projectDisplayTitle`, `ExploreAskBar { value, onSubmit }`, `useRecordInteraction`.
- Produces: route `/app/(product)/projects/[projectId]/search` dengan query `?q=&section=`; `SourceResultCard` props `{ paper: SearchPaper; saved: boolean; pending: boolean; onSave: () => void }`.

- [ ] **Step 1: `SourceResultCard.svelte`**

```svelte
<script lang="ts">
	import { resolve } from '$app/paths';
	import { Badge } from '@aqsha/ui-svelte/components/badge';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Icon, BookOpenIcon, CheckIcon, ExternalLinkIcon, PlusIcon } from '$lib/icons';
	import type { SearchPaper } from '../api';

	/** Kartu hasil pencarian literatur; Simpan = citation-first (perpustakaan + link proyek). */
	let {
		paper,
		saved,
		pending,
		onSave
	}: {
		paper: SearchPaper;
		saved: boolean;
		pending: boolean;
		onSave: () => void;
	} = $props();

	const meta = $derived(
		[paper.authors.slice(0, 3).join(', ') + (paper.authors.length > 3 ? ' dkk.' : ''), paper.year, paper.venue]
			.filter(Boolean)
			.join(' · ')
	);
</script>

<article class="flex flex-col gap-2 rounded-md border-2 border-border bg-card p-4">
	<div class="flex items-start justify-between gap-3">
		<h3 class="min-w-0 flex-1 text-sm font-medium leading-snug">{paper.title}</h3>
		{#if paper.isOpenAccess}
			<Badge variant="outline" class="shrink-0">open access</Badge>
		{/if}
	</div>
	{#if meta}
		<p class="text-label text-muted-foreground">{meta}</p>
	{/if}
	{#if paper.snippet}
		<p class="line-clamp-3 text-sm text-muted-foreground">{paper.snippet}</p>
	{/if}
	<div class="mt-1 flex items-center gap-2">
		<Button type="button" size="sm" class="gap-1.5" disabled={pending || saved} onclick={onSave}>
			{#if saved}
				<Icon icon={CheckIcon} class="size-3.5" /> Tersimpan
			{:else}
				<Icon icon={PlusIcon} class="size-3.5" /> {pending ? 'Menyimpan…' : 'Simpan'}
			{/if}
		</Button>
		<Button
			href={resolve('/app/(product)/explore/[paperRef]', { paperRef: paper.key })}
			variant="outline"
			size="sm"
			class="gap-1.5"
		>
			<Icon icon={BookOpenIcon} class="size-3.5" /> Baca
		</Button>
		{#if paper.url}
			<Button
				href={paper.url}
				target="_blank"
				rel="noopener"
				variant="ghost"
				size="icon"
				class="size-7"
				aria-label="Buka sumber asli"
			>
				<Icon icon={ExternalLinkIcon} class="size-3.5" />
			</Button>
		{/if}
		{#if paper.citedByCount != null}
			<span class="ml-auto text-label text-muted-foreground">{paper.citedByCount} sitasi</span>
		{/if}
	</div>
</article>
```

(Cek `Button` mendukung `href`/`target` di versi terpasang; bila tidak, pakai `<a>` + class recipe. Cek encoding `paper.key` pada `resolve` — reader existing menerima key kanonik `doi:…`; ikuti cara link existing ke reader — cari `explore/[paperRef]` referensi dengan `/usr/bin/grep -rn "paperRef" apps/svelte/src/lib`.)

- [ ] **Step 2: `ProjectSearchPage.svelte`**

```svelte
<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { useClerkContext } from 'svelte-clerk';
	import { SvelteSet } from 'svelte/reactivity';
	import { Badge } from '@aqsha/ui-svelte/components/badge';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Spinner } from '$lib/components/ui/spinner';
	import { PageTitle } from '$lib/seo';
	import { Icon, ArrowLeftIcon } from '$lib/icons';
	import ExploreAskBar from '$lib/features/explore/components/ExploreAskBar.svelte';
	import SourceResultCard from '$lib/features/discovery/components/SourceResultCard.svelte';
	import { usePaperSearch, useRecordInteraction, type SearchPaper } from '$lib/features/discovery/api';
	import { useSaveSource } from '$lib/features/citations/api';
	import { useSections, useWorkspace } from '../api';
	import { projectDisplayTitle } from '../types';

	/**
	 * Pencarian sumber sadar-konteks: hasil disimpan langsung ke perpustakaan akun
	 * + auto-link ke proyek ini (dan bab bila datang dari aksi per-bab).
	 */
	let { workspaceId }: { workspaceId: string } = $props();

	const clerk = useClerkContext();
	const enabled = $derived(clerk.isLoaded && Boolean(clerk.auth.userId));

	const q = $derived(page.url.searchParams.get('q') ?? '');
	const sectionId = $derived(page.url.searchParams.get('section'));

	const workspace = useWorkspace(() => workspaceId, () => enabled);
	const sections = useSections(() => workspaceId, () => enabled);
	const section = $derived(
		sectionId ? (sections.data?.find((s) => s.id === sectionId) ?? null) : null
	);

	const search = usePaperSearch(
		() => q,
		() => undefined,
		() => enabled && q.trim().length > 0
	);
	const results = $derived<SearchPaper[]>(search.data?.pages.flatMap((p) => p.items) ?? []);

	const saveSource = useSaveSource();
	const record = useRecordInteraction();
	const savedKeys = new SvelteSet<string>();
	let pendingKey = $state<string | null>(null);

	function save(paper: SearchPaper) {
		pendingKey = paper.key;
		saveSource.mutate(
			{
				source: {
					title: paper.title,
					doi: paper.doi ?? null,
					url: paper.url ?? null,
					authors: paper.authors,
					year: paper.year ?? null,
					venue: paper.venue ?? null
				},
				workspaceId,
				sectionId
			},
			{
				onSuccess: () => {
					savedKeys.add(paper.key);
					record.mutate({ itemRef: { kind: 'paper', paperKey: paper.key }, kind: 'save' });
				},
				onSettled: () => (pendingKey = null)
			}
		);
	}

	function submitQuery(next: string) {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient URL builder, not reactive state
		const url = new URL(page.url);
		if (next.trim()) url.searchParams.set('q', next.trim());
		else url.searchParams.delete('q');
		void goto(url, { replaceState: true, noScroll: true, keepFocus: true });
	}

	// Saran query awal dari konteks proyek/bab — pencarian belum dimulai.
	const suggestions = $derived(
		[
			section?.title ?? null,
			workspace.data?.topicNote?.trim() || null,
			workspace.data?.name.trim() || null
		].filter((s, i, all): s is string => Boolean(s) && all.indexOf(s) === i)
	);
</script>

<PageTitle title="Cari sumber" />

<div class="flex h-svh min-h-0 flex-col overflow-hidden bg-background">
	<header class="flex flex-col gap-3 border-b-2 border-border px-6 py-4">
		<div class="flex flex-wrap items-center gap-2">
			<Button
				href={resolve('/app/(product)/projects/[projectId]', { projectId: workspaceId })}
				variant="ghost"
				size="sm"
				class="gap-1.5 text-muted-foreground"
			>
				<Icon icon={ArrowLeftIcon} class="size-3.5" /> Kembali ke proyek
			</Button>
			{#if workspace.data}
				<Badge variant="outline">{projectDisplayTitle(workspace.data)}</Badge>
			{/if}
			{#if section}
				<Badge variant="secondary">{section.title}</Badge>
			{/if}
		</div>
		<h1 class="font-display text-2xl font-bold">
			Cari sumber {section ? `untuk ${section.title}` : 'untuk proyek ini'}
		</h1>
		<ExploreAskBar value={q} onSubmit={submitQuery} />
	</header>

	<div class="min-h-0 flex-1 overflow-y-auto px-6 py-5">
		{#if !q.trim()}
			<div class="grid gap-3">
				<p class="text-sm text-muted-foreground">Mulai dari topikmu:</p>
				<div class="flex flex-wrap gap-2">
					{#each suggestions as suggestion (suggestion)}
						<Button type="button" variant="outline" size="sm" onclick={() => submitQuery(suggestion)}>
							{suggestion}
						</Button>
					{/each}
				</div>
			</div>
		{:else if search.isPending}
			<div class="flex items-center justify-center gap-2 py-16 text-muted-foreground">
				<Spinner class="size-4" />
				<span class="text-sm">Mencari literatur…</span>
			</div>
		{:else if results.length === 0}
			<p class="py-16 text-center text-sm text-muted-foreground">
				Tidak ada hasil — coba kata kunci lain atau lebih spesifik.
			</p>
		{:else}
			<div class="grid gap-3">
				{#each results as paper (paper.key)}
					<SourceResultCard
						{paper}
						saved={savedKeys.has(paper.key)}
						pending={pendingKey === paper.key}
						onSave={() => save(paper)}
					/>
				{/each}
			</div>
			{#if search.hasNextPage}
				<Button
					type="button"
					variant="outline"
					class="mx-auto mt-4 flex"
					disabled={search.isFetchingNextPage}
					onclick={() => search.fetchNextPage()}
				>
					{search.isFetchingNextPage ? 'Memuat…' : 'Muat lagi'}
				</Button>
			{/if}
		{/if}
	</div>
</div>
```

- [ ] **Step 3: Route**

`apps/svelte/src/routes/app/(product)/projects/[projectId]/search/+page.svelte`:

```svelte
<script lang="ts">
	import { page } from '$app/state';
	import ProjectSearchPage from '$lib/features/workspaces/pages/ProjectSearchPage.svelte';

	const projectId = $derived(page.params.projectId!);
</script>

{#key projectId}
	<ProjectSearchPage workspaceId={projectId} />
{/key}
```

- [ ] **Step 4: Entry points**

(a) `SectionOutline.svelte` — tambah item dropdown per bab (setelah "Ubah judul", L136; import `goto` dari `$app/navigation`, `resolve` sudah ada, tambah `SearchIcon` ke import icons):

```svelte
							<DropdownMenu.Item
								onSelect={() =>
									goto(
										resolve('/app/(product)/projects/[projectId]/search', {
											projectId: workspaceId
										}) + `?section=${section.id}`
									)}
							>
								<Icon icon={SearchIcon} class="size-4" /> Cari sumber untuk bab ini
							</DropdownMenu.Item>
```

(b) `ProjectSourcesPanel.svelte` — tambah baris aksi di atas list (setelah pembuka `<div class=…>` konten, sebelum `{#if linked.isPending}`; import `resolve` dari `$app/paths`, `Icon, SearchIcon` sudah/tambah di import):

```svelte
	<div class="flex items-center gap-2">
		<Button
			href={resolve('/app/(product)/projects/[projectId]/search', { projectId: workspaceId })}
			variant="outline"
			size="sm"
			class="flex-1 gap-1.5"
		>
			<Icon icon={SearchIcon} class="size-3.5" /> Cari sumber
		</Button>
		<!-- "Tambah dari perpustakaan" — task berikutnya -->
	</div>
```

Dan pada empty state, ganti teks jadi ajakan bertombol:

```svelte
		<div
			class="grid gap-3 rounded-md border-2 border-dashed border-border p-6 text-center text-sm text-muted-foreground"
		>
			<p>Belum ada sumber di proyek ini.</p>
			<Button
				href={resolve('/app/(product)/projects/[projectId]/search', { projectId: workspaceId })}
				variant="outline"
				size="sm"
				class="mx-auto"
			>
				Cari sumber untuk proyek ini
			</Button>
		</div>
```

- [ ] **Step 5: Verifikasi manual + commit**

Run: `cd apps/svelte && bun run check && cd ../..` → bersih.
Manual: dari bab "Cari sumber untuk bab ini" → halaman search dengan chip proyek+bab & saran query; submit query → hasil kartu; Simpan → "Tersimpan ✓", sumber muncul di panel Sumber proyek DENGAN bab tertandai; Simpan paper yang sama dua kali/dari proyek lain → tidak ada entri dobel di `/app/library`; "Baca" membuka reader; back-button kembali ke proyek.

```bash
git add apps/svelte/src/lib/features/discovery/components/SourceResultCard.svelte apps/svelte/src/lib/features/workspaces/pages/ProjectSearchPage.svelte "apps/svelte/src/routes/app/(product)/projects/[projectId]/search" apps/svelte/src/lib/features/workspaces/components/SectionOutline.svelte apps/svelte/src/lib/features/workspaces/components/ProjectSourcesPanel.svelte
git commit -m "feat(svelte): in-project source search with citation-first save"
```

---

### Task 9: Svelte — Simpan dari Explore (`SaveSourceButton`) + hapus alur artifact-URL

**Files:**
- Create: `apps/svelte/src/lib/features/discovery/components/SaveSourceButton.svelte`
- Modify: `apps/svelte/src/lib/features/discovery/components/DiscoveryItemCard.svelte`
- Modify: `apps/svelte/src/lib/features/discovery/components/PaperReader.svelte`
- Delete: `apps/svelte/src/lib/features/discovery/components/SaveToWorkspaceButton.svelte`

**Interfaces:**
- Consumes: `useSaveSource` (Task 7), `SourceSaveInput`, `ProjectSectionPicker` (Task 6).
- Produces: `SaveSourceButton` props `{ source: SourceSaveInput; label?: string; ariaLabel?: string; variant?: ButtonVariant; size?: ButtonSize; class?: string; onSaved?: () => void }` — pengganti drop-in `SaveToWorkspaceButton`.

- [ ] **Step 1: `SaveSourceButton.svelte`**

```svelte
<script lang="ts">
	import * as Dialog from '@aqsha/ui-svelte/components/dialog';
	import {
		Button,
		type ButtonSize,
		type ButtonVariant
	} from '@aqsha/ui-svelte/components/button';
	import { toast } from 'svelte-sonner';
	import { Icon, BookmarkIcon, CheckIcon } from '$lib/icons';
	import ProjectSectionPicker from '$lib/features/workspaces/components/ProjectSectionPicker.svelte';
	import { useSaveSource } from '$lib/features/citations/api';
	import type { SourceSaveInput } from '../source-save';

	/**
	 * Simpan citation-first dari explore: default masuk perpustakaan akun saja;
	 * opsional pilih proyek tujuan (+ bab). Duplikat memakai referensi lama.
	 */
	let {
		source,
		label = 'Simpan',
		ariaLabel,
		variant = 'outline',
		size = 'sm',
		class: className,
		onSaved
	}: {
		source: SourceSaveInput;
		label?: string;
		ariaLabel?: string;
		variant?: ButtonVariant;
		size?: ButtonSize;
		class?: string;
		onSaved?: () => void;
	} = $props();

	const save = useSaveSource();
	let open = $state(false);
	let saved = $state(false);

	function saveTo(target: { workspaceId: string; sectionId: string | null } | null) {
		save.mutate(
			{
				source,
				workspaceId: target?.workspaceId ?? null,
				sectionId: target?.sectionId ?? null
			},
			{
				onSuccess: () => {
					saved = true;
					open = false;
					toast.success(target ? 'Tersimpan & ditautkan ke proyek' : 'Tersimpan ke perpustakaan');
					onSaved?.();
				}
			}
		);
	}
</script>

<Button
	type="button"
	{variant}
	{size}
	class={className}
	aria-label={ariaLabel ?? label ?? 'Simpan'}
	disabled={save.isPending || saved}
	onclick={() => (open = true)}
>
	<Icon icon={saved ? CheckIcon : BookmarkIcon} class="size-3.5" />
	{#if label}{saved ? 'Tersimpan' : label}{/if}
</Button>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-sm">
		<Dialog.Header>
			<Dialog.Title>Simpan sumber</Dialog.Title>
			<Dialog.Description>Masuk ke perpustakaanmu; tautkan ke proyek bila perlu.</Dialog.Description>
		</Dialog.Header>
		<div class="grid gap-4">
			<Button type="button" variant="outline" disabled={save.isPending} onclick={() => saveTo(null)}>
				Perpustakaan saja
			</Button>
			<div class="grid gap-2">
				<p class="text-label font-medium text-muted-foreground">Atau tautkan ke proyek:</p>
				<ProjectSectionPicker
					disabled={save.isPending}
					confirmLabel="Simpan ke proyek"
					onConfirm={saveTo}
				/>
			</div>
		</div>
	</Dialog.Content>
</Dialog.Root>
```

- [ ] **Step 2: Ganti pemakaian di `DiscoveryItemCard.svelte`**

Blok `SaveToWorkspaceButton` (L190-199, snippet `cardFooter`) diganti:

```svelte
				<SaveSourceButton
					source={{
						title: item.title,
						doi: item.doi ?? null,
						url: item.url ?? null,
						authors: item.authors ?? [],
						year: item.year ?? null,
						venue: item.venue ?? null
					}}
					label=""
					size="icon"
					variant="ghost"
					ariaLabel="Simpan ke perpustakaan"
					onSaved={() => handlers.onSaved(item)}
				/>
```

(Field `item.*` mengikuti `DiscoveryItem` hasil Task 7 Step 4 — nama persisnya cocokkan dengan `model.ts`.) Ganti import `SaveToWorkspaceButton` → `SaveSourceButton`.

- [ ] **Step 3: Ganti pemakaian di `PaperReader.svelte`**

Blok L89-98 diganti:

```svelte
				<SaveSourceButton
					source={{
						title: paper.title,
						doi: paper.doi ?? null,
						url: paper.url ?? null,
						authors: paper.authors,
						year: paper.year ?? null,
						venue: paper.venue ?? null
					}}
					label="Simpan"
					size="sm"
					variant="ghost"
					class="rounded-full text-muted-foreground hover:text-foreground"
					onSaved={() =>
						record.mutate({ itemRef: { kind: 'paper', paperKey: paper.key }, kind: 'save' })}
				/>
```

- [ ] **Step 4: Hapus `SaveToWorkspaceButton` + cek `useSaveUrl`**

```bash
git rm apps/svelte/src/lib/features/discovery/components/SaveToWorkspaceButton.svelte
/usr/bin/grep -rn "useSaveUrl" apps/svelte/src
```
Bila `useSaveUrl` tanpa consumer tersisa → hapus hook-nya dari `features/artifacts/api.ts` (deviasi #7); bila masih dipakai (mis. alur artifact URL di proyek), biarkan.

- [ ] **Step 5: Verifikasi manual + commit**

Run: `cd apps/svelte && bun run check && cd ../..` → bersih.
Manual: dari kartu explore Simpan → dialog; "Perpustakaan saja" → muncul di `/app/library` TANPA link proyek; pilih proyek+bab → muncul di panel Sumber; dari paper reader sama; interest feed tetap tercatat (kartu "tersimpan" memicu perilaku feed existing).

```bash
git add apps/svelte/src/lib/features/discovery/components apps/svelte/src/lib/features/artifacts/api.ts
git status   # pastikan deletions SaveToWorkspaceButton ikut
git commit -m "feat(svelte): citation-first save from explore with project picker"
```

---

### Task 10: Svelte — "Tambah dari perpustakaan" di panel Sumber (`LibraryPickerDialog`)

**Files:**
- Create: `apps/svelte/src/lib/features/citations/components/LibraryPickerDialog.svelte`
- Modify: `apps/svelte/src/lib/features/workspaces/components/ProjectSourcesPanel.svelte`

**Interfaces:**
- Consumes: `useCitationsList`, `EMPTY_CITATION_FILTERS`, `useLinkCitation`, `useWorkspaceCitations` (untuk menandai yang sudah ter-link), `citationMetaLine`.
- Produces: `LibraryPickerDialog` props `{ open: boolean; onOpenChange: (open: boolean) => void; workspaceId: string }`.

- [ ] **Step 1: `LibraryPickerDialog.svelte`**

```svelte
<script lang="ts">
	import * as Dialog from '@aqsha/ui-svelte/components/dialog';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Input } from '@aqsha/ui-svelte/components/input';
	import { Spinner } from '$lib/components/ui/spinner';
	import { toast } from 'svelte-sonner';
	import { Icon, CheckIcon, PlusIcon } from '$lib/icons';
	import {
		EMPTY_CITATION_FILTERS,
		useCitationsList,
		useLinkCitation,
		useWorkspaceCitations
	} from '../api';
	import { citationMetaLine } from '../types';

	/**
	 * Tautkan referensi perpustakaan yang sudah ada ke proyek. Link di level
	 * proyek; penandaan bab lewat Select di panel Sumber.
	 */
	let {
		open,
		onOpenChange,
		workspaceId
	}: {
		open: boolean;
		onOpenChange: (open: boolean) => void;
		workspaceId: string;
	} = $props();

	let q = $state('');
	const list = useCitationsList(() => ({ ...EMPTY_CITATION_FILTERS, q }));
	const linked = useWorkspaceCitations(() => workspaceId, () => open);
	const link = useLinkCitation();

	const items = $derived(list.data?.pages.flatMap((p) => p.items) ?? []);
	const linkedIds = $derived(new Set((linked.data?.items ?? []).map((i) => i.id)));
</script>

<Dialog.Root {open} {onOpenChange}>
	{#if open}
		<Dialog.Content class="sm:max-w-lg">
			<Dialog.Header>
				<Dialog.Title>Tambah dari perpustakaan</Dialog.Title>
				<Dialog.Description>Tautkan referensi yang sudah kamu simpan ke proyek ini.</Dialog.Description>
			</Dialog.Header>
			<Input bind:value={q} placeholder="Cari di perpustakaan…" aria-label="Cari referensi" />
			<div class="max-h-80 min-h-0 overflow-y-auto">
				{#if list.isPending}
					<div class="flex items-center justify-center gap-2 py-8 text-muted-foreground">
						<Spinner class="size-4" />
						<span class="text-sm">Memuat…</span>
					</div>
				{:else if items.length === 0}
					<p class="py-8 text-center text-sm text-muted-foreground">
						{q ? 'Tidak ada yang cocok.' : 'Perpustakaanmu masih kosong.'}
					</p>
				{:else}
					<ul class="grid gap-1.5">
						{#each items as item (item.id)}
							{@const isLinked = linkedIds.has(item.id)}
							<li class="flex items-center gap-3 rounded-md border-2 border-border bg-card px-3 py-2">
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm font-medium">{item.title}</p>
									<p class="truncate text-label text-muted-foreground">{citationMetaLine(item)}</p>
								</div>
								<Button
									type="button"
									variant={isLinked ? 'ghost' : 'outline'}
									size="sm"
									class="gap-1.5"
									disabled={isLinked || link.isPending}
									onclick={() =>
										link.mutate(
											{ workspaceId, citationId: item.id },
											{ onSuccess: () => toast.success('Ditautkan ke proyek') }
										)}
								>
									{#if isLinked}
										<Icon icon={CheckIcon} class="size-3.5" /> Sudah ada
									{:else}
										<Icon icon={PlusIcon} class="size-3.5" /> Tambahkan
									{/if}
								</Button>
							</li>
						{/each}
					</ul>
					{#if list.hasNextPage}
						<Button
							type="button"
							variant="ghost"
							size="sm"
							class="mx-auto mt-2 flex"
							onclick={() => list.fetchNextPage()}
						>
							Muat lagi
						</Button>
					{/if}
				{/if}
			</div>
		</Dialog.Content>
	{/if}
</Dialog.Root>
```

- [ ] **Step 2: Wire ke `ProjectSourcesPanel.svelte`**

Ganti komentar seam Task 8 dengan tombol kedua + dialog:

```svelte
		<Button
			type="button"
			variant="outline"
			size="sm"
			class="flex-1 gap-1.5"
			onclick={() => (pickerOpen = true)}
		>
			<Icon icon={PlusIcon} class="size-3.5" /> Dari perpustakaan
		</Button>
```

Script: `let pickerOpen = $state(false);` + import `LibraryPickerDialog` dari `$lib/features/citations/components/LibraryPickerDialog.svelte` + `PlusIcon`. Di akhir template:

```svelte
<LibraryPickerDialog
	open={pickerOpen}
	onOpenChange={(open) => (pickerOpen = open)}
	{workspaceId}
/>
```

- [ ] **Step 3: Verifikasi manual + commit**

Run: `cd apps/svelte && bun run check && cd ../..` → bersih.
Manual: panel Sumber → "Dari perpustakaan" → cari → Tambahkan → item muncul di panel dengan Select bab; item yang sudah ter-link berlabel "Sudah ada".

```bash
git add apps/svelte/src/lib/features/citations/components/LibraryPickerDialog.svelte apps/svelte/src/lib/features/workspaces/components/ProjectSourcesPanel.svelte
git commit -m "feat(svelte): link existing library citations from project sources panel"
```

---

### Task 11: Svelte — hapus berita dari Explore

**Files:**
- Delete: `apps/svelte/src/routes/app/(product)/explore/n/` (subtree route reader berita)
- Delete: `apps/svelte/src/lib/features/discovery/components/NewsReader.svelte`, `NewsReaderRoute.svelte`
- Modify: `apps/svelte/src/lib/features/discovery/{types.ts,api.ts,model.ts}`
- Modify: komponen yang merah (`DiscoveryItemCard.svelte`, `reader-ui/ReaderShell.svelte`, dst.)
- Test: modify `apps/svelte/src/lib/features/discovery/model.spec.ts`

**Interfaces:** murni pengurangan; gate = check hijau + tidak ada referensi `news` tersisa di `apps/svelte` (kecuali komentar historis yang ikut dihapus).

- [ ] **Step 1: Hapus route + komponen reader berita**

```bash
git rm -r "apps/svelte/src/routes/app/(product)/explore/n"
git rm apps/svelte/src/lib/features/discovery/components/NewsReader.svelte apps/svelte/src/lib/features/discovery/components/NewsReaderRoute.svelte
```

- [ ] **Step 2: Sweep `news` — dituntun check + grep**

`/usr/bin/grep -rn "news" apps/svelte/src --include='*.ts' --include='*.svelte' -i` lalu terapkan aturan:
1. `discovery/types.ts`: `FeedKind` → `'paper'`; hapus field news-only `articleText` (+ komentarnya) dan cabang news di `feedItemHref` (L104); sesuaikan `KIND_LABELS`.
2. `discovery/api.ts`: `VISIBLE_KINDS` → `['paper']` (L19-20).
3. `discovery/model.ts`: hapus cabang `item.kind === 'news'` di `feedDetailHref` (L52); sederhanakan `kindLabel`/`kindPanelClass` yang membedakan non-paper (kini semua item = paper).
4. Komponen: hapus cabang news di `DiscoveryItemCard.svelte` (L72) dan `reader-ui/ReaderShell.svelte` (L7); biarkan jalur paper apa adanya.
5. `model.spec.ts`: hapus/ubah kasus news.
6. JANGAN sentuh `explore-url-model.ts` (topik ≠ berita) dan `feed-blocks.ts` (tidak menyebut news).

- [ ] **Step 3: Verifikasi + commit**

Run: `cd apps/svelte && bun run check && bun run test && cd ../..`
Expected: check bersih; seluruh spec svelte PASS.
Manual: `/app/explore` hanya menampilkan paper (feed dev lama yang punya row news → tidak muncul, backend sudah memfilter); `/app/explore/n/<id>` → 404; two-state `q`/`topic` tetap bekerja.

```bash
git add -u apps/svelte/src
git status   # hanya file sweep news
git commit -m "feat(svelte)!: remove news from explore - literature only"
```

---

### Task 12: Gate akhir Fase 3

**Files:** tidak ada file baru — verifikasi lintas workspace (+ commit penutup bila ada sisa).

- [ ] **Step 1: Gate otomatis**

Run (dari root):
```bash
bun run build:dist && bun run typecheck && bun run test
cd apps/svelte && bun run check && bun run test && bun run lint && cd ../..
```
Expected: hijau, KECUALI `apps/web` di typecheck root (by design) dan 2 error pre-existing `DetailPanel.svelte`.

- [ ] **Step 2: Checklist E2E manual (dev server, akun dev)**

1. `/app/library`: tambah DOI → muncul terverifikasi; import .bib → preview → commit; tarik Zotero (bila terkoneksi); filter/search/URL state; detail + salin sitasi (APA); bulk tag/merge/hapus; "Tambahkan ke proyek".
2. Proyek → bab → "Cari sumber untuk bab ini" → Simpan → panel Sumber menampilkan item dengan bab tertandai; simpan paper sama dari proyek lain → library tetap satu entri, dua link.
3. Panel Sumber: "Cari sumber", "Dari perpustakaan", lepas dari proyek, pindah bab.
4. `/app/explore`: browse hanya paper; Simpan → dialog "Perpustakaan saja"/proyek; paper reader Simpan; `/app/explore/n/<id>` 404.
5. Dark mode + keyboard (dialog picker, bulk bar, baris library fokusable) — WCAG 2.2 AA.
6. Worker dev: jalankan `bun run dev:worker` sebentar → tidak ada job GDELT ter-enqueue (log lane hanya `refreshTrendingPapers`).

- [ ] **Step 3: Changelog & penutup**

Konsultasikan `docs/product/versioning-and-changelog.md`: `apps/svelte` belum cutover → kemungkinan TIDAK butuh entri changelog; TAPI perubahan API (import/sync account-level, feed tanpa berita) menyentuh produksi bila di-deploy — catat keputusan di PR. Commit sisa bila ada:

```bash
git status
git add <path-sisa-eksplisit>   # bila ada
git commit -m "chore: phase 3 library & search green"   # hanya bila ada perubahan tersisa
```

---

## Self-Review (sudah dijalankan penulis plan)

- **Spec coverage**: de-workspace import/sync + migration drop kolom (Task 1), create dedupe-return + render account-level (Task 2), feed tanpa berita backend (Task 3), repoint hooks + `workspaceId: null` render/copy + gate artifact link (Task 4), `/app/library` full page URL-state + detail reuse (Task 5), aksi library lengkap: DOI/manual/import/provider/duplikat/bulk/export/AddToProject + `ProjectSectionPicker` (Task 6), pipeline citation-first `source-save`+`useSaveSource` (Task 7), `/app/projects/[id]/search` + saran query konteks + entry points bab/panel (Task 8), `SaveSourceButton` explore + "Perpustakaan saja" + hapus artifact-URL (Task 9), `LibraryPickerDialog` (Task 10), explore tanpa berita frontend (Task 11), gate + E2E + changelog (Task 12). Tanpa dialog gaya sitasi di library (sesuai spec — settings per proyek, tidak disentuh). ⌘K tidak disentuh (sesuai spec).
- **Placeholder scan**: tidak ada TBD; task sweep (1, 3, 11) memakai aturan transformasi eksplisit + tsc/check-driven dengan perintah verifikasi (preseden plan Fase 1–2). Titik yang bergantung bentuk API terpasang (props `DetailSplitLayout`, sub-API `DropdownMenu`, `Checkbox`, `Button href`, field `CitationListItem`, `ManualCitationFields`, chaining Eden) diberi instruksi verifikasi eksplisit.
- **Type consistency**: `useImportPreview()/useImportCommit()/useProviderSync*(provider)` (Task 4) dipakai wizard di Task 6; `useCitationRender(workspaceId: () => string | null)` (Task 4) dipakai `CitationDetailView` yang dirender `LibraryPage` dengan `workspaceId={null}` (Task 5); `SourceSaveInput`/`paperToCitationInput`/`useSaveSource` (Task 7) dipakai Task 8–9 dengan bentuk input sama; `ProjectSectionPicker { disabled, confirmLabel, onConfirm }` (Task 6) dipakai `AddToProjectDialog` (Task 6) dan `SaveSourceButton` (Task 9); `LibraryRow` props (Task 5) diisi penuh di Task 6; endpoint `POST /citations` `onDuplicate` (Task 2) = yang dikirim `useSaveSource` (Task 7); route search (Task 8) = target `resolve()` di `SectionOutline`/`ProjectSourcesPanel`.
- **Deviasi tercatat** di Global Constraints (7 butir) untuk direview user di PR.
