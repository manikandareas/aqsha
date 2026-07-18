# Fase 4 — Laporan gate pipeline compile LaTeX + sitasi

Keputusan: **GO** (2026-07-18)

Server terbukti bisa mengubah `LaTeX + .bib` → `PDF` yang benar (sitasi biblatex
ter-resolve via biber, SyncTeX ada dan inverse-map akurat) secara aman & andal,
di macOS (arm64) maupun di Linux (Ubuntu 22.04) tanpa jaringan. Fondasi ini
membuka Fase 5.

## Hasil kriteria

| # | Kriteria | Lokal (macOS arm64) | Docker (Ubuntu 22.04, `--network=none`) |
|---|---|---|---|
| 1 | PDF non-kosong, 2 halaman | PASS | PASS |
| 2 | Daftar pustaka biblatex (biber auto-run) | PASS | PASS |
| 3 | SyncTeX ada + inverse-map ke baris sumber | PASS | PASS |
| 4 | Selesai dalam timeout (cache warm) | PASS | PASS |
| 5 | `\write18` diblok | PASS | PASS |
| 6 | Error LaTeX → `errors[]` terstruktur (line+pesan) | PASS | PASS |

Bukti otomatis: `packages/services/test/latex-gate.test.ts` (5 test, 6 kriteria)
— lokal `bun test` = 5 pass. Docker: image `aqsha-latex-gate` build **exit-0**; langkah
`RUN --network=none … bun test test/latex-gate.test.ts test/latex-compile-service.test.ts
test/latex-runner.test.ts` = **15 pass, 0 fail** di Ubuntu 22.04 arm64 (cache-only, tanpa
jaringan). Termasuk `runSandboxed > timeout → kill` yang kini **513 ms** — sebelum fix runner
menggantung 5002 ms → gagal (lihat deviasi #6). Keenam kriteria gate lulus di kedua platform.

Catatan proses: rebuild pertama-dengan-fix sempat terhalang disk host penuh 100% (Docker
builder cache membengkak lintas iterasi → content-store I/O error). Diselesaikan dengan reset
store Docker (hapus `Docker.raw` korup, reclaim ~18 GB), lalu build bersih lulus exit-0 di atas.

## Versi terpasang

- **Lokal (macOS arm64):** tectonic 0.16.9 (brew), biber 2.17 (binary darwin
  universal SourceForge, dipasang sebagai `tectonic-biber` di `/opt/homebrew/bin`
  TANPA sudo — direktori itu milik user di Apple Silicon).
- **Image (Ubuntu 22.04):** tectonic 0.16.9 (rilis musl `aarch64-unknown-linux-musl`),
  biber 2.17 (apt `biber`, TeX Live 2022), bun 1.3.10.

## Temuan & batas yang diketahui

- **biber WAJIB 2.17** selama bundle default Tectonic 0.16.x = TeX Live 2022 /
  biblatex 3.17. Mismatch → `Found biblatex control file version X, expected Y`.
  Dipin di image (apt Ubuntu 22.04 = 2.17); pantau saat upgrade Tectonic.
- **`--untrusted` + `TECTONIC_UNTRUSTED_MODE=1` mematikan shell-escape** (`\write18`
  terbukti diblok) **tapi TIDAK menyandbox FS read** — `\input{/etc/passwd}` masih
  tembus. Enforcement penuh = OS-level sandbox (container read-only rootfs, tanpa
  network). Ini urusan penempatan produksi Fase 5/6, bukan level proses.
- **`-Z deterministic-mode` DILARANG** — menghapus path absolut sehingga merusak
  SyncTeX (inverse-map jadi tak punya file sumber).
- **Cold-start biber:** biber adalah binary PAR-packed yang mengekstrak diri ke
  `~/.par` pada invokasi pertama di proses/mesin dingin; kompilasi pertama bisa
  melewati timeout default 30 dtk. Cache hangat = prasyarat gate (Task 1 Step 4
  lokal, langkah warm di Dockerfile). Saat hangat, kompilasi doc gate ~8 dtk.
  Penempatan produksi harus meng-warm biber saat build image (Dockerfile sudah).
- **Env knob:** `AQSHA_TECTONIC_BIN` (default `"tectonic"`), `TECTONIC_CACHE_DIR`,
  `TECTONIC_UNTRUSTED_MODE`.
- **Error codes** (throwAppError vs union): dokumen salah = union `{ ok:false,
  errors }`; timeout/OOM/infra = throw `latex_compile_timeout` /
  `latex_bundle_missing` / `latex_compile_failed` / `latex_output_too_large` /
  `latex_invalid_input`.

## Deviasi dari plan

1. **biber tanpa sudo.** `/opt/homebrew/bin` writable oleh user di Apple Silicon,
   dan binary darwin biber 2.17 adalah universal Mach-O (punya slice arm64 native)
   → jalan langsung di M-series. Fallback "Docker-only" plan Step 2 TIDAK
   diperlukan; toolchain lokal aktif penuh.
2. **`mkdir -p out` ditambahkan** sebelum `tectonic --outdir out` di smoke Task 1
   Step 4 dan di langkah warm Dockerfile. Tectonic menolak `--outdir` yang belum
   ada (`output directory "out" does not exist`); perintah warm mentah plan
   melewatkan ini. `LatexCompileService` sudah `mkdir(outdir)` internal jadi test
   tak terpengaruh — hanya perintah warm mentah yang perlu perbaikan.
3. **Assertion judul di `citation-bib.test.ts`** dilonggarkan terhadap proteksi
   kurung kurawal citation-js (`title = {Metode {Penelitian}}`) dengan membuang
   kurawal sebelum cek isi judul. Proteksi case itu output biblatex yang BENAR
   (menjaga kapitalisasi saat render). Assertion **kunci** (`@\w+\{sugiyono2019,`
   dan peta `keyById`) tidak diubah.
4. **Modul latex dikeluarkan dari barrel root `@aqsha/services`** (tetap tersedia
   via subpath `@aqsha/services/latex`). Barrel root ikut di-typecheck konsumen
   `apps/web` (lewat tipe `App` `@aqsha/api`) yang lingkungan tipenya tak memuat
   `bun-types`; `runner.ts` memakai `Bun.spawn` → `Cannot find name 'Bun'`.
   Subpath granular sesuai konvensi paket ini (lihat komentar `tsup.config.ts`)
   dan mencegah global Bun bocor ke type-graph web.
5. **Cek jumlah halaman via `mdls` di smoke dilewati** (file di `/var/folders`
   tak ter-index Spotlight → `mdls` gagal). Jumlah halaman = 2 dibuktikan lewat
   `pdf-lib` `getPageCount()` di gate test.
6. **Bug runner spesifik-Linux ditemukan gate Docker & diperbaiki.** Di Linux,
   `SIGKILL` ke proses induk (mis. `/bin/sh`) meninggalkan anak (mis. `sleep`)
   yang masih menahan pipe stdout/stderr; drain `for-await` tak pernah selesai,
   dan `Promise.all([...drains, exited])` menggantung sampai anak mati → timeout
   TAK efektif. Di macOS anak ikut mati jadi bug tak terlihat — persis risiko yang
   ingin dibuktikan Task 8. Fix (`runner.ts`): tunggu `proc.exited` lalu beri
   drain jeda singkat (`DRAIN_GRACE_MS`), ambil output parsial daripada gantung.
   Batas sisa: proses runaway 1-proses (mis. tectonic loop TeX) tetap dibunuh
   bersih (kasus nyata produksi; terbukti PASS di Linux), tapi anak yatim yang
   ditinggalkan tak ikut dibunuh di level proses — pembersihan pohon proses
   diserahkan ke batas container (PID namespace) di penempatan Fase 5/6.

## Di luar cakupan Fase 4 (pra-eksis, bukan regresi)

Diverifikasi dengan menjalankan test/typecheck; kegagalan berikut ADA sebelum
Fase 4 dan di file yang tak disentuh migrasi ini:

- `bun run typecheck` penuh: error pra-eksis di `apps/web` `features/citations/api.ts`
  + `features/workspaces/api.ts` (drift kontrak Eden Treaty: `workspaceId`, `kind`,
  route sitasi). Tak berhubungan dengan latex. Modul latex Fase 4 **nol** error
  typecheck (services `tsc --noEmit` = exit 0; error `runner.ts Bun` yang sempat
  muncul sudah diperbaiki via deviasi #4).
- `bun test` penuh services: 377 pass; kegagalan sisanya env-gated —
  BillingService integration (butuh `DATABASE_URL`), research (butuh
  `FIRECRAWL_API_KEY` + jaringan live; Crossref 500/Firecrawl 503), astra-chat
  fail-open (redis). Enam file test baru Fase 4 = 32 pass, 0 fail; test citations
  eksisting = 64 pass, 0 fail (nol regresi).

## Artefak

- Modul: `packages/services/src/latex/` (types, log-parser, runner, synctex,
  compile.service, index) + `packages/services/src/citations/citation-bib.ts` +
  `CitationService.exportBib`.
- Test: `packages/services/test/latex-*.test.ts` + `citation-bib.test.ts` +
  fixtures `test/fixtures/latex/`.
- Infra bukti Linux/offline: `infra/latex-compile/Dockerfile` (image
  `aqsha-latex-gate`).

Changelog produk: tidak perlu entri (bukan perubahan user-facing).
