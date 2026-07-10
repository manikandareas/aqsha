# Plan: Analisis Data & Statistik (SPSS-parity) via Daytona Sandbox

Tanggal: 2026-07-09 · Status: FASE 0–6 IMPLEMENTED (0–5: 2026-07-09; 6 Tier 3: 2026-07-10; halaman khusus "Analisis Data" = future, go/no-go menunggu usage data)
Branch kerja: `statistics`

## 1. Visi & positioning

Astra bisa mengerjakan apa yang mahasiswa lakukan di SPSS: upload data kuesioner → agent menyarankan pipeline uji → menjalankan analisis di sandbox Python → mengembalikan tabel gaya output SPSS + chart + **interpretasi naratif bahasa Indonesia siap Bab 4**. Ini melengkapi loop "satu-satunya app untuk skripsi": cari literatur (/deep) → tulis (artifact) → **olah data (baru)**.

Sinyal pasar (riset 2026-07-09): jasa olah data manusia dihargai Rp99rb–900rb per paket (Sigma Statistika, TamatiNaja, InfoSkrip); paket lengkap Rp300rb sudah termasuk penulisan Bab 4. Value prop yang mereka jual — interpretasi siap copy-paste, tabel rapi, pendampingan — bisa Aqsha berikan dengan biaya marginal ~Rp200–500 per sesi (biaya Daytona ~1–3 sen). Margin dan diferensiasi sangat besar.

## 2. Keputusan produk (locked 2026-07-09)

| Keputusan | Pilihan |
|---|---|
| Surface rilis 1 | **Chat-first** — semua lewat chat Astra; hasil sebagai fenced viz blocks (reuse pola deep-viz). Halaman khusus "Analisis Data" = fase future. |
| Model eksekusi | **Hybrid** — katalog template Python deterministik untuk uji-uji baku skripsi; codegen bebas hanya sebagai fallback ber-guardrail untuk permintaan di luar katalog. |
| Billing | **Kredit per-run + kuota tier** — reuse feature `sandbox_compute` yang SUDAH ada di plan.ts; Free dapat jatah kecil untuk mencoba (ubah `requiredPlanForFeature` dari `starter` → `free`, meter via kredit). |
| Sandbox | **Daytona** — akun/API key sudah ada. Snapshot prebaked, sandbox-per-thread, networkBlockAll. |

## 3. Temuan riset kunci

### 3.1 Kebutuhan statistik skripsi Indonesia (ranked)

Pipeline skripsi kuantitatif Indonesia **sangat ritualistik** dan rule-based (cutoff baku: sig > 0,05 = normal; VIF < 10; alpha > 0,60; du < DW < 4−du) — ideal untuk template deterministik. Interpretasi Bab 4 punya format baku yang bisa di-template-kan.

**Tier 1 — core loop kuesioner Likert (~80% skripsi manajemen/ekonomi/psikologi/pendidikan):**
1. Statistik deskriptif + profil responden (frekuensi, mean, SD)
2. Uji validitas — Pearson item-total **vs r tabel** (konvensi lokal wajib tampilkan r hitung ≥ r tabel, bukan cuma p-value)
3. Uji reliabilitas — Cronbach's alpha (cutoff 0,60/0,70) + "scale if item deleted"
4. Uji normalitas — One-Sample K-S **pada residual dengan Lilliefors correction** (persis output SPSS; `scipy.kstest` polos ≠ SPSS!) + Shapiro-Wilk
5. Uji asumsi klasik — multikolinearitas (Tolerance/VIF), heteroskedastisitas (**Glejser** + scatterplot SRESID×ZPRED), autokorelasi (Durbin-Watson vs tabel du), linearitas (deviation from linearity)
6. Regresi linear sederhana & berganda — persamaan, uji t parsial, uji F simultan, R²
7. Korelasi Pearson/Spearman

**Tier 2 — sering diminta:** independent/paired t-test, one-way ANOVA + Tukey, Levene, Mann-Whitney, Wilcoxon, Kruskal-Wallis, chi-square, moderasi (MRA), mediasi (path + Sobel + bootstrap; PROCESS model 1 & 4), regresi logistik, transformasi MSI (ordinal→interval).

**Tier 3 — diferensiator:** **SEM-PLS ala SmartPLS** (outer model: loading/AVE/CR/HTMT; inner: path coefficient/R²/bootstrap t — sangat naik daun untuk skripsi), EFA + KMO & Bartlett, two-way ANOVA/MANOVA/ANCOVA, CB-SEM (semopy). Data panel EViews-style: tunda.

