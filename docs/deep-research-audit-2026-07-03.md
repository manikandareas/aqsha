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

## Bagian 2 — Potensi stuck & bug step lain (STATUS: SEMUA FIXED 2026-07-07, uncommitted, owner E2E)

### Kelas A — Run bisa macet

| # | Temuan | Severity |
|---|---|---|
| A1 | Restart/deploy proses agent mid-run → run beku permanen | **Tinggi — FIXED 2026-07-07** |
| A2 | Restart di atas task stale → hang tambahan sampai full timeout | Sedang — FIXED 2026-07-07 |
| A3 | Detektor stall buta terhadap status `waiting`/`pending` | Rendah — FIXED 2026-07-07 |

**A1 — Deploy membekukan semua run aktif.** Mastra 1.47 tidak me-resume run `running` setelah
proses mati (`use-mastra-agent.ts:88` mengakuinya). Pemulihan satu-satunya = user melihat banner
stall (muncul setelah `DEEP_STALL_MS` 300 dtk) lalu klik restart; user menutup tab → beku
selamanya. Deploy Dokploy = restart container → SEMUA run /deep aktif beku tiap deploy. Fondasi
pemulihan sudah ada (task di-recover saat boot + hasil reuse by `toolCallId`) tapi workflow induk
tak ikut di-restart → hasil recovery menganggur.
**Rekomendasi:** sweep saat boot agent — list run `deep-research` status `running` → `restart()`
otomatis. Murah: step re-run me-reuse task selesai tanpa re-debit.
**Fix (2026-07-07):** `mastra.getWorkflow("deep-research").restartAllActiveWorkflowRuns()`
fire-and-forget + catch di `apps/agent/src/mastra/index.ts`. Scoped per-workflow (bukan facade)
supaya workflow internal Mastra tak ikut tersapu; hanya menyapu `running`+`waiting` (bukan
`suspended` — gerbang HITL sehat). REVISI pasca code-review: sweep dipicu REQUEST HTTP PERTAMA
(middleware `bootSweepMiddleware`, once-guard per proses), BUKAN module scope — modul ini juga
di-import smoke scripts/build/test yang menunjuk DB sama, dan sweep dari proses sekali-jalan
me-restart run milik user lalu mati di tengah (membekukan ulang, bisa dobel-dispatch). Saat
request pertama tiba, `registerDeepTaskExecutors` (module scope) + `startWorkers()` deployer
sudah jalan; run beku selalu tersentuh karena FE poll re-attach memukul server.

**A2 — `waitUntilTerminal` menunggu task stale sampai timeout penuh.** `deep-tasks.ts:153-158`:
task lama non-terminal → tunggu full `timeoutMs` (600–900 dtk) sebelum dispatch attempt baru.
Task stale (eksekutor mati, recovery tak menyentuh) membuat klik "mulai ulang" terasa hang
~10 menit lagi.
**Rekomendasi:** cek `updatedAt` task; stale melewati ambang → langsung dispatch attempt baru.
**Fix (2026-07-07, rekomendasi DIKOREKSI):** `BackgroundTask` TIDAK punya `updatedAt` — anchor
yang benar = `startedAt ?? createdAt`. `waitUntilTerminal` kini menerima deadline ABSOLUT dari
`existingTaskDeadline(task, callerTimeoutMs)` = `anchor + task.timeoutMs + margin 30s` (di-cap
timeout step pemanggil); task stale ber-deadline lampau → wait langsung keluar → dispatch attempt
baru segera. Hardening pasca code-review: task lama yang melewati deadline TANPA terminal
di-`manager.cancel()` dulu sebelum attempt baru — task pending di antrean backlog / re-dispatch
`recoverStaleTasks` (ber-`startedAt` kosong, timer `timed_out` engine baru jalan saat eksekusi
mulai) bisa masih hidup, dan tanpa cancel keduanya jalan → subagent dobel + debit dobel.

**A3 — Stall banner hanya untuk `running`.** `use-mastra-agent.ts:1156` — run beku di
`waiting`/`pending` tak pernah memicu banner. Workflow ini tak memakai step waiting hari ini;
fix gratis (tambahkan status ke kondisi).
**Fix (2026-07-07):** kondisi stall diperluas ke `running|waiting|pending`; catch `restartDeep`
kini membedakan run `pending` (`restart()` pasti menolaknya — "not active") → pesan arahan
"Hentikan, lalu kirim ulang" alih-alih error generik.

