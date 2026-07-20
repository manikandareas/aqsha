# Research-first Fase 9: Redesign Typst dokumen-tunggal — desain

Status: brainstorm disepakati 2026-07-20 (grill-me, semua keputusan terkunci).
Scope: `packages/db` + `packages/services` + `apps/api` + `apps/agent` + `apps/svelte`.
Rujukan: master spec `2026-07-17-research-first-repositioning-design.md`, Fase 6
`2026-07-18-research-first-phase6-pdf-annotation-agent-loop-design.md`, Fase 7
`2026-07-19-research-first-phase7-per-hunk-diff-review-design.md`, plan Fase 7b+8b
`2026-07-19-research-first-phase7b-8b-editor-and-docx-export.md`.

## Masalah yang diselesaikan

1. **LaTeX terlalu berat**: sintaksnya sulit bagi mahasiswa, dan compile Tectonic server-side
   (round-trip API + R2) tidak pernah terasa realtime.
2. **UI terlalu granular**: status per bab (empty/draft/in_review/done), stage workspace,
   dokumen terpecah ke halaman per-section, tombol compile manual + badge stale — user
   overwhelmed; hierarki halaman tidak tersusun berdasarkan kepentingan.

Konteks penting: branch `feat/apps-svelte-migration` belum pernah di-merge/shipped —
**tidak ada data produksi**. Ini kesempatan mengganti fondasi tanpa migrasi data.

## Tujuan

Satu proyek = **satu dokumen Typst kontinu** yang disunting di satu editor dengan preview
realtime (compile WASM di browser), dinavigasi lewat TOC overlay, dan tetap punya loop
Astra penuh (anotasi di preview → proposal diff → review per-hunk). Konsep compile, status
bab, dan stage hilang dari hadapan user.

## Keputusan desain (hasil grilling)

1. **Typst menggantikan LaTeX total.** Jalur Tectonic/SyncTeX/stex/biblatex dihapus.
   Tanpa migrasi data (belum shipped); data dev lama dibiarkan mati bersama tabelnya.
2. **Compile hybrid.** Preview realtime = typst.ts WASM di browser (Web Worker, recompile
   incremental debounced per ketukan). Build "resmi" = CLI `typst` di server via
   `runSandboxed` — dipakai untuk ekspor PDF/DOCX dan dry-run compile proposal Astra.
   Server tidak pernah dibutuhkan untuk preview.
3. **Satu buffer kontinu.** Seluruh dokumen dalam satu source Typst (satu artifact,
   `artifactType='typst'`, `language='typst'`); bab hanyalah heading level-1 (`= Bab N`).
4. **Sections derived dari heading.** Tabel `workspace_sections` DIHAPUS. TOC/outline
   dibangun dari parse source (client: typst.ts `query`; agent cukup membaca source).
   Tidak ada dua sumber kebenaran yang bisa desync.
5. **Status & stage dihapus; `kind` bertahan.** Status section mati bersama tabelnya;
   kolom `workspaces.stage` + `StageStepper.svelte` dihapus. `kind` dipertahankan karena
   fungsional: memilih template scaffold Typst saat proyek dibuat.
6. **Layout: pane kiri = tab Chat | Editor (default Chat), pane kanan = preview persisten.**
   Sheet Sumber/Detail tetap sekunder. Route `sections/[sectionId]` dan `preview` dihapus —
   satu halaman `/app/projects/[projectId]`.
7. **TOC overlay di preview = rumah tunggal manajemen bab.** Klik = navigasi; drag =
   reorder blok teks antar heading; `+` = sisip heading + template; menu per-item =
   rename/hapus. Semua operasi = transformasi teks source (editor transaction), bukan
   operasi DB. User tetap bebas mengetik heading manual; TOC mengikuti.
8. **Konsep compile hilang dari UI.** Tidak ada tombol compile/badge stale. Build server
   berjalan implisit saat ekspor dan dry-run proposal. Error Typst tampil inline di editor
   (diagnostik WASM terstruktur `path/severity/line:col/message` → CM6 lint).
9. **Anotasi + proposal per-hunk dipertahankan, retarget ke dokumen.** Loop "tandai di
   preview → kirim ke Astra → review diff → terima per-hunk" utuh. Diff review dirender di
   tab Editor; anotasi dibuat dari seleksi teks di preview.
