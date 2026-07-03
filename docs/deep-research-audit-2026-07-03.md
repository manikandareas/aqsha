# Audit `/deep` (deep-research) — 2026-07-03

Audit dipicu laporan owner atas thread prod `11a29a43-81b0-4a5f-8587-a467902385f3`
(run `364ac57f-1088-4117-8144-7cd698ac4a28`, tier pro, 02-07 09:20→09:33 UTC, status `success`).
Bagian 1 = temuan thread tersebut (SUDAH difix). Bagian 2 = hasil sweep lanjutan seluruh step
Workflow + mesin background-task: potensi stuck & bug yang MASIH TERBUKA.

Referensi kode: `apps/agent/src/mastra/workflows/deep-research.ts` (workflow),
`apps/agent/src/mastra/workflows/deep-tasks.ts` (background task DUR-7),
`apps/web/features/threads/lib/use-mastra-agent.ts` (poll/re-attach FE),
`apps/web/features/threads/lib/mastra-timeline.ts` (reducer/seed FE).

---

## Bagian 1 — Temuan thread prod (STATUS: FIXED 2026-07-03, uncommitted)

### 1.1 Plan rusak → riset jalan dengan 1 sub-question (FIXED)

Bukti DB: output `draft-plan` di snapshot berisi junk `{"name": "deep-research"}{"name":
"research-education"}` di awal + fence ```json TANPA penutup (persis 1 marker ``` di seluruh
teks). `parsePlan` fence-regex gagal → fallback SENYAP: `plan` = teks mentah (dgn junk),
`subQuestions = [pertanyaan mentah]` (1, bukan 5), `domain = general` (harusnya education).
Terbukti: `research_sources` fase search semua `sub_question_index = 0`.

Akar ganda:
- Junk `{"name":…}`: `deepWriter` membawa `skills` tapi semua call `toolChoice:"none"` → model
  "memanggil skill" sebagai teks.
- Parser manual rapuh (fence wajib tertutup; fallback first-`{`-to-last-`}` mencakup multi-objek).

**Fix:** `draft-plan`/`replan`/`draft-clarify` migrasi ke `structuredOutput` Mastra 1.47
(`{schema zod, errorStrategy:"strict"}` → `out.object`); `parsePlan`/`parseClarifyQuestions`/
`PLAN_JSON_CONTRACT` DIHAPUS; kardinalitas (≥2, cap 8) ditegakkan `ensurePlanOutput` di kode
(bukan `minItems` — dukungan keyword tak seragam di gateway strict-mode); `skills` dicabut dari
`deepWriter` (astra-lite tetap punya). Escape hatch gateway: `AQSHA_STRUCTURED_OUTPUT_INJECTION=1`
→ `jsonPromptInjection`. Smoke hijau: `apps/agent/scripts/smoke-structured-plan.ts`.

Sweep konsistensi: dua parser itu = SATU-SATUNYA parsing manual output LLM di repo.
Dipertahankan by-design: `generateThreadTitle` + `summarizeArticleId` + findings subagent
(teks memang produknya), `explore/suggest.ts` line-parser (typeahead murah, fast-model tanpa
jaminan json_schema, soft-fail benign). Konvensi: struktur via response_format/tool-schema;
prose untuk konsumsi manusia/prompt hilir.

### 1.2 Refresh saat search-literature terlihat "reset" (FIXED — UI-only)

Bukti DB: workflow TIDAK re-run (tiap step 1× `startedAt`, 0 URL duplikat di sources).
Yang hilang = rekonstruksi FE: detail step hanya dari `output` (baru ada saat step selesai),
progres per-subQ stream-only, invalidasi sources digerbang `status === "success"` padahal rows
ditulis DI TENGAH step (bukti: 09:22:38–58, step selesai 09:25:57).

**Fix:** `runningSearchDetail` men-seed kartu sub-agen dari output `approve-plan`/`draft-plan`
saat step running tanpa output (guard `prev ?? planned`); invalidasi sources dua titik di poll
re-attach (saat step muncul + saat success).

### 1.3 Timer reset ke 0 saat refresh (FIXED)

`ElapsedLabel` menghitung dari mount. **Fix:** prop `startedAt` durable (dihitung per-render,
aman tiba terlambat, clamp ≥0); anchor `/deep` = `steps[id].startedAt` snapshot (semua varian
`StepResult` Mastra membawanya, termasuk `StepRunning`); anchor chat normal = `createdAt` pesan
user pemicu (`precedingUserCreatedAt`).

---

## Bagian 2 — Potensi stuck & bug step lain (STATUS: OPEN)

### Kelas A — Run bisa macet

| # | Temuan | Severity |
|---|---|---|
| A1 | Restart/deploy proses agent mid-run → run beku permanen | **Tinggi** |
| A2 | Restart di atas task stale → hang tambahan sampai full timeout | Sedang |
| A3 | Detektor stall buta terhadap status `waiting`/`pending` | Rendah |

**A1 — Deploy membekukan semua run aktif.** Mastra 1.47 tidak me-resume run `running` setelah
proses mati (`use-mastra-agent.ts:88` mengakuinya). Pemulihan satu-satunya = user melihat banner
stall (muncul setelah `DEEP_STALL_MS` 300 dtk) lalu klik restart; user menutup tab → beku
selamanya. Deploy Dokploy = restart container → SEMUA run /deep aktif beku tiap deploy. Fondasi
pemulihan sudah ada (task di-recover saat boot + hasil reuse by `toolCallId`) tapi workflow induk
tak ikut di-restart → hasil recovery menganggur.
**Rekomendasi:** sweep saat boot agent — list run `deep-research` status `running` → `restart()`
otomatis. Murah: step re-run me-reuse task selesai tanpa re-debit.

