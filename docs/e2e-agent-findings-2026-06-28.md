# Temuan E2E — Fitur Agent "Astra" (2026-06-28)

> **Metode:** pengujian end-to-end di browser (Claude in Chrome) terhadap app lokal + verifikasi langsung ke DB dev (`mastra_messages`, `research_sources`, `provider_usage_ledger`, `usage_daily_rollup`) dan pembacaan kode.
> **Lingkungan:** web `:3000` (dev), api `:3001`, agent Mastra `:4111`; akun `plan_key=admin` (kredit unlimited); model `gpt-5.4-mini` (OpenAI langsung).
> **Baseline expected:** `docs/product-spec-astra-agent.md` (ID gap **G1–G7** dipakai konsisten di sini).
> **Catatan jaringan:** di awal sesi, `api.openai.com` di-reset TLS oleh jaringan (intermittent `ECONNRESET`) → semua turn gagal. Setelah jaringan diganti, pulih. **Ini bukan bug app.**

## Ringkasan severity

| ID | Issue | Severity | Status |
|---|---|---|---|
| **G1** | Refresh saat turn aktif: progres tak resume **dan** jawaban ter-truncate | 🔴 Tinggi | Reproduced |
| **G2** | `/deep` memakai agent+skill, **bukan** Workflow `deep-research` (dormant) | 🟠 Sedang (arsitektur; akar G3/G4) | Reproduced |
| **G3** | Billing `deep_research` tidak ke-debit | 🟠 Sedang | Reproduced |
| **G4** | `citation_number=NULL` + tak ada bagian Sumber/Referensi + citation-verifier tak jalan | 🟠 Sedang | Reproduced |
| **G5** | Stop melempar `AbortError` tak tertangani | 🟡 Rendah | Reproduced |
| **G6** | Retry/regenerate menduplikasi pesan user | 🟡 Rendah | Reproduced |
| **G7** | Kartu artefak rencana hilang setelah refresh | 🟡 Rendah | Reproduced |
| **G8** | Resume approval tool → error stream `tool_result must be preceded by a tool_call` | 🟡 Rendah | Reproduced |

**Yang BERFUNGSI baik:** streaming chat + sintesis final (tanpa "turn senyap"), title async, slash menu (10 cmd) + `/deep` chip, deep-research *inti* (plan-gate konversasional, pencarian paper+web nyata, sintesis bersitasi `[n]` seimbang dengan counter-evidence naratif, 35 sumber OpenAlex tersimpan), billing ledger (`external_search`, `normal_chat`), rehydrate history pasca-selesai, error-handling ECONNRESET + retry-draft, kirim-kosong diblokir, Stop & Retry, **propose_artifact + save-to-workspace + kartu approval `delete_artifact` (Setujui/Tolak) — semua TERVERIFIKASI LIVE**.

### ✔ HITL — kartu approval `delete_artifact` (terverifikasi 2026-06-28)
Alur diuji live: minta agent buat artifact → konfirmasi percakapan → artifact dibuat (kartu Dokumen) → simpan ke workspace (badge "Tersimpan") → minta hapus → **kartu approval muncul**: *"Menghapus artefak — &lt;id&gt;? Setujui untuk menjalankan."* + tombol **Setujui / Tolak** (`agent.approve`/`agent.decline`, `mastra-chat-thread-surface.tsx:154-178`). Klik **Setujui** → "Selesai · 1 langkah" → "Sudah dihapus" + artifact hilang dari DB. **Jadi kartu approval bertombol MEMANG ADA** (khusus tool `requireApproval=true` = `delete_artifact`), berbeda dari plan-gate `/deep` yang konversasional. *Catatan kecil:* row artifact **hilang total** dari tabel `artifacts` walau kolom `deleted_at` ada (soft-delete) — perlu cek apakah hard vs soft delete.

---

## G1 — Refresh saat turn aktif tidak resume real-time DAN memotong jawaban 🔴

**Pertanyaan owner yang dijawab:** *"Saat long-running task berjalan, jika di-refresh, apakah progresnya masih berjalan real-time?"* → **TIDAK.**

**Repro:**
1. `[auth]` Kirim pertanyaan yang menghasilkan jawaban panjang (atau `/deep` yang sudah disetujui).
2. Saat status `streaming` (tombol Stop tampil, beberapa paragraf sudah keluar), **refresh** halaman (reload URL thread).
3. Amati UI + cek DB.

