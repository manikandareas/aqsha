# Repositioning research-first: proyek karya tulis sebagai pusat produk

Tanggal: 2026-07-17
Status: draft untuk review
Scope: `apps/svelte` + `packages/db` + `packages/services` + `apps/api` + `apps/agent`

## Masalah

Positioning di `apps/svelte/PRODUCT.md` sudah benar (student researcher, review-ready draft,
claim selalu terhubung ke sumber), tapi UI tidak mencerminkannya: pintu masuk produk adalah
composer chat ala GPT/Claude, dan workspace adalah file board generik ala Google Drive.
Diferensiasi produk hanya hidup di copy, tidak di struktur.

## Keputusan produk (hasil brainstorming)

1. **Pusat produk = karya tulis** (skripsi/tesis/disertasi/jurnal/proposal/makalah), bukan chat.
2. **Workspace = proyek karya tulis.** Tidak ada entity kontainer lain.
3. **Proyek punya kerangka bab dari template per jenis, sepenuhnya editable**
   (tambah/hapus/rename/reorder), dengan status per bab dan progress.
4. **Chat Astra scoped ke proyek.** Tidak ada chat global. Intent brainstorm (cari judul,
   pertajam topik) ditampung lewat pembuatan proyek tanpa-friksi yang mulai di tahap
   `exploration` — judul boleh kosong, cukup topik kasar.
5. **Perpustakaan sumber global per akun + koleksi per proyek** (model Zotero).
   Menambahkan sumber ke proyek = membuat link, bukan menyalin.
6. **Editor = SuperDoc** (DOCX-native, ProseMirror, framework-agnostic), langsung komit
   tanpa fase spike. Satu bab = satu dokumen DOCX.
7. **Explore dua level**: pencarian sumber utama in-project (sadar konteks proyek/bab) +
   feed literatur global. **Feed berita (GDELT) dihapus** — fokus penuh literatur ilmiah.
8. **Pendekatan implementasi: evolusi in-place** — schema `workspaces` yang ada berevolusi,
   bukan domain paralel baru.
9. **Tanpa migrasi data & tanpa redirect route lama** — app Svelte belum cutover, jadi
   perubahan schema bersih tanpa backfill/kompat, dan route lama dihapus begitu saja.

## Data model

Semua perubahan berupa migration Drizzle struktural tanpa backfill.

### `workspaces` (proyek)

Kolom baru:

- `kind` text NOT NULL, CHECK
  `undergraduate_thesis | masters_thesis | dissertation | journal_article | proposal | paper | freeform`.
  Label UI bahasa Indonesia via mapping frontend (skripsi, tesis, disertasi, artikel jurnal,
  proposal, makalah, bebas).
- `stage` text NOT NULL default `exploration`, CHECK
  `exploration | proposal | research | writing | revision | done`. Diubah manual oleh user.
- `deadline` bigint nullable (epoch-ms).
- `topic_note` text nullable — topik kasar selama tahap eksplorasi; UI memakai ini sebagai
  placeholder judul saat `name` kosong.

Untuk `kind='freeform'`: UI menyembunyikan stepper tahap dan kerangka bab — berperilaku
seperti workspace polos.

### `workspace_sections` (kerangka bab) — tabel baru

- `id` text PK (app-generated UUID, konsisten pola V2).
- `workspace_id` NOT NULL → `workspaces.id` (cascade delete).
- `title` text NOT NULL, `order` integer NOT NULL.
- `status` text NOT NULL default `empty`, CHECK `empty | draft | in_review | done`.
  Label UI: kosong, draf, direview, beres.
- `document_artifact_id` text nullable → `artifacts.id` — artifact DOCX milik bab
  (dibuat lazy saat bab pertama kali ditulis).
- `created_at` / `updated_at` bigint.

Template per `kind` = data seed di `packages/services` (bukan tabel): daftar judul awal saja.
Skripsi → Bab 1–5 + Daftar Pustaka; jurnal → IMRaD; proposal → struktur pengajuan; dst.
Setelah proyek dibuat, sections sepenuhnya milik user. Tambahan kolom `role` text nullable,
CHECK (`bibliography`) — section "Daftar Pustaka" ditandai `role='bibliography'` sehingga
kontennya digenerate citeproc (lihat Flow 4), bukan dokumen DOCX yang diedit.

### Perpustakaan global (evolusi `workspace_citations`)

- Tabel di-rename menjadi `citations`; kolom `workspace_id` di-drop. Item milik akun
  (`owner_user_id`). Semua kolom lain (CSL canonical, canonical_key, metadata_status,
  provider sync, dsb.) tetap.