**A2 — `waitUntilTerminal` menunggu task stale sampai timeout penuh.** `deep-tasks.ts:153-158`:
task lama non-terminal → tunggu full `timeoutMs` (600–900 dtk) sebelum dispatch attempt baru.
Task stale (eksekutor mati, recovery tak menyentuh) membuat klik "mulai ulang" terasa hang
~10 menit lagi.
**Rekomendasi:** cek `updatedAt` task; stale melewati ambang → langsung dispatch attempt baru.

**A3 — Stall banner hanya untuk `running`.** `use-mastra-agent.ts:1156` — run beku di
`waiting`/`pending` tak pernah memicu banner. Workflow ini tak memakai step waiting hari ini;
fix gratis (tambahkan status ke kondisi).

### Kelas B — Bug senyap

| # | Temuan | Severity |
|---|---|---|
| B1 | Kegagalan pasca-billing = kredit hangus tanpa jalur pulih | **Tinggi** |
| B2 | `persistDeepReport` best-effort → laporan bisa hilang setelah refresh | **Tinggi** |
| B3 | Hasil `bail` (blocked/cancelled) tak pernah sampai ke user | Sedang |
| B4 | Stop tidak membatalkan background task in-flight | Rendah |
| B5 | Reuse task tak menjangkau attempt ber-suffix | Rendah |

**B1 — Kredit hangus saat step pasca-billing gagal permanen.** Setelah debit di `approve-plan`:
`counter-evidence`/`verify-citations`/`synthesize` gagal melewati `retries: 1`, atau
`assign-citations` yang TANPA retries (blip DB pun mematikannya) → workflow `failed`. Branch
failed FE (`use-mastra-agent.ts:1134`) men-settle turn TANPA pesan error, meng-clear runId,
tanpa affordance retry (banner restart hanya utk `running`). Satu-satunya jalan user =
regenerate = DEBIT BARU. Padahal `run.restart()` pada run failed me-reuse semua task selesai
(nyaris gratis).
**Rekomendasi:** `retries: 1` di `assign-citations`; branch failed → tampilkan error + TAHAN
runId + tombol "Coba lagi" → `restart()`.

**B2 — Laporan hilang bila persist gagal.** `persistDeepReport` (`deep-research.ts:461`)
best-effort: gagal → run tetap `success`, laporan tampil live dari snapshot, tapi refresh membaca
history dari `mastra_messages` → laporan LENYAP padahal user bayar penuh.
**Rekomendasi:** biarkan persist THROW → `retries: 1` synthesize re-run → task
`${runId}:synthesize` completed di-reuse (tak bayar LLM ulang), hanya persist yang diulang.

**B3 — `bail` blocked/cancelled = settle senyap.** `bail()` mengakhiri workflow ber-status
`success`; TIDAK ADA jalur FE yang membaca `result.status`/`reason` (live `workflow-finish`
mengabaikan payload — `mastra-timeline.ts:775`; branch success poll juga). Kasus terburuk: kuota
habis → bail di `draft-clarify` SEBELUM `ensureDeepThread` → turn settle senyap, bubble user tak
dipersist, refresh = thread kosong; user tak pernah tahu alasannya.
**Rekomendasi:** baca `result` workflow di kedua jalur → render `reason` sebagai error/kartu info.

**B4 — `run.cancel()` tidak menghentikan task subagent.** Task in-flight jalan terus sampai
selesai — tool `search_*` terus men-debit `external_search`. Bocor kecil & bounded;
`manager.cancel(taskId)` tersedia bila mau ditutup.

**B5 — Dedupe task hanya mencocokkan `toolCallId` dasar.** `deep-tasks.ts:144-149`: attempt
retry ber-suffix (`:r1:<ts>`) yang BERHASIL tak ditemukan pada restart berikutnya → sub-Q itu
diriset (dan didebit) ulang. Edge case dari edge case; dicatat saja.

### Terverifikasi aman

- `verify-citations` tak bisa hang di network: Crossref/OpenAlex/arXiv semua via `fetchWithRetry`
  + `AbortSignal.timeout` (`packages/services/src/papers/http.ts`).
- Semua debit idempoten per-run (`${runId}:deep`, `${runId}:verify`) → restart tak double-charge.
- Isolasi per-sub-Q `search-literature` (CFG-4) → step tak pernah melempar; guard teks-kosong +
  gap jujur ke sintesis.
- `emitDetail`/`ensureDeepThread`/`subQuestionSources` best-effort — tak bisa mematikan run.
- Wiring recovery task engine benar: `backgroundTasks.enabled` + `registerDeepTaskExecutors`
  saat boot (`apps/agent/src/mastra/index.ts:93`).

### Temuan sampingan

`mastra_workflow_snapshot` prod berisi 625 baris `__mastra_notification_dispatcher` (1 baris/menit
dari scheduler internal Mastra) vs 1 baris deep-research — polusi tabel, layak dibersihkan/di-cap
terpisah.

---

## Prioritas pengerjaan (usulan)

1. **B1 + B2** — uang user (kredit hangus / laporan hilang).
2. **A1** — deploy membekukan run aktif (frekuensinya = frekuensi deploy).
3. **B3** — kuota habis tak pernah dikomunikasikan.
4. A2, A3, B4, B5 — menyusul, kecil-kecil.
