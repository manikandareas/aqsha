# Product Specification — Fitur Agent "Astra"

> **Status:** Living document · **Versi:** 2.0 (post-fix G1–G8) · **Tanggal:** 2026-06-28
> **Cakupan:** Fitur agent **Astra** — chat (`astra-lite`), Deep Research (`/deep` via Mastra Workflow), Human-in-the-Loop, streaming/persist/resume, sitasi/sumber, dan billing pemakaian agent.
> **Tujuan dokumen:** (1) sumber kebenaran *expected behavior* untuk pengujian; (2) acuan requirement + acceptance criteria; (3) **rencana uji E2E driver-agnostik** (§7) yang bisa dijalankan **TestSprite, Claude-in-Chrome, atau manual** tanpa mengubah teks.
> **Grounding:** Disusun dari kode nyata per 2026-06-28 SETELAH perbaikan G1–G8 (lihat `docs/agent-fixes-plan-2026-06-28.md` + memory `astra-agent-fixes-g1-g8-impl`). Riwayat bug pra-fix ada di `docs/e2e-agent-findings-2026-06-28.md`.
> **Perubahan v1→v2 (ringkas):** `/deep` kini menjalankan **Workflow `deep-research`** dengan **plan-gate berupa KARTU bertombol** (bukan percakapan teks); refresh saat streaming **resume** (chat & /deep); Stop bersih tanpa `AbortError`; regenerate **tanpa duplikat**; kartu artefak **rehydrate** saat refresh; `citation_number` + **bagian Sumber** terisi; debit `deep_research` aktif; skill dimuat via **inline** (lepas dari cwd).

---

## 1. Ringkasan & Arsitektur

Astra adalah asisten riset di dalam app Aqsha (`apps/web`, Next.js 16). Dua kemampuan utama:

1. **Chat (`astra-lite`)** — percakapan riset dengan akses tool (baca data, kelola workspace/artifact, pencarian akademik & web) dan skill domain.
2. **Deep Research (`/deep`)** — riset multi-sumber via **Mastra Workflow** deterministik: agent menyusun **rencana**, meminta **persetujuan** lewat kartu, lalu mencari literatur, mencari bukti tandingan, menomori + memverifikasi sitasi, dan menyusun **sintesis bersitasi**.

### 1.1 Komponen runtime

| Lapisan | Lokasi | Peran |
|---|---|---|
| Frontend chat | `apps/web/features/threads/*`, `apps/web/features/thread-experience/*` | UI komposer, timeline, kartu rencana/approval/artefak, hook `useMastraAgent` |
| Proxy | `apps/web/app/mastra-api/[...path]/route.ts` | `/mastra-api/*` → `MASTRA_AGENT_ORIGIN` (`:4111`) via `node:http`, **tanpa idle-timeout**, inject Clerk Bearer |
| Agent runtime | `apps/agent/src/mastra/*` | Agent `astra-lite`, tools, skills (inline), processors, Workflow `deep-research` + subagent, Mastra Memory |
| Services | `packages/services/*` | Billing/entitlement, RAG, research, citations |
| DB | `packages/db` (Postgres + pgvector) | `mastra_*` (SoT pesan), `research_sources`, billing (`billing_credit_periods`, `provider_usage_ledger`, `usage_daily_rollup`) |

### 1.2 Prinsip arsitektur (penting untuk pengujian)

- **Mastra Memory = source-of-truth pesan.** FE hanya mengirim pesan **user**; server mem-persist teks/reasoning/tool calls ke `mastra_messages`. Ref: `use-mastra-agent.ts`, `mastra-timeline.ts`.
- **Chat memakai durable-thread API.** Kirim = `sendMessage` (run **terlepas dari koneksi** → refresh tak meng-abort generasi); streaming + re-attach = langganan tunggal `subscribeToThread` (replay buffer in-flight saat refresh); Stop = `abortThread`; HITL tool = `sendToolApproval`. Persist tetap di **`onFinish`** (reconnect mid-run pakai buffer; refresh pasca-selesai pakai `mastra_messages`).
- **`/deep` = Mastra Workflow `deep-research`** dijalankan FE (`getWorkflow().createRun().stream()/resumeStream()/observe()`), 7 step: draftPlan → approvePlan (HITL suspend/resume) → searchLiterature → counterEvidence → assignCitations → verifyCitations → synthesize. Step akhir mem-persist laporan **verbatim** ke memory thread (`persistReport`) + proyeksi `chat_threads` + title async.
- **Model:** `astra-lite` & subagent deep memakai `liteModel` = OpenAI Chat Completions, model dari env `AQSHA_LITE_MODEL` (deployment saat ini `gpt-5.4-mini`), opsional `OPENAI_BASE_URL`. **Tanpa `maxOutputTokens`**; input dibatasi `TokenLimiterProcessor` (~75% context).
- **Budget langkah chat:** `maxSteps = 10` + `EnsureFinalResponseProcessor` (paksa teks akhir → anti "turn senyap").
- **Skills (11) di-INLINE** (`createSkill`, di-compile ke bundle via `scripts/gen-inline-skills.ts`) — lepas dari cwd/fs (path filesystem gagal resolve karena runtime cwd = `<mastraDir>/public`).