### 3.2 Pemetaan package Python (coverage ~95%)

| Kebutuhan | Package | Catatan |
|---|---|---|
| Deskriptif, crosstab | pandas | — |
| Cronbach's alpha (+CI) | pingouin | — |
| Omega reliability | reliabiliPy | — |
| K-S ala SPSS | statsmodels `lilliefors` | **GOTCHA: bukan `scipy.kstest`** |
| Shapiro, Levene, non-parametrik, chi-square | scipy.stats | — |
| VIF, Durbin-Watson, OLS, logistik | statsmodels | tabel du/dL + r tabel perlu di-bundle sendiri |
| t-test/ANOVA + effect size + post hoc | pingouin | output kaya (Cohen's d, CI) → pelaporan APA |
| Glejser, linearity F-test, MSI, Sobel, r-tabel | **custom (kecil)** | ditulis sendiri di package `aqsha_stats` |
| Mediasi bootstrap | pingouin `mediation_analysis` | seed tetap |
| PROCESS model 1–76 | pyprocessmacro | model 6 (serial) belum didukung |
| EFA + KMO + Bartlett | factor-analyzer | — |
| CB-SEM | semopy | sintaks lavaan |
| **PLS-SEM (SmartPLS-like)** | openpls-engine | divalidasi vs SmartPLS 4; **GPL-3.0** — hanya dieksekusi sebagai program terpisah di sandbox (tidak di-link ke kode proprietary); alternatif: plspm (Apache, stale), seminr-py (muda) |
| Baca .sav/.dta | pyreadstat | value labels SPSS ikut terbaca |
| Baca .xlsx | openpyxl/pandas | — |

### 3.3 Daytona (SDK TypeScript)

- Package `@daytona/sdk` (alias lama `@daytonaio/sdk`), auth via env `DAYTONA_API_KEY`. Jalan di Bun.
- **Ekstraksi chart bawaan**: `sandbox.process.codeRun(code)` → `ExecutionResult.artifacts.charts[]` = base64 PNG + metadata terstruktur (type, title, labels, ticks, elements) — dipicu `plt.show()`. Kita dapat PNG **dan** data mentahnya (bisa re-render dengan komponen chart sendiri).
- **Lifecycle**: create dari snapshot < 1 dtk; Stopped = filesystem awet, memori bersih; **auto-stop default 15 mnt idle** (API call me-reset timer; proses internal TIDAK) → lazy `sandbox.start()` di tool call berikutnya. Variabel Python TIDAK persist antar `codeRun`; file & package persist.
- **Snapshot prebaked**: `daytona.snapshot.create` dari Dockerfile/Image builder — prebake seluruh stack stats + package `aqsha_stats`. Snapshot inactive setelah 2 minggu tak dipakai (sentuh berkala / re-activate). Default snapshot sudah berisi pandas/numpy/matplotlib.
- **Biaya**: 1 vCPU/1GB ≈ $0.067/jam → sesi analisis 10 mnt ≈ **$0.011**. Stopped ≈ hanya storage (3GiB default, 5GiB pertama gratis). $200 kredit gratis menutupi seluruh development.
- **Keamanan**: isolasi container (bukan microVM) → mitigasi: `networkBlockAll: true` (analisis statistik tak butuh egress), resource limit, sandbox per-user-thread. Tier 1/2 org punya network restriction yang justru sejalan.
- **Limits**: max 4 vCPU/8GB per sandbox; org pool Tier 2 (kartu + $25) = 100 vCPU/200GiB — cukup jauh untuk awal.

### 3.4 Seam integrasi yang sudah tersedia di codebase

- **Billing SUDAH siap**: `CreditFeature` `sandbox_compute` sudah ada di `packages/services/src/plan.ts` (10 kredit flat, gate `starter`), kolom ledger/rollup sudah ada di schema. Tinggal panggil `BillingService.consumeCredits` (idempotent via `idempotencyKey`).
- **Upload CSV sudah first-class** (`packages/services/src/artifacts/model.ts`); XLSX/.sav **belum** di allow-list → perlu ekstensi.
- **Akses file mentah**: `StorageService.getObjectBytes`/`presignGet` (agent selama ini hanya pakai `extractedText`; sandbox butuh bytes).
- **Pola viz anti-forgery sudah teruji** (deep-viz): builder deterministik → marker `{{viz:<id>}}` → injector men-stamp fence ` ```aqsha:viz ` + nomor figur, strip fence buatan model → FE gate provider. Statistik akan meniru pola ini dengan kontrak sendiri (`stats-viz`).
- **Pola tool**: `createTool` + `callerId(ctx)` + delegasi ke service; bundle baru digabung ke `astraTools` (`apps/agent/src/mastra/tools/index.ts`).
- **HITL**: `ask_questions` (tool-suspend) tersedia untuk klarifikasi pemilihan variabel.
- **Skill `verify-statistics` sudah ada** (`apps/agent/src/mastra/skills/`) sebagai grounding metodologi.
- Tidak ada kode eksekusi/sandbox apa pun saat ini — greenfield di sisi eksekusi.

### 3.5 Kenapa bukan codegen bebas penuh (bukti)

QRData (ACL 2024): GPT-4 hanya 58% akurat pada statistical reasoning berbasis data; BLADE (EMNLP 2024): agen terbaik ~40% F1; reproduksibilitas antar-run buruk (arXiv 2602.14349). Konsekuensi untuk skripsi (diuji dosen, angka harus cocok dengan "SPSS punya teman") = fatal. Maka: **LLM tidak menghitung dan tidak menulis angka** — LLM memilih uji, memetakan kolom, dan menarasikan JSON hasil. Semua angka dari template deterministik (seed tetap untuk bootstrap).

## 4. Arsitektur solusi

### 4.1 Diagram alur (chat-first)

```
User upload data.xlsx (artifact, existing)
  │
  ├─ Astra: profile_dataset(artifactId)
  │    └─ AnalysisService: get-or-create sandbox (per thread) → upload bytes
  │       → aqsha_stats profile → JSON {kolom, tipe, deteksi Likert, missing, n}
  │    └─ Astra tampilkan preview skema + sarankan pipeline (ask_questions bila perlu)
  │
  ├─ Astra: run_analysis({ analysis: "uji_validitas", dataset, args })
  │    └─ billing: consumeCredits(sandbox_compute, idempotencyKey=toolCallId)
  │    └─ template registry → python -m aqsha_stats run uji_validitas --args …
  │       → JSON hasil (angka + decision + rule + cutoff) + charts (plt.show)
  │    └─ tool result → run context (statsBlocks)
  │
  └─ Astra menulis jawaban: narasi Bab 4 dari JSON + marker {{stats:<id>}}
       └─ output processor: inject fence ```aqsha:stats``` + stamp "Tabel n"/"Gambar n"
          + strip fence buatan model (anti-forgery)
       └─ FE: rehype plugin + StatsFigureProvider → komponen tabel/chart
```

### 4.2 Komponen baru

**A. `packages/stats-py/` — package Python `aqsha_stats` (jantung fitur)**
- Satu fungsi per uji, input = path dataset + mapping kolom + opsi; output = **JSON terstruktur**: `{ analysis, tables: [...], decisions: [{rule, value, cutoff, verdict}], figures via plt.show(), meta: {n, seed, version} }`.
- Berisi kustom lokal: r-tabel (dari t-dist), tabel Durbin-Watson du/dL, Glejser, deviation-from-linearity F-test, MSI, Sobel.
- **Decision rules dihitung di Python** (bukan LLM): tiap hasil membawa verdict + rule-nya ("VIF 2,31 < 10 → tidak terjadi multikolinearitas").
- Seed tetap (`AQSHA_STATS_SEED=42`) untuk bootstrap/permutasi → reproducible.
- CLI entrypoint: `python -m aqsha_stats run <analysis> --data <path> --args <json>` → stdout JSON; dipanggil via `codeRun`.
- **Golden-fixture tests (pytest)**: dataset fixture dengan output SPSS yang diketahui, toleransi numerik — khususnya jebakan K-S Lilliefors, alpha, VIF, DW. Dijalankan di CI (uv/pip lokal, tidak butuh Daytona).
- openpls-engine (GPL) dipanggil sebagai subprocess terpisah, hanya hidup di image sandbox.

**B. `packages/services/src/clients/daytona.ts`** — mirror pola `clients/s3.ts`: env `DAYTONA_API_KEY`, `AQSHA_DAYTONA_SNAPSHOT` (nama snapshot, versioned mis. `aqsha-stats-v1`), fail-fast, singleton client.

**C. `packages/services/src/analysis/`** — `AnalysisService`:
- `ensureSandbox(threadScope)` — get-or-create per thread (tabel baru `analysis_sandboxes`: threadId, sandboxId, status, datasets uploaded, createdAt; mig 0028); lazy `start()` kalau stopped; create dengan `{ snapshot, networkBlockAll: true, autoStopInterval: 15, resources: {cpu:1, memory:2} }`.
- `stageDataset(sandbox, artifactId)` — `StorageService.getObjectBytes` → `sandbox.fs.uploadFile`; catat di tabel supaya tidak re-upload (file persist across stop).
- `profileDataset`, `runAnalysis(analysisId, args)`, `runFreeformPython(code)` — semua via `codeRun`, timeout per-call (default 120 dtk, berat 300 dtk), parse stdout JSON + `artifacts.charts`.
- **Registry katalog** `analysis/catalog.ts` (TS): id, nama ID, deskripsi, skema args (zod), tier, kredit — SSOT yang juga dipakai untuk tool description + suggest.

**D. Tools agent** — `apps/agent/src/mastra/tools/` bundle `analysisTools` → merge ke `astraTools`:
- `profile_dataset` — profil + preview skema (murah/gratis).
- `list_analyses` — katalog uji (agar model tidak mengarang nama uji).
- `run_analysis` — jalankan template; **debit `sandbox_compute` di sini** (idempotencyKey = toolCallId; debit hanya on-success, pola debit-on-success sudah ada preseden).
- `run_python_analysis` — fallback codegen ber-guardrail (lihat §5). Tier gating lebih ketat (Pro/plus+?) — open question.

**E. Kontrak viz statistik** — `packages/chat-core/src/stats-viz.ts` (subpath `./stats-viz`, sibling deep-viz, JANGAN campur union):
- Block types v1: `stats-table` (tabel gaya output SPSS: judul, kolom, baris, catatan kaki), `stats-decision` (kartu verdict rule-based), `stats-figure` (PNG base64 dari Daytona + caption; plus metadata chart untuk re-render future).
- `injectStatsBlocks(text, blocks)` — replace marker `{{stats:<id>}}`, strip fence model-authored, stamp "Tabel n" / "Gambar n".
- FE: rehype plugin + `StatsFigureProvider` gate (mount hanya pada message yang metadata-nya membawa `statsRunIds` — anti-forgery sama seperti `VizFigureProvider`).
- Injeksi di chat via **output processor** baru di rantai `astra-lite` (preseden: `projectionOutput`), sumber blocks = tool results turn berjalan.

**F. Upload & ekstraksi** — `packages/services/src/artifacts/model.ts`: tambah `xlsx` (+ `sav` fase 2) ke allow-list ekstensi/MIME + artifact type `spreadsheet` (atau reuse `csv` family `data`); `extract.ts`: XLSX → preview text (sheet pertama, n baris) untuk RAG, bytes tetap jadi sumber sandbox.

**G. Skill** — `apps/agent/src/mastra/skills/analisis-statistik/SKILL.md`: playbook pipeline ritual (validitas → reliabilitas → normalitas → asumsi klasik → regresi → hipotesis), kapan uji apa, format narasi Bab 4, larangan menulis angka di luar JSON hasil. Ko-eksis dengan `verify-statistics`.

**H. Slash command** — `packages/chat-core/src/index.ts` `promptCommands`: `/analisis` (grup baru atau grup Olah Data) yang memandu flow upload→profil→pipeline.

### 4.3 Lifecycle & biaya sandbox

- 1 sandbox per thread; idle 15 mnt → auto-stop (biaya → ~0); tool call berikutnya lazy-start (file/dataset masih ada).
- Kebersihan: worker BullMQ ringan `analysis-sandbox-cleanup` (cron, pola `artifact-cleanup`) men-delete sandbox milik thread yang tak aktif > 7 hari (sebelum auto-archive) + saat thread/account dihapus (hook di account-deletion worker).
- Estimasi biaya: sesi aktif 10 mnt ≈ $0.011 → dengan 10 kredit/run dan harga kredit existing, margin sangat aman.

## 5. Guardrails (hybrid template + codegen)

1. **Template-first**: instruksi agent memaksa `list_analyses` → `run_analysis`; `run_python_analysis` hanya bila katalog tidak memuat permintaan (dan tool description menyatakan itu).
2. **Angka hanya dari JSON**: narasi digenerate dari hasil terstruktur; injector men-strip fence/figur buatan model; decision verdict dihitung Python.
3. **Codegen fallback ber-guardrail**: sandbox `networkBlockAll`; timeout ketat; stdout JSON-only convention; hasil ditandai di UI sebagai "analisis kustom — di luar katalog terverifikasi"; charts tetap via `plt.show()`.
4. **Assumption-gate**: hasil uji asumsi membawa rekomendasi cabang deterministik (tidak normal → sarankan non-parametrik/transformasi) di JSON, bukan improvisasi model.
5. **Golden fixtures vs SPSS**: pytest parity di `packages/stats-py` (CI) + sync-test TS↔Python untuk id katalog (preseden vocab sync-test chat-core↔services).
6. **Auditability**: kode template yang dieksekusi + versi package dicantumkan di metadata hasil (toggle "Lihat kode" ala Julius AI) — penting untuk pertanggungjawaban saat sidang.

## 6. Billing

- Reuse `sandbox_compute`: ubah `requiredPlanForFeature` → `free` (keputusan produk: Free bisa mencoba, dibatasi kredit bulanan 150 ≈ sedikit run setelah dipakai chat).
- `estimateCredits`: pertahankan flat 10/run untuk `run_analysis`; usul `profile_dataset` gratis (murah, penting untuk onboarding); `run_python_analysis` 10; SEM-PLS/analisis berat (bootstrap 5000) 20 — finalisasi saat implementasi fase 2.
- Debit di tool `run_analysis` on-success, `idempotencyKey = ${toolCallId}:sandbox_compute`; `requireEntitlement` sebelum eksekusi (gate-first, tanpa charge saat blocked — pola plan-gate /deep).
- FE: hint kredit di composer + usage card (pola `deepRunsUsed/Limit` bila mau kuota terpisah — default: kredit saja dulu).

## 7. Fase implementasi (detail)

Prinsip lintas fase: tiap fase berdiri sendiri dan shippable; `bun run typecheck` + test hijau sebelum lanjut; ikuti kebiasaan merapikan kode (dedupe, dead-code, typed contracts); fase 2/3 wajib golden fixtures hijau.

### Fase 0 — Infra sandbox (fondasi)

Tujuan: koneksi Daytona terbukti jalan end-to-end dari kode repo, snapshot siap pakai.

Scope:
- Tambah dependency `@daytona/sdk` di `packages/services`.
- `packages/services/src/clients/daytona.ts` — singleton client, env `DAYTONA_API_KEY` + `AQSHA_DAYTONA_SNAPSHOT` (fail-fast bila fitur aktif tanpa key; pola `clients/s3.ts`). Update `.env.example` apps/agent + apps/api.
- `packages/stats-py/` skeleton: struktur package `aqsha_stats` (entrypoint `python -m aqsha_stats run <analysis>`), `pyproject.toml`, pytest setup, 1 analisis dummy (`profile`) untuk smoke.
- `packages/stats-py/Dockerfile` (python 3.12-slim + pandas/scipy/statsmodels/pingouin/factor-analyzer/pyreadstat/openpyxl/matplotlib + aqsha_stats) + script `bun run stats:snapshot` untuk build/push snapshot versioned (`aqsha-stats-v1`).
- Smoke script (bukan test CI): create sandbox dari snapshot → upload CSV kecil → `codeRun` profil → verifikasi stdout JSON + `artifacts.charts` → delete.

Deliverable: snapshot `aqsha-stats-v1` hidup di akun Daytona; smoke script PASS.
Acceptance: create-dari-snapshot < 5 dtk; chart PNG ter-decode; tidak ada egress (networkBlockAll dites dengan `codeRun` yang mencoba fetch → gagal).

### Fase 1 — Ingestion & profil dataset

Tujuan: agent bisa "melihat" dataset user: upload XLSX/CSV → preview skema di chat.

Scope:
- `packages/services/src/artifacts/model.ts`: allow-list `.xlsx` (MIME + ekstensi + type map); `extract.ts`: branch XLSX → preview text (sheet pertama, ±50 baris) untuk RAG.
- Mig 0028: tabel `analysis_sandboxes` (id, ownerUserId, threadId, sandboxId, status, stagedDatasets jsonb, createdAt, lastUsedAt).
- `packages/services/src/analysis/analysis.service.ts`: `ensureSandbox` (get-or-create per thread, lazy `start()` bila stopped), `stageDataset` (bytes dari `StorageService` → `fs.uploadFile`, catat di stagedDatasets), `profileDataset` (JSON: kolom, tipe, deteksi Likert, missing, n).
- Tool `apps/agent/src/mastra/tools/profile-dataset.ts` (bundle `analysisTools` baru → merge ke `astraTools`); tanpa debit kredit.
- Update instruksi agent: hapus asumsi "TANPA sandbox", tambah panduan singkat kapan memprofil dataset.

Deliverable: di chat, upload `data.xlsx` → tanya "tolong lihat data saya" → Astra menampilkan ringkasan skema.
Acceptance: sandbox di-reuse antar tool call dalam satu thread (cek `analysis_sandboxes` hanya 1 row/thread); dataset tidak di-re-upload bila sudah staged; sandbox stopped → call berikutnya auto-start tanpa error.

### Fase 2 — Katalog Tier 1 + billing

Tujuan: seluruh pipeline ritual skripsi bisa dijalankan dengan angka yang match SPSS.

Scope:
- `aqsha_stats` analisis Tier 1: `descriptive`, `uji_validitas` (Pearson + r-tabel), `uji_reliabilitas` (alpha + item-deleted), `uji_normalitas` (Lilliefors + Shapiro, pada residual maupun variabel), `uji_multikolinearitas` (Tolerance/VIF), `uji_heteroskedastisitas` (Glejser + scatterplot), `uji_autokorelasi` (DW + tabel du/dL), `uji_linearitas`, `regresi_linear` (sederhana/berganda: persamaan, t, F, R²), `korelasi` (Pearson/Spearman). Setiap hasil membawa `decisions[]` (rule + cutoff + verdict).
- Golden fixtures pytest: dataset fixture + output SPSS yang diketahui, toleransi numerik; jalan di CI lokal (uv), tanpa Daytona.
- `packages/services/src/analysis/catalog.ts`: registry TS (id, nama ID, deskripsi, zod args, kredit) + sync-test id katalog TS ↔ Python (pola vocab sync-test chat-core↔services).
- Tools `list_analyses` + `run_analysis`; debit `sandbox_compute` on-success (`idempotencyKey = ${toolCallId}:sandbox_compute`), `requireEntitlement` gate-first; `plan.ts`: `requiredPlanForFeature` sandbox_compute → `free`.

Deliverable: "jalankan uji validitas untuk variabel X1" → tabel angka benar + verdict di chat (masih teks polos, belum viz).
Acceptance: golden fixtures 100% hijau (khusus Lilliefors match SPSS); debit kredit idempoten (retry tool tidak double-charge); user Free kehabisan kredit → pesan blocked yang rapi (bukan throw).

### Fase 3 — Output layer (nilai jual terlihat)

Tujuan: hasil tampil seperti "output SPSS + interpretasi Bab 4", bukan teks polos.

Scope:
- `packages/chat-core/src/stats-viz.ts` (subpath `./stats-viz`): block `stats-table`, `stats-decision`, `stats-figure` (v:1) + `injectStatsBlocks` (marker `{{stats:<id>}}`, strip fence buatan model, stamp "Tabel n"/"Gambar n").
- Output processor baru di rantai `astra-lite`/`astra-pro`: kumpulkan blocks dari tool results turn berjalan → inject ke teks final; tandai message metadata `statsRunIds`.
- FE `apps/web/features/threads/components/stats-viz/`: rehype plugin + `StatsFigureProvider` gate (mount hanya bila metadata membawa `statsRunIds`) + komponen tabel gaya SPSS, kartu verdict, figur PNG (+ error boundary per block, pola deep-viz).
- Skill `apps/agent/src/mastra/skills/analisis-statistik/SKILL.md`: playbook pipeline ritual, pemilihan uji, format narasi Bab 4 + APA, larangan menulis angka di luar JSON hasil (`bun run skills:gen`).
- Slash command `/analisis` di `promptCommands` chat-core.

Deliverable: **demo end-to-end: upload kuesioner → `/analisis` → pipeline validitas→reliabilitas→asumsi→regresi → draft narasi Bab 4 dengan tabel & figur resmi.**
Acceptance: fence `aqsha:stats` yang ditulis model sendiri (forgery) ter-strip dan render sebagai code block; angka di narasi == angka di JSON (spot-check); nomor Tabel/Gambar sekuensial.

### Fase 4 — Codegen fallback (hybrid lengkap)

Tujuan: permintaan di luar katalog tetap terlayani, dengan guardrail.

Scope:
- Tool `run_python_analysis`: LLM menulis Python → `codeRun` di sandbox yang sama (networkBlockAll, timeout ketat, konvensi stdout JSON-only, chart via `plt.show()`); debit `sandbox_compute`.
- Instruksi + tool description: wajib coba `list_analyses`/`run_analysis` dulu; fallback hanya bila katalog tak memuat.
- UI: hasil codegen diberi label "analisis kustom — di luar katalog terverifikasi" + toggle "Lihat kode" (auditability ala Julius AI).

Deliverable: permintaan non-katalog (mis. "hitung indeks komposit lalu uji trend") terjawab.
Acceptance: prompt yang cocok katalog TIDAK jatuh ke codegen (uji dengan beberapa prompt baku); kode error → agent memperbaiki maksimal N retry lalu menyerah dengan pesan jelas.

### Fase 5 — Tier 2 + export file

Tujuan: paritas dengan paket "jasa olah data lengkap" + deliverable file.

Scope:
- `aqsha_stats` Tier 2: t-test (independent/paired), one-way ANOVA + Tukey, Levene, Mann-Whitney, Wilcoxon, Kruskal-Wallis, chi-square, moderasi MRA, mediasi (pingouin bootstrap + Sobel + pyprocessmacro model 1 & 4), regresi logistik, transformasi MSI. Golden fixtures diperluas.
- Input `.sav`/`.dta`: allow-list + baca via pyreadstat (value labels SPSS ikut terbaca → profil lebih kaya).
- **Export hasil (generate di sandbox → `fs.downloadFile` → artifact baru di library):**
  - `.docx` — tabel output bergaya SPSS + narasi interpretasi (siap tempel Bab 4);
  - `.xlsx` — tabel mentah hasil semua uji;
  - **`.sav` — dataset olahan via `pyreadstat.write_sav`** (skor total per variabel, hasil MSI, variabel komputasi) lengkap dengan variable/value labels — untuk mahasiswa yang dimintai "file SPSS" oleh dosen. Catatan batas: file output/viewer `.spv` TIDAK bisa dihasilkan (format proprietary IBM, tak ada writer); padanannya adalah `.docx` tabel output.
- Tool `export_analysis_results` + wiring artifact library.

Deliverable: sesi analisis lengkap menghasilkan 3 file unduhan di library.
Acceptance: `.sav` hasil ekspor terbuka di SPSS asli dengan labels utuh; `.docx` tabel rapi; artifact muncul di library + bisa di-@mention.

### Fase 6 — Tier 3 + surface khusus (Tier 3 IMPLEMENTED 2026-07-10; halaman khusus = future)

Tujuan: diferensiator premium + fondasi halaman "Analisis Data".

Scope (terimplementasi — 6 analisis baru, total katalog 27):
- **`sem_pls`** — SEM-PLS ala SmartPLS via **openpls-engine 1.10.0** (jauh lebih kaya dari perkiraan: SRMR/d_ULS, HTMT, Fornell-Larcker, f², efek total): outer loadings + bootstrap t, alpha/CR/AVE, discriminant validity, R², path coefficients + CI. **Isolasi GPL**: engine TIDAK di-import `aqsha_stats` — semua komputasi di `packages/stats-py/openpls_driver.py` (file berlisensi GPL-3.0 terpisah, bukan bagian wheel) sebagai subprocess ber-IPC JSON stdin/stdout; engine terpasang via dependency-group `sandbox` (uv.lock-pinned, hanya di image + venv tes). **Determinisme bootstrap**: start method `fork` + `np.random.seed` + `processes=1` (child mewarisi state RNG); default 1000 sampel, clamp 100–2000 (engine murni-Python ±50 ms/iterasi — 5000 melewati timeout heavy 300 dtk; floor 100 untuk tes).
- **`cb_sem`** — CB-SEM via **semopy 2.3.11 (MIT, dependency langsung)**: loadings, jalur struktural (C.R./Sig.), goodness of fit (Chi-Square, CFI, TLI, GFI, AGFI, RMSEA, AIC/BIC). Kolom ber-titik di-rename ke token aman sebelum parsing sintaks lavaan; laten 1 item otomatis jadi observed variable. Args sama dengan `sem_pls` (latents + paths `"X -> Y"`).
- **`analisis_faktor`** — EFA + KMO & Bartlett **implementasi sendiri** (PCA extraction dari matriks korelasi + varimax via `statsmodels.multivariate.factor_rotation`, BSD): **factor-analyzer DIBUANG** (GPL-2.0 DAN rusak dengan scikit-learn ≥1.6 — `force_all_finite` rename). KMO/Bartlett tervalidasi identik vs factor_analyzer (golden di test). Output: KMO & Bartlett, Communalities (+MSA per item), Total Variance Explained, Rotated Component Matrix.
- **`uji_anova_dua_arah`**, **`uji_ancova`**, **`uji_manova`** — statsmodels GLM. GOTCHA paritas SPSS: Type III SS **wajib sum-to-zero contrasts** (`C(..., Sum)`); nama kolom bebas via patsy `Q(...)`. Two-way: Levene per sel + Tests of Between-Subjects Effects; ANCOVA: + Estimated Marginal Means (kovariat di grand mean; cross-check pingouin.ancova); MANOVA: Pillai/Wilks/Hotelling/Roy.
- Kredit: `cb_sem`/`sem_pls` = 20 (sem_pls heavy), GLM/EFA = 10. **Open question #2 resolved: TANPA gating tier terpisah** — kredit-only (cap bulanan Free 150 sudah membatasi; kontrak katalog tak berubah).
- Tests: `tests/test_tier3.py` (golden KMO/Bartlett vs factor_analyzer; t-stat bootstrap PLS deterministik seed 42; cross-check statsmodels/pingouin) — suite penuh 85 pass.
- **OWNER ACTION: rebuild snapshot** (`bun run stats:snapshot aqsha-stats-v2` + update `AQSHA_DAYTONA_SNAPSHOT` di apps/agent/.env + apps/api/.env) — Dockerfile kini menyertakan semopy + openpls-engine (`uv export --group sandbox`) + COPY `openpls_driver.py`.

Scope (masih future):
- Halaman khusus "Analisis Data" (data view + variable view + panel hasil, agent sebagai copilot) — arsitektur fase 1–5 (service + katalog + stats-viz contract) sudah surface-agnostic sehingga ini murni kerja frontend + routing.

Deliverable: skripsi berbasis SmartPLS terlayani; keputusan go/no-go halaman khusus berdasar usage data fase 3–5.

## 8. Risiko & mitigasi

| Risiko | Mitigasi |
|---|---|
| Angka ≠ output SPSS teman (Lilliefors, dsb.) | Golden fixtures vs SPSS; pakai statsmodels `lilliefors`, bukan `scipy.kstest` |
| LLM salah pilih uji / halu interpretasi | Template-first, decision rules di Python, skill playbook, angka hanya dari JSON, injector anti-forgery |
| Sandbox idle-stop di tengah sesi panjang | Lazy `start()` on-demand; file persist; variabel tidak diandalkan antar call (stateless per codeRun by design) |
| Isolasi container (bukan microVM) | `networkBlockAll`, resource limit, sandbox per-thread per-user, ephemeral cleanup |
| GPL openpls-engine | Hanya dieksekusi sebagai program terpisah dalam image sandbox; tidak di-link/di-bundle ke kode app; review ulang saat fase 6 |
| Snapshot inactive 2 minggu | Cron sentuh/aktivasi berkala atau re-create saat deploy |
| Data sensitif responden di sandbox pihak ketiga | Retensi pendek (cleanup 7 hari), dokumentasikan di privacy policy; opsi self-host Daytona (open source) bila perlu di masa depan |
| pyprocessmacro tak dukung model 6 | Fallback: mediasi serial via semopy path model; atau tandai "belum didukung" |

## 9. Open questions (untuk diputuskan saat implementasi)

1. `run_python_analysis` (codegen) dibuka untuk semua tier atau Pro-only?
2. ~~SEM-PLS digating ke tier atas?~~ **RESOLVED 2026-07-10: kredit-only** (20 kredit/run, tanpa gating plan — cap kredit bulanan sudah membatasi; gating bisa ditambah belakangan tanpa ubah kontrak katalog).
3. Perlu kuota terpisah `sandboxRunsUsed/Limit` ala deep runs, atau kredit saja cukup?
4. Retensi dataset di sandbox: 7 hari OK, atau hapus segera setelah thread idle?
5. Export "Bab 4 draft" langsung ke artifact BlockNote (integrasi `request_document_edit`)?

## 10. Referensi

- Daytona: daytona.io/docs (getting-started, process-code-execution, typescript-sdk/charts, snapshots, limits, billing, network-limits, guides/data-analysis-with-ai) · pricing: vCPU $0.014/s-ish (lihat §3.3)
- pyprocessmacro: github.com/QuentinAndre/pyprocessmacro · factor-analyzer: factor-analyzer.readthedocs.io · semopy: semopy.com · openpls-engine: github.com/jojacobsen/openpls-engine (validasi vs SmartPLS 4, SSRN doi:10.2139/ssrn.6869001)
- Bukti risiko codegen: QRData (ACL 2024 findings-acl.548), BLADE (EMNLP 2024 findings-emnlp.815), DiscoveryBench (arXiv 2407.01725), reproduksibilitas (arXiv 2602.14349)
- Harga jasa olah data: sigmastatistika.com, tamatinaja.com, infoskrip.com, educativa.id
