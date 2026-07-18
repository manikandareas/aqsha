# Research-first Fase 4: fondasi LaTeX (pivot editor, agen-first) — desain

Status: brainstorm disepakati 2026-07-18. **Menggantikan Fase 4 editor SuperDoc**
(`2026-07-18-research-first-phase4-editor-design.md`, di-supersede setelah gate NO-GO).
Spec ini memuat: (a) konteks pivot + keputusan terkunci, (b) arsitektur sistem + peta fase
lanjutan (Fase 4–8), (c) desain detail **Fase 4 (gate pipeline compile LaTeX + sitasi)** — satu-
satunya bagian yang sudah di-brainstorm sampai tingkat implementasi. Fase 5–8 dapat spec sendiri.

## Konteks: kenapa pivot

Gerbang GO/NO-GO editor SuperDoc (`.superpowers/sdd/progress.md`, E2E 2026-07-18) = **NO-GO**:
SuperDoc 1.45.0 gagal membuka template skripsi kampus nyata (`Invalid content for node type
bibliography`), round-trip export→import-nya sendiri crash, dan memicu loop render sitasi di app.
Kesimpulan lebih dalam: editor DOCX WYSIWYG in-app yang fidelity + fleksibel + open-source praktis
tidak ada yang matang; DOCX (OOXML) terlalu kompleks untuk diedit in-place dengan andal.

Reframing yang dipilih user (agen-first, kanonik sederhana, output presisi) menuntun ke LaTeX:
LaTeX→PDF presisi mutlak dan deterministik, plain-text (ideal untuk LLM + diff + anotasi), dan
sitasi akademik adalah home turf-nya (biblatex+biber) — melarutkan mimpi buruk citation-pill DOCX.

## Keputusan terkunci (dari brainstorm)

- **Interaksi utama = agen-first, model anotasi** (gaya "agentation"): mahasiswa menandai/
  menginstruksi di atas dokumen ter-render; Astra yang menulis/menyunting; mahasiswa tinjau &
  Accept/Reject. Mahasiswa jarang mengetik prosa langsung.
- **Kanonik = LaTeX (teks)**; **output = PDF dulu** (DOCX ditunda; sebagian kampus wajib `.docx`
  editable untuk bimbingan — jaring pengaman itu urusan fase akhir).
- **Compile = server-side, diterima aman.** Engine **Tectonic** (single-binary, tanpa shell-escape,
  ramah container).
- **Editor LaTeX = opsional/opt-in**, sekunder terhadap anotasi; sekaligus rumah tinjauan diff.
  Positioning agen-first tetap utuh selama editor bukan jalan utama.
- **Sitasi = biblatex + biber** dari `.bib` yang di-generate dari perpustakaan; sisip = `\cite{key}`.
- **Anotasi PDF ↔ sumber = SyncTeX** (mekanisme bawaan LaTeX; pola klik-ke-sumber ala Overleaf).

Risiko produk yang diakui (bukan penghalang, untuk dibahas saat desain UX): agen-first di mana
"Astra menulis hampir semua" untuk skripsi menyentuh integritas akademik + positioning
"student writing workspace". Dipilih sadar oleh user.

## Arsitektur sistem (bentuk keseluruhan)

Setiap bab punya **sumber LaTeX** sebagai kanonik. Dua surface di atas satu sumber:
- **Utama:** PDF ter-render (PDF.js) + lapisan anotasi. Anotasi di PDF → SyncTeX → lokasi sumber →
  Astra menyunting sumber → recompile → diff (Accept/Reject).
- **Opsional:** editor sumber LaTeX (CodeMirror), opt-in, escape-hatch + surface diff.

Sitasi via biblatex dari `.bib` (di-generate dari perpustakaan). Compile server-side (Tectonic,
sandboxed) → PDF + `.synctex.gz`. Preamble/thesis-class + body per-bab dirakit jadi dokumen yang
compilable.

**Menggantikan Fase 4 SuperDoc.** Backend Task 2–4 SuperDoc (saveDocument byte DOCX, render-payload,
bibliography join) sebagian besar di-rework: artifact berpindah dari byte DOCX ke teks LaTeX +
`.bib`. Konsep versioning/CAS (`content_version`) dan agregasi daftar pustaka tetap relevan.
Migrasi 0041 dst. dinilai ulang. Branch `feat/apps-svelte-migration` yang sekarang bukan fondasi
editor final.

## Peta fase lanjutan (tiap fase = spec → plan → implement sendiri)

Melanjutkan penomoran migrasi research-first (Fase 1 domain → 2 IA → 3 perpustakaan → …). "Fase 5
lama" roadmap (Astra co-writer + ekspor) **terserap** ke sini — loop agen = co-writer, ekspor kini
PDF-first.

| Fase | Isi | Catatan |
|---|---|---|
| **4** | **GATE: pipeline compile LaTeX + sitasi** — service compile Tectonic sandboxed; `.bib` dari library; biblatex+biber; SyncTeX; PDF | **Fase pertama pivot.** Buktikan asumsi paling berisiko. Nyaris tanpa UI (dev harness). GO/NO-GO. |
| 5 | Model dokumen LaTeX kanonik + assembly + storage | Preamble/thesis-class + body per-bab + komposisi `.bib`; autosave/versioning teks LaTeX. Menggantikan storage DOCX-artifact per section |
| 6 | Viewer PDF + lapisan anotasi + loop editing agen | PDF.js + SyncTeX klik-ke-sumber; anotasi pinned + antrian; Astra sunting → diff → apply; loop compile-validate + self-repair. UX inti; mungkin dipecah 6a viewer/anotasi, 6b loop agen |
| 7 | Editor LaTeX opsional + tinjauan diff | CodeMirror LaTeX (opt-in); surface diff Accept/Reject |
| 8 | Thesis-class per-kampus + ekspor DOCX best-effort | Adopsi/sesuaikan `.cls` untuk "persis pedoman kampus"; jaring pengaman kampus wajib-Word |

