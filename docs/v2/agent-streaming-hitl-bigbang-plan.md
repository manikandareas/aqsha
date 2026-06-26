# Big-Bang Plan — Streaming + HITL Redesign (eve, web-v2)

> Implement in a fresh Claude session. Branch: `feat/v2-agent`.
> Companion docs (READ FIRST): `docs/v2/agent-streaming-hitl-redesign-research.md` (the verdict + 5 pillars),
> `docs/v2/hitl-streaming-audit-live.md` (live repro + DB evidence).
> This plan **corrects 3 mechanisms** from the research doc (verified against eve dist source + live DB) —
> see "Traps" before coding.

---

## Context (kenapa)

Stack streaming/HITL web-v2 over-engineered: ia menulis ulang dengan tangan apa yang eve 0.11.6 sudah
berikan native (durable stream replayable by `startIndex`). Lima gejala live-terbukti masih ada:
**A** kartu HITL tak muncul live (baru setelah refresh), **B** menjawab HITL error/"no token",
**C** cold-load lambat (~2 dtk detoast 32 MB), **D** frozen 2–3,7 mnt dead-air subagent,
**E** thread "zombie" (`status='streaming'` selamanya → composer terkunci, refresh tak menolong).

Owner memilih **big-bang penuh termasuk storage rewrite**. Plan ini memperbaiki kelimanya + memangkas
storage 32 MB→KB. Prinsip: **eve durable stream = SoT turn aktif; Postgres = history + status; klien =
render, bukan rekonsiliasi. Hapus lebih banyak dari menambah.**

---

## Sumber kebenaran eve (terverifikasi di dist 0.11.6 + DB)

- `GET /eve/v1/session/:id/stream?startIndex=N` durable + replayable (skip `<N`, lalu tail). Event **tak
  ber-index**; klien hitung posisi (`streamIndex`) sendiri.
- `useEveAgent` **TIDAK** auto-attach saat mount (`initialSession`/`initialEvents` seed-only; stream buka
  saat `.send()`). → resume in-flight WAJIB dibuka manual (`useThreadResume` tetap dipakai).
- Reducer (`dist/src/client/message-reducer.js`): `message.completed.data.message` = **teks final lengkap
  (tanpa perlu delta)**; TAPI **`reasoning.completed` di-emit 0×** oleh agent kita → reasoning final HANYA
  ada di `reasoning.appended` TERAKHIR. Reducer **tak punya** handler `subagent.called/completed`
  (subagent tampil via `actions.requested` kind `subagent-call`).
- `channel.continuationToken` (handler `events`) = bentuk **double-namespace `eve:eve:…` (internal)** — BUKAN
  token klien yang benar (`eve:…` single). Token tak re-mint per turn (stabil se-sesi).
- DB: `subagent.called`/`childSessionId` = **0 baris** (delegasi model-driven hanya emit `actions.requested`);
  `session.waiting`/`session.completed` **DIPERSIST**; satu `/deep` = 6119 event / 32 MB, 99% = `*.appended` kumulatif.

---

## Phase 0 — Prep
- **Commit/checkpoint** working tree `feat/v2-agent` dulu (kotor dgn iterasi lama) → diff refactor legible/revertible.
- Migrasi: committed terakhir `0012`. Memori menyebut 0013/0014 hand-authored di branch lain — **cek &
  rekonsiliasi nomor** sebelum `drizzle-kit generate` (pakai nomor bebas berikutnya).
- Luruskan komentar usang yang menyesatkan: `eve-timeline.ts:~336` ("session.* tak dipersist" — SALAH, dipersist),
  `chatThreads.ts` ("dipersist tiap session.waiting oleh channel" — SALAH).

## Phase 1 — Single stream (fix A + sebagian C)
**Goal:** satu sumber live (resume stream), buang poll 2 dtk. Akar **A = `busy` tak pernah clear**: di jalur
SEND live, saat parkir eve menutup body per-snapshot → `agent.events` kehilangan ekor `input.requested`/
`session.waiting` → `isStreamActive(base)` tetap true → `busy` true → `hitlRequests = !busy ? … : []` = kosong
sampai refresh. Fix = resume stream mengirim boundary itu dengan andal.