**Expected (spec FR7.3):** progres lanjut real-time (FE re-subscribe ke run aktif); jawaban selesai utuh.

**Actual:**
- UI **jatuh ke state basi** (thread lama → kondisi sebelum turn aktif) atau **kosong** (thread baru → tampilan home "Apa yang ingin kita teliti?"); komposer kembali **idle** (tombol kirim, bukan Stop) → **tidak** re-subscribe.
- Lebih buruk: **disconnect meng-abort generasi server** → pesan asisten ter-*persist* **terpotong mid-kalimat**. Run yang **tidak** di-refresh selesai utuh.

**Bukti:**
- Thread `/deep` (793cb3df): jawaban DB berakhir `"…Banyak studi melaporkan potensi"` (terpotong), `textLen≈480`.
- Esai (702a799c): di-refresh ~9 dtk; pesan ter-persist `13:09:06` (~46 dtk **setelah** disconnect) tapi berakhir `"…Masyarakat juga"` (terpotong). → server **lanjut sebentar** lalu **ter-abort**, bukan berhenti seketika.
- Kontrol (38324808, **tanpa** refresh): `textLen=2900`, berakhir `"…langkah penting untuk hidup lebih sehat, seimbang, dan berkualitas."` (utuh, ada kesimpulan).

**Root cause:**
- `apps/web/features/threads/lib/use-mastra-agent.ts` — saat mount, FE hanya memuat **seed history** (`thread.listMessages()`), **tidak** ada logika re-subscribe ke run yang sedang berjalan.
- Mastra mem-persist pesan asisten **di `onFinish`** (akhir turn), **bukan inkremental** — terbukti via poll DB: selama deep-research berjalan, pesan asisten sintesis **belum** ada di `mastra_messages` (yang ada hanya pesan plan). Maka saat refresh, tak ada turn in-flight untuk ditampilkan/diresume.
- Abort fetch klien (akibat unload halaman) merambat ke pembatalan generasi upstream.

**Saran fix:** persist inkremental / simpan run-id aktif + re-attach ke stream berjalan saat mount (Mastra `observe`/stream resume); pastikan disconnect klien tidak membatalkan run server (jalankan run detached, stream sebagai subscriber).

---

## G2 — `/deep` memakai agent+skill, bukan Workflow `deep-research` (dormant) 🟠

**Ini akar penyebab G3 & G4** (bukan tiga bug terpisah).

**Repro / observasi:**
1. `[auth]` Jalankan `/deep <pertanyaan>` → setujui plan → biarkan selesai.
2. Cek `mastra_workflow_snapshot` dan `provider_usage_ledger`.

**Expected (memori migrasi Fase 2/3):** `/deep` menjalankan **Mastra Workflow `deep-research`** 6-step (draftPlan → approvePlan *suspend/resume* → searchLiterature → counterEvidence → verifyCitations → synthesize), dengan billing `deep_research` & subagent.

**Actual:** `/deep` berjalan sebagai **turn agent biasa** (`astra-lite` + skill `deep-research`), **percakapan**:
- `mastra_workflow_snapshot` **tidak** punya run `deep-research` (hanya `__mastra_notification_dispatcher`).
- Plan-gate = **teks** "balas setuju/lanjut" (bukan workflow suspend/resume API).
- Tool yang jalan hanya `search_papers`/`search_web` (tool agent), **tanpa** `verify_identifiers`/counter-evidence subagent.

**Root cause (kode):**
- `packages/chat-core/src/index.ts:254-268` — command `/deep` hanya **`buildPrompt`**: *"Gunakan skill deep-research… WAJIB mulai dengan `propose_research_plan`… TUNGGU persetujuan user"*. Tidak ada pemanggilan workflow.
- `apps/web/features/threads/lib/use-mastra-agent.ts` — FE **selalu** `agent.stream(text)`; tidak ada pemanggilan `/api/workflows/deep-research/*`.
- `apps/agent/src/mastra/index.ts:30` — Workflow `deep-research` **terdaftar** & diekspos di `/api/workflows/deep-research/*`, tapi **tak ada pemanggil** dari FE → **dormant**.

**Saran fix (keputusan produk):** pilih satu jalur —
(a) **Wire-kan** `/deep` ke Workflow (FE call `start/stream/resume`), dapat plan-gate suspend/resume + subagent + billing + citation verify; **atau**
(b) **Pertahankan jalur skill** tetapi **pindahkan** debit `deep_research` + pemetaan `citation_number` + langkah verifikasi ke dalam alur skill (lihat G3/G4). Pilih (a) atau (b) secara eksplisit; saat ini "setengah jalan".

