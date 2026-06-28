# Rencana Perbaikan Isu Agent "Astra" — G1–G8 (2026-06-28)

> **STATUS: DIIMPLEMENTASI (uncommitted). Gate hijau: typecheck (7 ws) + lint (0 error) + test (db 22 / chat-core 6 / services 239 / api 76, 0 fail).** Owner approve: G1=durable-thread, G2=Opsi A.
> Sisa = E2E browser (butuh login Clerk, tak bisa otomatis) untuk verifikasi runtime: refresh mid-stream, /deep plan-gate suspend/resume, re-attach refresh, citation_number DB. File ringkas perubahan + gotcha: lihat memory `astra-agent-fixes-g1-g8-impl`.
>
> Slice & file disentuh: **S1** `use-mastra-agent.ts`,`mastra-timeline.ts`,`mastra-client.ts`. **S2** `mastra-timeline.ts`. **S3** `mastra-timeline.ts`,`use-mastra-agent.ts`,`mastra-chat-thread-surface.tsx`. **S4** `chat-core/index.ts`,`composer.tsx`,`mastra-chat-thread-surface.tsx`,`use-mastra-agent.ts`,`mastra-timeline.ts`,`workflows/deep-research.ts`. **S5** `researchSourceRepo.ts`,`research/index.ts`,`lib/tool-context.ts`,`lib/research.ts`,`workflows/deep-research.ts`,`mastra-chat-thread-surface.tsx`,`mastra-timeline.ts`,`sources-panel.tsx`,`db/test/chat-retrieval-repos.test.ts`.

> Status awal: MENUNGGU PERSETUJUAN (Fase 2). Sumber: `docs/e2e-agent-findings-2026-06-28.md` + verifikasi ulang kode/DB + riset docs resmi (installed `@mastra/core` 1.47.0, `@mastra/client-js` 1.28.0, `ai` 7.0.0-beta.178).
> Keputusan terkunci owner: **G1 = durable-thread API**, **G2 = jalankan Workflow `deep-research`**.

## Ringkasan arah

- **Chat (`astra-lite`)** pindah dari `agent.stream()` (terikat koneksi) ke **durable-thread API**: `sendMessage` (run terlepas dari koneksi) + `subscribeToThread` (re-attach by-thread, in-memory replay) + `abortThread` (Stop) + `sendToolApproval` (HITL). Ini memperbaiki **G1, G5, G8** sekaligus.
- **`/deep`** dijalankan via **Workflow `deep-research`** — dua sub-jalur dipertimbangkan (A: FE drive workflow; B: agent orkestrasi workflow). Rekomendasi = **A** (fidelitas laporan tercitasi terjamin). Lihat §G2.
- **G4** (citation_number + render Sumber) butuh kode BARU di jalur mana pun — bukan otomatis dari wiring workflow.

## Bukti API resmi (ground-truth, versi terpasang)