- `features/threads/api.ts`: **hapus polling** `useThreadEvents` (refetchInterval) + `compactThreadEvents`.
  Sisakan fetch snapshot **sekali** (cold-load) + `afterIndex` untuk backfill bila perlu.
- `features/thread-experience/components/eve-chat-thread-surface.tsx`: stop poll; `initialEvents` = snapshot
  mount sekali; `streamActive` dari `status` + last-event; pertahankan surfacing token (`initialSession.continuationToken`, line ~118).
- `features/threads/components/chat-surface.tsx`: **`buildOrderedLog` TETAP** (kini 2-source: history ⊕ activeEvents
  — JANGAN hapus). Pastikan setelah `agent.send()` parkir tanpa boundary, **resume re-attach dari cursor menarik
  boundary** (sudah enabled `streamActive && status==='ready'`) → `base` dapat `session.waiting` → `busy` clear →
  kartu muncul live. Verifikasi gating `busy`/`hitlRequests`.
- `features/threads/lib/use-thread-resume.ts`: **TETAP** (hand-roll fetch wajib — `eve/client` seret `node:module`,
  tak bisa di-bundle browser). Ini jadi satu-satunya sumber live pasca-poll. Bisa disederhanakan (EOF/backoff)
  tapi inti = buka `/stream?startIndex=cursor`, feed reducer.
- Reuse: reducer tunggal `reduceEventsToMessageData`/`eventsToTimeline` (`eve-timeline.ts`).
- **Catat:** snapshot-close yang membuang ekor sebagian artefak `eve dev`; uji A juga di build prod-style.

## Phase 2 — Token capture race fix (fix B)
**Goal:** token `eve:…` (single) tersimpan andal walau turn parkir SEBELUM klien bind `sessionId` (race 1/5).
**JANGAN** tambah handler `events:{"session.waiting"}` di channel (menyimpan `eve:eve:…` double → kirim ulang
triple-namespace → "Cannot deliver" = regres B; sudah tried-and-reverted, lihat `channels/eve.ts:60-67`).

- **Primary (robust): proxy-tee respons create-POST.** `apps/web-v2/app/eve/v1/[...path]/route.ts`: deteksi
  `POST /eve/v1/session` (create), clone respons kecil `{sessionId, continuationToken:"eve:…"}` (token BENAR/single),
  lalu **upsert server-side** via api-v2 (sertakan bearer yang sama). Tak bergantung klien bind sessionId.
- `apps/api-v2/src/routes/threads.ts`: endpoint upsert token **race-proof** (create-if-absent keyed by
  sessionId+owner) — respons create (202) mendahului hook `session.started` yang bikin row, jadi **upsert**,
  bukan `saveContinuation` ber-assertOwner (butuh row). Bisa kolom `chat_threads.continuation_token` (upsert row
  minimal) atau tabel kecil `session_tokens`. Pilih upsert ke `chat_threads` bila row sudah ada di mayoritas kasus + retry.
- `features/threads/lib/use-astra-agent.ts`: **hapus** capture klien `onSessionChange→saveContinuation` (digantikan
  proxy-tee), ATAU jadikan **idempotent + retry** sampai row ada (alternatif lebih ringan tanpa proxy DB).
- (Opsional harden) `POST /:id/answer` yang inject token server-side & panggil eve continue — hanya dgn token
  single tersimpan, JANGAN `channel.continuationToken`.

## Phase 3 — step_index read fix (fix C tuntas)
**Goal:** bunuh 2 dtk. Penyebab: subquery compaction `GROUP BY (payload->'data'->>'stepIndex')` **men-detoast 32 MB
hanya untuk baca stepIndex**.
- `packages/db/src/schema/chatThreadEvents.ts`: tambah kolom `step_index int` (nullable) + index `(thread_id, type, step_index)`.
- `apps/agent-v2/agent/lib/store.ts` `appendThreadEvent`: tulis `step_index` dari `payload.data.stepIndex`.
- `packages/db/src/repositories/chatThreadEventRepo.ts` `listByThread`: `GROUP BY step_index` (bukan ekspresi JSON) →
  tak ada detoast. Backfill 1× (batched per thread): `UPDATE … SET step_index=(payload->'data'->>'stepIndex')::int`.
