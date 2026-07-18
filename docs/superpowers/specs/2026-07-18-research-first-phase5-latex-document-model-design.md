# Research-first Fase 5: model dokumen LaTeX kanonik + assembly + storage — desain

Status: brainstorm disepakati 2026-07-18.
Scope: `packages/db` + `packages/services` + `apps/api`. Tanpa UI (viewer Fase 6, editor Fase 7).
Rujukan: master spec `2026-07-17-research-first-repositioning-design.md`, pivot
`2026-07-18-research-first-phase4-latex-foundation-design.md`, gate report
`2026-07-18-research-first-phase4-latex-gate-report.md`.

## Tujuan

Mengganti storage byte-DOCX per bab (warisan SuperDoc, gate NO-GO) dengan **sumber LaTeX teks
kanonik**: satu bab = satu sumber teks; assembly preamble + body per-bab + komposisi `.bib` menjadi
dokumen compilable; autosave + versioning teks; storage hasil compile (PDF + SyncTeX) yang siap
dirender Fase 6. Semua di atas `LatexCompileService` yang terbukti di gate Fase 4.

## Keputusan desain (hasil brainstorm)

1. **Unit compile = hybrid.** Per-bab untuk loop edit cepat (Fase 6); assembly full-document untuk
   preview akhir/ekspor. Dua jalur assembly, satu preamble yang sama.
2. **Storage sumber = artifact type baru `latex`.** `workspace_sections.document_artifact_id` tetap;
   teks di `artifact_contents`, CAS via `artifacts.content_version` yang sudah ada.
3. **Preamble digenerate stateless dari template** (kind + gaya sitasi + judul/penulis proyek).
   User tidak mengedit preamble di fase ini; fungsi template = titik sisip thesis-class Fase 8.
4. **Kunci sitasi persisten**: kolom `citations.bib_key`, di-assign sekali lalu beku — kunci
   `\cite{}` yang tertanam di sumber tidak pernah bergeser karena perubahan himpunan library.
5. **Pemakaian sitasi**: scan perintah `\cite` keluarga biblatex saat save → reconcile
   `document_citation_usages` (delete-guard & hitung pemakaian tetap hidup).
6. **Versioning 3 lapis**: (a) sumber selalu inline Postgres → save satu transaksi atomik penuh;
   (b) CAS `baseVersion` → union `stale_write`; (c) revision log append-only ber-retensi.
   Perbaikan struktural atas pola SuperDoc yang menulis blob R2 di luar transaksi.
7. **Compile masuk scope**: endpoint sinkron per-bab & full-doc + storage hasil build, tanpa env
   flag dan tanpa queue. Keamanan penuh bergantung OS sandbox = dependency penempatan pra-cutover
   (bukan scope fase ini).
8. **Compile tidak pernah di jalur interaksi.** Teks kanonik; PDF = proyeksi yang menyusul.
   Save/apply tidak menunggu compile; buka halaman membaca build tersimpan.

## Data model & migrasi (Drizzle, tanpa backfill)

### `artifacts` — type `latex`

- Migrasi: ALTER CHECK `artifacts_artifact_type_check` menambah `'latex'`.
- `packages/services/src/artifacts/model.ts`: tambah `latex` ke `artifactTypes`
  (family `text`, default language `latex`). Bukan `uploadAllowedArtifactTypes` dan bukan
  `agentWritableArtifactTypes` (agen menulis via jalur section, bukan `propose_artifact`).
- CAS tetap `artifacts.content_version` (mig 0041).

### Sumber teks — inline-only di `artifact_contents`

- Sumber LaTeX di `artifact_contents.plain_text`. **Invariant service: `*_r2_key` selalu null untuk
  type `latex`** — sumber kanonik tidak pernah di-offload supaya save selalu satu transaksi atomik
  (teks + versi + usages + revisi + status bab naik bersama, atau tidak sama sekali).
- Cap keras ukuran sumber (2 MB) → `latex_source_too_large`. `plainTextPreview` diturunkan
  dari sumber.

### `citations.bib_key` — kunci sitasi persisten

- Kolom baru `bib_key` text nullable + UNIQUE partial index
  `(owner_user_id, bib_key) WHERE bib_key IS NOT NULL`.
