# Research-first Fase 3: Perpustakaan & Pencarian

Tanggal: 2026-07-18
Status: disetujui untuk implementation plan
Scope: `apps/svelte` + `apps/api` + `packages/services` + `packages/db` (perubahan backend kecil)
Induk: `docs/superpowers/specs/2026-07-17-research-first-repositioning-design.md` (fase 3 dari 5)

## Masalah

Fase 1–2 sudah meletakkan domain (citations account-level + `workspace_citation_links`) dan
IA project-first, tapi permukaan sumbernya belum ada: `/app/library` masih placeholder,
komponen citations Svelte (CitationsPanel + 15 dialog/wizard) orphaned, "Simpan" hasil
pencarian masih bermodel artifact-URL warisan apps/web, dan Explore masih membawa feed
berita yang menurut spec repositioning harus hilang.

## Keputusan produk (hasil brainstorming)

1. **Simpan hasil pencarian = citation-first.** "Simpan" pada hasil pencarian literatur
   langsung membuat citation di perpustakaan akun (`POST /citations` — `{doi}` bila ada DOI,
   `{fields}` dari metadata hasil bila tidak) lalu auto-link ke proyek/bab konteks.
   Bukan artifact-URL (alur lama apps/web). Konten full-text/RAG bukan bagian aksi Simpan.
2. **`/app/library` = citations saja** (model Zotero murni). File/PDF tetap aset per-proyek;
   citation ber-`artifactId` menautkan ke reader. Tidak ada daftar artifact lintas-proyek.
3. **Pencarian in-project = route dalam proyek** `/app/projects/[projectId]/search?q=&section=`.
   `/app/explore` tetap global (browse + search). Bukan query-param konteks di explore,
   bukan dialog.
4. **Import file & provider sync di-de-workspace di API.** `imports/preview|commit` pindah ke
   `/citations/imports/*`; sync preview/commit kehilangan `workspaceId`. Sesuai spec induk
   ("import wizard … menarget perpustakaan akun"). apps/web makin merah — diterima sejak Fase 1.
5. **⌘K tidak berubah.** Pencarian fase ini = literature search (in-project + explore) +
   search/filter `q` di `/app/library`. Perluasan ⌘K ke sumber/thread = future.
6. **Pendekatan UI: rebuild penuh untuk shell list** `/app/library` dan hasil pencarian
   (flat-card v2, full page); **dialogs/wizard/detail existing di-reuse** (repoint endpoint
   seperlunya). Model data Fase 1 dipakai apa adanya — tanpa tabel/kolom link baru.

## Routing (`apps/svelte`)

```
/app/library                       → Perpustakaan (full page, citations-only)
/app/projects/[projectId]/search   → Pencarian sumber in-project (?q=&section=)
/app/explore                       → Browse literatur global (existing, minus berita)
/app/explore/[paperRef]            → Paper reader (tetap)
/app/explore/n/[id]                → DIHAPUS (reader berita)
```

## Perubahan backend

Semua tipis, pola existing (route Elysia → service; `appError` terstruktur; tanpa backfill).

1. **De-workspace import & sync.**
   - Route: `POST /citations/imports/preview` (multipart file) dan
     `POST /citations/imports/:batchId/commit` menggantikan versi `/workspaces/:id/…`.
     `POST /integrations/:provider/sync/preview` dan `…/sync/:batchId/commit` tanpa
     `workspaceId` di body.
   - Services: `CitationImportService.preview/commit` + `CitationSyncService.previewFolder`
     drop parameter `workspaceId` (owner-scoped murni).
   - DB: migration drop kolom `citation_import_batches.workspace_id` (data batch dev boleh
     hilang — konsisten keputusan tanpa-backfill).
   - `from-artifact` TETAP workspace-scoped (artifact terikat proyek; auto-link sudah benar).
2. **Create dengan dedupe-return.** `POST /citations` menerima opsi
   `onDuplicate: 'return-existing'`: saat canonical-key bentrok dengan citation aktif milik
   owner, kembalikan citation existing sebagai hasil sukses (plus penanda `created: false`),
   bukan 409. Perilaku existing (409 `citation_duplicate` + `allowDuplicate`) tetap untuk
   dialog DOI/manual.
3. **Render account-level.** `POST /citations/render` dengan `styleId` eksplisit
   (default `apa-7`), tanpa workspace — dipakai preview & salin sitasi di `/app/library`.
   Render per-proyek existing (pakai `workspace_citation_settings`) tidak berubah.
4. **Feed tanpa berita.** Lane hydration GDELT dimatikan di worker; feed API berhenti
   mengembalikan item `kind: 'news'` (filter sisi services). Tabel `feed_*` TIDAK di-drop
   (apps/web masih hidup — sesuai spec induk).

## `/app/library` — Perpustakaan

Shell list dibangun baru (flat-card v2, full page, `DetailSplitLayout`); komponen hidup di
`features/citations/` (`pages/LibraryPage.svelte` + `components/library/*`).

- **Header**: judul + total; aksi: "Tambah sumber" (dropdown: dari DOI / manual / import file
  .bib-.ris / tarik dari Mendeley-Zotero), menu export (BibTeX/RIS/CSL-JSON), "Kelola duplikat".
- **Toolbar filter**: search `q` debounced + filter status/source/tag (`useCitationTags`) +
  chips filter aktif. **State filter & detail di URL** (`?q=&status=&source=&tag=&cite=<id>`)
  — full page tak punya konflik `q` board, jadi URL state (beda dari CitationsPanel yang lokal).
