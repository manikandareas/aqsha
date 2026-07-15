# Audit: /deep "stuck" + Stop tidak bekerja — 2026-07-08

**Thread:** `44c1550d-4dba-4f5f-909e-b0afe3ddc882` ("Implementasi AI dan ML di Pertambangan")
**Run:** `5b3b08cc-71f5-491a-b8cf-1a78f85d14af` (workflow `deep-research`, `agentKind=pro`)
**Owner:** `user_3FfvShyvMCFPIHD3dxHdeMCKrgm`
**DB:** prod (postgres-prod-vps)
**Revisi:** 2026-07-08 — setiap issue diverifikasi ulang terhadap kode + DB prod (lihat verdict per
issue). ISSUE-3 dinyatakan TIDAK VALID, ISSUE-2 akar masalahnya dikoreksi (fix jauh lebih kecil),
ISSUE-4 tidak terbukti terjadi di run ini. Ditambah ISSUE-6 (freeze navigasi, di luar /deep).

## TL;DR

Run-nya **TIDAK rusak** — selesai `success` dalam ~15 menit dan menghasilkan report 241 KB. Keluhan
"nyangkut" = run berat + Stop yang no-op (progres muncul lagi 2,5 dtk setelah ditekan) + freeze
navigasi (ISSUE-6). Keluhan "tidak bisa Stop" = **bug nyata** (ISSUE-1), dan abort in-flight
(ISSUE-2) ternyata tinggal meneruskan `abortSignal` yang SUDAH dipasok Mastra. Dugaan awal
"timestamp tersimpan salah" (eks ISSUE-3) terbukti artefak alat baca, bukan bug; dugaan "banner
macet ikut menyesatkan" (ISSUE-4) tidak terbukti fire di run ini.

### Timeline sebenarnya (kolom `*Z` / UTC — otoritatif; step timing dari snapshot context)

| Waktu (UTC, 2026-07-08) | Kejadian |
|---|---|
| 04:18:05 | Thread + workflow dibuat |
| 04:18:05 → 04:20:02 | `draft-clarify` → `clarify` → `draft-plan` |
| 04:20:02 → 04:20:06 | `approve-plan` (user setujui rencana) |
| 04:20:06 → 04:24:56 | `search-literature` — 6× `literature-searcher` subagent |
| 04:24:56 → 04:28:44 | `counter-evidence` |
| 04:28:44 → 04:29:02 | `assign-citations` → `analyze-sources` |
| 04:29:02 → 04:29:19 | `verify-citations` (deterministik) |
| 04:29:20 → 04:33:25 | `synthesize` (`deep-writer`) — report 241 KB |
| 04:33:26 → 04:33:29 | `persist-report` (241.388 byte) → workflow **`success`** |

---

## Daftar Issue

### ISSUE-1 — Stop /deep no-op setelah refresh (fase `running`) 🔴 HIGH — ✅ TERVERIFIKASI VALID
- **Gejala:** Tombol Stop ditekan, workflow lanjut membakar kredit sampai selesai. UI settle
  sesaat, lalu poll berikutnya (2,5 dtk) men-seed ulang progres → tombol terasa rusak.
- **Akar masalah (terkonfirmasi):** `stop()`
  (`apps/web/features/threads/lib/use-mastra-agent.ts:1545-1568`) membatalkan workflow HANYA jika
  `deepRunRef.current` memegang handle client-js hidup (`run.cancel()`). Satu-satunya tempat
  re-attach poll men-set handle itu adalah cabang **`suspended`** (`:1265`); cabang
  **`running`/`waiting`/`pending`** hanya `seedWorkflowProgress` + poll ulang (`:1310`) dan
  membiarkan `deepRunRef.current = null`. Akibatnya, thread yang dibuka ulang/refresh/di tab lain
  selama fase running → Stop jatuh ke `subRef.current?.abort()` (hanya untuk run chat; null saat
  re-attach /deep) → no-op.
