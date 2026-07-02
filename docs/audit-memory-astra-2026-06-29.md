# Audit Memory & Konteks Astra Agent — 2026-06-29

Audit implementasi **memory** pada AI agent (Astra) di repo ini, mencakup 4 area:
percakapan lintas-giliran, konteks dokumen/artifact, fitur `@` mention, dan pipeline upload file → RAG.

**Status keseluruhan:** Fondasi sehat — Mastra Memory persist, RAG pipeline lengkap, `@` mention &
upload bekerja end-to-end. Kelemahan utama bukan "apakah jalan", tapi **keandalan agent memakai
konteks lintas-giliran** + **ketahanan operasional saat deploy**.

## Legenda

- **Severity** — `P0` = bisa gagal nyata di mata user · `P1` = penting, berdampak langsung · `P2` = polish/edge-case.
- **Tipe** — `Bug` · `Desain-limit` (batasan desain saat ini) · `Risiko-deploy` · `Desain` (memang disengaja).
- **Keputusan** (isi sendiri) — saran nilai: `Fix sekarang` · `Nanti` · `Tolak` · `Diskusi`. Tambahkan catatan bila perlu.

---

## A. Memory percakapan (Q1) — andal ≤10 pesan, lemah di luar itu

Verdict: ✅ Follow-up dekat andal. ⚠️ Follow-up ke giliran jauh bergantung kualitas semantic recall.

| ID  | Sev | Tipe         | Issue & saran                                                                                                                                                                                           | Lokasi                               | Keputusan                                  |
| --- | --- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------ |
| A1  | P1  | Desain-limit | `workingMemory` dimatikan → tak ada ringkasan berjalan; percakapan panjang kehilangan konteks implisit yang tak ter-recall. **Saran:** aktifkan working memory (template ringkas) untuk thread panjang. | `apps/agent/src/mastra/memory.ts:25` | fix, aktifkan                              |
| A2  | P2  | Desain-limit | `semanticRecall.topK: 3` konservatif → follow-up ke pesan >10 ke belakang yang tak mirip semantik bisa meleset. **Saran:** naikkan `topK` 3→5–8.                                                        | `apps/agent/src/mastra/memory.ts:24` | fix, naikan dengan perhitungan yang matang |
| A3  | P2  | Desain-limit | `lastMessages: 10` (~5 giliran) sebagai jendela non-semantik; sempit untuk thread panjang. **Saran:** pertimbangkan naikkan window.                                                                     | `apps/agent/src/mastra/memory.ts:23` | fix, naikan dengan perhitungan matang      |

---

## B. Dokumen/artifact lintas-giliran (Q2) — area paling rapuh, sumber "linglung"

Verdict: ⚠️ Kapabilitas ada (tool benar), tapi rapuh. Akar = B1+B2+B3 (ephemeral + tak dipandu + tak ada manifest).

| ID  | Sev | Tipe         | Issue & saran                                                                                                                                                                                                                                                                                                    | Lokasi                                                              | Keputusan                       |
| --- | --- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------- |
| B1  | P1  | Bug/desain   | Konteks lampiran & `@`mention bersifat EPHEMERAL (`ifIdle.streamOptions.context`, tak dipersist ke memory). Di giliran berikutnya note "Berkas terlampir: X" & note `@`mention hilang dari context. **Saran:** ganti dgn manifest durable (lihat B3), jangan persist note mentah.                                | `use-mastra-agent.ts:243-258`; `composer.tsx:258-262`               | fix                             |
| B2  | P1  | Bug          | Instruksi tak punya guardrail — cuma "gunakan tool bila relevan". Tak ada perintah: "SEBELUM bilang tak melihat file, panggil `list_artifacts`/`search_thread_documents` dulu; jangan minta upload ulang." Penyebab langsung jawaban "silakan upload filenya". **Saran:** tambah kalimat guardrail di instruksi. | `apps/agent/src/mastra/instructions.ts:17-23`                       | fix. perkuat instruction prompt |
| B3  | P1  | Desain-limit | Tak ada manifest thread durable — tak ada `<system-reminder>` per-turn yang me-list artifact aktif thread; agent harus menebak alih-alih "selalu diberi tahu". **Saran:** processor yang inject daftar artifact thread tiap turn.                                                                                | `apps/agent/src/mastra/processors/thread-projection.ts` (belum ada) | fix                             |
| B4  | P2  | Desain-limit | `search_thread_documents` semantik-only tanpa fallback — kalau RAG balik kosong (query vague), agent bisa simpulkan dokumen "tidak ada". **Saran:** fallback otomatis ke `list_artifacts` saat hasil kosong.                                                                                                     | `packages/services/src/rag.service.ts:88-116`                       | fix                             |