### Kelas B — Bug senyap

| # | Temuan | Severity |
|---|---|---|
| B1 | Kegagalan pasca-billing = kredit hangus tanpa jalur pulih | **Tinggi — FIXED 2026-07-03** |
| B2 | `persistDeepReport` best-effort → laporan bisa hilang setelah refresh | **Tinggi — FIXED 2026-07-03** |
| B3 | Hasil `bail` (blocked/cancelled) tak pernah sampai ke user | Sedang — FIXED 2026-07-07 |
| B4 | Stop tidak membatalkan background task in-flight | Rendah — FIXED 2026-07-07 |
| B5 | Reuse task tak menjangkau attempt ber-suffix | Rendah — FIXED 2026-07-07 |

**B1 — Kredit hangus saat step pasca-billing gagal permanen. (FIXED 2026-07-03)** Setelah debit
di `approve-plan`: `counter-evidence`/`verify-citations`/`synthesize` gagal melewati `retries: 1`,
atau `assign-citations` yang TANPA retries (blip DB pun mematikannya) → workflow `failed`. Branch
failed FE (`use-mastra-agent.ts:1134`) men-settle turn TANPA pesan error, meng-clear runId,
tanpa affordance retry (banner restart hanya utk `running`). Satu-satunya jalan user =
regenerate = DEBIT BARU.

KOREKSI atas rekomendasi awal: `run.restart()` TIDAK bisa dipakai pada run failed —
`createRestartExecutionParams` (@mastra/core 1.47) melempar `"This workflow run was not active"`
untuk snapshot ber-status selain `running`/`waiting`, dan step gagal men-persist
`workflowStatus: "failed"`. Jalur pemulihan yang benar = **`timeTravel`** (hanya menolak snapshot
`running`; stepResults lama dipertahankan, `snapshot.requestContext` di-merge → identitas
owner/billing selamat; terekspos client-js 1.28 `run.timeTravelStream({ step })`, route
`/workflows/:id/time-travel-stream` @mastra/server 1.47).

**Fix:** (1) `retries: 1` di `assign-citations` (murni DB, idempoten — penomoran dihitung ulang
deterministik lalu overwrite). (2) FE rekonsiliasi terminal SATU titik (`reconcileDeepTerminal`):
`workflow-finish` tak membawa status (payload cuma `{runId}`) → jalur live baca `runById` sekali,
rute ke handler yang sama dgn poll. (3) Branch failed (live+poll): TAHAN runId (selamat refresh)
+ state `deepFailed {runId, stepId, message}` (step failed + `steps[id].error` dari snapshot) →
kartu "Coba lagi"/"Buang" di surface. (4) `retryDeep()` = `timeTravelStream({ step: <failed> })`
→ `consumeWorkflow` (pipeline live yang sama); turn di-revive dulu (`reviveWorkflowTurn`) agar
tak lahir bubble kembar. Jaminan uang: time-travel mulai DI step gagal → `approve-plan` tak
re-eksekusi (debit `${runId}:deep` tak tersentuh); search re-run me-reuse task by `toolCallId`;
`${runId}:verify` idempoten. `canceled` tetap clear senyap (tindakan user).

**B2 — Laporan hilang bila persist gagal. (FIXED 2026-07-03)** `persistDeepReport`
(`deep-research.ts:461`) best-effort: gagal → run tetap `success`, laporan tampil live dari
snapshot, tapi refresh membaca history dari `mastra_messages` → laporan LENYAP padahal user bayar
penuh. Rekomendasi awal (throw di dalam synthesize) DIREVISI: itu mencampur failure domain LLM
(mahal, ter-reuse via task) dgn persist DB (murah) — retry granular & observabilitas kabur.