- `subscribeToThread({threadId,resourceId?})` → `Response & {processDataStream({onChunk,reconnect}), abort(), unsubscribe()}` — client-js `dist/resources/agent.d.ts:133-143`. Server route `POST /agents/:id/threads/subscribe` auto-exposed (`@mastra/server` chunk-XRE4KFIZ.js:1420). Proxy `/mastra-api/*`→`/api/*` sudah mencakup.
- `sendMessage` meluncurkan run **detached** (tak ada `abortSignal` request yang ditanam ke `agent.stream(...untilIdle...)`) → run **tak ke-abort saat klien disconnect** (core chunk-SOTPACNN.js:6789-6834). Kontras: `STREAM_GENERATE_ROUTE` menanam `abortSignal` → itu akar G1 sekarang.
- Reconnect/replay = buffer in-memory `parts[]` per-run, di-replay dari index 0 saat (re)subscribe (core chunk-SOTPACNN.js:5696-5736, 6442-6443). Single-replica → jalan tanpa config tambahan. (Multi-replica perlu `CachingPubSub`; deploy kita single-replica.)
- Persist pesan tetap **onFinish** (bukan inkremental) — reconnect mid-run pakai buffer, refresh pasca-selesai pakai `mastra_messages` (sama seperti sekarang).
- `ChunkType` SAMA dengan path `stream()` → reducer `mastra-timeline.ts` mostly tetap jalan; tiap chunk dapat field `runId` tambahan; ada chunk `{type:'abort'}` (core `dist/stream/types.d.ts:844`).
- `observe({runId,offset})` **TIDAK** untuk plain agent (hanya durable/evented agent) → untuk chat pakai `subscribeToThread`, bukan observe.
- G8: assertion `tool_result must be preceded by a tool_call` hanya di `processChatResponse_vNext` (path `approveToolCall` terikat-koneksi). `sendToolApproval` + `subscribeToThread` pakai `sharedProcessMastraStream` (tanpa assertion) → G8 hilang.
- AI SDK v7: `finishReason` tak punya `'abort'` (ai `dist/index.d.ts:125`); abort out-of-band. `isAbortError` ada di `@ai-sdk/provider-utils`.
- Workflow client: `getWorkflow('deep-research').createRun({runId?,resourceId?})` → `Run` dengan `start/stream/observe({offset})/resume({step,resumeData})/resumeStream/cancel/runById`. Routes `POST /workflows/:id/{create-run,stream,observe,resume,resume-stream}` + `GET /runs/:runId`. `stream()` mengembalikan **bare ReadableStream** (`for await`, BUKAN processDataStream). Chunk = **step-level** (`workflow-step-start/result/suspended/finish`); token subagent TIDAK stream karena step pakai `.generate()`. `workflow-step-suspended.payload.suspendPayload` = `{plan,subQuestions}`.

---

## G1 🔴 — Refresh saat turn aktif (durable-thread)

**Root cause (terkonfirmasi):** (1) proxy `route.ts:86` `req.signal→upstream.destroy()` membunuh request upstream → server abort generasi; (2) persist onFinish; (3) FE tak re-attach run aktif. DB: ekor pesan terpotong (`…melaporkan potensi` len 480).

**Solusi (docs):** migrasi `use-mastra-agent.ts` ke durable-thread.
- Mount: `subscribeToThread({threadId, resourceId})` SEKALI (long-lived), `processDataStream({onChunk, reconnect:true})`. Jika ada run aktif → buffer di-replay → token sebelumnya muncul + lanjut live (G1 fix). Seed history `listMessages()` tetap untuk turn yang sudah selesai.
- Kirim turn: `sendMessage({message, resourceId, threadId, ifIdle:{streamOptions:{context}}})` → `{runId}`. Run detached → refresh tak meng-abort.
- Status **chunk-driven** (bukan per-call try/finally): `start`/`step-start`→streaming; `abort`/`error`/terminal `finish`→ready.
- `clientContext` (ekspansi command + @mention) pindah ke `ifIdle.streamOptions` (cek field `context` di streamOptions saat impl).

**File:** `apps/web/features/threads/lib/{use-mastra-agent.ts, mastra-timeline.ts, mastra-client.ts}`, `apps/web/features/thread-experience/components/mastra-chat-thread-surface.tsx`. Proxy tak perlu diubah (subscribeToThread SSE; disconnect cuma tutup subscriber, run jalan terus).

**Risiko:** API `@experimental` (501 bila version-skew; di 1.47 aman). Multi-replica perlu CachingPubSub (deploy single-replica → moot, dokumentasikan). Reducer harus handle `abort` chunk + multi-run (start/finish berulang per runId).

**Test:** kirim prompt panjang → refresh saat streaming → token lanjut, jawaban utuh (DB ekor berakhir tanda baca). `bun run typecheck/lint/test` + repro browser + cek `mastra_messages`.

---

## G5 🟡 — Stop AbortError (fall-out G1)

**Root cause:** `stop()` `abortRef.abort()` → reader `processDataStream` lempar `AbortError` → diset `state.error`.