---

## 2. Persona & Plan (entitlements)

Sumber: `packages/services/src/plan.ts`.

| Plan | Kredit/bulan | Deep research/bulan | Workspace | Library | Model |
|---|---|---|---|---|---|
| **free** | 50 | 2 | 1 | 25 | Lite |
| **starter** | 500 | 3 | 5 | 250 | Lite + Pro |
| **plus** | 1.500 | 12 | 20 | 1.000 | Lite + Pro |
| **ultra** | 10.000 | unlimited | unlimited | unlimited | Lite + Pro |
| **admin** | unlimited (`MAX_SAFE_INTEGER`) | unlimited | unlimited | unlimited | internal |

> **Catatan pengujian:** akun uji default (owner) ber-`plan_key=admin` → kuota tak terbatas. **Skenario billing-block (kuota habis) TIDAK bisa diuji dengan akun ini**; butuh akun `free`.

---

## 3. Fitur, Functional Requirements & Acceptance Criteria

Notasi: **FR** = functional requirement; **AC** = acceptance criterion (testable). `[auth]` = butuh login Clerk. ✔ = perilaku post-fix yang diharapkan lulus.

### F1 — Chat dasar (`astra-lite`)

**FR1.1** User mengetik di komposer dan mengirim (Enter / tombol kirim). Pesan baru membuat **thread baru** (URL di-bump ke `/app/threads/<id>`) atau melanjutkan thread aktif.
**FR1.2** Jawaban di-**stream** token-demi-token; selama berlangsung status = `streaming`, tombol komposer = **Stop**, indikator "Astra sedang berpikir…/menyusun jawaban…".
**FR1.3** Turn berakhir dengan **teks jawaban final** utuh (`finishReason=stop`); tidak berhenti di tool-call tanpa teks.
**FR1.4** Setelah selesai, muncul aksi **copy** dan **regenerate** di bawah jawaban.
**FR1.5** Judul thread di-generate **asinkron** setelah turn pertama.

- **AC1.1** Mengirim "jelaskan singkat apa itu spaced repetition" → bubble user, lalu jawaban ter-stream dan **diakhiri kalimat utuh** (tanda baca penutup).
- **AC1.2** Selama streaming tombol = **Stop**; setelah selesai kembali ke tombol kirim + ikon copy/regenerate.
- **AC1.3** Kirim pesan **kosong** (Enter tanpa teks) tidak membuat thread / tidak mengirim.
- **AC1.4** Judul thread berubah dari "Percakapan baru" menjadi judul ringkas dalam ≤ ~30 dtk.

### F2 — Slash commands (komposer)

Sumber: `packages/chat-core/src/index.ts`. **10 command**, dikelompokkan.

| Grup | Command | Alias |
|---|---|---|
| Tulis Akademik | `/paraphrase`, `/expand`, `/summarize` | — |
| Rancang Riset | `/outline` | — |
| Rancang Riset | `/research-question` | `/rq` |
| Rancang Riset | `/methodology` | `/method` |
| Rancang Riset | `/literature-review` | `/litreview` |
| Rancang Riset | `/deep` | `/deepresearch`, `/riset` |
| Workspace | `/artifact`, `/workspace` | — |

**FR2.1** Mengetik `/` membuka menu perintah yang dapat difilter; memilih item memasukkan command ke komposer.
**FR2.2** `/deep` ditampilkan sebagai **chip/token mode**; user mengetik pertanyaan riset setelahnya. Saat dikirim, `/deep` **TIDAK** di-expand jadi prompt chat — FE menjalankan Workflow (lihat F4).

- **AC2.1** Mengetik `/` menampilkan menu dengan **10** perintah berkelompok.
- **AC2.2** Memilih "Deep research" → komposer menampilkan chip **deep**, siap menerima pertanyaan.