- Assign lazy (saat pertama dibutuhkan ekspor/compile) memakai penamaan `generateBibKeys` existing
  (slug penulis+tahun, suffix a/b/c saat tabrakan **dengan kunci tersimpan lain milik owner**),
  lalu beku selamanya. Race assign paralel diamankan unique index + retry on-conflict.
- `buildBibliographyFile` diubah menerima kunci eksternal (tidak generate ulang per-ekspor);
  `CitationService.exportBib` membaca/meng-assign kunci persisten.

### `document_revisions` — tabel baru (append-only, retensi)

- Kolom: `id` PK, `owner_user_id` FK, `artifact_id` FK (cascade), `version` integer,
  `source` text, `author` text CHECK (`user | agent | system`), `created_at`.
  Unique `(artifact_id, version)`.
- Ditulis dalam transaksi save yang sama. Prune inline: simpan maksimal 20 revisi per artifact.
- Bukan UI riwayat versi (tetap out of scope) — fungsinya jaring pengaman pemulihan +
  fondasi three-way merge / "kembalikan sebelum suntingan Astra" di Fase 6/7.

### `latex_builds` — tabel baru (hasil compile, latest-only per scope)

- Kolom: `id` PK, `owner_user_id` FK, `workspace_id` FK (cascade), `section_id` nullable FK
  (cascade; **null = build full-document**), `status` CHECK (`ok | error`), `pdf_r2_key`,
  `synctex_r2_key` (nullable), `errors` jsonb (`CompileError[]`, terisi saat `error`),
  `log_tail` text (ekor log terpotong untuk debug), `source_versions` jsonb
  (peta `sectionId → contentVersion` yang ter-compile — pembaca selalu bisa mendeteksi build basi),
  `built_at`.
- Unique parsial: `(section_id) WHERE section_id IS NOT NULL` dan
  `(workspace_id) WHERE section_id IS NULL`. Upsert = ganti pointer; byte PDF/synctex ke R2 via
  `StorageService.storeBytes`, key lama dihapus best-effort setelah pointer berganti
  (pola `deleteStaleR2Keys`).

### Dipensiunkan

- Jalur DOCX `SectionDocumentService` (save byte, `parseClustersJson`, clusters BlockNote) diganti
  seluruhnya. `document_citation_usages` tetap dipakai; `inline_node_id` & `locator_json` diisi null,
  `occurrence_order` = urutan kemunculan hasil scan.

## Assembly

`LatexAssemblyService` (`packages/services/src/latex/assembly.service.ts`) — fungsi murni:
input `{ workspace, sections + sumber, bibEntries, settings }` →
output `{ mainTex, extraFiles, bib }` yang langsung dimakan `LatexCompileService`.

- **Kontrak body bab: tanpa `\chapter{}`.** Assembly yang menyisipkan `\chapter{<judul section>}`
  (judul di-escape LaTeX: `& % _ # $ ~ ^ \ { }`) — rename bab di UI otomatis sinkron; agen hanya
  menulis isi bab.
- **Body per bab = file terpisah `sections/<sectionId>.tex`** yang di-`\input` dari `mainTex`
  ter-generate → SyncTeX mengatribusi baris langsung ke file bab; pemetaan PDF↔sumber Fase 6
  tanpa aritmetika offset.
- **Per-bab**: preamble + `\setcounter{chapter}{sortOrder - 1}` + `\input` satu bab +
  `\printbibliography`.
- **Full-document**: preamble + halaman judul sederhana (judul/penulis dari workspace) + semua bab
  non-bibliography urut `sort_order`; section `role='bibliography'` dirender `\printbibliography`
  pada posisinya (tetap tidak bisa diedit).
- **Preamble** `buildPreamble({ kind, styleId, title, author })`: documentclass per kind
  (`report` untuk skripsi/tesis/disertasi; `article` untuk jurnal/paper/makalah/proposal/freeform),
  paket dasar + dukungan bahasa Indonesia, `biblatex` (`backend=biber`) dengan mapping gaya:
  `apa-7 → apa`, `ieee → ieee`, `chicago-author-date → chicago-authordate`,
  `vancouver → numeric` (fallback). Ketersediaan paket style di bundle offline diverifikasi test;
  bila sebuah paket miss → fallback built-in: `apa`/`chicago-authordate` → `authoryear`,
  `ieee` → `numeric`.
