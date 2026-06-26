# Rencana Optimasi Convex (tetap di Convex Cloud — tanpa self-host, tanpa migrasi Postgres)

**Status:** draft — disusun 2026-06-19 dari hasil audit free-plan + investigasi split (lihat memory `convex-freeplan-limit-audit`, `convex-vs-postgres-split-decision`).

**Tujuan:** menurunkan konsumsi resource Convex (terutama **database bandwidth**) sebesar 10–50× sehingga app bisa jalan di Convex Cloud free/Pro murah untuk produksi awal — **tanpa** mengubah datastore, **tanpa** self-host, **tetap** memakai reactivity Convex.

**Di luar ruang lingkup (sesuai keputusan owner):** self-host Convex, migrasi ke PostgreSQL/pgvector, rewrite backend ke custom API. RAG tetap di `@convex-dev/rag`.

---

## 1. Akar masalah (ringkas)

Resource pengikat = **DB bandwidth (read+write, ~1 GiB/bln di free tier)**. Baseline idle kecil; biaya jebol saat streaming aktif karena **pola akses**, bukan Convex mahal:

- **Read amplification (#1, dominan):** `listRuns` (`agent/queries.ts:127-170`) membaca `MAX_RUNS=10` run × `Promise.all` seluruh `agentRunEvents` (`MAX_EVENTS_PER_RUN=500`) **dengan `payloadJson` penuh**, plus `listMessages` (`:102-125`) membaca `MAX_MESSAGES=100` pesan penuh. Keduanya **reactive**, di-subscribe selama thread terbuka (`apps/web/.../use-thread-experience-data.ts:64-75`, `chat-thread-state.tsx:120-145`). Tiap flush meng-invalidate → re-baca seluruh history. Biaya = **O(jumlah_flush × ukuran_thread)**.
- **Write amplification (#2):** tiap flush memicu **2 write** (`streamBridge.ts:248-249`): `updateMessageText` (full-blob `chatMessages.text`+`reasoning`, `service.ts:208-211`) + `upsertRunEventBySegmentId` (full segment `payloadJson`), plus heartbeat `agentRuns.updatedAt` (`service.ts:415,446,459`). Default flush sangat agresif: **250ms / 800 char** (`apps/agents/src/config.ts:52-53`).
- **Pendukung:** `getFeed` reactive selalu ter-mount (#3), file/vector storage leak saat hapus artifact (#4/#5), `artifacts.get` re-ship autosave (#6), action `refreshTrendingTopics` ~82s (#7), retry `/deep` (#8), tabel append-only tanpa retensi (#9), cron idle (#10).

## 2. Prinsip optimasi (model biaya reactivity Convex)

Query reaktif **re-run setiap dokumen di read-set-nya berubah**; biaya per re-run = bytes/dok yang dibacanya. Maka dua tuas:

1. **Kurangi frekuensi re-run** → kurangi write yang meng-invalidate (throttle heartbeat, perbesar interval flush, pisahkan read-set agar tidak menyentuh dokumen yang sering ditulis).
2. **Kurangi ukuran tiap re-run** → read-set sekecil mungkin (metadata-only, single-doc by id, hanya run aktif, paginasi history, payload diramping).

Semua perubahan mematuhi `packages/convex/AGENTS.md`: object-syntax, `args`/`returns` validator, **setiap read path ber-index**, bounded reads (`.take`/`.paginate`), structured error, pola facade+folder, dan **gate** (`bun run typecheck` + `lint` + `--filter '@aqsha/convex' test` + `npx convex dev --once`).

---

## 3. Fase implementasi (urut ROI ÷ risiko)

### FASE 0 — Quick wins (≈1 hari, risiko ~0, sebagian env-only)

Tujuan: potong frekuensi flush × invalidasi × ukuran baca tanpa perubahan struktural.

1. **Perbesar interval flush (env, tanpa kode):** `AGENTS_STREAM_FLUSH_MS` 250→**1000**, `AGENTS_STREAM_FLUSH_CHARS` 800→**2000** (`apps/agents/src/config.ts:52-53` default + set di env prod). Dampak: ~3–4× lebih sedikit flush → memotong langsung read #1 **dan** write #2. UX: smoothing client (`useSmoothText` di `message-row.tsx`) tetap mulus.
2. **Throttle heartbeat `agentRuns.updatedAt`** (`service.ts:415,446,459`): hanya `patch` bila `now - run.updatedAt > 45_000` (jauh di bawah `RUNNING_STALL_MS=10min` watchdog). ~3 baris. Dampak: menghentikan invalidasi `listRuns` lewat jalur heartbeat.
3. **Relax cron `agent:watchdog`** 5min→**15min** (`crons.ts`) atau jadikan adaptif (self-cancel bila tak ada run queued/running/waiting_hitl). Potong ~67% pajak call idle (#10).
4. **Kecilkan cap `getFeed`** (`feed.ts:70-147`): `loadHiddenItemIds` take(1000)→take(150), `loadSavedItemIds` take(500)→take(150) (atau ganti ke point-lookup hanya untuk kandidat yang ter-skor). Memangkas read #3 per eksekusi.

Gate + ukur di dashboard sebelum lanjut.

### FASE 1 — Redesign read path streaming (perbaikan #1, tetap reaktif) ⭐ inti

Tujuan: hilangkan re-baca **O(flush × history)**. Pecah "live stream" dari "history".

1. **`listRuns` → metadata-only:** buang `Promise.all` event inlining (`queries.ts:139-167`); kembalikan hanya field run (`runId,status,mode,agentKind,costUsd,numTurns,errorMessage,verificationReportJson,createdAt,updatedAt`). Read-set `listRuns` kini hanya tabel `agentRuns` → hanya ter-invalidate oleh write `agentRuns` (sudah di-throttle di Fase 0).
2. **Query baru `getActiveRunEvents`** (reactive): baca event **hanya untuk satu run aktif/terbaru** (bukan 10 run), via `by_run_seq`, `payloadJson` boleh diramping. Read-set kecil & terbatas → re-run per flush jadi **O(events_run_aktif)**, bukan O(10×500×history).
   - *Enhancement opsional (gold standard):* `getActiveRunEvents(runId, sinceSeq)` hanya kembalikan event `seq > sinceSeq`; client menyimpan `sinceSeq` & merge → mendekati O(1) per flush. Tambah biaya state merge di client; boleh fase lanjutan.
3. **Event run lama (history):** muat sekali via paginasi/non-reaktif (mengikuti pola `getFeedPaginated` di `feed.ts:158`) saat thread dibuka — bukan re-baca per flush.
4. **Pesan:** subscribe **pesan asisten aktif by id** (`getMessage(messageId)` single-doc) untuk teks live; muat history pesan via paginasi (atau one-shot non-reaktif) — bukan `listMessages` 100 baris tiap flush.
5. **Frontend:** sesuaikan `use-thread-experience-data.ts:64-75` & `chat-thread-state.tsx:120-145` ke query baru; perbarui adapter `@aqsha/agent-contracts` bila perlu. Pertahankan `useSmoothText`.

Dampak: menghapus penyumbang bandwidth dominan. Risiko: sedang (lintas `packages/convex` + `apps/web` + contracts) → wajib test paritas (lihat §4).

### FASE 2 — Redesign write path (perbaikan #2)

Tujuan: hentikan pertumbuhan write super-linear.

- **Opsi 2A (disarankan, bersih):** selama streaming **berhenti menulis `chatMessages.text` full-blob tiap flush**; render jawaban live dari `text_segment` (`getActiveRunEvents`). Tulis `chatMessages.text` final **sekali** di `finalizeMessage` (`service.ts:216+`). Menghapus seluruh write full-blob `chatMessages` saat stream.
- **Opsi 2B (lebih murah, kalau 2A terlalu invasif):** tetap tulis `chatMessages.text` tapi sudah jarang berkat Fase 0 (1s/2000char); andalkan segmen per-step yang sudah ter-bound (`currentSegmentText()` di `streamBridge.ts:296-331`). Kolaps 2 write jadi 1 mutation bila memungkinkan.

Keputusan 2A vs 2B = **decision point** (§6). Default rekomendasi: 2A.

### FASE 3 — Tutup kebocoran storage (file/db/vector)

- **Hard-delete blob artifact** (#4): pada `artifacts.ts:612` (`remove`) & `:1356` (`deleteArtifactFromAgentInternal`), `scheduler.runAfter(0, internalAction)` yang mengumpulkan **semua** storage id (pakai ulang logika koleksi `accountCleanup` + **tambah `uploadStorageId`** `schema.ts:80`) → `ctx.storage.delete()` + `ctx.db.delete` baris dependen (`artifactContents/Extractions/Versions/PaperMetadata/Urls`). Tambah `uploadStorageId` ke loop `accountCleanup` (`artifacts.ts:55-59`).
- **Purge RAG** (#5): pada hard-delete & di `accountCleanup`, panggil `artifactRag.deleteAsync({ namespace, key })`; `deleteAsync` key lama **sebelum** reindex GROBID/promoted (`uploads.ts:183,435`, `extractions.ts:841`).
- **Cron retensi** (#9): prune `agentRunEvents` (`text_segment`/`reasoning_segment`) untuk run finalized > N hari (teks final ada di `chatMessages`); index + prune `externalLookupCache` by `expiresAt`; age-out `feedItems`/`explorePapers`/`feedConsensus` per window; trim usage ledger di luar window UI. Gunakan paginasi + scheduled continuation (atau `@convex-dev/migrations`), bukan satu fungsi raksasa. Pertimbangkan hapus double-store `reasoning`.

### FASE 4 — Action compute + egress

- **`refreshTrendingTopics`** (#7): fan-out tiap seed GDELT via `ctx.scheduler.runAfter(i*5200, internal...refreshOneTopic)` (scheduler yang memberi spacing, bukan `sleep()` dalam action yang ditagih); cek cache **sebelum** sleep. Terapkan juga ke `refreshGoogleNews`/`enrichGoogleNewsArticles`. Turunkan lane dari ~5,5 → <0,5 GB-h/bln.
- **Retry `/deep`** (#8): keluarkan `timeout`/`overloaded`/`529` dari retry whole-phase (`runManager.ts`); degrade-to-partial via jalur `policy.optional` bila ada output parsial; atau checkpoint output subagent agar retry lanjut setelah search.

### FASE 5 — (OPSIONAL, defer) SSE live transport

Hanya bila Fase 1+2 belum cukup. Stream token langsung dari `apps/agents` (Hono, `server.ts`) ke browser via SSE + persist **final-only** ke Convex. **Tetap di Convex** (durable state di Convex) — bukan self-host/Postgres. Lebih besar: butuh endpoint SSE + pub-sub dari `StreamBridge`, auth browser→agents + CORS (baru), EventSource client + reconnect/replay. Tandai opsional.

---

## 4. Cara ukur keberhasilan

- **Dashboard Convex → Settings → Usage**: catat baseline bandwidth (read/write GB), function calls, storage, action compute **sebelum** Fase 0; bandingkan tiap fase. Ini sumber kebenaran billing.
- **Agregasi logs** (metode di audit): MCP `logs` (jsonl) → jumlahkan `usageStats.databaseReadBytes/databaseWriteBytes/executionTime` per fungsi. Jalankan 1 thread `/deep` sebelum & sesudah Fase 1 → harusnya read turun drastis.
- **Test paritas** (`packages/convex/tests/`, `convex-test`): assert query baru (`listRuns` metadata-only, `getActiveRunEvents`, `getMessage`) mengembalikan bentuk yang setara dengan path lama untuk skenario yang sama. Wajib untuk refactor behavior-preserving.
- **Gate per perubahan**: `bun run typecheck` + `bun run lint` + `bun run --filter '@aqsha/convex' test` + `npx convex dev --once` (pantau `Schema validation failed`/`ReturnsValidationError`/`Couldn't find function`).

## 5. Urutan & estimasi kasar

| Fase | Effort | Risiko | Dampak biaya |
|------|--------|--------|--------------|
| 0 Quick wins | ~1 hari | ~0 | ~3–5× turun, segera |
| 1 Read path | 2–4 hari | sedang | menghapus penyumbang dominan |
| 2 Write path | 1–3 hari | sedang | hentikan write super-linear |
| 3 Storage leak | 1–2 hari | rendah | hentikan ratchet file/vector/db storage |
| 4 Action/egress | ~1 hari | rendah | turunkan action-compute & egress |
| 5 SSE (opsional) | besar | sedang–tinggi | hanya bila masih kurang |

Disarankan kerjakan **0 → 1 → 2 → 3 → 4**, ukur di dashboard setelah tiap fase; berhenti begitu sudah nyaman di bawah limit.

## 6. Decision points (perlu keputusan owner)

1. **Fase 2: 2A (render live dari segment + tulis `chatMessages` final-only) vs 2B (coarsen saja).** Rekomendasi 2A (paling hemat) — perlu sedikit perubahan render frontend.
2. **Fase 1: pakai enhancement `sinceSeq` incremental atau cukup "active-run-only".** Active-run-only sudah memberi mayoritas penghematan; `sinceSeq` untuk mendekati O(1) tapi menambah merge state di client.
3. **Fase 3: retensi `agentRunEvents` berapa hari?** (mis. 14–30 hari untuk run finalized).

## 7. Target hasil

Setelah Fase 0–3, bandwidth per `/deep` run turun dari puluhan–ratusan MB → satuan MB; per turn normal dari ~48MB → ratusan KB. Realistis: **dev + early users muat di free tier**, dan **Pro ($25/bln) menampung banyak user** — tanpa self-host, tanpa Postgres, tanpa rewrite. Catatan: untuk skala besar, biaya dominan app AI tetap **token LLM** (OpenAI/OpenRouter), bukan host backend — itu isu terpisah dari plan ini.