---

## C. `@` mention composer (Q3) — bekerja, bukan kosmetik

Verdict: ✅ Bekerja end-to-end (palette → validasi ownership → hydrate → kirim ke agent). Caveat = ephemeral + preview saja.

| ID  | Sev | Tipe         | Issue & saran                                                                                                                                                                            | Lokasi                                                                           | Keputusan                                                           |
| --- | --- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| C1  | P1  | Bug/desain   | Sama dgn B1: note `@`mention (nama+ID+preview+instruksi) ephemeral per-turn; user harus re-pin di giliran berikutnya. **Saran:** ikut solusi B3 (manifest durable).                      | `composer.tsx:264-272`; `packages/services/src/context.service.ts` (`buildNote`) | fix                                                                 |
| C2  | P2  | Desain-limit | Agent hanya menerima preview 200 char; isi penuh harus via `search_thread_documents`/`get_render_payload`. **Saran:** OK, biarkan (hemat token) — pastikan agent dipandu memanggil tool. | `packages/services/src/context.service.ts` (`buildNote`)                         | fix                                                                 |
| C3  | P2  | Desain-limit | Kegagalan `hydrate` (jaringan) drop konteks senyap — pesan tetap terkirim tanpa note, tanpa feedback. **Saran:** surface warning kecil ke user.                                          | `composer.tsx:269-271`                                                           | fix. design agar durable, sehingga warning ini dapat di minimalisir |

---

## D. Upload file + RAG pipeline (Q4) — bekerja, isi diproses jadi konteks

Verdict: ✅ Upload + ekstraksi + embedding bekerja; isi file searchable. Risiko utama = D1 (deploy) & D2 (senyap). Di lokal: key embedding SET di `api` & `agent`.