- Migrasi `00NN_step_index.sql` (kolom + index + backfill). **Cursor & klien tak berubah.**

## Phase 4 — Subagent elapsed indicator (fix D)
**Goal:** matikan "frozen" semu. Child-stream **TAK tersedia** (`childSessionId` 0 baris; reducer tak handle subagent).
Parent-heartbeat **mustahil** (parent parkir tanpa compute). Solusi tanpa eve-change/child-id:
- `features/threads/lib/eve-timeline.ts` (`toolPartModel`) + `features/threads/components/tool-row.tsx`: untuk row
  `subagent-call` ber-status running, tampilkan **elapsed timer** ("Menelaah literatur… M:SS"). **Reuse `ElapsedLabel`**
  dari `features/threads/components/message-list.tsx`.
- Bergantung Phase 1 menjaga stream attached saat gap (sudah: `IDLE_TIMEOUT_MS=600_000` `use-thread-resume.ts:33`,
  `maxReconnectAttempts:120` `use-astra-agent.ts:106`).

## Phase 5 — Zombie reconciler (fix E)
**Goal:** turn crash (a.l. ENOSPC) tak menulis event terminal → busy selamanya. **Reuse `registerRepeatable`**
(`apps/api-v2/src/workers/index.ts:~63`, pola feed-hydration).
- Queue + Worker baru `reconcile-stale-threads`, cron (mis. tiap jam). Untuk tiap `status='streaming'` dgn
  `last_activity_at < now()-AMBANG`:
  1. **Append event terminal sintetik** `turn.failed` (∈ `SETTLED_OR_PARKED_LAST`) via `appendThreadEvent` (reuse),
     supaya `isStreamActive(base)` → false (klien unlock composer).
  2. `setThreadStatus('failed')` (DB & heuristik selaras).
- **AMBANG > gap subagent sah** (terukur 5,7 mnt) — set **30 mnt** (tunable). Catatan: selama dead-air TIDAK ada
  event dipersist, jadi `last_activity_at` tetap lama → ambang 30 mnt aman utk run normal; subagent >30 mnt = edge,
  terima/tunable.
- Klien: `streamActive`/`busy` sudah memakai `status` + last-event → otomatis benar setelah reconciler.
- Operasional (bukan kode): **jaga disk lega** — ENOSPC = penyebab utama crash→zombie (lihat audit §ENOSPC).

## Phase 6 — Storage rewrite (opted-in; deploy ATOMIC, lakukan TERAKHIR)
**Goal:** 32 MB→KB at-rest. **Mekanisme = B-strip (lebih aman dari drop-deltas+cursor-decouple):** simpan baris 1:1
(jadi `event_index == eveStreamIndex`, **cursor resume tak tersentuh, nol risiko cursor in-flight**), tapi **strip
payload delta tersusul**. Reasoning aman (delta TERAKHIR tak di-strip → reasoning final tetap ada).
> Catatan ke owner: kamu memilih "incl cursor decouple". Plan pakai **B-strip** karena hasil shrink SAMA tapi tanpa
> landmine cursor/migrasi-index (review Plan-agent). Bila tetap mau drop-deltas+`eve_stream_index` counter, itu opsi
> lebih berisiko (counter idempotency saat durable replay) — bisa, tapi tak disarankan.
- `apps/agent-v2/agent/hooks/projection.ts`: di handler `step.completed` (atau `message.completed`), **strip payload
  delta tersusul** untuk step itu (1 UPDATE/step, bukan per-delta) — `SET payload = <minimal> WHERE thread=… AND turn=…
  AND step_index=… AND type IN ('message.appended','reasoning.appended') AND event_index < max(step)`. JANGAN sentuh
  idempotency key billing `step.completed` (`sessionId:turnId:stepIndex`).
- **Data migrasi 1×** thread lama (batched): strip delta tersusul yang sudah ada (`… AND event_index NOT IN (SELECT
  max(event_index) … GROUP BY thread,turn,type,step_index)`). Baris/index TETAP → cursor lama valid.
- **Deploy atomic**: ini satu-satunya fase yang menyentuh jalur tulis; deploy agent-v2 + jalankan migrasi bersamaan.
  Fase 1–5 semuanya additive/read-side → cursor in-flight tetap valid lintas-deploy.