---

## G3 — Billing `deep_research` tidak ke-debit 🟠 (konsekuensi G2)

**Repro:**
1. `[auth]` Jalankan & setujui `/deep` (≥1 kali hari ini).
2. Query `usage_daily_rollup.feature_counts.deep_research` untuk tanggal hari ini + `provider_usage_ledger WHERE feature='deep_research'`.

**Expected (spec F9 / AC4.5):** approve plan men-debit **`deep_research`** (60 kredit Lite) sekali per run (`consumeCredits`, idempotency `${runId}:deep`, di `deep-research.ts:231-243`).

**Actual:** **tidak ke-debit.**
- Kedua thread `/deep` (793cb3df, 6dcb42f4) hanya punya ledger `external_search` (6 & 7 baris), **0 baris** `deep_research`.
- `usage_daily_rollup` 2026-06-28: `deep_research=0` (vs 06-27=1, 06-25=6) → **berhenti tercatat sejak hari ini**.

**Root cause:** debit `deep_research` hanya terjadi di **Workflow** (`approvePlan` step) — dan Workflow **tidak dijalankan** (G2). Pemakaian deep-research nyata hanya menagih per-pencarian (`external_search` 2 kredit/call).

**Saran fix:** ikuti keputusan G2. Jika jalur skill dipertahankan, tambahkan debit `deep_research` saat plan disetujui di jalur skill (mis. di tool `propose_research_plan`/saat resume konversasional).

---

## G4 — Sitasi menggantung: `citation_number=NULL`, tak ada bagian Sumber, verifier tak jalan 🟠 (konsekuensi G2)

**Repro:**
1. `[auth]` Selesaikan satu `/deep`.
2. Baca sintesis di UI (cari bagian "Sumber/Referensi"); query `research_sources` untuk thread.

**Expected (spec FR4.3/FR4.4):** sintesis punya `[n]` yang **terpetakan** ke sumber (`research_sources.citation_number` terisi) + **bagian Sumber/Referensi** di UI; `verify_identifiers`/citation-verifier dijalankan.

**Actual:**
- `research_sources`: **35 sumber** tersimpan (OpenAlex, judul+DOI+URL nyata) **tapi `citation_number=NULL` untuk SEMUA** → `[1]–[4]` di teks **tidak** terpetakan ke sumber.
- Sintesis (3.912 char) **tidak** memuat bagian "Sumber/Referensi/URL".
- `usage_daily_rollup.citation_verify=0` hari ini → **citation-verifier tidak berjalan**.

**Bukti:** `SELECT count(citation_number) FROM research_sources WHERE thread_id=…` → 0 dari 35; sintesis tail tanpa daftar sumber.

**Root cause:** pemetaan `citation_number` + langkah `verifyCitations` adalah **step Workflow** (`deep-research.ts`) yang tidak jalan (G2). Pembaca melihat `[n]` tanpa tahu sumbernya.

**Saran fix:** render daftar Sumber dari `research_sources` per-thread di UI + isi `citation_number` (di jalur yang dipilih pada G2).

---

## G5 — Stop melempar `AbortError` yang tidak tertangani 🟡

**Repro:**
1. `[auth]` Kirim prompt jawaban panjang.
2. Klik **Stop** saat streaming.

**Expected:** stream berhenti bersih.

**Actual:** stream **berhenti** (✔, teks parsial dipertahankan) **tapi** muncul error di Next.js dev overlay:
```
Console AbortError: BodyStreamBuffer was aborted
  at useMastraAgent.useCallback[stop] (use-mastra-agent.ts:131)
  > abortRef.current?.abort();
```
Badge "1 Issue" tampil. Secara fungsional Stop OK; ini **unhandled rejection** (dev-only overlay, tapi tetap polusi error).

**Root cause:** `apps/web/features/threads/lib/use-mastra-agent.ts:130-135` — `abortRef.current?.abort()` tanpa membungkus/men-`catch` `AbortError` yang dilempar oleh stream reader yang sedang berjalan.

**Saran fix:** `try/catch` di sekitar abort, atau filter `AbortError` di `catch` block stream (`err.name === "AbortError"` → abaikan, jangan set `state.error`).

---

## G6 — Retry/regenerate menduplikasi pesan user 🟡

