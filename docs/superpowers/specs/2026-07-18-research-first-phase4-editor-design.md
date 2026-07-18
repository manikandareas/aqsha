# Research-first Fase 4: Editor bab SuperDoc

> **SUPERSEDED 2026-07-18.** Gate GO/NO-GO SuperDoc = NO-GO (lihat `.superpowers/sdd/progress.md`).
> Fase 4 di-pivot ke fondasi LaTeX/PDF agen-first:
> `2026-07-18-research-first-phase4-latex-foundation-design.md`. Dokumen ini disimpan sebagai riwayat.

Tanggal: 2026-07-18
Status: SUPERSEDED (implementasi SuperDoc dibangun lalu ditolak gate; diganti pivot LaTeX)
Scope: `apps/svelte` + `apps/api` + `packages/services` + `packages/db` (satu migration additive)
Induk: `docs/superpowers/specs/2026-07-17-research-first-repositioning-design.md` (fase 4 dari 5)

## Masalah

Fase 1–3 sudah meletakkan domain (sections + `document_artifact_id` lazy), IA project-first,
dan perpustakaan/pencarian — tapi loop inti Flow 2 (menulis bab) masih placeholder:
`sections/[sectionId]` hanya menampilkan "editor hadir di pembaruan berikutnya",
`document_artifact_id` tidak pernah di-set di manapun, dan `ArtifactService.updateDocument`
hanya menerima markdown. Tidak ada jejak SuperDoc di repo (greenfield); editor lama
(BlockNote) hanya hidup di `apps/web` dan mekaniknya tidak relevan untuk DOCX-native.

## Keputusan produk (hasil brainstorming)

1. **Editor = `superdoc@1.45.0` pinned exact** (bukan `2.0.0-next`), vanilla JS tanpa
   wrapper package — satu komponen Svelte tipis yang mount/destroy instance.
2. **Lisensi: jalur kepatuhan AGPLv3** — seluruh `apps/svelte` di-open-source-kan
   (plus package frontend yang ter-bundle ke client, mis. `@aqsha/ui-svelte`).
   Backend (`apps/api`, `packages/services`, `packages/db`, `apps/agent`) tetap closed.
   Tidak ada lisensi komersial Harbour; tidak ada gate rilis lisensi.
3. **Save path lewat API** (bukan presigned PUT): client export Blob DOCX →
   `PUT /sections/:id/document` multipart → service tulis byte ke S3, bump versi,
   rekonsiliasi sitasi — atomik satu round-trip.
4. **Lazy-create saat save pertama**: buka bab tanpa dokumen → SuperDoc blank di memori;
   artifact DOCX baru lahir pada save pertama (tidak ada artifact kosong yatim).
5. **Citation pill = structured content (SDT) built-in SuperDoc** — elemen OOXML native
   (`<w:sdt>`) sehingga round-trip DOCX dijamin; bukan custom extension node
   (round-trip OOXML tidak terjamin) dan bukan hyperlink-scheme hack (bocor ke ekspor).
6. **Status bab: auto `empty→draft` sekali arah** saat dokumen pertama kali tersimpan;
   semua transisi lain tetap manual oleh user.
7. **Bibliography (`role='bibliography'`) dirender citeproc read-only di Fase 4** dari
   sitasi terpakai di bab-bab (agregasi `document_citation_usages`), tanpa SuperDoc.
8. **Single-writer, tanpa Yjs** (sesuai spec induk); tulisan basi terdeteksi via
   `content_version` → union `stale_write`.
9. **Definisi done = loop tulis lengkap**: buka → load/blank → edit + autosave +
   indikator → insert citation pill + re-render saat ganti gaya → bibliography view →
   unduh DOCX per bab. Task implementasi pertama = gerbang GO/NO-GO fidelity.
10. **Deviasi flag**: `DOCUMENT_AUTHORING_ENABLED` TIDAK dibalik. Flag itu hanya menggate
    CTA "buat dokumen" markdown di `WorkspaceLibraryEmpty` — tetap dead-end (reader
    read-only) meski editor bab ada, karena editor kita per-bab, bukan editor artifact
    library. Editor bab live tanpa flag; docstring flag diperbarui.

## Alternatif yang ditolak: OnlyOffice Docs

Dibandingkan mendalam sebelum komit. OnlyOffice unggul di fidelity DOCX hari ini dan
kolaborasi realtime gratis (CE 9.4 menghapus limit 20 koneksi), tapi kalah di semua
diferensiasi Aqsha:

- **Arsitektur**: Document Server terpisah (container ±2 GB RAM, JWT, save via callback
  server-to-server) + embed iframe — bukan komponen in-app; infra & titik gagal baru.