**Solusi (docs):** dengan durable-thread, Stop = `subscription.abort()` (= `abortThread`, cancel server-side) → server kirim chunk `{type:'abort'}`, SSE tutup bersih, **tanpa** AbortError. Teardown unmount = `unsubscribe()` (tak throw). **Hapus** `AbortController`/`abortRef`/`getSignal` + injeksi signal ke fetch (`mastra-client.ts`). Tambah `case "abort"` di reducer (settle turn, status→ready). Guard sisa AbortError via `err?.name==='AbortError'` bila perlu.

**File:** `use-mastra-agent.ts`, `mastra-timeline.ts`, `mastra-client.ts`.

**Test:** Stop saat streaming → berhenti, teks parsial tetap, tombol kembali kirim, **tanpa** error overlay/`state.error`.

---

## G8 🟡 — Resume approval `tool_result must be preceded by a tool_call` (fall-out G1)

**Root cause:** `approveToolCall` (streaming) → `processChatResponse_vNext` rekonstruksi UI-message dgn `toolInvocations=null` → assertion throw (cuma console.error, fungsional OK).

**Solusi (docs):** ganti `approveToolCall/declineToolCall` → `sendToolApproval({resourceId,threadId,toolCallId,approved})` (non-stream, `{accepted,runId}`). Output resume mengalir via `subscribeToThread` yang sudah aktif (`sharedProcessMastraStream`, tanpa assertion). Reducer `completeToolPart` sudah toleran tool-result tanpa pasangan. Cek live: apakah tool `requireApproval` juga emit chunk `tool-call` (kalau tidak, render hasil dari entry approval).

**File:** `use-mastra-agent.ts`, `mastra-chat-thread-surface.tsx` (handler approve/decline).

**Test:** picu `delete_artifact` → kartu → Setujui → terhapus **tanpa** error console.

---

## G2 🟠 + G3 🟠 — `/deep` → Workflow + billing `deep_research`

**Root cause:** `chat-core/index.ts:262` `/deep` cuma expand prompt skill (yang bahkan menyuruh tool **hantu** `propose_research_plan` — tak ada di `astraTools`, temuan E1); FE selalu `agent.stream`; Workflow dormant; debit `deep_research` cuma di `approvePlanStep` → DB rollup hari ini=0.

### Dua sub-jalur (riset penuh)

**Opsi A (REKOMENDASI) — FE drive Workflow langsung.**
- `/deep` → `client.getWorkflow('deep-research').createRun({resourceId})` → `run.stream({inputData:{question,threadId}})`, konsumsi `for await`. Adapter BARU `reduceWorkflowChunk` (map `workflow-step-*` → timeline; `mastra-timeline.ts` sekarang drop chunk ini).
- Plan-gate: chunk `workflow-step-suspended` bawa `{plan,subQuestions}` → kartu rencana (Setujui/Edit/Tolak) → `run.resume({step:'approve-plan', resumeData:{approved,edits}})` + `resumeStream`.
- Refresh: simpan `threadId→runId` (tak ada get-run-by-thread). Mount: `runById(runId)` → `suspended`→render kartu dari suspendPayload; `running`→`observe({offset})`; `success`→render report dari `mastra_messages`.
- **Persist laporan (WAJIB, E4):** tambah step akhir `persistReport` → `mastra.getAgent('astra-lite').getMemory().saveMessages([{role:'assistant', content: report, threadId, resourceId, ...}])` agar rehydrate. Laporan **verbatim** (fidelitas `[n]` terjaga).
- Billing `deep_research`: sudah di `approvePlanStep` (jalan begitu workflow benar dijalankan → G3 sembuh). `/deep` TIDAK lewat astra-lite → tak ada double-debit `normal_chat`.
- **+ kelebihan:** fidelitas laporan tercitasi terjamin (krusial untuk G4 — `[n]` harus = inventory bernomor, tak boleh di-renumber model).
- **− biaya:** transport FE kedua (for-await + reducer workflow), mapping `threadId→runId`, refresh-resume terpisah dari chat. Progres step-level (dead-air saat `.generate()`).

