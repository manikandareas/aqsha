# Research-first Fase 9: Redesign Typst dokumen-tunggal — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ganti fondasi dokumen proyek dari LaTeX per-section menjadi **satu dokumen Typst kontinu**: editor tunggal CM6 dengan preview realtime (typst.ts WASM di Web Worker), TOC overlay sebagai rumah manajemen bab, tanpa konsep compile/status/stage di UI, dengan loop Astra utuh (anotasi → proposal → review per-hunk) diretarget ke level dokumen, plus ekspor PDF/DOCX server-side.

**Architecture:** Source Typst utuh = satu artifact ber-CAS (`contentVersion`), satu-satunya kebenaran; bab derived dari heading `=`. Preview di-compile di browser (incremental, debounced, worker) — server CLI `typst` hanya untuk ekspor + dry-run proposal. Hunk review (`hunks.ts`) dipakai ulang apa adanya (diff teks murni). Anotasi di-anchor `selectedText` (bukan baris — typst.ts tidak mengekspos span→baris; lompatan editor↔preview level-heading via `query`).

**Tech Stack:** SvelteKit 5 (runes), CodeMirror 6 + `@vedivad/codemirror-typst`, `@myriaddreamin/typst.ts` 0.7.0 (+ web-compiler + renderer WASM), CLI `typst` (binary sistem), pandoc ≥3.9 (`-f typst --citeproc`), Drizzle, Elysia (Eden Treaty), Bun workspaces, vitest + bun:test.

**Spec:** `docs/superpowers/specs/2026-07-20-research-first-phase9-typst-single-document-design.md` (13 keputusan terkunci — baca dulu).

## Global Constraints

- Selalu `bun` (1.3.10); jangan npm/pnpm/yarn. Migrasi dir = `packages/db/migrations`.
- Komentar kode: **why** saja, TANPA referensi fase/plan/tiket (CLAUDE.md).
- `apps/svelte` TIDAK impor `@aqsha/db`/`@aqsha/services` — tipe di-mirror di `features/*/api.ts`.
- Service = object-literal + `db` arg pertama; error via `throwAppError`; union produk (stale/compile_error) sebagai return value, bukan throw.
- Setelah ubah services: `bun run build:dist` + restart proses api/agent sebelum verifikasi runtime.
- **Tes rune `$state` WAJIB `.svelte.test.ts` (vitest browser project)** — node tidak meng-compile rune.
- Baseline typecheck svelte: 2 error pre-existing `DetailPanel:158-159`; `@aqsha/web` typecheck GAGAL = baseline. Tes services yang butuh binary (`typst`, `pandoc`) HARUS auto-skip bila binary tak ada.
- Binary dev: `brew install typst` (resolve `AQSHA_TYPST_BIN ?? "typst"`); pandoc 3.10 sudah ada. Provisioning prod DILUAR cakupan.
- Subprocess selalu via `runSandboxed` (env eksplisit; `XDG_CACHE_HOME` diarahkan dir persisten untuk cache paket typst).
- WASM di FE: import `?url` + `getModule`, init sekali (guard HMR), SSR guard (`browser`), jalankan compiler di Web Worker.
- Ikon via `$lib/icons` (hugeicons). UI copy sentence case bahasa Indonesia.
- UI kartu FLAT; token OKLCH `DESIGN.md`; skill impeccable untuk layar baru.
- Urutan task menjaga repo selalu compile: backend dulu (schema→services→api→agent), FE menyusul, cleanup terakhir.

---

### Task 1: Skema — drop sections/builds/stage, dokumen di workspace

**Files:** `packages/db/src/schema/{workspaces,artifacts,documentAnnotations}.ts`; rename `sectionEditProposals.ts` → `documentEditProposals.ts`; delete `workspaceSections.ts`, `latexBuilds.ts`; update `schema/index.ts`, `workspaceCitationLinks.ts`; migrasi baru via `bun run db:generate`.