### F3 — Konteks `@mention` & Attachment

**FR3.1** `@` memunculkan picker workspace/paper; pilihan jadi **pill inline** (catatan ephemeral). Cap: 5 workspace, 8 paper.
**FR3.2** Attachment file = presign → PUT S3 → finalize, tersimpan sebagai **artifact headless** per thread. **Nonaktif sebelum thread punya id**.

- **AC3.1** `@` memunculkan daftar workspace/paper; memilih menambahkan pill.
- **AC3.2** Tombol attachment nonaktif di komposer thread baru (sebelum kirim pertama).

### F4 — Deep Research (`/deep`) — via Mastra Workflow

> **Perilaku v2 (ter-wire):** `/deep` menjalankan **Mastra Workflow `deep-research`** dari FE (Opsi A). Composer mendeteksi `/deep`, mengirim **pertanyaan** (slug di-strip) ke `agent.sendDeep`, yang memanggil `createRun()` + `run.stream({inputData:{question, threadId}})`. Plan-gate = **KARTU bertombol** (Workflow `suspend` di step `approve-plan`), bukan percakapan teks. Ref: `composer.tsx`, `use-mastra-agent.ts`, `workflows/deep-research.ts`.

**Alur:**
1. User kirim `/deep <pertanyaan>`.
2. Workflow menyusun rencana → **suspend** → FE menampilkan **kartu "Rencana riset"** (prosa rencana + daftar sub-pertanyaan) + tombol **Setujui / Tolak**. Riset BELUM jalan.
3. **Setujui** → `resumeStream({step:'approve-plan', resumeData:{approved:true}})`; debit `deep_research` (60 kredit Lite, sekali). **Tolak** → workflow batal, tak riset.
4. Jejak langkah tampil di blok "Proses": "Menelaah literatur" → "Mencari bukti tandingan" → "Menomori sumber" → "Memverifikasi sitasi" → "Menulis sintesis".
5. **Sintesis akhir bersitasi `[n]`** muncul sebagai jawaban; **bagian/daftar Sumber** "N sumber" muncul di bawahnya dengan badge `[n]`. Laporan + pertanyaan dipersist ke thread (rehydrate saat refresh).

**FR4.1** Sebelum riset, Workflow **wajib** menampilkan rencana (prosa + 3–6 sub-pertanyaan) sebagai kartu dan **menunggu persetujuan**.
**FR4.2** Pertanyaan ambigu → agent **minta konteks** lebih dulu (chat biasa; lihat F5b).
**FR4.3** Sintesis akhir **bersitasi `[n]`**; sumber riil tersimpan di `research_sources` (di-scope thread, `turnId` = workflow runId).
**FR4.4** Tiap `[n]` dipetakan ke sumber: `research_sources.citation_number` terisi 1..N (dedupe by DOI/arXiv/locator); counter-evidence + citation-verifier dijalankan; **bagian Sumber** dirender di UI.
**FR4.5** Menyetujui plan men-debit **`deep_research`** sekali (`provider_usage_ledger` + `usage_daily_rollup`).

- **AC4.1** `/deep <pertanyaan spesifik>` → **kartu "Rencana riset" + tombol Setujui/Tolak**; riset belum jalan.
- **AC4.2** Klik **Setujui** → blok "Proses" berjalan, lalu **sintesis bersitasi `[n]`**.
- **AC4.3** `research_sources` thread terisi (> 0 baris) dengan judul/DOI/URL nyata. *(verifikasi DB)*
- **AC4.4** Sintesis punya **bagian Sumber** ("N sumber") + tiap baris berbadge `[n]`; `research_sources.citation_number` non-null. *(UI + DB)*
- **AC4.5** Menyetujui plan menambah hitungan `deep_research` di `usage_daily_rollup`. *(verifikasi DB)*
- **AC4.6** Klik **Tolak** pada kartu rencana → workflow berhenti, tak ada sintesis/pencarian.

### F5 — Human-in-the-Loop (HITL)

HITL ada **dua mekanisme berkartu-tombol + satu percakapan**:

**(a) Plan-gate `/deep` = KARTU bertombol** (Workflow suspend `approve-plan`)
**FR5.1** Kartu **"Rencana riset"** dengan tombol **Setujui** (`agent.resolvePlan(true)`) / **Tolak** (`agent.resolvePlan(false)`). Ref: `mastra-chat-thread-surface.tsx` (planGate card), `use-mastra-agent.ts`.