- Tabel baru `workspace_citation_links`: `workspace_id` NOT NULL, `citation_id` NOT NULL,
  `section_id` nullable (→ sumber ditandai untuk bab tertentu), `created_at`.
  Unique (`workspace_id`, `citation_id`).
- Import wizard, DOI resolve, Mendeley/Zotero sync yang ada menarget perpustakaan akun;
  aksi "tambahkan ke proyek" membuat link.
- `workspace_citation_settings` (gaya sitasi) tetap per proyek.

### `chat_threads` (scope proyek)

- Kolom baru `workspace_id` text NOT NULL → `workspaces.id`.
- Metadata thread boleh membawa `section_id` fokus (satu bab) — disimpan di sisi Mastra
  memory metadata, bukan kolom baru.
- Proyeksi `threadProjectionProcessor` diperluas membawa `workspace_id`.

### Feed berita

- Worker hydration GDELT dimatikan dan UI feed berita dihapus dari `apps/svelte`.
- Tabel `feed_*` TIDAK di-drop dulu — `apps/web` (Next.js) yang masih live memakainya;
  DROP menyusul saat cutover penuh.

## IA & routing (`apps/svelte`)

```
/app                                → Beranda: daftar proyek
/app/projects/[id]                  → Rumah proyek
/app/projects/[id]/sections/[sid]   → Editor bab (SuperDoc)
/app/projects/[id]/threads/[tid]    → Thread Astra dalam proyek
/app/library                        → Perpustakaan global
/app/explore                        → Feed literatur global
```

Route lama (`/app/workspaces`, threads global) dihapus tanpa redirect.
Path bahasa Inggris; copy UI bahasa Indonesia.

- **Beranda `/app`**: daftar proyek (kartu: jenis, judul/topik, tahap, progress bab,
  deadline, aktivitas terakhir) + tombol "Proyek baru". Bukan composer hero.