| ID  | Sev | Tipe          | Issue & saran                                                                                                                                                                                                                                                                                                                    | Lokasi                                                                                       | Keputusan                                                                          |
| --- | --- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| D1  | P1  | Risiko-deploy | Key embedding harus ada di DUA proses. Indexing jalan di `api`, tapi `search_thread_documents` jalan di `agent`. Kalau saat deploy key cuma di `api` (lupa di `agent`) → embedding tersimpan tapi search selalu `[]`, agent buta. **Saran:** health-check/startup-assert key di proses agent + dokumentasikan di runbook deploy. | `packages/services/src/clients/embeddings.ts:31`; `apps/agent/.env`                          | fix, prefer hapus konfigurasi. embedding by default harus aktif                    |
| D2  | P1  | Bug           | Degradasi senyap — tanpa key: upload tetap sukses, `indexingStatus` tetap `ready`, tapi `indexed:false` & search `[]`, tanpa error/warning ke user. **Saran:** surface `indexed:false` ke UI + log warning.                                                                                                                      | `packages/services/src/artifacts/extract-pipeline.ts`; `rag.service.ts:57`                   | fix. warning dengna sonner/toast                                                   |
| D3  | P2  | Desain-limit  | Tak ada OCR — PDF hasil scan / file gambar → ekstraksi kosong → `indexingStatus: "failed"`. **Saran:** terima sebagai batasan; beri pesan jelas ke user saat failed.                                                                                                                                                             | `packages/services/src/artifacts/extract.ts`                                                 | fix, gunakan mistral ocr, prefer gunain sdk js nya langsung                        |
| D4  | P2  | Desain-limit  | Tak ada fallback lexical/keyword (BM25); pencarian murni vektor. **Saran:** opsional, pertimbangkan hybrid search nanti.                                                                                                                                                                                                         | `packages/services/src/rag.service.ts:88-116`                                                | ok, fix it                                                                         |
| D5  | P2  | Desain-limit  | Ekstraksi inline/sinkron memblok response finalize → file besar (≤50 MB) bisa lambat / risiko timeout. **Saran:** pertimbangkan offload ke worker BullMQ utk file besar.                                                                                                                                                         | `packages/services/src/artifact.service.ts:554` (`extractIndexAndPatch` di-await)            | ok, make sure ui/ux tetap baik                                                     |
| D6  | P2  | Desain-limit  | Tak bisa attach sebelum thread ada (`onPickFile` butuh `threadId`). **Saran:** terima sebagai batasan; pastikan UX jelas.                                                                                                                                                                                                        | `apps/web/features/threads/components/composer.tsx:289`                                      | discuss, apakah berarti ketika start conversation tidak bisa langsung attach file? |
| D7  | P2  | Desain        | Paper-enrichment dilewati untuk lampiran headless (DOI/metadata baru jalan saat di-promote ke workspace). By design. **Saran:** tak perlu diubah.                                                                                                                                                                                | `packages/services/src/artifact.service.ts:609`                                              | ok                                                                                 |
| D8  | P2  | Desain-limit  | Tipe terbatas: PDF/DOCX/TXT/MD/CSV/JSON, maks 50 MB. Tak ada XLSX/PPTX/gambar. **Saran:** tambah tipe bila ada permintaan.                                                                                                                                                                                                       | `apps/web/features/artifacts/types.ts:72`; `packages/services/src/artifacts/model.ts:16,290` | fix. since we use mistral ocr bisa digunakan                                       |

---

## Keputusan final (2026-06-29) — hasil diskusi

Mengklarifikasi/mengesahkan kolom Keputusan di atas:

- **D1** → **OpenAI key WAJIB (fail-fast).** Hapus jalur silent-skip; assert `isEmbeddingEnabled()` saat startup proses agent → gagal keras kalau key hilang. **Tanpa migrasi**, kualitas 1536-dim tetap. (Bukan fastembed lokal.)
- **Scope memory** → **per-thread (default).** `semanticRecall` & `workingMemory` tetap thread-scoped. Tidak ada recall lintas-thread.
- **A1** → aktifkan `workingMemory` (scope thread, template ringkas). Verifikasi API ke `@mastra/memory` terpasang dulu.
- **A2/A3** → `lastMessages 10→16`, `semanticRecall.topK 3→6`, `messageRange 2` (konfirmasi semantik ke versi terpasang). Aman ~40–50k token di bawah cap 96k.
- **C2** → **cukup B2/B3** (preview 200 char tetap; agent dipandu fetch isi penuh). Tidak ada perubahan terpisah.
- **D6** → **BUKA attach di pesan pertama.** Teruskan `effectiveThreadId` ke landing Composer + `ensureThread` server-side saat `finalizeThreadUpload` (sebelum `assertOwner`).
- **D3/D8** → Mistral OCR via JS SDK (verifikasi SDK terbaru via docs dulu); OCR membuka tipe gambar (D8) + PDF scan. Menambah `MISTRAL_API_KEY`.

## Rencana eksekusi (bundel)

**Gelombang 1 — terkontrol, dampak tinggi:**