- **`.bib` = seluruh sitasi ter-link ke proyek** (`workspace_citation_links`) dengan `bib_key`
  persisten. Tanpa subset per-bab — biblatex hanya merender entri yang benar-benar disitasi.

## Services & API

### `SectionLatexService` (rework `section-document.service.ts`)

- `getDocument(db, { ownerUserId, sectionId })` →
  `{ source, contentVersion, updatedAt } | null` (lazy: bab belum pernah ditulis = null).
- `saveDocument(db, { ownerUserId, sectionId, source, baseVersion, author })` → union
  `{ status:'saved', artifactId, contentVersion, sectionStatus }`
  `| { status:'stale_write', currentVersion }`.
  Satu transaksi: lazy-create artifact `latex` (save pertama, v1) ATAU CAS update
  (`baseVersion` ≠ tersimpan → `stale_write`); insert `document_revisions` + prune;
  scan `\cite` → reconcile `document_citation_usages`; status bab `empty → draft`.
  Guard: bukan section `role='bibliography'` (`bibliography_not_editable`), cap ukuran.
  **Guard race lazy-create**: pointer section di-update dengan kondisi
  `WHERE document_artifact_id IS NULL`; 0 baris ter-update = kalah race → transaksi batal,
  perlakukan sebagai `stale_write` (tidak ada artifact orphan).
- `scanCiteKeys(source)`: regex keluarga perintah biblatex (`\cite`, `\parencite`, `\textcite`,
  `\autocite`, `\footcite`, `\fullcite`, bentuk kapital, multi-key koma, varian `\cites`),
  abaikan bagian ter-komentar `%`. Map key → citation via `bib_key` owner-scoped; key tak dikenal
  diabaikan (bukan error — bisa jadi entri manual user).

### `LatexBuildService`

- `compileSection(db, { ownerUserId, sectionId })` / `compileWorkspace(db, { ownerUserId, workspaceId })`:
  muat data (snapshot konsisten satu SELECT per tabel) → assign `bib_key` yang belum ada →
  assembly → `LatexCompileService.compile` →
  - sukses: simpan PDF + synctex ke R2, upsert `latex_builds` `status:'ok'` + `source_versions`;
  - error dokumen: upsert `status:'error'` + `errors` (union hasil produk, bukan throw);
  - error infra (`latex_compile_timeout` / `latex_bundle_missing` / …): `throwAppError`
    pass-through, pointer build lama tetap utuh.
- `getBuild(db, …)` → row build + signed URL PDF. Synctex dikonsumsi server-side (Fase 6);
  tidak di-expose sebagai URL publik dulu.
- Sinkron, tanpa queue. Upgrade path (queue/worker + push) tidak butuh migrasi ulang model.

### API (`apps/api`, mengikuti pola route sections existing)

- `GET  …/sections/:sid/document` — sumber + `contentVersion` (+ null bila belum ada).
- `PUT  …/sections/:sid/document` `{ source, baseVersion }` — autosave; union `stale_write`.
  Route selalu men-set `author:'user'`; nilai `agent`/`system` hanya dari pemanggilan service
  internal (loop agen Fase 6), tidak pernah dari input HTTP.
- `POST …/sections/:sid/compile` — build per-bab.
- `POST …/:id/compile` — build full-document.
- `GET  …/sections/:sid/build` / `GET …/:id/build` — build terakhir + signed URL PDF.

Path final menyesuaikan prefiks route workspaces/sections Fase 1 (detail di plan).

### Konkurensi & staleness (aturan terkunci)

1. **Semua penulis lewat satu jalur**: `saveDocument` CAS. Agen (Fase 6) menulis dengan
   `author:'agent'` + `baseVersion` dari saat ia membaca; `stale_write` → agen wajib baca ulang &
   re-propose diff. Tidak ada jalur tulis yang melewati CAS.
2. **`stale_write` tidak pernah ditangani dengan menimpa.** Konsumen wajib baca-ulang atau merge.
   Revision log menyediakan revisi basis untuk three-way merge di Fase 7.
3. **Deteksi perubahan = banding versi, bukan reload buta**: polling `contentVersion`
   (`getDocument`) dan `latex_builds.source_versions`. SSE/push bisa menyusul tanpa ubah model.
4. **Client: satu save in-flight, coalesce.** Autosave berikutnya menunggu respons sebelumnya;
   respons membawa `contentVersion` baru sebagai base save berikutnya.