10. **Source mapping level-heading; presisi per-baris ditunda.** typst.ts stock TIDAK
    mengekspos span→baris maupun kursor→koordinat (hasil riset — hanya span-id hex).
    Konsekuensi: lompatan editor↔preview bekerja per-heading via `compiler.query()`;
    anotasi di-anchor pakai `selectedText` (kutipan persis), BUKAN nomor baris — dan loop
    Astra memang sudah berbasis kutipan (`edits.oldText`), jadi tidak terdegradasi.
    Future work: PR binding wasm upstream (~50 baris Rust) untuk presisi SyncTeX-like.
11. **Stack editor: engine `@myriaddreamin/typst.ts` 0.7.0 (kita kontrol worker/debounce/
    renderer) + `@vedivad/codemirror-typst` untuk extension CM6** (highlight + diagnostik
    + autocomplete/hover via typst-ide; mode `sync: "external"`). Risiko vedivad (single
    maintainer) terlokalisasi di lapisan editor yang mudah diganti; engine inti typst.ts
    adalah de-facto standard (author tinymist, rilis aktif Jun 2026).
12. **DOCX via `pandoc -f typst --citeproc -o out.docx`** — terverifikasi hands-on di
    pandoc 3.10 lokal (heading, tabel, math→OMML, footnote, sitasi `@key` +
    `#bibliography("refs.bib")` → daftar pustaka ter-render). Batasan: styling halaman
    hilang (pakai `--reference-doc` bila perlu), locator/supplement sitasi drop.
13. **Scaffold saat create project.** `kind` men-generate source Typst awal (preamble
    `#set` minimal + heading bab standar skripsi/artikel + `#bibliography` bila relevan)
    sehingga preview tidak kosong meski tab default Chat. Untuk thesis-family, scaffold
    juga menyertakan **halaman judul** dari `kindInfo` yang terisi (judul — fallback
    generik, nama penulis dari profil user, prodi/fakultas/universitas, tahun); field
    kosong dilewati rapi. Tanpa logo/NIM (tidak dikumpulkan).
14. **Alur create = halaman penuh, bukan dialog.** Semua tombol `+` proyek → route
    `/app/projects/new`: tanpa query = pemilih kind (grid kartu per `WORKSPACE_KINDS`);
    dengan `?kind=<valid>` = form info kind itu (back browser natural, kind invalid →
    fallback pemilih). `NewProjectDialogContent`/`NewProjectDialog` DIHAPUS.
15. **Info per-kind di jsonb `workspaces.kindInfo`** (discriminated union per kind di
    TypeScript). Matrix — semua field OPSIONAL, hanya kind yang wajib:
    - Semua kind: judul, topik kasar (`topicNote` existing), tenggat (`deadline` existing).
    - Skripsi/tesis/disertasi/proposal: + `university`, `faculty`, `studyProgram`,
      + pedoman universitas (upload PDF).
    - Artikel jurnal: + `targetJournal`, `affiliation`.
    - Paper: + `university`, `courseOrVenue`. Freeform: tanpa tambahan.
    Form di-**prefill** dari proyek se-kind terakhir milik user (field pedoman tidak
    di-prefill). `kindInfo` bisa diedit setelah create di sheet Detail proyek
    (termasuk unggah/ganti pedoman); dosen pembimbing sengaja belum dikumpulkan.
16. **Pedoman universitas = upload PDF opsional → artifact terhubung proyek** (pipeline
    upload artifact existing), otomatis muncul di Sumber proyek sehingga terbaca Astra.
    Urutan submit: create workspace dulu → upload PDF → link ke workspace → navigasi ke
    proyek (upload gagal ≠ create gagal — proyek tetap jadi, toast tawarkan ulang di
    Detail). Auto-generate template dari pedoman = luar scope.

## Data model (migrasi baru, drop-and-replace)

- **DROP**: `workspace_sections`, `latex_builds` (build tidak lagi dipersist — ekspor
  menghasilkan blob on-demand; dry-run proposal tidak butuh persist), kolom
  `workspaces.stage`.
- **`workspaces`**: + `documentArtifactId` (nullable, lazy — dibuat saat scaffold/tulis
  pertama; pola sama dengan `workspace_sections.documentArtifactId` lama); +
  `kindInfo` (jsonb nullable — bentuk per kind, keputusan 15; validasi bentuk di
  service, bukan CHECK).
- **`artifacts`**: + `artifactType` `'typst'` (CHECK constraint diperbarui); source
  dokumen tetap teks inline di `artifact_contents.plainText` + `contentVersion` CAS.