**Repro:**
1. `[auth]` Setelah satu jawaban (atau setelah Stop), klik ikon **regenerate**.

**Expected:** regenerasi jawaban untuk prompt yang sama.

**Actual:** **berhasil regenerasi** (✔) **tapi** memunculkan **bubble pesan user duplikat** + pasangan turn baru — bukan mengganti jawaban sebelumnya in-place.

**Root cause:** `mastra-chat-thread-surface.tsx:149-152` — `regenerate()` = `send(lastUserText(...))` → memperlakukan sebagai turn baru.

**Saran fix:** jika UX yang diinginkan adalah "ganti in-place", regenerasi harus tidak menulis ulang pesan user (atau menandai turn sebagai regenerasi). Jika "turn baru" memang disengaja, sembunyikan duplikasi bubble user.

---

## G7 — Kartu artefak rencana hilang setelah refresh 🟡

**Repro:**
1. `[auth]` Jalankan `/deep` sampai plan-gate (kartu "Rencana riset … Dokumen" tampil).
2. Refresh halaman.

**Expected:** referensi rencana tetap terlihat (kartu/atau setidaknya tautan ke artefak).

**Actual:** setelah refresh, **teks** approval ("Rencana riset sudah saya susun. Silakan balas setuju/lanjut") **tetap** ada, tapi **kartu artefak Dokumen hilang**.

**Root cause:** timeline tool-step & kartu artefak bersifat **LIVE-ONLY** — hanya **teks + reasoning** yang dipersist ke history (`mastra-timeline.ts`). Saat rehydrate, kartu artefak tidak direkonstruksi.

**Saran fix:** rehydrate kartu artefak dari `mastra_messages` tool-parts / dari `artifacts` tabel saat membangun timeline history (minimal tampilkan tautan ke artefak rencana).

---

## G8 — Resume approval tool melempar `tool_result must be preceded by a tool_call` 🟡

**Repro:**
1. `[auth]` Picu tool ber-approval (`delete_artifact`) → kartu Setujui/Tolak.
2. Klik **Setujui**.
3. Cek console.

**Expected:** resume approval mulus tanpa error.

**Actual:** tool **berhasil dijalankan** (artifact terhapus, "Sudah dihapus") **tapi** console melempar (badge "1 Issue"):
```
Error processing stream response: Error: tool_result must be preceded by a tool_call
  at onChunk (@mastra/client-js …/index.js)
  at sharedProcessMastraStream
  at Agent.processChatResponse_vNext
```

**Root cause (hipotesis):** saat approval di-resume, server mengalirkan **`tool_result`** tanpa `tool_call` pendahulu di segmen stream yang sama → parser `@mastra/client-js` (`processChatResponse_vNext`) menolak urutan. Fungsional OK, tapi integritas stream pada jalur HITL-approval cacat (berpotensi glitch UI di kasus lain).

**Saran fix:** pastikan stream resume approval mengirim ulang `tool-call` pendahulu (atau tandai sebagai continuation) sebelum `tool-result`; atau tangani urutan ini di adapter klien.

---

## Tidak teruji / keterbatasan

- **Billing-block free-tier (AC9.2):** akun uji `plan_key=admin` (kredit unlimited) → tak bisa memicu blokir kuota. Butuh akun `free` untuk verifikasi return-union rate-limit/billing.
- **TestSprite:** asersi level-DB (G3, G4, citation_number, ledger) **di luar** jangkauan tes UI/API TestSprite; G1 (refresh mid-stream) bergantung timing → sulit dideterministik oleh auto-test. TestSprite juga butuh kredensial login Clerk (tidak bisa di-supply otomatis).

## Lampiran — query verifikasi (dev DB)

`DATABASE_URL` dev = `…@100.75.23.41:5432/aqsha` (bukan MCP `postgres-vps` yang menunjuk prod `:5435`).

```sql
-- G3: deep_research debit hari ini
SELECT date, feature_counts->>'deep_research' AS deep, feature_counts->>'external_search' AS ext
FROM usage_daily_rollup WHERE owner_user_id = :uid ORDER BY date DESC LIMIT 3;

-- G3: ledger fitur per thread /deep
SELECT feature, count(*), sum(credits) FROM provider_usage_ledger
WHERE thread_id = :deep_thread_id GROUP BY feature;

-- G4: pemetaan citation_number
SELECT count(*) total, count(citation_number) with_num FROM research_sources WHERE thread_id = :deep_thread_id;
```