**Fix:** persist dipisah jadi step ke-8 **`persist-report`** (`retries: 2`, failure domain
sendiri): `synthesize` kini mengembalikan `SynthesizedSchema` (skema akumulatif + report +
reasoning) TANPA persist; `persistDeepReport` THROW pada kegagalan nyata (guard `!mastra`/
`!memory` tetap return — constraint environment test) + id pesan DETERMINISTIK
`deep-report:<runId>` (paritas `deep-user:<runId>`) → retry/time-travel meng-upsert baris yang
sama, mustahil bubble laporan kembar. Persist gagal permanen → run `failed` di `persist-report`
→ kartu B1 → "Coba lagi" time-travel HANYA ke step persist (nol biaya LLM, laporan dari
stepResults snapshot). FE: `persist-report` masuk `WF_STEP_ORDER` + label "Menyimpan laporan";
laporan tetap dibaca dari output `synthesize` (kontrak `reportFromOutput` tak berubah).

**Hardening pasca-review B1+B2 (code-review xhigh 2026-07-03).** Temuan review atas fix di atas,
semua diterapkan: (1) rekonsiliasi live yang GAGAL memverifikasi (`runById` blip) tak lagi
men-clear runId — diserahkan ke poll re-attach (toleran 8×) via `bumpReattach`; (2) catch
`retryDeep` tak lagi memakai `clearDeepRunIdUnlessAlive` (status `failed` = "tak hidup" → kunci
tersapu); helper itu sendiri kini MENAHAN kunci untuk status `failed` dan no-op untuk runId
`undefined` (error start run baru tak menyapu kunci run lama); (3) `retryDeep` ber-guard
`statusRef !== "ready"` + tombol "Coba lagi" disabled saat busy (chunk retry mid-stream menyasar
bubble chat yang sedang streaming); (4) guard laporan kosong PINDAH ke `synthesize` (throw) —
tanpa itu run gagal di validasi input `min(1)` `persist-report` dan time-travel me-replay laporan
kosong yang sama selamanya (trigger nyata: `deep-tasks` memaksa `text:""` utk hasil task
malformed); (5) `ensureProjected` kembali best-effort di `persistDeepReport` (kosmetik sidebar;
`ensureMemoryThread` + `saveMessages` tetap throw); (6) handler terminal poll+live disatukan
`applyDeepTerminal` (klaim "SATU titik" kini benar — tempat alami B3) + once-guard chunk terminal
(canceled memancarkan `workflow-canceled` LALU `workflow-finish`); (7) `stop()` tak lagi membuang
kartu gagal (Stop run chat ≠ keputusan atas run failed); `regenerate` membuang kartu+kunci
(memilih debit baru = run lama tuntas); (8) `lastTurnMessageIds` kini menghapus turn MENGGANTUNG
(pesan pasca-assistant-terakhir, mis. `deep-user:<runId>`) — regenerate pasca-failed tak lagi
menghapus pasangan Q&A sebelumnya; (9) flag TEMP-TEST persist digerbang env
`AQSHA_E2E_FAIL_PERSIST=1` (prod tanpa env = nol fs I/O; file /tmp nyasar tak bisa mematikan
persist); (10) `SynthesizedSchema` diramping ke subset yang dikonsumsi persist-report/FE +
`reviveWorkflowTurn` me-reset `error`. Sisa OPEN (kecil, dicatat saja): recovery failed lintas
device (discovery mengecualikan `failed`); `createdAt` laporan hasil retry tertunda mengurut
setelah chat yang lebih baru.

**B3 — `bail` blocked/cancelled = settle senyap.** `bail()` mengakhiri workflow ber-status
`success`; TIDAK ADA jalur FE yang membaca `result.status`/`reason` (live `workflow-finish`
mengabaikan payload — `mastra-timeline.ts:775`; branch success poll juga). Kasus terburuk: kuota
habis → bail di `draft-clarify` SEBELUM `ensureDeepThread` → turn settle senyap, bubble user tak
dipersist, refresh = thread kosong; user tak pernah tahu alasannya.
**Rekomendasi:** baca `result` workflow di kedua jalur → render `reason` sebagai error/kartu info.
**Fix (2026-07-07), dua lapis.** Fakta terverifikasi: engine mem-persist run bail sebagai
`success` dgn payload di `result` run (dan `runById` client-js MEMBAWA `result` — FE dulu
membuangnya). (a) FE: `applyDeepTerminal` menerima `result`, `deepNoticeFromResult` → state
`deepNotice` (hanya `status:"blocked"`; `cancelled` = keputusan user, tetap senyap) → kartu
info-only "Riset mendalam dihentikan: <reason>" (`DeepRunNoticeCard` kini `secondary` opsional +
`icon` primary); kedua jalur (poll + live-via-`reconcileDeepTerminal`) lewat satu titik. (b)
Durable: helper `persistBlockedBail` di ketiga site blocked = `ensureDeepThread` (bubble user
selamat refresh — site draft-clarify bail SEBELUM gerbang HITL mana pun) + `persistDeepNotice`
(pesan assistant id deterministik `deep-bail:<runId>`, best-effort, upsert idempoten). Site
`cancelled` (approve-plan) TIDAK disentuh.