- **Citation pill**: mengendalikan editor dari UI kita (insert content control dari
  `LibraryPickerDialog`) hanya via Automation API/Connector = Developer Edition
  (mulai ~$1.911, production per-server/tahun) **plus add-on berbayar**. Jalur gratis =
  plugin dalam sandbox iframe mereka — UX Flow 2 rusak.
- **Astra co-writer (Fase 5)**: tidak ada jalur headless tracked-changes yang bebas biaya;
  SuperDoc menyediakannya native.
- **Lisensi**: FAQ resmi OnlyOffice menyatakan integrasi SaaS dengan CE tetap menuntut
  ketersediaan source (atau lisensi komersial) — keunggulan "iframe = separate work"
  semu karena melawan interpretasi licensor sendiri. Kedua opsi sama-sama berujung
  "patuh AGPL atau bayar".
- **Mobile web editing**: tidak ada di CE (fitur berbayar) — buruk untuk mahasiswa.

**Fallback resmi**: jika gerbang GO/NO-GO SuperDoc gagal (fidelity template kampus tak
layak), pivot ke OnlyOffice Developer Edition dievaluasi ulang — saat itu kalkulusnya
berubah (bayar lisensi + terima iframe demi fidelity).

## Data model

Migration Drizzle additive tunggal:

- `artifacts.content_version` integer nullable — diisi hanya untuk dokumen authored
  (DOCX bab); mulai 1 saat dibuat, +1 tiap save. Fondasi deteksi `stale_write`.
  Artifact lain (upload, markdown lama) tetap null.

Tidak ada perubahan `workspace_sections` — kolom `document_artifact_id` dan CHECK
status/role sudah siap dari Fase 1.

## Backend

### `SectionDocumentService` (packages/services, baru)

```ts
saveDocument(db, {
  ownerUserId, sectionId, bytes, fileName, baseVersion, clusters,
}) →
  | { status: 'saved'; artifactId: string; contentVersion: number; sectionStatus: SectionStatus }
  | { status: 'stale_write'; currentVersion: number }   // union, bukan throw
```

- **Save pertama** (`document_artifact_id` null): buat artifact `artifactType:'docx'`,
  `source:'manual'`, `mimeType` DOCX, byte via `StorageService.storeBytes`,
  `contentVersion=1`; patch `workspace_sections.documentArtifactId`
  (`WorkspaceSectionRepo.update` sudah menerima field ini); transisi `empty→draft`
  hanya jika status masih `empty`.
- **Save berikutnya**: `baseVersion !== contentVersion` → `stale_write`; cocok →
  overwrite byte di `storageR2Key` yang sama, `contentVersion++`, `updatedAt`.
- **Rekonsiliasi sitasi**: `CitationUsageService.reconcileClusters({ ownerUserId,
  workspaceId, documentArtifactId, clusters })` — entry point baru yang reuse
  `DocumentCitationUsageRepo.replaceForDocument`, lepas dari format `blocksJson`
  BlockNote. `clusters` dikirim client dari hasil scan SDT dokumen.
- **Plain text**: ekstrak via mammoth (pola `finalizeUpload`) untuk `plainTextPreview`;
  re-embedding pgvector DITUNDA (Astra membaca dokumen via headless di Fase 5).
- Validasi: `role='bibliography'` → `throwAppError('bibliography_not_editable')`;
  cap ukuran byte (pola `validateUpload`); ownership via `assertSectionOwner`.

### Routes (apps/api)

- `PUT /sections/:id/document` — multipart dengan **`t.File` sebagai field pertama**
  (gotcha Elysia repo), field lain `baseVersion` + `clustersJson` (string JSON).
  Respons = union `saved | stale_write` apa adanya.
- `GET /workspaces/:id/bibliography` — agregasi `document_citation_usages` semua dokumen
  bab proyek (join `workspace_sections.documentArtifactId`, urut `sortOrder` bab lalu
  `occurrenceOrder`, dedupe citation id) → `CitationService.render` dengan gaya + sort
  dari `workspace_citation_settings` → `{ styleId, entries: [{ id, text }] }`.
- Load dokumen & unduh mentah **tanpa endpoint baru**: presigned GET dari
  `GET /artifacts/:id/render-payload` existing.

## Frontend (apps/svelte)

### Halaman bab (`sections/[sectionId]`)

- Shell ala `ArtifactReaderPageShell`: `DetailSplitLayout` dengan ancestor fixed-`h-svh`
  (gotcha repo), kiri editor, kanan `ProjectSidePanel` existing (tab Sumber terfilter
  default ke bab ini + tab Chat scoped proyek).
- Header: judul bab, `Select` status (pola `SectionOutline`), indikator simpan
  (`tersimpan / menyimpan… / gagal — coba lagi`), tombol "Unduh DOCX".