**Steps:**
- [ ] `workspaces`: hapus `stage` (+ `WORKSPACE_STAGES`); tambah `documentArtifactId` (nullable, FK artifacts, lazy) + `kindInfo` (jsonb nullable — bentuk per kind divalidasi di service; tipe TS discriminated union di `@aqsha/db`). `kind` tetap.
- [ ] `artifacts`: tambah `'typst'` ke enum `artifactType`.
- [ ] `document_annotations`: drop `sectionId`, `sourceFile`, `sourceLine`, `sourceVersion`; FK `workspaceId` tetap; anchor = `selectedText`+`page`+`rects`.
- [ ] `document_edit_proposals` (rename tabel + file): drop `sectionId`; partial unique satu `pending` per `workspaceId`.
- [ ] `workspace_citation_links`: drop `sectionId` (+ unique jadi `(workspaceId, citationId)` saja).
- [ ] Drop `workspace_sections`, `latex_builds`. `document_revisions` tetap.
- [ ] `bun run db:generate` → periksa SQL (drop-and-replace ok, branch unshipped) → `bun run db:migrate` → `bun --filter @aqsha/db test`.
- [ ] Commit: `feat(db): skema dokumen Typst tunggal — drop sections/builds/stage`.

### Task 2: `TypstCompileService` (CLI server) + parser diagnostik

**Files:** create `packages/services/src/typst/compile.service.ts`, `typst/diagnostics.ts`; reuse `latex/runner.ts` → pindah ke `typst/runner.ts`; test `packages/services/test/typst-compile.test.ts`.

**Interfaces:**
```ts
TypstCompileService.compile(input: { mainTyp: string; bib?: string }): Promise<
  | { ok: true; pdf: Uint8Array }
  | { ok: false; errors: { file: string; line: number; message: string; severity: "error" | "warning" }[] }
>
```
- [ ] Tulis `main.typ` (+ `refs.bib` bila ada) ke tmpdir; `typst compile main.typ out.pdf --font-path <dir font repo>` via `runSandboxed`; `AQSHA_TYPST_BIN ?? "typst"`; `XDG_CACHE_HOME` → dir cache persisten (paket `@preview`).
- [ ] `diagnostics.ts`: parse stderr typst (`error: … ┌─ main.typ:12:4`) → struktur errors. Tes fixture stderr nyata (sukses, error sintaks, error bib).
- [ ] Tes compile happy-path + error (auto-skip bila binary absen — pola pandoc Fase 8b).
- [ ] Commit: `feat(typst): compiler CLI server-side + parser diagnostik`.

### Task 3: `WorkspaceDocumentService` — get/save CAS + scaffold per kind

**Files:** create `packages/services/src/workspace-document.service.ts`, `typst/scaffold.ts`, `typst/cite-scan.ts` (sitasi `@key` / `#cite(<key>)`); test `workspace-document.test.ts`, `typst-scaffold.test.ts`.

**Interfaces:** (adaptasi `SectionLatexService` — CAS, revisi, usages)
```ts
getDocument(db, { ownerUserId, workspaceId }): Promise<{ artifactId; source; contentVersion } | null>
saveDocument(db, { ownerUserId, workspaceId, source, baseVersion, author }): Promise<
  | { status: "saved"; artifactId: string; contentVersion: number }
  | { status: "stale_write"; currentVersion: number }>
scaffoldTypstDocument(kind: WorkspaceKind, opts: { title?: string; authorName?: string; kindInfo?: WorkspaceKindInfo }): string  // pure
```
- [ ] `saveDocument`: lazy artifact create (`artifactType:'typst'`) + set `workspaces.documentArtifactId`; txn atomik text+version+revision(retention 20)+citation usages dari `cite-scan`; limit `TYPST_SOURCE_MAX_BYTES` (paritas 413).
- [ ] `scaffold.ts`: template per `kind` — `#set` minimal (font Inter/teks Indonesia), heading bab standar (skripsi: `= Pendahuluan` … `= Penutup`; artikel: struktur IMRaD), `#bibliography("refs.bib", style: …)` sesuai `workspace_citation_settings`. Thesis-family: **halaman judul** dari `kindInfo` terisi (judul — fallback generik, penulis, prodi/fakultas/universitas, tahun; field kosong dilewati). Konstruksi konservatif (kompatibel typst-hs/pandoc).
- [ ] `WorkspaceService.create` menerima `kindInfo` (validasi bentuk per kind) + memanggil scaffold (dokumen langsung ada); `update` kehilangan `stage`, menerima `kindInfo`.
- [ ] Tes: CAS stale_write, retention revisi, scaffold per kind compile hijau (skip tanpa binary).
- [ ] Commit: `feat(services): dokumen Typst tunggal ber-CAS + scaffold per kind`.

### Task 4: `DocumentProposalService` + `AnnotationService` retarget

**Files:** rename/adaptasi `latex/section-proposal.service.ts` → `typst/document-proposal.service.ts`; `annotation.service.ts` retarget; `latex/hunks.ts` → `typst/hunks.ts` (isi TIDAK berubah); tests adaptasi `section-proposal.test.ts` → `document-proposal.test.ts`, `annotation.test.ts`.

