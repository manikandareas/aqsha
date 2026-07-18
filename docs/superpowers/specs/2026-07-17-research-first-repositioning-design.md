# Repositioning research-first: proyek karya tulis sebagai pusat produk

Tanggal: 2026-07-17 (diperbarui 2026-07-18: pivot editor SuperDoc → LaTeX/PDF agen-first)
Status: draft untuk review
Scope: `apps/svelte` + `packages/db` + `packages/services` + `apps/api` + `apps/agent`

> **Pembaruan pivot (2026-07-18).** Keputusan editor berubah dari SuperDoc (DOCX WYSIWYG) ke
> **LaTeX kanonik + PDF, interaksi agen-first (model anotasi)** setelah gerbang GO/NO-GO SuperDoc =
> NO-GO. Ini memperluas roadmap dari 5 → 8 fase (Fase 4–8 menggantikan Fase 4 SuperDoc + Fase 5
> co-writer lama, yang terserap). Detail otoritatif: `2026-07-18-research-first-phase4-latex-foundation-design.md`
> (peta fase 4–8 + desain gate) dan `2026-07-18-research-first-phase4-latex-gate-report.md` (gate Fase 4
> = GO). Bagian di bawah sudah diselaraskan; detail model dokumen/anotasi/loop agen hidup di spec pivot itu.

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
6. **Kanonik = LaTeX (teks); interaksi utama agen-first (model anotasi); output PDF dulu**
   (DOCX best-effort ditunda). Editor sumber LaTeX opsional/opt-in (sekunder + rumah tinjauan
   diff). Satu bab = satu sumber LaTeX; anotasi PDF↔sumber lewat SyncTeX. (Mengganti keputusan
   SuperDoc/DOCX setelah gerbang NO-GO; alasan & detail di spec pivot.)
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
- `document_artifact_id` text nullable → `artifacts.id` — artifact **sumber LaTeX** milik bab
  (dibuat lazy saat bab pertama kali ditulis). Model dokumen kanonik + assembly + storage teks
  LaTeX didetailkan di Fase 5 (menggantikan storage byte DOCX).
- `created_at` / `updated_at` bigint.

Template per `kind` = data seed di `packages/services` (bukan tabel): daftar judul awal saja.
Skripsi → Bab 1–5 + Daftar Pustaka; jurnal → IMRaD; proposal → struktur pengajuan; dst.
Setelah proyek dibuat, sections sepenuhnya milik user. Tambahan kolom `role` text nullable,
CHECK (`bibliography`) — section "Daftar Pustaka" ditandai `role='bibliography'` sehingga
kontennya digenerate biblatex+biber saat compile (lihat Flow 4), bukan sumber yang diedit tangan.

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
/app/projects/[id]/sections/[sid]   → Bab: PDF ter-render + anotasi (editor LaTeX opsional)
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

**Flow 2 — Loop inti menulis bab (agen-first).** Halaman bab: **PDF ter-render di tengah**
(PDF.js) + lapisan anotasi; panel kanan sumber bab + composer Astra; editor sumber LaTeX
opt-in sebagai escape-hatch. Loop inti: mahasiswa **menandai/anotasi** di PDF → SyncTeX
memetakan ke lokasi sumber → Astra menyunting sumber LaTeX → **diff** Accept/Reject → compile
ulang (loop compile-validate + self-repair). Sitasi ditulis `\cite{...}` dari koleksi bab.
Status bab diubah user (kosong → draf → direview → beres); progress rumah proyek & beranda mengikuti.

**Flow 3 — Mengumpulkan sumber.** "Cari sumber" dari bab/proyek → pencarian literatur
(OpenAlex/arXiv/Crossref existing) dengan query awal disarankan dari topik proyek/judul bab.
Simpan → masuk perpustakaan akun + auto-link ke proyek (dan bab bila dicari dari bab).
Dari `/app/explore`, simpan meminta pilih proyek tujuan (atau perpustakaan saja).

**Flow 4 — Daftar pustaka.** Section "Daftar Pustaka" dihasilkan **biblatex+biber** dari sitasi
yang terpakai di bab-bab: library CSL-JSON → `.bib` (BibExportService, kunci sitasi stabil) →
`\printbibliography`. Infra `document_citation_usages` existing melacak pemakaian; selalu sinkron,
ikut compile.

## Editor LaTeX, viewer PDF & loop agen

Detail penuh (model dokumen, anotasi, loop self-repair) di spec pivot + fase 5–8; ringkas arah:

- **Kanonik & compile**: satu bab = satu **sumber LaTeX**. Preamble/thesis-class + body per-bab
  dirakit → di-compile server (Tectonic sandboxed, `LatexCompileService` dari gate Fase 4) → PDF +
  `.synctex.gz`. Autosave teks LaTeX debounced ke API; single-writer, tulisan basi via versi
  (`stale_write`, lihat error handling). Yjs/kolaborasi realtime DITUNDA.
- **Surface utama (agen-first) = PDF + anotasi**: PDF.js render + lapisan anotasi. Mahasiswa
  menandai di PDF → SyncTeX inverse-map ke baris sumber → jadi konteks perintah ke Astra. Editor
  sumber LaTeX (CodeMirror) opsional/opt-in: escape-hatch + rumah tinjauan diff.