- **Bukti (diverifikasi DB prod):** snapshot run berakhir `success`, bukan `canceled`
  (`run.cancel()` tak pernah jalan).
- **Fix (dua opsi setara aman):**
  1. Di re-attach poll cabang running/waiting/pending, seed handle — pola persis cabang suspended:
     `deepRunRef.current ??= await wf.createRun({ runId: rid, resourceId: userId })`. Biaya: satu
     roundtrip `createRun` per re-attach walau Stop tak pernah ditekan.
  2. **(disarankan)** Lazy di `stop()`: bila handle null tapi `getDeepRunId(opts.threadId)` ada →
     fire-and-forget `wf.createRun({ runId, resourceId: userId })` lalu `.cancel()`. Menutup juga
     kasus lain di mana handle hilang tapi runId persist, tanpa biaya per-poll.

### ISSUE-2 — Abort tidak menghentikan `agent.generate()` in-flight 🟠 MEDIUM — ✅ VALID, akar masalah DIKOREKSI (fix trivial, bukan arsitektural)
- **Gejala:** Stop di tengah fase writer/subagent tetap menyelesaikan generasi LLM yang sedang
  jalan (hasil dibuang, debit tidak nol).
- **Akar masalah (dikoreksi):** dugaan awal "args task wajib JSON-serializable tanpa closure, jadi
  generate tak bisa menerima signal" **salah alamat**. Mastra core 1.47 SUDAH memasok signal:
  `manager.cancel()` pada task `running` men-abort controller di `activeAbortControllers`, dan
  workflow internal `__background-task` meneruskannya sebagai
  `executor.execute(task.args, { abortSignal: abortController.signal, ... })`
  (terverifikasi di dist `@mastra/core` — `workflow-4XQ5EASL.js:90`). Mata rantai yang putus ada
  di kode kita: `deepTaskExecutor` (`apps/agent/src/mastra/workflows/deep-tasks.ts:80-82`)
  **membuang parameter kedua** (`execute: (args) => executeDeepGenerate(args)`).
- **Fix (±5 baris):** teruskan signal —
  `execute: (args, opts) => executeDeepGenerate(args, opts?.abortSignal)` lalu di
  `executeDeepGenerate` oper ke `agent.generate(args.prompt, { abortSignal, ... })`
  (`AgentExecutionOptions` menerimanya — `agent.types.d.ts:382`). Bonus: timeout task Mastra
  memakai controller yang sama → generate yang melewati `timeoutMs` ikut ter-abort.

### ~~ISSUE-3 — Timestamp non-tz menyimpan waktu lokal (UTC-8)~~ — ❌ TIDAK VALID (artefak alat baca, data BENAR)
- **Verifikasi (DB prod):** cast server-side melewati parsing driver membuktikan nilai tersimpan
  identik: `"createdAt"::text = '2026-07-08 04:20:06.076'` vs
  `"createdAtZ"::text = '2026-07-08 04:20:06.076+00'`, dan
  `EXTRACT(EPOCH FROM ("createdAtZ" AT TIME ZONE 'UTC' - "createdAt")) = 0` di semua baris run ini.
  Cross-check jam independen (`chat_threads` epoch-ms) mengonfirmasi instan `*Z` benar.
- **Penjelasan "skew 8 jam":** MCP postgres server jalan lokal di Mac (TZ UTC+8) → driver mem-parse
  `timestamp without time zone` sebagai waktu LOKAL lalu me-render ISO UTC → tampil mundur 8 jam.
  DB dev menunjukkan "skew" arah & besaran sama persis (mustahil bila penyebabnya timezone server
  penulis — prod dan dev mesinnya beda). Tidak ada trigger di kedua tabel; jalur baca Mastra
  Z-first (`row.createdAtZ || row.createdAt`) → logika timeout/sweep runtime aman.