- [ ] `propose(db, { ownerUserId, workspaceId, edits?|fullSource, summary, respondsToAnnotationIds?, threadId })`: anchored search-replace (`applyProposalEdits` dipertahankan), dry-run `TypstCompileService.compile` (+ bib) sebelum persist `pending`; supersede pending lama.
- [ ] `accept`: paritas Fase 7 — guard versi → hunks → fast-path all-selected tanpa compile → subset sejati dry-run → `saveDocument` CAS (`author:'agent'`) → anotasi `resolved`. Union `accepted | stale | compile_error`.
- [ ] `AnnotationService`: create/list/update/mark-sent level workspace; hapus jalur synctex-inverse; simpan `selectedText`+`page`+`rects`.
- [ ] Tes: propose→accept penuh/parsial/stale/compile_error; anotasi CRUD.
- [ ] Commit: `feat(typst): proposal dokumen + anotasi level-workspace`.

### Task 5: Ekspor PDF/DOCX + hapus modul LaTeX

**Files:** create `typst/pdf-export.service.ts`, `typst/docx-export.service.ts` (adaptasi `docx-export.service.ts`); delete seluruh sisa `src/latex/` (`assembly`, `compile` tectonic, `build`, `synctex`, `section-synctex`, `section-latex`, `section.service`, `log-parser`, `docx-convert` jalur latex); update `src/index.ts`; tests.

- [ ] PDF: compile CLI → `StorageService` blob → signed URL (tanpa tabel build). DOCX: `pandoc -f typst --citeproc --bibliography=refs.bib -o out.docx` (`projectBib()` dipertahankan untuk komposisi bib).
- [ ] Hapus semua ekspor/impor latex dari barrel; `bun --filter @aqsha/services test` hijau (baseline fail tectonic hilang bersama modulnya — catat baseline baru).
- [ ] Commit: `feat(typst): ekspor PDF/DOCX + hapus pipeline LaTeX`.

### Task 6: API routes runtuh ke level workspace

**Files:** `apps/api/src/routes/workspaces.ts`; tests `apps/api/test/` adaptasi.

- [ ] Hapus semua `/sections/*` + `/workspaces/:id/compile|build` + folders legacy bila sudah tak dipakai.
- [ ] Tambah: `GET/PUT /workspaces/:id/document`; `GET /workspaces/:id/proposals`, `POST .../proposals/:pid/accept|reject`; `GET/POST/PATCH/DELETE` annotations + `mark-sent`; `POST /workspaces/:id/export/pdf|docx` (rate limit bucket `typst:compile`).
- [ ] `POST /workspaces` + `PATCH /workspaces/:id` menerima `kindInfo` (tanpa `stage`); list/detail menyertakan `kindInfo` (untuk prefill client-side). `bun run build:dist` + `bun --filter @aqsha/api typecheck` + test.
- [ ] Commit: `feat(api): endpoint dokumen/proposal/anotasi/ekspor level workspace`.

### Task 7: Agent tools + instruksi Typst

**Files:** `apps/agent/src/mastra/tools/{get-document-source,propose-document-edit}.ts` (rename+adaptasi), `tools/index.ts`, `instructions.ts`, `skills-inline.ts`.

- [ ] `get_document_source`: source utuh + `contentVersion` + anotasi terbuka (`selectedText`, note, page — tanpa `sourceLine`).
- [ ] `propose_document_edit`: `workspaceId` implisit dari scope thread proyek; kontrak edits/fullSource/summary/respondsToAnnotationIds tetap.
- [ ] Instruksi: menulis **Typst** (heading `=`, sitasi `@key`, JANGAN menulis preamble — dokumen sudah punya `#set` scaffold; body bab ditulis di bawah heading-nya). Verifikasi API Mastra vs `@mastra/core` terpasang.
- [ ] Commit: `feat(agent): tools dokumen Typst + instruksi sintaks`.

### Task 8: FE — typst worker (compile WASM incremental + diagnostik)

**Files:** create `apps/svelte/src/lib/features/document/typst/{worker.ts,client.ts,types.ts}`; font ttf/otf di `static/fonts/typst/` (konversi dari woff2 — `fonttools`/`woff2_decompress`; Typst tidak membaca woff2); deps `@myriaddreamin/typst.ts@0.7.0`, `@myriaddreamin/typst-ts-web-compiler@0.7.0`, `@myriaddreamin/typst-ts-renderer@0.7.0`.