- **List**: baris lebar penuh gaya tabel-flat (border-2, tanpa shadow): dot status, judul,
  meta (penulis · tahun · venue), badge source, tag chips; aksi hover: salin sitasi
  (render account-level `apa-7`), "Tambahkan ke proyek…", menu (detail/edit/buka DOI/hapus).
  Checkbox saat mode pilih; infinite "Muat lagi" (page size 50).
- **Detail**: `cite=<id>` → panel kanan me-render `CitationDetailView` (reuse) + aksi
  "Tambahkan ke proyek…".
- **Bulk bar** (UI baru, mutations reuse): beri tag, export terpilih, gabungkan (≥2), hapus.
- **Empty state**: reuse `CitationEmptyState`.
- **`AddToProjectDialog`** (baru): pilih proyek (`useWorkspacesList`) + opsional bab
  (`useSections`) → `useLinkCitation`.

Reuse (repoint ke endpoint account-level, prop `workspaceId` dihapus): `CitationDetailView`,
`CitationDoiDialog`, `CitationFormDialog`, `CitationImportWizard`, `ProviderSyncWizard`,
`CitationDuplicatesDialog`, `CitationExportMenu`, `CitationEmptyState`.

Keputusan turunan:

- **Tanpa dialog gaya sitasi di library** — `workspace_citation_settings` per proyek; gaya
  diatur dari konteks proyek. Library memakai `apa-7` untuk preview/salin.
- Daftar "citation ini ter-link ke proyek mana" TIDAK ditampilkan (butuh endpoint baru) —
  future.
- `CitationsPanel` lama tidak dihapus di muka; bila setelah wiring ia orphan sungguhan,
  dihapus di task sweep.

## Pencarian in-project — `/app/projects/[projectId]/search`

- Header: kembali ke proyek + chip konteks ("Proyek X" / "· Bab Y" bila `section`) +
  search bar (typeahead `useExploreSuggest`). Saat `q` kosong: chips saran query dari
  `topicNote`/judul proyek/judul bab.
- Hasil: `SourceSearchResults` + `SourceResultCard` (baru, flat-card; `usePaperSearch`
  existing, load-more manual). Aksi per kartu: **Simpan** (citation-first + auto-link ke
  proyek, + bab bila ada `section`), **Baca** (reader `/app/explore/[paperRef]`), buka
  tautan asli.
- **Pipeline Simpan** (util bersama `source-save.ts`): map `SearchPaper` → `POST /citations`
  dengan `onDuplicate:'return-existing'` → `useLinkCitation({workspaceId, citationId,
  sectionId?})`. Tidak pernah dobel (unique link + dedupe-return); kartu jadi "Tersimpan ✓";
  disabled saat pending.
- Entry points: aksi bab "Cari sumber untuk bab ini" di `SectionOutline`; CTA "Cari sumber"
  di `ProjectSourcesPanel` (+ empty state-nya).

## Panel Sumber proyek (`ProjectSourcesPanel`)

Dua aksi baru:

- "Cari sumber" → goto search in-project.
- "Tambah dari perpustakaan" → `LibraryPickerDialog` baru (search `useCitationsList` →
  pilih → `useLinkCitation`).

Picker proyek/bab menjadi komponen inti bersama (`ProjectSectionPicker`) yang dipakai
`AddToProjectDialog`, `LibraryPickerDialog` (sisi bab), dan `SaveSourceDialog`.

## Explore dua level (tanpa berita)

- Feed browse: hapus semua cabang `kind: 'news'` di `ExploreFindings`/model discovery;
  hapus route `n/[id]`; backend berhenti mengirim berita. Two-state `q`/`topic` + codec
  `explore-url-model.ts` tidak berubah. Chat global tetap tidak ada (keputusan Fase 2).
- **Simpan dari explore** (kartu discovery, hasil search, paper reader): `SaveSourceDialog`
  baru — pilih proyek tujuan + opsional bab, atau **"Perpustakaan saja"** (default) →
  pipeline citation-first yang sama. Menggantikan alur artifact-URL lama.
  `useRecordInteraction(save)` tetap ditembak agar interest feed hidup.

## Error handling

- `readableApiErrorMessage` + toast di semua mutation baru.
- Duplikat pada Simpan-dari-search = hasil produk disengaja (`return-existing`), bukan
  thrown error; 409 `citation_duplicate` tetap untuk dialog DOI/manual dengan tawaran
  "tambah tetap".
- Simpan disabled saat pending (anti double-submit); link insert idempotent
  (`onConflictDoNothing` + unique).

## Testing

- Unit svelte: `source-save.spec.ts` (mapping paper→citation input), codec URL
  library/search, update `feed-blocks.spec.ts` pasca-hapus news.
- Backend: test services untuk import de-workspaced, `onDuplicate:'return-existing'`,
  render account-level; test route yang dipindah.
- Gate: `cd apps/svelte && bun run check` hijau (2 error pre-existing
  `DetailPanel.svelte:158-159` di luar scope), `bun run test` semua workspace, typecheck
  root (apps/web merah by design).

## Urutan implementasi (minim surface merah)

Backend dulu (services + route + migration → `bun run build:dist` supaya tipe Eden segar)
→ repoint hooks + wizard citations → library page → search in-project + panel Sumber →
explore sweep (Simpan citation-first + hapus berita) → gate akhir.

## Out of scope

- Editor bab/SuperDoc, citation pill di dokumen, autosave, ekspor DOCX (Fase 4).
- Migrasi data / redirect route lama (konsisten Fase 1–2).
- Perluasan ⌘K ke sumber/thread; daftar proyek-ter-link per citation; DROP tabel `feed_*`.
- Ingest full-text/RAG dari hasil Simpan (artifact pipeline tetap ada untuk upload manual
  di proyek).