**(b) Klarifikasi query ambigu = PERCAKAPAN (teks)**
**FR5.2** Untuk query ambigu, agent **bertanya balik sebagai teks**; user menjawab via komposer. Tidak ada kartu field input.

**(c) Tool destruktif = KARTU bertombol** (Mastra `sendToolApproval`)
**FR5.3** Tool **`delete_artifact`** (satu-satunya `requireApproval`) memunculkan **kartu Setujui/Tolak**; resume via `sendToolApproval` (mengalir di langganan thread yang sama — tanpa error urutan stream).

- **AC5.1** Plan-gate `/deep` menampilkan **kartu "Rencana riset" + Setujui/Tolak** (bukan percakapan teks).
- **AC5.2** Query ambigu (mis. "bandingkan dua pendekatan itu untuk proyek saya") → agent **minta konteks** sebagai teks.
- **AC5.3** Minta hapus artifact → **kartu Setujui/Tolak**; klik Setujui → terhapus ("Sudah dihapus"), **tanpa** error console (`tool_result must be preceded by a tool_call` TIDAK boleh muncul).

### F6 — Artifacts

**FR6.1** `propose_artifact` membuat dokumen Markdown **headless** (`workspaceId=null`, ter-scope thread) → **kartu artefak** (judul + "Dokumen").
**FR6.2** Kartu artefak punya aksi **simpan ke workspace** (`link_to_workspace`); setelah tersimpan → badge "Tersimpan".
**FR6.3** Kartu artefak **rehydrate saat refresh** (direkonstruksi dari `tool-invocation` di `mastra_messages`). Ref: `mastra-timeline.ts` `mastraMessagesToTimeline`.

- **AC6.1** Minta buat dokumen → kartu artefak (judul + "Dokumen") muncul.
- **AC6.2** Simpan ke workspace → badge "Tersimpan".
- **AC6.3** Reload thread → kartu artefak tetap tampil.

### F7 — Streaming, Persist & Resume

**FR7.1** Blok "Proses" (tool/langkah, label "Sedang bekerja… Ns") dirender LIVE; teks + reasoning + kartu artefak (rehydrate) dipersist; jejak tool generik tak dipersist sebagai timeline live.
**FR7.2** Turn **selesai** ditampilkan penuh saat reload (seed dari `mastra_messages`).
**FR7.3** Refresh **di tengah turn aktif** → progres **lanjut/real-time** (chat: `subscribeToThread` me-replay + lanjut; `/deep`: `runById` → `observe` / kartu rencana di-rehydrate). Jawaban **tidak terpotong** (run terlepas dari koneksi).

- **AC7.1** Reload thread yang turn-nya selesai → seluruh percakapan (user + jawaban + kartu artefak) tampil.
- **AC7.2** Refresh saat chat **streaming** → token lanjut, jawaban berakhir utuh (tidak terpotong mid-kalimat).
- **AC7.3** Refresh saat `/deep` di tahap plan-gate → kartu "Rencana riset" tetap tampil; saat tahap riset → proses resume / selesai dengan sintesis.

### F8 — Stop & Retry

**FR8.1** Tombol **Stop** memanggil `abortThread` (cancel server-side) → stream berhenti **bersih** (chunk `abort`), teks parsial dipertahankan, status kembali `ready`. **Tanpa** `AbortError`.
**FR8.2** **Regenerate** menjalankan ulang pertanyaan terakhir **tanpa menambah bubble user duplikat** (hapus pasangan turn terakhir di memory + kirim ulang).
**FR8.3** Saat error (mis. koneksi), pesan error tampil dan **draft pesan dipulihkan** ke komposer.

- **AC8.1** Klik Stop saat streaming → berhenti, teks parsial tetap, tombol kembali kirim, **tanpa** error overlay/badge.
- **AC8.2** Klik regenerate → jawaban baru untuk pertanyaan sama, **tanpa** bubble user kembar (live & setelah refresh).
- **AC8.3** Saat error koneksi, pesan error muncul + teks dikembalikan ke komposer.

### F9 — Billing & Rate-limit

| Feature | Biaya kredit | Kapan |
|---|---|---|
| `normal_chat` | `ceil(totalTokens/1500)` (min 1) | per-turn chat Lite (output processor) |
| `deep_research` | 60 (Lite) / 120 (Pro) | **sekali** saat plan `/deep` disetujui (step `approvePlan`) |
| `external_search` | 2 / panggilan | tiap `search_papers/arxiv/web` + `lookup_doi` |
| `citation_verify` | 0 (rekam saja) | `verify_citations` / `verify_identifiers` |