- **Aksi:** tidak ada perubahan kode. Higiene diagnosis: saat audit tabel `mastra_*` via MCP,
  SELALU pakai kolom `*Z` atau cast `::text` / `AT TIME ZONE 'UTC'`. Opsional: set `TZ=UTC` pada
  env MCP postgres server lokal supaya artefak hilang permanen.

### ISSUE-4 — Banner "macet" (DUR-5) false-positive 🟡 LOW — ⚠️ RISIKO LATEN VALID, tapi TIDAK terbukti fire di run ini
- **Verifikasi (step timing snapshot prod):** jendela diam terpanjang = `search-literature`
  **290,6 dtk** — 9 detik di bawah `DEEP_STALL_MS = 300_000` (`use-mastra-agent.ts:118`).
  `synthesize` 245 dtk, `counter-evidence` 228 dtk. Banner hampir pasti tidak pernah muncul di run
  ini; "kesan nyangkut" lebih mungkin dari ISSUE-1 (Stop no-op) + ISSUE-6 (freeze navigasi) +
  durasi run 15 menit.
- **Tetap layak diperbaiki:** run sedikit lebih berat pasti melewati ambang (di sini tinggal 9
  detik lagi), dan fase `synthesize`/`analyze` memang sah diam beberapa menit.
- **Fix:** `steps` sudah tersedia di scope poll → tampilkan copy per-fase ("sedang menyusun
  laporan…") alih-alih banner "macet" untuk step generate-berat
  (`counter-evidence`/`analyze-sources`/`synthesize`), dan/atau ambang per-step (8–10 mnt untuk
  fase berat, 5 mnt sisanya). Murni FE.

### ISSUE-5 — Run berat: banyak sumber di-drop / inventory kena budget 🟡 LOW (observasi) — ✅ VALID, angka terverifikasi DB
- **Verifikasi (DB prod):** run ini punya **257 sumber bernomor** dan **190 unit unik** `[n]×subQ`
  → 190 − cap 60 = **130 unit di-drop** (`ANALYZE_UNIT_CAP`,
  `apps/agent/src/mastra/workflows/deep-research.ts:1367`) — persis angka log. Budget inventory
  48k (`INVENTORY_CHAR_BUDGET`, `:1273`) habis ±baris 108 → ~149 baris tanpa snippet — cocok.
- **Catatan penting:** DB tetap menyimpan SEMUA 257 snippet — pemangkasan hanya saat menyusun
  prompt, tidak ada kehilangan data. Bukan error; menandakan fan-out search mengumpulkan 3–4×
  kapasitas synthesize.
- **Arah tuning:** naikkan `ANALYZE_UNIT_CAP` bertahap (klasifikasi chunked 20 unit/panggilan lite
  → cap 100 ≈ 2 panggilan ekstra) ATAU batasi sumber per sub-Q di hulu. Budget 48k lahir dari
  insiden prompt 400KB yang membuat run macet permanen — jangan dinaikkan tanpa menaikkan timeout
  task.

### ISSUE-6 — Navigasi /app ↔ thread detail: URL berubah tapi visual freeze di halaman lama 🔴 HIGH (BARU, di luar /deep)
- **Gejala:** dari detail thread klik ke `/app` (atau sebaliknya) — path di address bar berubah,
  tapi layar tetap menampilkan halaman lama tanpa feedback; dua arah.
- **Akar masalah (terkonfirmasi docs Next 16.2.6 terpasang):** kombinasi tiga hal —
  1. Kedua rute **dynamic**: `/app` home ber-`export const dynamic = "force-dynamic"`
     (`apps/web/app/app/(product)/page.tsx:10` — padahal isinya murni client shell; ada juga
     import `redirect` mati), dan `threads/[threadId]` segment dynamic tanpa
     `generateStaticParams`; `(product)/layout.tsx` membaca `cookies()`.
  2. Rute dynamic tanpa `loading.tsx` → **prefetch `<Link>` di-skip total** dan klien harus
     menunggu respons RSC server saat klik.
  3. Satu-satunya `loading.tsx` ada di `app/app/loading.tsx` — **DI ATAS** `(product)/layout` →
     boundary sudah ter-mount, tak pernah tampil untuk navigasi intra-produk (menampilkannya
     berarti meng-unmount sidebar). Komentar `app-shell.tsx:14` justru mengasumsikan "route-level
     loading.tsx fills the content area" — file itu tidak pernah dibuat.
  Dokumentasi resminya mendeskripsikan gejala persis
  (`node_modules/next/dist/docs/01-app/02-guides/instant-navigation.md:175`): *"the page fetches
  uncached data with no local boundary, so the old page stays visible until the server finishes
  rendering, making the navigation feel unresponsive."*
- **Faktor penguat:** dev = kompilasi Turbopack on-demand per rute; thread berat (report 241KB +
  257 pill sitasi) di-mount sinkron begitu payload tiba → main thread terblokir; saat run /deep
  aktif, poll 2,5 dtk dapat menginterupsi/me-restart render transisi (starvation).
- **Fix:**
  1. Tambah `app/app/(product)/loading.tsx` (cover home ↔ thread ↔ workspaces ↔ explore) +
     `app/app/(product)/threads/[threadId]/loading.tsx` (cover thread ↔ thread — segment
     `[threadId]` re-instantiate per param, boundary `(product)` tidak menangkapnya). Isi:
     skeleton area konten / `AppLoadingOverlay variant="absolute"` (sudah ada, memang dibuat untuk
     ini). Efek per docs: prefetch parsial aktif, navigasi commit seketika, sidebar tetap
     interaktif.
  2. Hapus `force-dynamic` + import `redirect` mati di `(product)/page.tsx`.
  3. Opsional/eksperimental: `unstable_instant` (hint di docs Next 16) — jangan jadikan fix utama.
  4. Follow-up terpisah: defer/virtualisasi render laporan deep raksasa (memperpendek fase beku di
     thread berat mana pun).
- **Verifikasi pasca-fix:** Network tab → klik link thread: sebelum fix, request RSC pending
  sementara layar diam; setelah fix, area konten langsung berganti skeleton saat klik.

---

## Non-issue (diverifikasi, tidak perlu aksi)
- **`chat_threads.status = 'idle'` selama run** — by design. `threadProjectionProcessor` selalu
  menulis `idle`; `streaming`/`failed` sisa kompat schema (`packages/db/src/schema/chatThreads.ts:11-12`).
  FE tidak membaca kolom ini untuk deep. Bukan penyebab Stop gagal.
- **Timestamp `mastra_*` non-tz** — eks ISSUE-3, lihat di atas: data tersimpan benar; "skew" murni
  artefak driver pembaca non-UTC. Pakai kolom `*Z`/`::text` saat audit.
- **Tidak ada akumulasi run zombie di prod** — total `deep-research`: 4 `success`, 1 `canceled`, 0
  `running` (saat audit). Cancel PERNAH bekerja (contoh `canceled` 07-07 08:39) → mekanisme sehat saat
  handle hidup.
- Noise log yang bisa diabaikan: `This storage provider does not support batch creating metrics`,
  `crossref lookup failed Crossref returned 404`.

---

## Prioritas eksekusi (revisi)
1. **ISSUE-1** (fix inti "tidak bisa Stop"; FE minimal — opsi lazy di `stop()`)
2. **ISSUE-2** (naik prioritas: ±5 baris, melengkapi ISSUE-1 — Stop benar-benar menghentikan LLM in-flight)
3. **ISSUE-6** (dua file `loading.tsx` + hapus `force-dynamic` vestigial)
4. **ISSUE-4** (copy per-fase + ambang per-step)
5. **ISSUE-5** (evaluasi tuning terpisah)
6. ~~ISSUE-3~~ dicoret — diganti catatan higiene diagnosis di Non-issue.