- `role='bibliography'` → `BibliographyView` read-only (hasil `GET bibliography` +
  keterangan "digenerate otomatis dari sitasi terpakai"), tanpa SuperDoc.

### `SectionDocumentEditor.svelte`

- Dynamic import `import('superdoc')` client-only (SuperDoc butuh DOM; chunk besar hanya
  terunduh di route editor). CSS `superdoc/style.css` di-import di komponen ini saja.
- Mount `new SuperDoc({ selector, document, documentMode: 'editing', ... })` via
  `{@attach}`; `destroy()` saat unmount. `document` = presigned URL dari
  `useArtifactRender` bila `documentArtifactId` ada; blank bila belum.
- Toolbar bawaan SuperDoc, di-theme via CSS token warm-cream. `@superdoc-dev/fonts`
  TIDAK dipakai dulu (lisensinya perlu audit terpisah).
- **Autosave**: `editor.on('update')` → debounce ±2 dtk idle (max ±15 dtk) →
  `export({ triggerDownload: false })` → Blob + clusters dari
  `getStructuredContentTags` → mutation save → sinkronkan `contentVersion` lokal.
  `stale_write` → dialog "muat ulang dokumen". Flush saat `beforeNavigate` + guard
  `beforeunload` bila ada perubahan belum tersimpan. Tidak pernah gagal senyap.

### Citation pill

- Tombol "Sisipkan sitasi" → reuse `LibraryPickerDialog` (koleksi proyek) → render teks
  cluster via `POST /workspaces/:id/citations/render-document` existing →
  `insertStructuredContentInline({ attrs, text })` dengan lock isi (tidak bisa diedit
  manual, bisa dihapus sebagai satu unit). Encoding attrs: `id` = nodeId cluster,
  payload sitasi (`{ citationIds, locator? }`) diserialisasi JSON ke `alias`;
  task gerbang memverifikasi field mana yang round-trip DOCX utuh dan boleh
  menggesernya (mis. ke `tag`) tanpa mengubah desain.
- Ganti gaya sitasi proyek → invalidate `useRenderDocumentCitations` →
  `updateStructuredContentById` per pill. Teks final tersimpan di DOCX → file yang
  diunduh langsung benar di Word tanpa langkah flatten terpisah.

### Ekspor per bab

Dari editor: `superdoc.export()` (state terkini). Dari luar editor: signed URL
`render-payload` (byte tersimpan terakhir).

## Task gerbang GO/NO-GO (task implementasi pertama)

Sebelum membangun penuh: pasang SuperDoc minimal di halaman bab (dev), import template
skripsi kampus nyata, verifikasi fidelity margin/pagination/header-footer + round-trip
SDT (insert → export → re-import → attrs utuh). Fixture DOCX template kampus dikomit ke
repo untuk regresi. NO-GO = berhenti dan eskalasi (fallback OnlyOffice dievaluasi ulang),
bukan jalan terus diam-diam.

## Error handling

Pola repo penuh: `throwAppError` untuk kondisi terminal (`section_not_found`,
`bibliography_not_editable`, `document_too_large`), union return untuk `stale_write`
(hasil produk disengaja), `readableApiErrorMessage` di frontend.

## Testing

- `packages/services`: `saveDocument` (save pertama / berikutnya / stale / tolak
  bibliography / transisi status sekali arah), `reconcileClusters`, agregasi bibliography
  (urutan bab + dedupe + gaya).
- `apps/api`: kedua route baru (pola test existing).
- `packages/db`: migration lolos runner.
- Frontend: `cd apps/svelte && bun run check` per task (baseline 2 error pre-existing
  DetailPanel:158-159) + E2E manual; round-trip SDT tervalidasi di task gerbang.

## Kepatuhan AGPL (deliverable ikutan)

- `LICENSE` AGPL-3.0 di `apps/svelte` dan `packages/ui-svelte` (+ package frontend
  ter-bundle lain bila ada).
- Notice "kode sumber tersedia" + link repo publik di UI (footer/settings).
- Catatan scope kepatuhan di docs: corresponding source = semua kode yang ter-bundle ke
  client; backend tetap closed.
- Mekanisme publikasi mirror repo publik = tugas ops di luar plan ini.
- Entry changelog + cek version bump per `docs/product/versioning-and-changelog.md`.

## Out of scope (Fase 5 / nanti)

- Astra co-writer (SuperDoc headless di `apps/agent`, tracked changes, Mastra tools).
- Ekspor karya utuh (gabung DOCX semua bab + bibliography) dan ekspor PDF.
- Kolaborasi realtime (Yjs) dan riwayat versi dokumen penuh.
- Re-embedding pgvector konten bab untuk RAG.
- Mobile editing yang dipoles (cukup tidak rusak).
- DROP flag `DOCUMENT_AUTHORING_ENABLED` / redesign authoring artifact library.