1. **Bundle 1 — Anti-"linglung" (durable context).** B2 (guardrail instruksi) + B3 (processor manifest artifact thread per-turn) + B4 (fallback search kosong → `list_artifacts`). Menutup B1/C1 tanpa persist note mentah. *Agent + sedikit services.*
2. **Bundle 2 — Memory tuning.** A1 (workingMemory thread-scoped) + A2/A3 (sizing). *Agent only.*
3. **Bundle 3 — Embedding fail-fast.** D1 (assert key startup, hapus silent-skip) + D2 (toast Sonner `indexed:false` + log warning). *services + agent + web.*

**Gelombang 2 — sentuh migrasi/dep/worker:**

4. **Bundle 4 — Upload UX & async.** D5 (offload ekstraksi+index ke worker BullMQ, FE status `pending→ready`) + D6 (attach di pesan pertama) + C3 (perkuat ketahanan hydrate). *api worker + web.*
5. **Bundle 5 — OCR + tipe baru.** D3 (Mistral OCR untuk PDF scan/gambar) + D8 (terima tipe gambar). *services + dep + env baru.*
6. **Bundle 6 — Hybrid search.** D4 (FTS tsvector/GIN + fusion RRF dengan vektor). *services + migrasi.*

**Tidak diubah:** D7 (by design).

## Status implementasi (2026-06-29) — 6 bundel SELESAI, uncommitted

Gates: `bun run typecheck` (7 workspace) exit 0 · `bun run lint` 0 error (21 warning lama) · `@aqsha/services` 239 pass · `@aqsha/chat-core` 6 pass.

| Bundle | Status | Berkas utama |
|--------|--------|--------------|
| 1 — Anti-"linglung" (B2/B3/B4) | ✅ | `apps/agent/src/mastra/processors/thread-artifact-manifest.ts` (baru), `instructions.ts`, `lib/owner-thread.ts` (dedupe), `tools/search-thread-documents.ts`, `agents/astra-lite.ts` |
| 2 — Memory tuning (A1/A2/A3) | ✅ | `apps/agent/src/mastra/memory.ts` (lastMessages 16, topK 6, scope:'thread', workingMemory) |
| 3 — Embedding fail-fast (D1/D2) | ✅ | `packages/services/src/clients/embeddings.ts`, `rag.service.ts`, agent `index.ts` + api `server.ts` + `workers/index.ts`, `features/threads/api.ts` (toast) |
| 4 — Upload UX async (D5/D6/C3) | ✅ | `artifact.service.ts`, `workers/artifact-indexing.worker.ts` (baru), `chat/thread.service.ts` (`assertOwnerOrAbsent`), `composer.tsx`, `mastra-chat-thread-surface.tsx`, `threads/api.ts` |
| 5 — OCR + tipe gambar (D3/D8) | ✅ | `artifacts/ocr.ts` (baru, `@mistralai/mistralai`), `artifacts/extract.ts`, `artifacts/model.ts` (type `image`), `features/artifacts/types.ts` |
| 6 — Hybrid search (D4) | ✅ | mig `0019_deep_wrecking_crew.sql`, `schema/artifactEmbeddings.ts` (`content_tsv`+GIN), `repositories/artifactEmbeddingRepo.ts` (`searchLexical`), `rag.service.ts` (RRF) |

**Wajib owner sebelum E2E:**
1. `bun run db:migrate` (mig 0019) di DEV (:5432) + prod (:5435), lalu **full restart** semua proses (api/worker/agent) — DB-itests api/db merah sampai ini di-apply (bukan bug).
2. (Opsional, untuk OCR) set `MISTRAL_API_KEY` di env api+worker; tanpa itu upload gambar / PDF-scan gagal ekstraksi dengan alasan jelas (best-effort, tak crash).
3. Pastikan `AQSHA_EMBEDDING_API_KEY` ada di env **agent + api + worker** (fail-fast: ketiga proses menolak boot tanpa kunci).
4. E2E: follow-up dokumen lintas-giliran (anti-linglung), attach di pesan pertama, file >2 MB pending→ready, upload gambar (OCR), hybrid search kata-kunci.