Fase pertama pivot = **Fase 4**: buktikan fondasi paling berisiko (compile + sitasi + SyncTeX
benar-benar jalan aman di server kita) sebelum membangun UI di atasnya.

---

# Fase 4 — Gate pipeline compile LaTeX + sitasi

**Tujuan:** buktikan server bisa mengubah `LaTeX + .bib` → `PDF` yang benar (sitasi biblatex
ter-resolve, SyncTeX ada) dengan aman & andal, sebelum ada UI. GO/NO-GO dengan kriteria eksplisit.

## Komponen (tiap unit: satu tujuan, antarmuka jelas, dependency jelas)

1. **`LatexCompileService`** (`packages/services`) — orkestrasi murni.
   - Input: `{ mainTex: string, extraFiles?: Record<path, bytes>, bib: string, engine, options }`.
   - Output union: `{ ok: true, pdf: Uint8Array, synctex: Uint8Array, log: string }`
     `| { ok: false, errors: CompileError[] }`.
   - Tak tahu HTTP/queue. Bergantung ke runner + log parser.
2. **Sandboxed runner** — lapisan subprocess terisolasi & teruji.
   - Input: working dir + command. Menjalankan Tectonic dengan batas (lihat Sandbox).
   - Output: `{ exitCode, stdout, stderr, timedOut, killedBy }`. Satu-satunya penyentuh proses OS.
3. **`BibExportService`** (fungsi di `CitationService`) — CSL-JSON perpustakaan → entri BibLaTeX
   (`.bib`) + kunci sitasi stabil bebas-tabrakan. Reuse data citation yang ada.
4. **Log parser** — log TeX/Tectonic → `CompileError[] { line, message, severity }`. Deterministik,
   teruji terpisah.
5. **Gate harness** — test/skrip perangkai jadi bukti (bukan route produksi).

## Alur data

`.bib` (dari library) + `.tex` (dirakit) → `LatexCompileService` → runner → Tectonic (+ biber untuk
biblatex) → `{ pdf, synctex.gz, log }` **atau** `{ errors[] }` → dikembalikan ke pemanggil.

## Sandbox & keamanan (inti gate)

- **Tectonic** dipilih karena tanpa shell-escape (`\write18` mati by default) — beda dari TeX Live.
- Batas per-compile: **timeout wall-clock** (mis. 30s + kill), cap memori, cap ukuran output (cegah
  `\loop` tak hingga / PDF raksasa), FS read-only kecuali tmpdir per-job, tanpa jaringan runtime.
- **Bundle paket offline:** Tectonic normalnya fetch paket saat pertama. Untuk sandbox no-network,
  warm cache/bundle saat build image; runtime cache-only. (Salah satu yang gate buktikan bisa.)

## Error handling (konvensi repo)

- Error compile (LaTeX salah) = **union return** `{ ok:false, errors }` (hasil produk yang
  diharapkan), bukan throw.
- Timeout / OOM / pelanggaran sandbox = **`throwAppError`** terminal (`latex_compile_timeout`,
  `latex_compile_failed`).
- Paket hilang (bundle kurang) = disurface jelas sebagai sinyal ops.

## Testing = bukti gate (kriteria LOLOS)

1. Doc contoh (heading, 1 persamaan, 1 `\includegraphics`, 2–3 `\cite`) + `.bib` ter-generate →
   **PDF non-kosong, jumlah halaman benar**.
2. **Daftar pustaka biblatex ter-render** dengan entri yang disitasi (biber jalan).
3. **SyncTeX ada & inverse-map**: koordinat PDF tertentu → baris sumber yang benar (dibutuhkan
   lapisan anotasi Fase 6).
4. Compile selesai dalam timeout.
5. **Sandbox memblok shell-escape**: doc ber-`\write18` TIDAK mengeksekusi.
6. Doc dengan error LaTeX → `errors[]` terstruktur (line+pesan), bukan crash.

## Risiko yang justru dituntaskan gate ini

- **Orkestrasi Tectonic + biblatex + biber** (apakah Tectonic menjalankan biber otomatis via
  `Tectonic.toml`, atau perlu pass eksplisit) — hal #1 yang dibuktikan.
- **SyncTeX di bawah Tectonic**: apakah Tectonic memancarkan `.synctex.gz` yang inverse-map-nya
  akurat (dukungan SyncTeX-nya pernah punya kuirk) — kriteria lolos #3 bergantung ini.
- **Bundle offline** vs fetch-on-demand di sandbox no-network.
- **Sandbox subprocess Bun** di container Linux VPS (ulimit/timeout via spawn).

## Penempatan produksi (ditunda)

Queue/worker BullMQ atau container compile terpisah = urusan Fase 5/6. Gate cukup jalan inline di
service + test.

## Ditunda ke fase berikutnya (bukan scope Fase 4)

Model dokumen kanonik & storage (Fase 5); viewer PDF + anotasi + loop agen + self-repair (Fase 6);
editor LaTeX opsional + diff UX (Fase 7); thesis-class per-kampus + ekspor `.docx` best-effort
(Fase 8).
