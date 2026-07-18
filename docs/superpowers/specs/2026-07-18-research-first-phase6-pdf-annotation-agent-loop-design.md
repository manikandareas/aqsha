# Research-first Fase 6: viewer PDF + lapisan anotasi + loop editing agen — desain

Status: brainstorm disepakati 2026-07-18.
Scope: `apps/svelte` + `packages/db` + `packages/services` + `apps/api` + `apps/agent`.
Satu spec, **satu plan implementasi menyeluruh** yang dieksekusi menerus dalam dua tahap
internal: **6a** (viewer PDF + anotasi + compile UX) lalu **6b** (loop editing agen).
Milestone akhir tahap 6a tetap verifiable sendiri.
Rujukan: master spec `2026-07-17-research-first-repositioning-design.md`, pivot
`2026-07-18-research-first-phase4-latex-foundation-design.md`, gate report
`2026-07-18-research-first-phase4-latex-gate-report.md`, Fase 5
`2026-07-18-research-first-phase5-latex-document-model-design.md`.

## Tujuan

Menghidupkan UX inti agen-first di halaman bab: PDF ter-render (build per-bab Fase 5) sebagai
surface utama, lapisan anotasi (seleksi teks + pin) yang ter-map ke sumber LaTeX via SyncTeX,
antrian anotasi yang dikirim ke Astra lewat thread chat scoped, dan loop editing agen — Astra
membaca sumber, mengajukan suntingan tervalidasi compile (self-repair sebelum diajukan), user
Terima/Tolak, compile resmi menyusul. Ditambah preview full-document minimal.

## Keputusan desain (hasil brainstorm)

1. **Satu spec, satu plan menyeluruh bertahap 6a→6b** (revisi user saat review: implementasi
   Fase 6 dijalankan langsung keseluruhan). Kontrak anotasi↔agen didesain utuh di sini; tahap
   6a punya milestone verifikasi sendiri sebelum masuk 6b.
2. **Anchor anotasi = seleksi teks + pin titik.** Highlight seleksi (butuh text layer PDF.js;
   presisi frasa — konteks terbaik untuk Astra) dan pin bebas untuk area non-teks
   (gambar/persamaan). Tanpa region/kotak.
3. **Jalur ke agen = thread chat scoped yang sudah ada.** Antrian anotasi menempel ke composer
   sebagai chip konteks (pola selectionRefs); Astra membalas di thread + memanggil tool yang
   menghasilkan proposal; reuse penuh streaming/memory/riwayat. Tanpa loop headless terpisah.
4. **Anotasi persisten di DB + lifecycle** (`open → sent → resolved | dismissed`): tahan reload,
   agen & user melihat antrian yang sama, riwayat instruksi terjaga; basi terdeteksi via versi.
5. **Suntingan agen = proposal gated + pre-validate.** Tool agen mengajukan sumber baru →
   server dry-run compile (assembly dengan sumber usulan, tanpa menyimpan) → agen self-repair
   sampai bersih → hanya proposal tervalidasi yang dipersist → user Terima/Tolak → Terima =
   `saveDocument(author:'agent')` CAS → compile resmi. User tidak pernah disodori diff yang
   merusak build.
6. **Preview full-document minimal masuk 6a**: viewer yang sama tanpa anotasi + compile full
   (endpoint workspace Fase 5).
7. **Proposal disimpan di tabel domain** (`section_edit_proposals`), bukan message-part:
   lifecycle jelas, tahan reload, stale terdeteksi (baseVersion vs contentVersion), audit jelas.
   Kartu-di-thread yang menunjuk proposalId bisa menyusul.
8. **Granularitas review Fase 6 = whole-proposal** (Terima/Tolak seluruh proposal, diff
   read-only). Per-hunk Accept/Reject = Fase 7 (rumahnya editor).

## Arsitektur — halaman bab (6a)

Route `/app/projects/[id]/sections/[sid]` mengganti stub `SectionEditorPage`:

- **Tengah: `SectionPdfViewer` (komponen baru).** Merender build per-bab dari
  `GET …/sections/:sid/build` (`pdfUrl` signed). Pola pdfjs-dist 5.4 existing (dynamic import
  di belakang `browser` guard, `GlobalWorkerOptions.workerSrc` via `new URL(…)`, canvas lazy
  per halaman ala `PdfPageCanvas`) **plus dua lapisan baru**: **text layer** (seleksi teks) dan
  **overlay anotasi** (marker highlight/pin, diposisikan via transform viewport per halaman).
  `PdfArtifactViewer` (Citation Manager) tidak disentuh — kebutuhan beda jauh, komponen sendiri.