**Opsi B (dievaluasi, TIDAK direkomendasikan untuk produk tercitasi) — agent orkestrasi workflow.**
- Attach workflow ke `astra-lite` via opsi `workflows`; `/deep` paksa `toolChoice` tool `workflow-deep-research`. Plan-gate = chunk `tool-call-suspended` → `sendToolApproval(resumeData:{approved,edits})` di socket durable-thread yang SAMA → **G1 refresh + Stop gratis, satu transport**.
- **− risiko penentu:** output workflow kembali sebagai **tool-result** → model re-emit laporan → model lite bisa **me-renumber/me-ringkas `[n]`** → mapping G4 rusak. Mitigasi (persist verbatim via outputProcessor dari tool-result + dedup billing `normal_chat`/`deep_research` + threadId dari requestContext) menambah kompleksitas yang rapuh.

> Rekomendasi: **A**. Fidelitas laporan tercitasi adalah inti produk (dan prasyarat G4). B menukar fidelitas demi unifikasi transport — tak sepadan untuk riset bersitasi. (Jika owner lebih menilai unifikasi transport, B tersedia.)

**File (A):** `packages/chat-core/src/index.ts` (`/deep` dispatch → mode workflow; hapus instruksi tool hantu), FE hook + adapter workflow baru, `apps/agent/src/mastra/workflows/deep-research.ts` (step `persistReport`; threadId tetap dari `inputData`), kartu plan-gate di surface.

**Test:** `/deep <q>` → kartu rencana (belum riset) → Setujui → timeline step → laporan tercitasi → DB: `provider_usage_ledger` ada `deep_research`, `usage_daily_rollup.deep_research`++; refresh saat running → resume.

---

## G4 🟠 — citation_number + render Sumber (butuh kode baru)

**Root cause (lebih dalam):** `persistSources` selalu `citationNumber:null` (`research/index.ts:95`); TAK ADA kode (skill/workflow) yang memetakan `[n]`→sumber (DB 0/3571). Tool stempel `turnId=toolCallId` (per-call) → grouping `MessageList sourcesByTurn.get(m.turnId)` tak match + Mastra surface tak pernah pass `sourcesByTurn` (E3). Per-call `[n]` lokal (tiap search `[1..k]` sendiri).

**Solusi (desain a2 — assign `[n]` global stabil saat run):**
- **`turnId = workflow runId`** untuk run deep (lewat context key baru `AQSHA_DEEP_RUN_KEY`; `research.ts:54` `deepRunId(ctx) ?? toolCallId(ctx)` — chat path tak berubah). Unique `(thread_id,turn_id,locator)` auto-dedupe paper lintas sub-pertanyaan.
- Step BARU `assignCitations` (setelah `counterEvidence`, sebelum `verify`/`synthesize`): `ResearchService.assignCitationNumbers(db,{threadId,turnId:runId})` — dedupe key `normalizeDoi(doi) ?? arxivId ?? locator`, nomori 1..N, update via PK. Susun `numberedInventory` → feed ke `verifyPrompt`/`synthesisPrompt` agar writer mengutip `[n]` global itu.
- Repo BARU: `listByThreadTurn`, `setCitationNumbers` (satu UPDATE CASE). Service BARU `assignCitationNumbers` + ekstrak helper `toItem`. **Tanpa migrasi** (`citation_number` sudah ada nullable).
- Render Sumber: Mastra surface `useThreadSources(threadId)` → build `sourcesByTurn` (rows `citationNumber!=null`) → pass ke `MessageList`. `mastra-timeline.ts` set `turnId=runId` (live di `start`, + rehydrate dari pesan report yang ditandai runId). `InlineSources` tampilkan badge `[n]` (sentence-case), urut by `citationNumber`, collapse duplikat. Fallback (b1): satu seksi "Sumber" level-thread bila tagging runId belum siap.