- **`document_revisions`**: tetap (menempel di artifact; retention 20).
- **`document_annotations`**: drop `sectionId`, `sourceFile`, `sourceLine`,
  `sourceVersion`; anchor = `selectedText` (+ `page`, `rects` untuk render overlay).
  Status enum tetap (`open/sent/resolved/dismissed`).
- **`section_edit_proposals` → `document_edit_proposals`**: drop `sectionId`; scope =
  `workspaceId`; partial unique = maksimal satu `pending` per workspace. Kolom lain tetap
  (`baseVersion`, `proposedSource`, `summary`, `annotationIds`, `status`, `threadId`).
- **`workspace_citation_links`**: drop `sectionId` (semua link level proyek).
- Karena drop-and-replace di branch unshipped, migrasi ditulis sebagai satu file migrasi
  baru (lanjut penomoran); data dev lama tidak dimigrasikan.

## Services (`packages/services`)

Modul `src/latex/` DIHAPUS dan digantikan `src/typst/`:

- **`typst/compile.service.ts`** — `TypstCompileService.compile({ mainTyp, bib, fonts })`:
  tulis `main.typ` + `refs.bib` ke tmpdir, jalankan `typst compile` via `runSandboxed`
  (binary `AQSHA_TYPST_BIN ?? "typst"`, `--font-path` ke dir font repo). Output
  `{ ok, pdf } | { ok:false, errors: {file,line,message,severity}[] }` (parse stderr
  diagnostik typst). `runner.ts` (runSandboxed) dipakai ulang apa adanya.
  Catatan paket `@preview`: scaffold v1 hanya memakai built-ins; bila user menambah
  import `@preview`, CLI men-download ke cache (`XDG_CACHE_HOME` diarahkan ke dir
  persisten) — kegagalan network di sandbox muncul sebagai compile error biasa.
- **`workspace-document.service.ts`** — adaptasi `SectionLatexService`:
  `getDocument` / `saveDocument` CAS (`baseVersion` → union `stale_write`), lazy artifact
  create, txn atomik (text + version + revision + citation usages dari scan `@key`/
  `#cite`), `scaffoldTypstDocument(kind, { title, authorName, kindInfo })` untuk create
  project (halaman judul thesis-family, keputusan 13). `WorkspaceService.create/update`
  menerima + memvalidasi bentuk `kindInfo` per kind.
- **`document-proposal.service.ts`** — adaptasi `SectionProposalService`:
  `propose` (anchored `edits` oldText→newText ATAU `fullSource`; dry-run compile CLI
  sebelum persist `pending`), `accept` (utuh atau `acceptedHunkIndexes`; subset sejati →
  dry-run compile ulang; fast-path all-selected tanpa compile), `reject`, `getPending`
  (+`hunks` dari `computeProposalHunks` — `hunks.ts` dipertahankan apa adanya, diff
  teks murni).
- **`annotation.service.ts`** — retarget workspace-level; hapus jalur SyncTeX inverse
  saat create (tidak ada lagi pemetaan baris); simpan `selectedText` + `page` + `rects`.
- **`typst/docx-export.service.ts`** — `pandoc -f typst --citeproc` atas source +
  `refs.bib` (komposisi bib dari linked citations dipertahankan dari `projectBib()`);
  blob via `StorageService`, signed URL.
- **`typst/pdf-export.service.ts`** — compile CLI → blob → signed URL (pengganti unduhan
  PDF; tidak ada tabel build).
- **DIHAPUS**: `assembly.service.ts` (tidak ada assembly — source user = dokumen utuh),
  `synctex.ts`, `section-synctex.service.ts`, `section.service.ts`, `build.service.ts`,
  `section-latex.service.ts`, `docx-convert.ts` jalur latex, `log-parser.ts` (diganti
  parser diagnostik typst), `cite-scan.ts` disesuaikan ke sintaks sitasi Typst.

## API (`apps/api/src/routes/workspaces.ts`)

Route `/sections/*` dan `/workspaces/:id/compile|build` DIHAPUS. Bentuk baru:

- `GET/PUT /workspaces/:id/document` — get/autosave CAS.
- `GET /workspaces/:id/proposals` · `POST /workspaces/:id/proposals/:pid/accept`
  (body opsional `acceptedHunkIndexes`) · `POST .../reject`.
- `GET/POST /workspaces/:id/annotations` · `PATCH/DELETE .../annotations/:aid` ·
  `POST .../annotations/mark-sent`.