---

## Migration & back-compat
- Thread 32 MB lama: Fase 1–5 tetap terbaca (rows 1:1; `step_index` backfilled; `eventsToTimeline` rekonstruksi penuh;
  `legacyHistory` `eve-chat-thread-surface.ts:~32` = fallback pra-event). Tak ada data loss.
- Sesi in-flight lintas-deploy: sesi eve durable (survive redeploy); klien reconnect via cursor. **Hanya Fase 6** yang
  bisa renumber semantik tulis → karena B-strip tak mengubah index, in-flight aman; tetap deploy Fase 6 atomic.
- Billing (`consumeCredits` di handler `step.completed`) tak disentuh fase manapun — jaga idempotency key.

## Verifikasi E2E (lokal: web-v2:3000 → api-v2:3001 → eve:4317 → VPS PG; Claude-in-Chrome + psql MCP)
1. **Baseline (sebelum):** psql histogram tipe event + `pg_column_size` sum + waktu `listByThread` (≈2 dtk).
2. **A (HITL live):** `/deep` → di park konfirmasi-rencana, kartu muncul **tanpa refresh**; `read_network_requests`:
   resume stream membawa `input.requested`, **tak ada** loop poll `/events` 2 dtk.
3. **B (jawab pasca-refresh):** di park, hard-refresh, klik opsi. `POST /eve/v1/session/:id` → 200 (bukan "Cannot
   deliver"); psql: `continuation_token` = `eve:…` (single) non-null **bahkan pada fast-first-turn-park** (kasus 5-event).
4. **C (cold-load):** buka thread 6119-event dingin; TTFB `/messages`+`/events` ≪ 2 dtk; `EXPLAIN ANALYZE` query baru =
   tanpa full detoast.
5. **D (dead-air):** saat gap subagent, row `subagent-call` menampilkan elapsed hidup + stream tetap attached (console: reconnect).
6. **E (zombie):** psql `UPDATE … SET status='streaming', last_activity_at=<31 mnt lalu>` pada thread settled; jalankan
   reconciler; status→`failed`, event terminal ter-append, composer unlock.
7. **Regresi:** reload `/deep` settled — tool rows, artifact, sources, **DAN reasoning** tetap render (jebakan
   reasoning-delete Fase 6 — uji eksplisit). Gates: `tsc`/`eslint` 0, `eve-timeline.test.ts` hijau.

## Traps (JANGAN lakukan)
- **JANGAN** simpan `channel.continuationToken` (double-namespace → regres B). Token benar = dari respons create-POST.
- **JANGAN** drop SEMUA delta — `reasoning.completed` 0× → reasoning final hilang. Strip-keep-last (Fase 6), bukan drop.
- **JANGAN** kejar child-stream subagent — `childSessionId` tak ada; reducer tak handle. Pakai elapsed indicator.
- **JANGAN** hapus `buildOrderedLog`/`use-thread-resume` — keduanya tetap perlu (kini 2-source / satu-satunya live source).
- Reconciler **WAJIB** tulis event terminal + status (bukan status saja) atau heuristik klien & DB divergen.

## File-file kritis
- agent-v2: `agent/lib/store.ts` (step_index, synthetic terminal, strip), `agent/hooks/projection.ts` (Fase 6 strip),
  `agent/channels/eve.ts` (BIARKAN — komentar 60-67 benar).
- db: `src/schema/chatThreadEvents.ts` (step_index), `src/repositories/chatThreadEventRepo.ts` (GROUP BY step_index),
  migrasi baru.
- api-v2: `src/routes/threads.ts` (token upsert; hapus dukungan poll bila perlu), `src/workers/index.ts` + worker reconciler baru.
- web-v2: `features/threads/api.ts` (hapus poll), `features/thread-experience/components/eve-chat-thread-surface.tsx`
  (stop poll), `features/threads/components/chat-surface.tsx` (busy/HITL gating), `features/threads/lib/use-astra-agent.ts`
  (token capture), `app/eve/v1/[...path]/route.ts` (proxy-tee), `features/threads/lib/eve-timeline.ts` +
  `components/tool-row.tsx` (subagent elapsed, reuse `ElapsedLabel` dari `message-list.tsx`).