**File:** `packages/db/src/repositories/researchSourceRepo.ts`, `packages/services/src/research/index.ts`, `apps/agent/src/mastra/lib/{tool-context.ts,research.ts}`, `apps/agent/src/mastra/workflows/deep-research.ts`, `apps/web/features/thread-experience/components/mastra-chat-thread-surface.tsx`, `apps/web/features/threads/lib/mastra-timeline.ts`, `apps/web/features/threads/components/sources-panel.tsx`.

**Cleanup:** hapus plumbing `sources` mati (`use-thread-experience-data.ts`, `thread-detail-shell.tsx`, `thread-shell-layout.tsx` — di-fetch lalu dibuang). Update komentar stale.

**Test:** `/deep` selesai → DB `research_sources.citation_number` terisi 1..N (dedupe benar) → UI ada seksi Sumber dgn `[n]` cocok prosa → refresh tetap muncul.

---

## G6 🟡 — Regenerate menduplikasi pesan user

**Root cause:** `regenerate()=send(lastUserText)` → turn baru + bubble user duplikat.

**Solusi:** durable-thread tetap meng-append pesan user ke memory. Opsi: (a) suppress bubble user duplikat di timeline saat regenerate (tandai turn regenerasi), atau (b) hapus pesan asisten terakhir dari memory lalu kirim ulang (butuh memory delete). Rekomendasi: (a) minimal — regenerate kirim ulang TANPA menambah bubble user baru (re-stream jawaban untuk pesan user terakhir yang sudah ada). Finalisasi saat impl setelah cek API memory delete.

**File:** `mastra-chat-thread-surface.tsx`, `use-mastra-agent.ts`, `message-list.tsx`.

**Test:** regenerate → jawaban baru tanpa bubble user kembar.

---

## G7 🟡 — Kartu artefak/plan hilang setelah refresh

**Root cause:** `mastraMessagesToTimeline` cuma rekonstruksi teks+reasoning; kartu artifact LIVE-ONLY.

**Solusi:** rehydrate tool/artifact parts dari `mastra_messages` (assistant message `content.parts` memuat tool-invocation parts saat onFinish). Perluas `mastraMessagesToTimeline` untuk rekonstruksi part `tool`/`artifact` (mis. `propose_artifact` → kartu). Untuk plan-gate `/deep` Opsi A: kartu rencana di-rehydrate dari `runById(runId).steps['approve-plan'].suspendPayload` saat status `suspended`.

**File:** `mastra-timeline.ts` (+ surface untuk plan-gate rehydrate).

**Test:** buat artifact → refresh → kartu tetap. `/deep` sampai plan-gate → refresh → kartu rencana tetap.

---

## Urutan implementasi (slice)

1. **Slice 1 — Durable-thread chat (G1+G5+G8).** Fondasi. Migrasi hook ke subscribe-first + sendMessage + abortThread + sendToolApproval; status chunk-driven; hapus AbortController.
2. **Slice 2 — Rehydrate parts (G7).** Perluas `mastraMessagesToTimeline` (tool/artifact).
3. **Slice 3 — Regenerate (G6).** Tanpa duplikasi bubble user.
4. **Slice 4 — `/deep` Workflow (G2+G3, Opsi A).** Adapter workflow + plan-gate suspend/resume + `persistReport` + billing terverifikasi.
5. **Slice 5 — Citations & Sources (G4).** `assignCitations` step + turnId=runId + repo/service + render `[n]`.

Tiap slice: rapikan kode (dedupe, dead-code, typed contract, test). Verifikasi: `bun run typecheck` + `bun run lint` + `bun run test` + repro browser/DB. Restart penuh dev setelah migrate (gotcha reusePort).

## Risiko lintas-isu

- API durable-thread `@experimental` — kunci versi; 501 = sinyal version-skew.
- Dua transport (chat durable-thread vs /deep workflow) — surface harus tahu mode thread saat refresh (cek active deep runId per thread).
- Token-level progress subagent tak stream (kedua opsi) — UX /deep step-level; ElapsedLabel sudah meredam dead-air.
- Tak ada migrasi DB untuk G4; tapi G1 mengubah lifecycle FE besar (uji menyeluruh).