- **Sitasi**: `\cite{key}` di sumber; daftar pustaka via biblatex+biber dari `.bib`
  (BibExportService: CSL-JSON library → biblatex, kunci sitasi stabil). Ganti gaya = ganti `style`
  biblatex + compile ulang — tak ada citation-pill DOCX.
- **Astra co-writer (loop agen)**: tools headless di `apps/agent` membaca/menyunting sumber LaTeX;
  suntingan masuk sebagai **diff** (Accept/Reject per bagian), lalu compile-validate + self-repair
  (baca `errors[]` terstruktur hasil compile, perbaiki). Verifikasi API Mastra vs `@mastra/core`
  terpasang sebelum implementasi (aturan repo).
- **Ekspor**: **PDF-first** (native dari compile, presisi mutlak — tak perlu konverter DOCX).
  Ekspor `.docx` best-effort = jaring pengaman kampus wajib-Word, ditunda ke Fase 8.

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
  transisi status bab, ekspor `.bib` (BibExportService) + compile LaTeX→PDF (gate Fase 4, sudah
  ada), assembly dokumen (Fase 5).
- `apps/api`: endpoint projects/sections/links/documents (pola test existing).
- `packages/db`: migration baru lolos runner migrasi.
- Frontend: verifikasi manual per fase + standar WCAG 2.2 AA repo.

## Pentahapan implementasi (tiap fase shippable)

Pivot LaTeX (2026-07-18) memperluas 5 → 8 fase: Fase 1–3 tetap; Fase 4 SuperDoc diganti gate LaTeX;
"Astra co-writer + ekspor utuh" lama **terserap** (loop agen = co-writer, ekspor PDF-first).

1. **Domain** — migrations + services + API: kind/stage/deadline/topic_note, sections + template
   seed, rename citations + tabel link, thread scope. ✅ **selesai**.
2. **IA Svelte** — beranda daftar proyek, rumah proyek, sidebar baru, hapus route lama. ✅ **selesai**.
3. **Perpustakaan & pencarian** — `/app/library`, koleksi per proyek/bab, pencarian in-project,
   explore tanpa berita. ✅ **selesai**.
4. **GATE: pipeline compile LaTeX + sitasi** — service compile Tectonic sandboxed; `.bib` dari
   library (biblatex+biber); SyncTeX; PDF. Fase pertama pivot, nyaris tanpa UI (dev harness),
   GO/NO-GO. ✅ **GO** (`…-phase4-latex-gate-report.md`).
5. **Model dokumen LaTeX kanonik + assembly + storage** — preamble/thesis-class + body per-bab +
   komposisi `.bib`; autosave/versioning teks LaTeX. Menggantikan storage DOCX-artifact per section.
6. **Viewer PDF + lapisan anotasi + loop editing agen** — PDF.js + SyncTeX klik-ke-sumber; anotasi
   pinned + antrian; Astra sunting → diff → apply; loop compile-validate + self-repair. UX inti;
   mungkin dipecah 6a (viewer/anotasi) + 6b (loop agen).
7. **Editor LaTeX opsional + tinjauan diff** — CodeMirror LaTeX (opt-in); surface diff Accept/Reject.
8. **Thesis-class per-kampus + ekspor DOCX best-effort** — adopsi/sesuaikan `.cls` untuk "persis
   pedoman kampus"; jaring pengaman kampus wajib-Word.

Prasyarat produksi sebelum expose compiler ke user (masuk Fase 5/6): **OS-level sandbox** (container
read-only rootfs, no-network) — `--untrusted` mematikan shell-escape tapi TIDAK menyandbox FS read.

Dokumen ikutan: `apps/svelte/PRODUCT.md` + `DESIGN.md` diperbarui (workspace → proyek,
IA baru), onboarding wizard disesuaikan ("kamu lagi nulis apa?" sebagai pembuka).

## Risiko & catatan

- **Keamanan compiler**: `--untrusted` + `TECTONIC_UNTRUSTED_MODE` mematikan `\write18`/shell-escape
  tapi TIDAK menyandbox FS read (`\input{/etc/passwd}` tembus). Sebelum expose ke user WAJIB OS-level
  sandbox (container read-only rootfs, no-network) — masuk Fase 5/6, bukan pemblokir gate.
- **Toolchain LaTeX**: biber WAJIB 2.17 selama bundle Tectonic = TeX Live 2022 / biblatex 3.17
  (mismatch = gagal compile); cold-start biber (PAR self-extract) bisa lewat timeout default → warm
  cache saat build image. Lisensi editor SuperDoc (AGPL) **hilang** (Tectonic MIT; biber CLI eksternal).
- **Produk agen-first**: interaksi utama = anotasi/perintah ke agen, bukan ketik-bebas WYSIWYG —
  perlu validasi UX (dibahas saat desain Fase 6). Sebagian kampus wajib `.docx` → ekspor DOCX
  best-effort Fase 8.
- **`apps/web` masih live**: perubahan schema (rename `workspace_citations` → `citations`,
  NOT NULL `chat_threads.workspace_id`) memutus kompatibilitas dengan app Next.js lama.
  Konsekuensi diterima karena arah produk adalah cutover ke Svelte; koordinasi cutover
  berada di luar spec ini.

## Out of scope

- Kolaborasi realtime multi-user (Yjs) dan riwayat versi dokumen penuh.
- Shared Journal / akses reviewer dosen di IA baru (menyusul setelah repositioning).
- Redesign Settings (aturan repo: additive-only).
- DROP tabel `feed_*` (menunggu cutover penuh).