- [ ] Worker: init compiler WASM (`?url` + `getModule`, sekali — guard HMR), `disableDefaultFontAssets()` + `loadFonts` lokal (subset text+math self-host), `withIncrementalServer` + `addSource('/main.typ', …)` per pesan `update` (debounce ~300 ms di client) → post `{ delta, diagnostics }`.
- [ ] `client.ts`: wrapper main-thread (SSR guard `browser`), API `update(source)`, event `onCompiled({delta, diagnostics})`; mapping diagnostik `range 'l:c-l:c'` → posisi CM6.
- [ ] Tes murni mapping diagnostik (`.test.ts` node); verifikasi manual worker via halaman dev.
- [ ] Commit: `feat(svelte): worker compile Typst WASM incremental + diagnostik`.

### Task 9: FE — `TypstPreview` + TOC overlay (navigasi)

**Files:** create `features/document/components/{TypstPreview.svelte,TocOverlay.svelte}`; `features/document/lib/outline.ts`.

- [ ] Preview: renderer session (`manipulateData({action:'merge', data: delta})`), render halaman (canvas/SVG per `retrievePagesInfo`, scroll container); semantics layer aktif (seleksi teks).
- [ ] `outline.ts`: heading level-1 via `compiler.query({selector: 'heading'})` di worker (fallback: parse regex `^= ` dari source) → `{ title, sourceLine, page }[]`.
- [ ] `TocOverlay`: tombol pembuka mengambang di preview; daftar bab; klik → scroll preview ke halaman heading + scroll editor ke barisnya (level-heading). Desain flat sesuai DESIGN.md.
- [ ] Commit: `feat(svelte): preview Typst multi-halaman + TOC overlay navigasi`.

### Task 10: FE — tab Editor (CM6 + vedivad) + autosave + API hooks

**Files:** create `features/document/components/TypstSourceEditor.svelte`, `features/document/lib/typst-editor.ts`; `features/document/api.ts` (hooks `useWorkspaceDocument`, `useSaveWorkspaceDocument`, mirror tipe union); reuse `AutosaveController` (pindah ke `features/document/lib/`); dep `@vedivad/codemirror-typst` (pinned exact).

- [ ] Editor CM6: extension vedivad `sync:"external"` (highlight+autocomplete+hover), lint dari diagnostik worker (`setDiagnostics`), `ExternalSync` annotation dipertahankan; buffer = source-of-truth; setiap perubahan → worker `update` + `AutosaveController.edit`.
- [ ] Verifikasi single-copy `@codemirror/state` (`bun pm ls`).
- [ ] Autosave → `PUT /workspaces/:id/document`; `stale_write` → banner muat ulang (pola lama).
- [ ] Tes controller (sudah ada) + tes rune baru `.svelte.test.ts` bila menambah state class.
- [ ] Commit: `feat(svelte): editor Typst CM6 + autosave CAS dokumen`.

### Task 11: FE — manajemen bab di TOC (tambah/reorder/rename/hapus)

**Files:** `features/document/lib/section-transforms.ts` (pure!) + test; `TocOverlay.svelte` interaksi.

**Interfaces:**
```ts
type HeadingBlock = { title: string; from: number; to: number }; // offset char blok bab
listHeadingBlocks(source: string): HeadingBlock[]
insertSection(source, afterIndex, title): string
moveSection(source, fromIndex, toIndex): string
renameSection(source, index, title): string
removeSection(source, index): string
```
- [ ] Transformasi = operasi teks atas blok antar heading level-1 (preamble sebelum heading pertama tidak tersentuh). Unit test menyeluruh (blok pertama/terakhir, dokumen tanpa heading, trailing newline).
- [ ] TOC: drag reorder (pola reorder existing), `+ bab`, menu rename/hapus (konfirmasi) → terapkan via editor transaction (`setDoc` ExternalSync TIDAK dipakai — ini edit user, harus memicu autosave).
- [ ] Commit: `feat(svelte): manajemen bab via TOC — transformasi teks murni`.

### Task 12: FE — `ProjectHomePage` baru + proposal/anotasi + routes cleanup