**B4 — `run.cancel()` tidak menghentikan task subagent.** Task in-flight jalan terus sampai
selesai — tool `search_*` terus men-debit `external_search`. Bocor kecil & bounded;
`manager.cancel(taskId)` tersedia bila mau ditutup.
**Fix (2026-07-07):** `abortSignal` step (dipicu `run.cancel()`) di-thread ke `runDeepSubagentTask`
dari ketiga step task (search/counter/synthesize; + guard empty-retry search). Abort → guard awal
throw sebelum dispatch; `waitUntilTerminal` men-cancel task lama yang ditunggu; task baru ditutup
via `handle.cancel()` (listener `abort`, dilepas di `finally`). Batasan JUJUR: kooperatif —
`agent.generate` in-flight tak menerima signal (args task wajib JSON-serializable), bisa tuntas
internal lalu hasil dibuang; yang dijamin: record `cancelled`, wait keluar dini, task antre tak
mulai, debit `search_*` berikutnya berhenti. Hardening pasca code-review: abort yang mendarat
SELAMA lookup `listTasks` di-cek ulang sebelum `createBackgroundTask` + sesudah `addEventListener`
(event `abort` pada signal yang SUDAH aborted tak pernah fire — spec WHATWG; tanpa cek ulang task
tetap lahir + ditunggu full timeout).

**B5 — Dedupe task hanya mencocokkan `toolCallId` dasar.** `deep-tasks.ts:144-149`: attempt
retry ber-suffix (`:r1:<ts>`) yang BERHASIL tak ditemukan pada restart berikutnya → sub-Q itu
diriset (dan didebit) ulang. Edge case dari edge case; dicatat saja.
**Fix (2026-07-07):** lookup kini `listTasks({ runId, orderBy createdAt desc })` + filter klien
`isAttemptOf` (`=== base || startsWith(base + ":r")` — BUKAN prefix polos: `:empty-retry` kunci
logis beda, `search:1` tak boleh match `search:10`). Prioritas: completed BER-TEKS terbaru →
reuse (hardening pasca code-review `completedWithText`: completed ber-`text:""` — turn senyap
CTX-7 / result malformed — TIDAK di-reuse; tanpa guard ini throw laporan-kosong `synthesize`
menemukan task "completed" kosong yang sama di tiap retry/time-travel → run gagal PERMANEN
padahal kredit terdebit); non-terminal terbaru → tunggu (deadline A2, cancel bila lewat); semua
terminal non-completed / completed kosong → attempt baru ber-suffix. Smoke
`apps/agent/scripts/smoke-deep-task.ts` diperluas: skenario 2 (reuse suffix B5) + 3 (guard
abort B4) — PASS.

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

1. ~~**B1 + B2** — uang user (kredit hangus / laporan hilang).~~ **DONE 2026-07-03** (lihat fix di atas).
2. ~~**A1** — deploy membekukan run aktif.~~ **DONE 2026-07-07** (sweep boot per-workflow).
3. ~~**B3** — kuota habis tak pernah dikomunikasikan.~~ **DONE 2026-07-07** (kartu notice FE +
   persist durable `deep-bail:<runId>`).
4. ~~A2, A3, B4, B5 — menyusul, kecil-kecil.~~ **DONE 2026-07-07** (semua; lihat fix per-item).

Verifikasi 2026-07-07: `bun run typecheck` + lint hijau; smoke `smoke-deep-task.ts` 3 skenario
PASS (Postgres lokal sekali-pakai — VPS dev offline saat itu). Sisa: E2E owner (checklist di plan
`~/.claude/plans/buat-plan-untuk-implementasi-peaceful-patterson.md`).