- **Interaksi anotasi**: seleksi teks → popover "Tambah anotasi" → catatan opsional → highlight.
  Mode pin: klik area non-teks → pin + catatan. Marker anotasi `open`/`sent` tampil di overlay;
  klik marker ↔ fokus item antrian.
- **Panel kanan**: `ProjectSidePanel` existing (tab chat + sources) tetap; antrian anotasi
  `open` tampil sebagai chip di atas composer — user memilih anotasi yang diikutkan, menulis
  instruksi, kirim (detail alur di 6b).
- **Preview full-document**: route `/app/projects/[id]/preview` dari rumah proyek — viewer sama
  tanpa lapisan anotasi + tombol compile full-document.

### Pemetaan SyncTeX

- **Saat create anotasi**, server memetakan anchor PDF → `sections/<sectionId>.tex` + baris via
  `synctexInverseLookup` (synctex build per-bab diambil dari R2 → `parseSynctex` → cache
  in-memory per build; koordinat klien dikonversi PDF point → sp). Pemetaan terjadi **sekali**
  dan tersimpan di row anotasi. Tidak ada endpoint lookup terpisah — internal
  `AnnotationService.create`.
- **Ekstensi services**: `synctexForwardLookup(data, { file, line })` → posisi PDF (inverse
  sudah ada di `packages/services/src/latex/synctex.ts`; forward dibangun dari `records` yang
  sama). Dipakai untuk **re-anchor best-effort**: marker dari build lama dirender ulang di build
  baru lewat forward lookup atas (file, baris) tersimpan. Baris yang bergeser jauh oleh
  suntingan → anotasi ditandai basi di daftar (dim), bukan salah tempat; remap presisi berbasis
  diff = luar scope.
- Synctex **tetap dikonsumsi server-side** (keputusan Fase 5); `synctex_r2_key` tidak di-expose
  sebagai URL publik.

### Compile UX (menjalankan aturan latensi Fase 5)

- Buka halaman = baca build tersimpan (tanpa compile saat load). Build tidak ada / basi
  (banding `latex_builds.source_versions[sectionId]` vs `contentVersion` dokumen) →
  auto-compile.
- Tombol "Compile ulang" manual; PDF lama tetap tampil + indikator basi; build baru swap
  in-place dengan posisi scroll dipertahankan; satu compile in-flight per scope, trigger
  beruntun coalesce (yang terakhir menang).
- Build `status:'error'` → panel error menampilkan `errors[]` (line+pesan) + `logTail`
  collapsible + quick action "Minta Astra perbaiki" (6b).
- Hooks baru `apps/svelte/src/lib/features/sections/api.ts`: `useSectionBuild`,
  `useCompileSection`, `useWorkspaceBuild`, `useCompileWorkspace` (+ queryKeys), di atas
  endpoint compile/build Fase 5.

## Data model & migrasi (Drizzle, tanpa backfill)

### `document_annotations` — tabel baru

- `id` text PK, `owner_user_id` FK, `workspace_id` FK (cascade), `section_id` FK (cascade),
  `kind` text CHECK (`highlight | pin`), `page` integer, `rects` jsonb (kotak ternormalisasi
  ruang-PDF; pin = satu titik), `selected_text` text nullable, `note` text nullable,
  `source_file` text nullable + `source_line` integer nullable (hasil inverse SyncTeX saat
  create; null bila tak ter-map), `source_version` integer (contentVersion saat create — dasar
  deteksi basi), `status` text CHECK (`open | sent | resolved | dismissed`) default `open`,
  `thread_id` text nullable + `message_id` text nullable (diisi saat `sent`),
  `created_at` / `updated_at` bigint.
- Anchor tak ter-map **bukan** kegagalan: `selected_text` + `note` tetap konteks cukup bagi
  agen; anotasi dibuat dengan `source_line` null.

### `section_edit_proposals` — tabel baru

- `id` text PK, `owner_user_id` FK, `workspace_id` FK (cascade), `section_id` FK (cascade),
  `thread_id` text nullable, `base_version` integer (CAS base = contentVersion saat agen
  membaca), `proposed_source` text (hasil akhir tervalidasi compile), `summary` text
  (penjelasan agen), `annotation_ids` jsonb (anotasi yang dijawab → auto-resolve saat accept),
  `status` text CHECK (`pending | accepted | rejected | superseded`) default `pending`,
  `created_at` bigint, `decided_at` bigint nullable.
- **Partial unique: satu `pending` per section** — proposal baru men-supersede pending lama
  (status lama → `superseded`).

## Services