**Files:** rewrite `features/workspaces/pages/ProjectHomePage.svelte`; retarget `ProposalReviewCard`, `AnnotationQueuePanel`, `AnnotationComposerDialog`, hooks proposal/anotasi di `features/document/api.ts`; delete routes `sections/[sectionId]`, `preview`, komponen mati (`SectionEditorPage`, `SectionOutline`, `StageStepper`, `SectionPdfViewer`, `ProjectDocumentViewer`, `ProjectPreviewPage`, hooks compile/build/synctex); onboarding create-project tetap (scaffold di server).

- [ ] Layout: header (kembali, emoji+judul, menu `⋯` unduh PDF/DOCX + sheet Sumber/Detail) · split resizable: kiri Tabs **Chat | Editor** (default Chat; badge di tab Chat saat proposal pending) · kanan `TypstPreview` + TOC overlay. Narrow → mode bergantian chat/editor/preview.
- [ ] Anotasi: seleksi teks di preview → composer (note) → antrian → kirim ke Astra (mark-sent); `ProposalReviewCard` dirender di tab Editor (di atas editor, collapsible).
- [ ] Ekspor: menu unduh memanggil `POST export/pdf|docx` → signed URL; error compile server tampil sebagai toast + diagnostik.
- [ ] Skill impeccable untuk polish; typecheck baseline dijaga.
- [ ] Commit: `feat(svelte): halaman proyek dokumen-tunggal — tab chat/editor + preview`.

### Task 13: FE — halaman buat proyek `/app/projects/new` + sheet Detail kindInfo

**Files:** create route `apps/svelte/src/routes/app/(product)/projects/new/+page.svelte` + `features/workspaces/pages/NewProjectPage.svelte` + `features/workspaces/components/KindInfoFields.svelte`; update `features/workspaces/{api.ts,types.ts,labels.ts}` (mirror `WorkspaceKindInfo`, create/patch dengan `kindInfo`); update entry points (`AppSidebar.svelte`, index proyek) → `goto('/app/projects/new')`; update sheet Detail (`ProjectHeader.svelte`) edit kindInfo + pedoman; delete `NewProjectDialog*` .

- [ ] Tahap pilih kind (tanpa `?kind`): grid kartu `WORKSPACE_KINDS` (label + deskripsi singkat + ikon); klik → `goto('?kind=<k>')`. `?kind` invalid → fallback pemilih.
- [ ] Tahap form (`?kind=<valid>`): field per matrix spec keputusan 15 — semua opsional (judul, topik, tenggat; akademik/jurnal/paper sesuai kind; upload pedoman PDF untuk thesis-family). Prefill dari proyek se-kind terbaru di cache list (kecuali pedoman). Tombol "Buat proyek" selalu aktif.
- [ ] Submit: `create({ kind, kindInfo, name?, topicNote?, deadline? })` → bila ada file pedoman: upload artifact + link ke workspace (best-effort — gagal ≠ batal; toast arahkan ke Detail) → `goto` proyek. Rate-limit union ditangani inline (paritas dialog lama).
- [ ] Sheet Detail: render + edit `kindInfo` sesuai kind (`KindInfoFields` dipakai ulang) + unggah/ganti pedoman.
- [ ] Hapus `NewProjectDialogContent.svelte`/`NewProjectDialog.svelte` + semua pemakaiannya. Desain flat sesuai DESIGN.md (skill impeccable); copy sentence case.
- [ ] Commit: `feat(svelte): halaman buat proyek per-kind + kindInfo di sheet detail`.

### Task 14: Cleanup akhir + verifikasi menyeluruh

- [ ] Grep sisa `latex|tectonic|synctex|section` mati di seluruh repo; hapus deps yang tak terpakai (`@codemirror/legacy-modes` stex, pdfjs bila tak ada pemakai lain — cek Citation Manager/explore tetap pakai); env `.env.example` ganti `AQSHA_TECTONIC_BIN` → `AQSHA_TYPST_BIN`.
- [ ] `bun run typecheck` (baseline), `bun run test`, `bun run build`.
- [ ] Update `docs/architecture` yang menyebut pipeline LaTeX; entri changelog per `docs/product/versioning-and-changelog.md` (user-facing).
- [ ] Verifikasi browser e2e (claude-in-chrome): klik `+` → pemilih kind → form info (prefill bila ada) → buat proyek (scaffold + halaman judul tampil di preview) → ketik di editor → preview berubah realtime → TOC nav/tambah/reorder → anotasi → minta Astra → proposal per-hunk accept → unduh PDF/DOCX. Infra dev: MinIO + Postgres (compose/Tailscale sesuai environment aktif).
- [ ] Commit: `chore(typst): cleanup jalur LaTeX + verifikasi fase 9`.