5. **Respons autosave TIDAK memicu refetch/replace buffer editor.** Respons hanya memperbarui
   `baseVersion` client. Buffer client = source of truth selama sesi mengetik — teks yang diketik
   ketika save sedang in-flight tidak boleh tertimpa hasil fetch. Teks server hanya masuk buffer
   saat: open dokumen, muat-ulang eksplisit oleh user, atau alur merge `stale_write`.

### Latensi & pemicu compile (aturan terkunci)

- Mengetik = lokal (0 ms). Autosave = background puluhan-ms, tanpa compile. Apply suggestion
  Astra = operasi teks + save, instan; PDF menyusul.
- Compile = detik-an, **off-interaction-path**: PDF lama tetap tampil + indikator basi
  (banding `source_versions`), build baru swap in-place dengan posisi scroll dipertahankan.
- Satu compile in-flight per scope; trigger beruntun di-coalesce (yang terakhir menang).
- Buka halaman = baca build tersimpan (tanpa compile saat load); sumber lebih baru → indikator
  basi + tawaran/auto compile (Fase 6).

## Error handling (konvensi repo)

- Union untuk hasil produk: `stale_write`; hasil compile `status:'error'` + `errors[]`.
- `throwAppError` untuk terminal: `latex_source_too_large`, `bibliography_not_editable` (reuse),
  `section_document_not_found` (reuse), `section_not_found` (reuse), + pass-through
  `latex_compile_timeout` / `latex_bundle_missing` / `latex_compile_failed` /
  `latex_output_too_large` / `latex_invalid_input`.
- Upload R2 build gagal → throw; pointer build lama tetap valid (tidak pernah pointer menunjuk
  blob setengah-jadi).

## Testing (pola repo; DB-test gated `DATABASE_URL`)

- **Unit assembly**: `buildPreamble` per kind/style; injeksi `\chapter` + escaping judul;
  `\setcounter`; posisi `\printbibliography`; determinism output.
- **Unit scan**: `scanCiteKeys` multi-key, bentuk kapital, `\cites`, komentar `%`, key tak dikenal.
- **Integrasi save**: lazy-create → CAS → `stale_write`; revisi tertulis + prune 20; reconcile
  usages; guard bibliography & cap ukuran; guard race lazy-create.
- **Integrasi bib_key**: assign lazy, unik per owner, stabil terhadap penambahan library, tabrakan.
- **End-to-end (gaya gate)**: 2 bab + sitasi ter-link → `compileSection` & `compileWorkspace` →
  PDF benar, daftar pustaka ter-render, synctex menunjuk `sections/<id>.tex`; verifikasi paket
  biblatex style (`apa`, `ieee`, `chicago-authordate`) tersedia di bundle offline.
- **Migrasi** lolos runner; typecheck: modul latex tetap subpath `@aqsha/services/latex`
  (tidak masuk barrel root — mempertahankan deviasi #4 gate report).

## Risiko & dependency

- **OS sandbox compiler** (container read-only rootfs, no-network, PID namespace) = dependency
  penempatan **pra-cutover prod**, bukan scope fase ini. Endpoint compile hidup tanpa flag atas
  keputusan sadar; `--untrusted` memblok shell-escape tapi tidak menyandbox FS read.
- **Paket biblatex style di bundle offline** Tectonic harus tercache (`biblatex-apa` dkk.);
  diverifikasi test — miss → fallback `numeric`/built-in + sinyal ops `latex_bundle_missing`.
- **Cold-start biber** di container dingin: warm cache saat build image (terbukti di gate).
- **Kualitas nomor bab per-bab compile** bergantung `\setcounter` — cross-ref antar-bab
  (`\ref` lintas file) hanya resolve di full-document build; per-bab menghasilkan `??` (diterima,
  loop edit; preview akhir memakai full build).
- **`apps/web` legacy** tidak tersentuh (barrel root bersih dari modul latex).

## Out of scope Fase 5

Semua UI (viewer PDF, anotasi, editor); loop agen & self-repair (Fase 6); diff Accept/Reject UX
(Fase 6/7); queue/worker compile; OS sandbox; thesis-class per-kampus (`buildPreamble` = titik
sisipnya, Fase 8); ekspor DOCX (Fase 8); Yjs/kolaborasi realtime; UI riwayat versi.