**FR9.1 Precheck (chat):** `billingPrecheckProcessor` cek kuota `normal_chat`; habis/cooldown → abort turn (tripwire, return-union). `/deep` punya precheck `deep_research` di step draftPlan.
**FR9.2 Debit (atomik, idempoten):** `consumeCredits` mengunci period row, cek idempotency-key, tulis `provider_usage_ledger`, update `usage_daily_rollup`.
**FR9.3 Rate-limit:** `chat:send` = **20 pesan / 60 dtk** per user (fail-open bila Redis error).
**FR9.4 Admin:** `plan_key=admin` → gate selalu `ok`, kredit unlimited.

- **AC9.1** Tiap pemakaian agent menulis baris `provider_usage_ledger` (`feature`, `credits`, `idempotency_key`). *(DB)*
- **AC9.2** `[free-account]` kredit habis → kirim chat diblokir pesan kuota (bukan crash). *(tak teruji — akun admin)*
- **AC9.3** Menyetujui plan `/deep` menambah `deep_research` di `usage_daily_rollup` + baris ledger. *(DB)*

### F10 — Model selector (Lite/Pro)

**FR10.1** Dropdown: **Astra Lite** (selalu) + **Astra Pro** (terkunci jika `plan_key=free`).
**FR10.2** Runtime saat ini **Lite-only**; pilihan Pro kosmetik.

- **AC10.1** Plan free → Pro terkunci (ikon gembok). Plan berbayar → Pro bisa dipilih.

---

## 4. Non-functional Requirements

- **NFR1 (streaming tahan lama):** proxy `/mastra-api/*` `node:http` `setTimeout(0)` → langganan/Workflow lama tak putus idle-timeout.
- **NFR2 (run terlepas koneksi):** chat via `sendMessage` + Workflow via `createRun` → disconnect klien (refresh) TIDAK meng-abort generasi server.
- **NFR3 (auth):** tiap request menyertakan **Clerk Bearer** segar; verifikasi `MastraAuthClerk`. `/mastra-api/*` di-exclude dari middleware Clerk.
- **NFR4 (bahasa):** semua output agent **Bahasa Indonesia**, sentence case (tanpa all-caps).
- **NFR5 (kejujuran sitasi):** `[n]` harus dari hasil tool/inventory bernomor; dilarang mengarang identifier.
- **NFR6 (single-replica):** replay langganan `subscribeToThread` pakai buffer in-memory → valid untuk deploy single-replica (multi-replica perlu CachingPubSub).

---

## 5. State & Error Model (untuk asersi UI)

| Kondisi | UI yang diharapkan |
|---|---|
| `status=ready`, thread kosong | Layar landing komposer (hero + saran) |
| `status=submitted/streaming` | "Astra sedang berpikir…/menyusun jawaban…", tombol **Stop**, blok "Sedang bekerja" + elapsed |
| Turn selesai | Teks jawaban final + ikon copy/regenerate; blok "Selesai · N langkah" (bila ada tool) |
| `/deep` plan-gate | **Kartu "Rencana riset"** + tombol **Setujui/Tolak** |
| Tool `requireApproval` (`delete_artifact`) | Kartu **Setujui/Tolak** ("… Setujui untuk menjalankan.") |
| `/deep` selesai | Sintesis bersitasi `[n]` + toggle "N sumber" (badge `[n]`) |
| Error koneksi | Pesan error inline + draft dipulihkan ke komposer |
| Kuota habis (free) | Pesan blokir kuota (return-union), turn tak jalan |

---

## 6. Edge Cases (wajib diuji)

1. **Pesan kosong** → tidak terkirim (AC1.3).
2. **Stop mid-stream** → berhenti, teks parsial tetap, **tanpa AbortError** (AC8.1).
3. **Regenerate** → jawaban baru **tanpa duplikat user** (AC8.2).
4. **Refresh saat chat streaming** → resume, jawaban utuh (AC7.2).
5. **Refresh saat /deep** (plan-gate / riset) → kartu/proses resume (AC7.3).
6. **Query ambigu** → agent minta klarifikasi teks (AC5.2).
7. **Tolak plan `/deep`** → agent berhenti, tak riset (AC4.6).
8. **Hapus artifact** → kartu Setujui/Tolak, Setujui → terhapus tanpa error stream (AC5.3).
9. **Kuota habis (free)** → blokir berpesan (AC9.2). *(belum teruji — akun admin)*