- **Rumah proyek**: tiga zona — kiri: kerangka bab (status + aksi per bab: "Tulis dengan
  Astra", "Buka editor", "Cari sumber untuk bab ini"); kanan: koleksi sumber proyek
  (reuse `CitationsPanel`) + thread terbaru; atas: identitas proyek (jenis, stepper tahap,
  deadline). Reuse pola `DetailSplitLayout`.
- **Sidebar**: Beranda, Perpustakaan, Jelajah, Pengaturan + proyek yang disematkan.
  Daftar recent-threads global dihapus dari sidebar.
- **Composer Astra** turun pangkat: hidup di rumah proyek dan halaman bab, selalu dengan
  chip konteks ("Proyek: … · Bab 2"), bukan pintu masuk produk.

## User flow kunci

**Flow 1 — Proyek baru & brainstorm.** Beranda → "Proyek baru" → dialog ringan: jenis →
topik kasar (judul & deadline opsional) → rumah proyek tahap `exploration`. Kerangka bab
redup; aksi utama: brainstorm dengan Astra + kumpulkan sumber awal. Kandidat judul dari
thread bisa dijadikan judul proyek satu klik. Naik tahap → kerangka menyala jadi pusat.

**Flow 2 — Loop inti menulis bab.** Halaman bab: SuperDoc di tengah, panel kanan sumber
bab + composer Astra. Tiga jalur isi: (a) Astra menulis draf bercitasi dari koleksi bab —
sitasi masuk sebagai citation pill, bukan teks polos; (b) user menulis manual, insert
sitasi via palette dari koleksi proyek; (c) campuran. Status bab diubah user
(kosong → draf → direview → beres); progress rumah proyek & beranda mengikuti.

**Flow 3 — Mengumpulkan sumber.** "Cari sumber" dari bab/proyek → pencarian literatur
(OpenAlex/arXiv/Crossref existing) dengan query awal disarankan dari topik proyek/judul bab.
Simpan → masuk perpustakaan akun + auto-link ke proyek (dan bab bila dicari dari bab).
Dari `/app/explore`, simpan meminta pilih proyek tujuan (atau perpustakaan saja).

**Flow 4 — Daftar pustaka.** Section "Daftar Pustaka" dihasilkan citeproc dari sitasi yang
terpakai di bab-bab (infra `document_citation_usages` existing), selalu sinkron, ikut ekspor.

## Editor SuperDoc & Astra co-writer

- **Penyimpanan**: satu bab = satu artifact DOCX di MinIO/S3. Load via signed URL; autosave
  debounced ke endpoint API + simpan saat blur/navigasi. Yjs/kolaborasi realtime DITUNDA —
  single-writer; tulisan basi terdeteksi via versi (`stale_write`, lihat error handling).
- **Citation pill**: node ProseMirror kustom (SuperDoc extension) menyimpan `citation_id` +
  locator; dirender citeproc sesuai gaya proyek; ganti gaya → render ulang semua pill +
  daftar pustaka. Saat ekspor, pill dan bibliography diturunkan jadi teks final agar file
  berdiri sendiri di Word.
- **Astra co-writer**: SuperDoc headless di Node dipasang di `apps/agent` sebagai Mastra
  tools `read_section_document` / `write_section_document`. Tulisan Astra masuk sebagai
  **tracked changes** — user menerima/menolak per bagian. Verifikasi API Mastra terhadap
  `@mastra/core` terpasang sebelum implementasi (aturan repo).
- **Ekspor**: per bab = unduh DOCX langsung. Karya utuh = API menggabungkan DOCX semua bab
  berurutan + daftar pustaka citeproc → satu DOCX. Ekspor PDF via konverter server-side
  (LibreOffice headless/Gotenberg di `infra/`) — fase terakhir, bukan pemblokir.

## Error handling

Mengikuti pola repo: `appError` terstruktur dari `packages/db` untuk endpoint baru;
union return untuk hasil produk yang disengaja; `readableApiErrorMessage` di frontend.

- Simpan dokumen saat versi storage lebih baru → `{ status: 'stale_write' }` (union, bukan
  throw); UI menawarkan muat ulang.
- Autosave gagal → indikator "tersimpan / menyimpan / gagal — coba lagi" di header editor;
  tidak pernah gagal senyap.
- Transisi status bab & tahap proyek divalidasi di services (nilai CHECK yang sama).

## Testing

- `packages/services`: seeding template per jenis, model link perpustakaan↔proyek↔bab,
  transisi status bab, penggabungan ekspor + bibliography citeproc.
- `apps/api`: endpoint projects/sections/links/documents (pola test existing).
- `packages/db`: migration baru lolos runner migrasi.
- Frontend: verifikasi manual per fase + standar WCAG 2.2 AA repo.

## Pentahapan implementasi (tiap fase shippable)

1. **Domain** — migrations + services + API: kind/stage/deadline/topic_note, sections +
   template seed, rename citations + tabel link, thread scope.
2. **IA Svelte** — beranda daftar proyek, rumah proyek, sidebar baru, hapus route lama.
3. **Perpustakaan & pencarian** — `/app/library`, koleksi per proyek/bab, pencarian
   in-project, explore tanpa berita.
4. **Editor** — SuperDoc per bab: baca/tulis, autosave, citation pill, ekspor DOCX per bab.
5. **Astra co-writer & ekspor utuh** — tools headless + tracked changes, gabung dokumen,
   ekspor PDF via konverter.

Dokumen ikutan: `apps/svelte/PRODUCT.md` + `DESIGN.md` diperbarui (workspace → proyek,
IA baru), onboarding wizard disesuaikan ("kamu lagi nulis apa?" sebagai pembuka).

## Risiko & catatan

- **Lisensi SuperDoc (AGPLv3/komersial)**: Aqsha SaaS closed-source — keputusan lisensi
  (beli komersial atau kepatuhan AGPL) wajib selesai sebelum rilis fitur editor. Tugas
  bisnis/ops, pemblokir rilis fase 4, bukan pemblokir fase 1–3.
- **Maturity SuperDoc**: proyek relatif muda; fidelity pagination/print (nomor halaman,
  margin per section untuk format kampus) belum divalidasi — diputuskan tanpa spike, jadi
  risiko ini diserap sadar; fase 4 dimulai dengan uji import template kampus nyata sebagai
  langkah pertama implementasi (bukan fase riset terpisah).
- **`apps/web` masih live**: perubahan schema (rename `workspace_citations` → `citations`,
  NOT NULL `chat_threads.workspace_id`) memutus kompatibilitas dengan app Next.js lama.
  Konsekuensi diterima karena arah produk adalah cutover ke Svelte; koordinasi cutover
  berada di luar spec ini.

## Out of scope

- Kolaborasi realtime multi-user (Yjs) dan riwayat versi dokumen penuh.
- Shared Journal / akses reviewer dosen di IA baru (menyusul setelah repositioning).
- Redesign Settings (aturan repo: additive-only).
- DROP tabel `feed_*` (menunggu cutover penuh).
