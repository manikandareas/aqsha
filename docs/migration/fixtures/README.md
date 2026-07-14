# Fixtures — correctness-critical contracts (Phase 0 #4)

Fixtures input→expected-output untuk verifikasi port Svelte (contract test lintas framework, §11.2). Diekstrak **read-only** dari test + pure-logic source pada baseline `ec04389`. Tanpa secret/PII (ID seperti `user_1`/`ws_1` = literal sintetis dari assertion, dipertahankan apa adanya).

## Isi

| File | Cakupan |
|---|---|
| [`correctness-critical-fixtures.md`](correctness-critical-fixtures.md) | 6 grup: (1) timeline reducer + chat-core + deep/stats viz, (2) citation export byte-exact + import, (3) upload state machine, (4) marquee geometry, (5) library model + panel URL codec, (6) BlockNote autosave FSM + explore citation. |

## External fixture files (sudah ada di repo, bagian dari baseline)

Jangan duplikat — referensikan langsung saat Phase 9/10:
- `packages/services/test/fixtures/citations/{mendeley,zotero}.{bib,ris}` — parse/format bibliography.

## Konstanta yang wajib cocok di port

`MAX_WORKSPACE_UPLOAD_FILES=20` · `WORKSPACE_UPLOAD_CONCURRENCY=3` · `MAX_CONTEXT_ARTIFACTS=12` · `MAX_UPLOAD_BYTES=52428800`.

## Gap yang harus ditutup port (belum ada test byte-locking)

Dua modul pure ini **belum punya `.test.ts`** — kontraknya dibaca dari source. Saat porting, **tambah golden fixture** (drive dengan urutan chunk/skenario di doc, snapshot hasilnya):
1. `apps/web/features/threads/lib/mastra-timeline.ts` — reducer `reduceMastraChunk`/`reduceWorkflowChunk` (SoT status "busy/Stop" + progress `/deep`).
2. `apps/web/features/workspaces/components/workspace-upload-toast-model.ts` — `getUploadSummary`/`getStatusText`.

## Runtime payload (perlu app + auth — OPS/owner, bukan static)

Fixtures di atas dari pure logic. Payload jaringan riil (butuh `apps/web` + Clerk auth berjalan) di-capture terpisah oleh owner bila diperlukan Phase 6–9, tanpa secret/PII:
- **Timeline stream** — rekam SSE `/mastra-api/*` untuk satu thread + satu `/deep` run (urutan chunk `start`→`text-delta`→`tool-*`→`finish`). Redact token/threadId riil.
- **Citation export** — unduh `.bib`/`.ris`/`.json` dari Citation Manager; bandingkan byte dengan grup 2.
- **Upload** — rekam presign+PUT untuk 3–4 file (termasuk 1 gagal) untuk memverifikasi state machine grup 3.

Prosedur capture: jalankan web baseline (`bun run dev:web`), sign-in test instance, lakukan flow, simpan payload ter-redaksi ke folder ini sebagai `runtime/<nama>.json`. Ini **tidak** memblokir gate Phase 0 (§ Phase 0 gate hanya menuntut ledger + freeze); dilakukan saat phase konsumennya.