Satu implementasi di `packages/services`, dipanggil route API **dan** tool agen (konvensi repo;
modul latex tetap subpath `@aqsha/services/latex`, di luar barrel root — deviasi #4 gate).

### `AnnotationService`

- `create(db, { ownerUserId, sectionId, kind, page, rects, selectedText?, note? })` — validasi
  section + build tersimpan; inverse-map SyncTeX (cache parse per build); simpan row.
- `list(db, { ownerUserId, sectionId })` — antrian + marker (dengan status).
- `update(db, …)` (note, status `dismissed`/reopen), `remove(db, …)`.
- `markSent(db, { ids, threadId, messageId })` — dipanggil saat pesan berisi anotasi terkirim.

### `SectionProposalService`

- `propose(db, { ownerUserId, sectionId, edits | fullSource, summary, respondsToAnnotationIds?, threadId? })`:
  muat source terkini → apply `edits` (search-replace anchored, match wajib unik; ambigu/tak
  ketemu = union gagal dengan pesan jelas) → **dry-run compile**: assembly per-bab dengan
  sumber usulan disubstitusi → `LatexCompileService.compile`, **tanpa menyimpan** build/source →
  - error compile → union `{ ok:false, compileErrors }` — **tidak ada** row proposal;
  - bersih → supersede pending lama, insert proposal `pending`, union
    `{ ok:true, proposalId, summary }`.
- `accept(db, { ownerUserId, proposalId })` — **satu transaksi**: guard `pending` →
  `saveDocument(author:'agent', baseVersion=base_version, source=proposed_source)` (CAS Fase 5)
  → sukses: status `accepted` + `decided_at` + resolve anotasi `annotation_ids`; CAS
  `stale_write` (user menyimpan versi lain setelah proposal dibuat) → status `superseded`,
  union `{ status:'stale', currentVersion }`. **Tidak pernah menimpa.**
- `reject(db, { ownerUserId, proposalId })` — status `rejected` + `decided_at`.
- `getPending(db, { ownerUserId, sectionId })` — proposal pending + basis diff.

## API (`apps/api`, pola route workspaces Fase 5)

- `GET  …/sections/:sid/annotations` / `POST …/sections/:sid/annotations`
- `PATCH …/sections/:sid/annotations/:aid` / `DELETE …/sections/:sid/annotations/:aid`
- `POST …/sections/:sid/annotations/mark-sent` `{ ids, threadId, messageId }` — batch
  `markSent` (klien memanggil setelah pesan berisi anotasi terkirim via proxy Mastra; pesan
  tidak lewat API kita, jadi penandaan `sent` butuh jalur sendiri)
- `GET  …/sections/:sid/proposals` — pending terkini (+ riwayat ringkas)
- `POST …/sections/:sid/proposals/:pid/accept` — union
  `{ status:'accepted', contentVersion } | { status:'stale', currentVersion }`
- `POST …/sections/:sid/proposals/:pid/reject`

Endpoint compile/build sudah ada dari Fase 5 (rate limit `latex:compile`). `propose` **tidak**
di-expose sebagai endpoint HTTP publik — hanya dipanggil tool agen (author `agent` tidak pernah
dari input HTTP, aturan Fase 5).

## Loop editing agen (6b)

### Tool Mastra baru (`apps/agent/src/mastra/tools/`, bucket `astraTools`)

Verifikasi API vs `@mastra/core` terpasang sebelum implementasi (aturan repo). Owner dari
RequestContext (`callerId`); `sectionId` = input tool (tidak menambah context key server-owned).

- **`get_section_source`** (READ) — input `{ sectionId }`; return
  `{ source, contentVersion, sectionTitle, openAnnotations[] }` (anotasi: id + teks terseleksi +
  baris sumber + catatan — agen tahu persis bagian yang dimaksud).
- **`propose_section_edit`** (WRITE) — input
  `{ sectionId, edits: [{oldText, newText}] | fullSource, summary, respondsToAnnotationIds? }`.
  `edits` untuk suntingan terarah; `fullSource` untuk draf bab kosong ("Tulis dengan Astra" dari
  rumah proyek — loop sama, base kosong). Delegasi ke `SectionProposalService.propose`; union
  `{ ok:false, compileErrors }` → agen membaca `errors[]` (line+pesan) dan memanggil ulang
  dengan perbaikan — **ini loop self-repair-nya**, dibatasi `maxSteps` agen + rate limit
  `latex:compile` di jalur tool.

### Alur di thread

1. User memilih anotasi (chip) + menulis instruksi → `ThreadAgent.send` dengan `clientContext`
   (seam existing di `thread-agent.svelte.ts`) berisi payload terstruktur: sectionId, judul bab,
   anotasi terpilih (id + teks + baris + catatan). Anotasi terkirim → `markSent`.
2. Instruksi sistem agen (skill/prompt Astra) mengarahkan: `get_section_source` → susun
   suntingan → `propose_section_edit` → jelaskan ringkas di balasan. Tool-call streaming tampil
   via pola ToolRow existing.
3. Pesan selesai → invalidate query proposals → **kartu proposal** muncul di halaman bab.
4. **UI review diff (whole-proposal)**: panel diff read-only (unified line-diff via lib `diff`;
   tanpa CodeMirror) source tersimpan vs `proposed_source` + ringkasan agen + tombol
   **Terima / Tolak**. Terima → accept endpoint → compile resmi otomatis → PDF swap in-place;
   anotasi terjawab resolve. Tolak → `rejected`; anotasi kembali `open`.
5. **Quick action "Minta Astra perbaiki"**: build tersimpan `status:'error'` → panel error +
   tombol yang mengirim `errors[]` sebagai konteks ke thread — masuk loop yang sama.

Seam lama `request_document_edit` / `onRequestDocumentEdit` (markdown-only, sengaja unwired)
**tidak dipakai** — jalur LaTeX memakai tool baru di atas; seam lama dibiarkan.

## Error handling (konvensi repo)

- **Union hasil produk**: accept `{ status:'stale' }`; tool/propose `{ ok:false, compileErrors }`;
  apply edits ambigu/tak-ketemu = union gagal dengan pesan actionable untuk agen; save
  `stale_write` (Fase 5).
- **`throwAppError` terminal**: `annotation_not_found`, `proposal_not_found`,
  `proposal_not_pending`, reuse `section_not_found` / `bibliography_not_editable`, pass-through
  infra compile (`latex_compile_timeout` / `latex_bundle_missing` / …). Frontend:
  `readableApiErrorMessage`.
- `CompileError.line` menunjuk baris file yang sedang diproses TeX (assembled `main.tex` /
  `sections/<id>.tex`), belum teratribusi presisi ke file bab oleh parser — tampilkan apa
  adanya; atribusi presisi = Fase 7.

## Testing (pola repo; DB-test gated `DATABASE_URL`)

- **Unit**: `synctexForwardLookup` (fixture gate existing); apply edits (match unik, gagal saat
  ambigu/tak-ketemu); supersede pending; auto-resolve annotation_ids; konversi koordinat
  PDF point ↔ sp.
- **Integrasi**: create annotation → inverse-map benar ke `sections/<sectionId>.tex`; anchor
  tak ter-map → row dengan `source_line` null; propose dry-run **tidak** menulis build/source;
  accept → CAS + revisi `author:'agent'` + resolve anotasi; accept setelah user save lain →
  `{ status:'stale' }` + `superseded`; reject → anotasi kembali `open`.
- **E2E gaya gate**: bab + sitasi → compile → anotasi di koordinat diketahui → baris benar →
  propose edit invalid (loop self-repair: union errors) lalu valid → accept → versi baru +
  build baru.
- **API**: route tests pola existing (annotations/proposals CRUD + accept/reject union).
- **Frontend**: verifikasi manual per plan + WCAG 2.2 AA; komponen `.svelte`/`.svelte.ts` via
  skill `svelte-code-writer`; desain via `impeccable` (PRODUCT.md/DESIGN.md apps/svelte).

## Risiko & prasyarat

- **Prasyarat prod: OS-level sandbox compiler** (container read-only rootfs, no-network, PID
  namespace) **WAJIB sebelum expose compile ke user prod** — `--untrusted` memblok shell-escape
  tapi TIDAK menyandbox FS read (gate report). Fase 6 **menaikkan urgensi**: dry-run compile
  kini bisa dipicu agen berkali-kali per pesan. Mitigasi interim: rate limit `latex:compile`
  juga di jalur tool. Penempatan sandbox = pekerjaan ops pra-cutover, bukan scope fase ini.
- **Biaya compile per iterasi self-repair** ~8 dtk warm — dibatasi `maxSteps` + rate limit;
  queue/worker compile tetap out of scope (upgrade path tanpa migrasi ulang, Fase 5).
- **Re-anchor forward-lookup best-effort** — baris bergeser jauh → anotasi basi (dim/daftar),
  bukan salah tempat.
- **Text layer + overlay dibangun dari nol** (viewer existing sengaja tanpa text layer) —
  risiko UI terbesar 6a; pola transform viewport per halaman.
- **Thread tetap workspace-scoped** (`chat_threads` tanpa sectionId) — konteks bab lewat
  payload pesan; thread ter-pin per bab = luar scope.

## Out of scope Fase 6

Editor CodeMirror + diff per-hunk Accept/Reject (Fase 7); atribusi presisi error→file bab
(Fase 7); thesis-class per-kampus + ekspor DOCX (Fase 8); anotasi di preview full-document;
remap anchor berbasis diff; queue/worker compile; OS sandbox (prasyarat ops, bukan scope);
kolaborasi realtime; UI riwayat versi.