---

## 7. Rencana Uji E2E — driver-agnostik (TestSprite / Claude-in-Chrome / manual)

> **Headless & portabel:** tiap langkah = aksi browser generik (navigate / type / click / wait-for-text / reload) + asersi **teks UI persis**. Tak ada selektor khusus tool → bisa dieksekusi **TestSprite**, **Claude-in-Chrome**, atau **manual** tanpa edit. Cocokkan string Bahasa Indonesia secara literal.

### 7.0 Prasyarat (semua driver)
- Stack dev jalan & **fresh** (web `:3000`, api `:3001`, agent `:4111`, worker). Setelah perubahan kode: kill orphan + `bun dev` bersih (gotcha reusePort + bundle agent basi).
- **Login Clerk** wajib: buka `http://localhost:3000`, sign-in, tunggu sampai di `http://localhost:3000/app`. Akun uji harus **2FA/OTP nonaktif** (driver otomatis tak bisa isi kode email). Isi kredensial: `<<TEST_EMAIL>>` / `<<TEST_PASSWORD>>`.
- Akun = **admin** (kredit unlimited) → **lewati** uji billing-block (F9 AC9.2).
- **Asersi DB di luar jangkauan TestSprite** (UI saja). Tandai "manual DB check"; Claude-in-Chrome juga UI-only kecuali dikombinasikan dgn query DB terpisah. DB dev = `…@100.75.23.41:5432/aqsha` (BUKAN MCP prod `:5435`).
- Waktu tunggu: chat ≤ 90 dtk; `/deep` ≤ 240 dtk. "Masih bekerja" = spinner + label diawali **"Sedang bekerja"**.

### 7.1 Petunjuk per-driver (ringkas)
- **TestSprite:** jadikan dokumen ini (atau `docs/testsprite-e2e-astra-prompt.md`) acuan PRD; suplai kredensial; jalankan TC di §7.2.
- **Claude-in-Chrome:** buka tab baru ke `http://localhost:3000`, lakukan login manual/asistif, lalu jalankan tiap TC sebagai urutan aksi + `read_page`/asersi teks. Untuk TC sensitif-waktu (refresh saat streaming), pakai `navigate`/reload tepat saat token mengalir.
- **Manual:** ikuti langkah apa adanya.

### 7.2 Test cases

Format: **Tujuan · Langkah · Expected (asersi) · Verifikasi**. Tag: 🟢 deterministik · 🟡 timing/long-running · 🔵 perlu DB.

**TC1 — Chat selesai utuh (AC1.1/1.3) 🟢**
Langkah: di `/app`, ketik `jelaskan singkat apa itu spaced repetition`, Enter.
Expected: bubble user muncul; jawaban ter-stream; saat selesai jawaban **berakhir tanda baca penutup** (`.`/`?`/`!`/`…`), tombol kembali ke kirim + ikon copy/regenerate. Lalu uji kirim kosong (Enter tanpa teks) → tak ada kirim.

**TC2 — Loading/Stop state (AC1.2) 🟢**
Langkah: kirim `tuliskan esai 4 paragraf tentang manfaat membaca buku`; amati saat streaming.
Expected: tombol komposer = **Stop** saat streaming; indikator "Astra sedang …" tampil; setelah selesai kembali ke kirim + copy/regenerate.

**TC3 — Slash menu 10 cmd (AC2.1/2.2) 🟢**
Langkah: ketik `/`. Expected: menu berkelompok berisi 10 command (`/paraphrase`,`/expand`,`/summarize`,`/outline`,`/research-question`,`/methodology`,`/literature-review`,`/deep`,`/artifact`,`/workspace`). Ketik `deep`, pilih "Deep research" → chip **deep** muncul.

**TC4 — Stop bersih, tanpa AbortError (AC8.1 · fix G5) 🟢**
Langkah: kirim `tuliskan esai panjang dan rinci tentang sejarah kopi di dunia`; saat beberapa paragraf streaming, klik **Stop**.
Expected: streaming berhenti, teks parsial tetap, tombol kembali kirim. **TIDAK** ada error overlay / banner merah / badge "1 Issue". (Regresi: `AbortError: BodyStreamBuffer was aborted` dilarang muncul.)

**TC5 — Regenerate tanpa duplikat (AC8.2 · fix G6) 🟢**
Langkah: setelah satu jawaban selesai, klik ikon **regenerate** (panah memutar).
Expected: jawaban baru dibuat; pertanyaan user tetap **muncul tepat satu kali** (tak ada bubble user kembar).