- `POST /workspaces/:id/export/docx` · `POST /workspaces/:id/export/pdf` — rate limit
  bucket `typst:compile` (pengganti `latex:compile`).
- `PATCH /workspaces/:id` kehilangan `stage`, menerima `kindInfo` (bentuk divalidasi
  service sesuai kind). `POST /workspaces` menerima `kindInfo`; respons list/detail
  menyertakan `kindInfo` (prefill dihitung client-side dari list yang sudah di-cache:
  proyek se-kind terbaru).

## Agent (`apps/agent`)

- `get_section_source` → **`get_document_source`**: source dokumen utuh + `contentVersion`
  + anotasi terbuka (`selectedText` + note; tanpa `sourceLine`).
- `propose_section_edit` → **`propose_document_edit`**: `workspaceId` scope; `edits`
  anchored / `fullSource`; validasi dry-run compile Typst di server.
- `instructions.ts` + `skills-inline.ts`: panduan menulis **Typst** (bukan LaTeX) —
  heading `=`, sitasi `@key`, tanpa preamble ganda (dokumen sudah punya `#set` scaffold).

## FE (`apps/svelte`)

- **`ProjectHomePage`** baru: header (emoji/judul + menu unduh PDF/DOCX + sheet
  Sumber/Detail), split resizable: kiri = Tabs `Chat | Editor` (default **Chat**), kanan =
  `TypstPreview` persisten. Sheet Detail menampilkan + mengedit `kindInfo` sesuai kind
  (termasuk unggah/ganti pedoman).
- **Halaman `/app/projects/new`** (keputusan 14–16): pemilih kind (grid kartu, deskripsi
  singkat per kind) → form info per-kind (prefill se-kind terakhir; upload pedoman;
  semua opsional) → submit: create → upload pedoman (best-effort) → goto proyek.
  Semua entry point `+` (sidebar, index proyek) diarahkan ke sini; dialog lama dihapus.
- **`lib/features/document/typst-worker.ts`**: Web Worker memuat compiler+renderer WASM
  (`?url` + `getModule`, SSR guard, HMR-once init), font di-preload dari
  `static/fonts` (**woff2 dikonversi ttf/otf** — Typst tidak membaca woff2), recompile
  incremental debounced (~300 ms) → delta artifact + diagnostik ke main thread.
- **`TypstPreview.svelte`**: render multi-halaman (renderer session + `manipulateData`
  merge delta; `retrievePagesInfo` untuk layout halaman), seleksi teks via semantics
  layer → anotasi (`selectedText` + rects), **TOC overlay** (outline dari `query`
  heading): klik → scroll preview + scroll editor ke heading (level-heading), drag
  reorder / tambah / rename / hapus → transformasi teks di buffer editor.
- **Tab Editor**: CM6 + `@vedivad/codemirror-typst` (`sync:"external"`), highlight +
  autocomplete/hover + lint dari diagnostik worker; `AutosaveController` dipakai ulang
  (CAS `stale_write` → banner muat ulang); `ProposalReviewCard` level-dokumen dirender
  di tab ini (mode diff per-hunk, perilaku Fase 7 utuh).
- **Anotasi**: `AnnotationQueuePanel`/`AnnotationComposerDialog` diretarget; badge di tab
  Chat saat proposal masuk.
- Hapus: `SectionEditorPage`, `ProjectPreviewPage`, `SectionOutline`, `StageStepper`,
  `SectionPdfViewer` + turunan pdfjs untuk dokumen (pdfjs tetap dipakai fitur lain),
  hooks compile/build/synctex.

## Batasan & risiko yang diterima

- Lompatan editor↔preview hanya presisi level-heading (keputusan 10).
- `@vedivad/codemirror-typst` muda/single-maintainer — dipin, dan hanya menyentuh lapisan
  extension editor.
- WASM compiler ~7.6 MB gz + font — dimuat lazy hanya di halaman proyek, di Web Worker.
- DOCX best-effort (paritas batasan LaTeX→DOCX sebelumnya, kini lebih baik: math→OMML).
- typst-hs (pandoc) tertinggal dari compiler Typst terbaru — fitur bahasa paling baru
  bisa gagal dikonversi; scaffold memakai konstruksi konservatif.

## Luar scope

- Presisi span→baris (PR upstream typst.ts).
- Template per-kampus / gaya halaman DOCX (`--reference-doc`).
- Kolaborasi multi-user / CRDT.
- Provisioning binary `typst` + font di image prod (paritas catatan pandoc Fase 8b).