**TC6 — Refresh saat chat streaming → resume (AC7.2 · fix G1) 🟡**
Langkah: kirim `tuliskan panduan komprehensif dan sangat panjang tentang pola tidur sehat`; saat masih streaming (Stop tampil), **reload** halaman thread.
Expected: setelah reload, jawaban lanjut/sudah selesai dan **berakhir utuh** (tak terpotong mid-kalimat). Bila window mid-stream terlewat → tandai inconclusive (bukan fail).

**TC7 — Kartu artefak rehydrate (AC6.1/6.3 · fix G7) 🟢**
Langkah: kirim `buatkan dokumen catatan singkat berisi 3 tips belajar efektif`; bila agent bertanya, jawab singkat (mis. `untuk mahasiswa, bahasa Indonesia`) hingga **kartu artefak** ("…Dokumen") muncul. Lalu **reload**.
Expected: kartu artefak tetap tampil setelah reload.

**TC8 — Approval hapus artifact (AC5.3 · fix G8) 🟢**
Langkah: pastikan ada artifact (pakai TC7), kirim `tolong hapus artefak yang tadi`.
Expected: muncul kartu berakhiran **"Setujui untuk menjalankan."** + tombol **Setujui**/**Tolak**. Klik **Setujui** → konfirmasi terhapus ("Sudah dihapus") + kartu hilang. **Tanpa** error console (`tool_result must be preceded by a tool_call` dilarang).

**TC9 — `/deep` plan-gate berupa kartu (AC4.1/5.1 · fix G2) 🟡**
Langkah: pilih `/deep`, ketik `apa efek konsumsi kafein terhadap kualitas tidur pada orang dewasa?`, kirim; tunggu ≤90 dtk.
Expected: muncul **kartu "Rencana riset"** (prosa rencana + daftar sub-pertanyaan) + baris **"Setujui untuk memulai riset, atau tolak untuk membatalkan."** + tombol **Setujui**/**Tolak**. Riset **belum** mulai (belum ada sintesis).

**TC10 — Setujui `/deep` → sintesis bersitasi + Sumber (AC4.2/4.4 · fix G2/G4) 🟡🔵**
Langkah: lanjut TC9, klik **Setujui**; tunggu ≤240 dtk (blok "Proses" menampilkan langkah "Menelaah literatur"/"Mencari bukti tandingan"/"Memverifikasi sitasi"/"Menulis sintesis").
Expected UI: jawaban akhir memuat penanda **[1]**, **[2]**, …; di bawahnya toggle **"N sumber"**; saat dibuka tiap sumber berbadge **[1]/[2]/…** sesuai prosa.
Verifikasi DB (manual): `research_sources.citation_number` non-null utk thread; `provider_usage_ledger` ada `feature='deep_research'`; `usage_daily_rollup.feature_counts->>'deep_research'` bertambah.

**TC11 — Tolak `/deep` (AC4.6) 🟡**
Langkah: `/deep apa dampak olahraga pagi terhadap produktivitas?` → tunggu kartu rencana → klik **Tolak**.
Expected: workflow berhenti; tak ada blok riset/sintesis bersitasi.

**TC12 — Klarifikasi ambigu (AC5.2) 🟢**
Langkah: di chat baru kirim `bandingkan dua pendekatan itu untuk proyek saya`.
Expected: agent membalas **minta klarifikasi/konteks sebagai teks** (menanyakan dua pendekatan apa / proyek apa), bukan jawaban percaya-diri. Tanpa kartu field.

**TC13 — Refresh saat `/deep` (AC7.3 · fix G1) 🟡**
Langkah: mulai `/deep apa manfaat dan risiko puasa intermiten?`, setujui rencana, dan saat blok "Proses" berjalan, **reload**.
Expected: setelah reload, `/deep` masih berproses (blok "Sedang bekerja" resume) atau sudah selesai dgn sintesis + sumber; thread **tidak** kosong/hilang. Timing terlewat → inconclusive.

**TC14 — Rehydrate turn selesai (AC7.1) 🟢**
Langkah: buka thread yang sudah punya jawaban selesai (mis. setelah TC1), reload.
Expected: seluruh percakapan (user + jawaban + kartu artefak bila ada) tampil utuh.

### 7.3 Laporan
Per TC: pass / fail / inconclusive + asersi kunci + screenshot saat gagal. Tonjolkan regresi: **TC4** (tanpa AbortError), **TC5** (tanpa duplikat), **TC7** (kartu bertahan), **TC8** (tanpa error stream), **TC6/TC13** (resume) — ini perilaku yang sebelumnya rusak.

---

## 8. Status perbaikan G1–G8 (was Known Gaps)

Diperbaiki 2026-06-28 (uncommitted; gate typecheck/lint/test hijau; menunggu E2E). Detail: `docs/agent-fixes-plan-2026-06-28.md`, memory `astra-agent-fixes-g1-g8-impl`.

| # | Area | Status v2 | Diuji oleh |
|---|---|---|---|
| **G1** | Resume saat refresh | ✅ chat durable-thread (`subscribeToThread`+`sendMessage`, run lepas-koneksi); `/deep` re-attach (`runById`/`observe`) | TC6, TC13 |
| **G2** | `/deep` → Workflow | ✅ FE menjalankan Workflow `deep-research` (plan-gate kartu, suspend/resume) | TC9, TC10, TC11 |
| **G3** | Billing `deep_research` | ✅ debit di step `approvePlan` (jalan karena Workflow aktif) | TC10 (DB) |
| **G4** | Sitasi & sumber | ✅ step `assignCitations` isi `citation_number`; bagian "Sumber" + badge `[n]` | TC10 (UI+DB) |
| **G5** | Stop AbortError | ✅ `abortThread` (cancel server, chunk `abort`); AbortController dihapus | TC4 |
| **G6** | Retry duplikat | ✅ regenerate hapus pasangan terakhir + kirim ulang, tanpa bubble kembar | TC5 |
| **G7** | Kartu hilang saat refresh | ✅ rehydrate `tool-invocation` dari `mastra_messages`; plan-gate dari `runById` | TC7, TC13 |
| **G8** | Error urutan stream approval | ✅ `sendToolApproval` (tanpa `processChatResponse_vNext` → tanpa assertion) | TC8 |
| **E1** (bonus) | Tool hantu `propose_research_plan` | ✅ dihapus dari `/deep` buildPrompt (kini jalur Workflow) | — |
| **Skill** (bonus) | "Skill not found" | ✅ skills di-INLINE (`createSkill`, di-bundle) — lepas dari cwd/fs | TC10 (writer baca domain-pack) |

**Keterbatasan tersisa:** billing-block free-tier (akun admin); asersi DB di luar TestSprite (cek manual); resume mid-stream sensitif-timing; cleanup dead plumbing `sources` di thread-experience shell (harmless, lint-warning pre-existing). Wajib: owner E2E + restart stack (bundle agent baru) sebelum uji.

---

## 9. Referensi kode (verifikasi cepat)

- Agent & model: `apps/agent/src/mastra/agents/{astra-lite,deep-writer,literature-searcher,counter-evidence,citation-verifier}.ts`, `model.ts`, `processors/{billing,ensure-final-response,thread-projection}.ts`, `memory.ts`
- Skills (11, inline): `apps/agent/src/mastra/skills/*/SKILL.md` → `skills-inline.ts` (gen `scripts/gen-inline-skills.ts`; `skills.ts` re-export)
- Workflow `/deep`: `apps/agent/src/mastra/workflows/deep-research.ts` (7 step + `persistReport` + `assignCitations`); daftar `index.ts:30`
- Tools (17): `apps/agent/src/mastra/tools/*` (`tools/index.ts`); konteks `lib/{tool-context,research}.ts` (turnId = deep runId)
- Slash commands: `packages/chat-core/src/index.ts` (`/deep` → `command:'deep'`)
- FE hook (durable-thread + workflow): `apps/web/features/threads/lib/{use-mastra-agent,mastra-timeline,mastra-client}.ts`
- Surface (kartu rencana/approval, regenerate, Sumber): `apps/web/features/thread-experience/components/mastra-chat-thread-surface.tsx`
- Komponen: `apps/web/features/threads/components/{composer,message-list,sources-panel,chat-artifact-card}.tsx`
- Proxy: `apps/web/app/mastra-api/[...path]/route.ts`
- Sumber/sitasi: `packages/services/src/research/{index,citation}.ts` (`assignCitationNumbers`), `packages/db/src/repositories/researchSourceRepo.ts` (`setCitationNumbers`/`listByThreadTurn`); api route `apps/api/src/routes/threads.ts` (`GET /:id/sources`)
- Billing/plan: `packages/services/src/plan.ts`, `billing.service.ts`, `billing/*`, `quota/*`
