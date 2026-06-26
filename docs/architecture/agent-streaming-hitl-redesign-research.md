# Riset & Brainstorming: Streaming + HITL untuk Long-Running Agent (eve)

> Branch: `feat/v2-agent` · Tanggal: 2026-06-26
> Tujuan: menjawab pertanyaan owner — **apakah pendekatan streaming/HITL kita saat ini
> over-engineering**, dan **apa cara paling matang** untuk: (a) streaming tetap real-time saat
> user refresh, (b) run jalan terus di background saat user pindah halaman lalu kembali ke progres
> terbaru yang tetap di-stream live, (c) HITL (ask_question/approval) yang mulus.
> Metode: baca **dokumen resmi eve 0.11.6 yang ter-bundle** + **source dist eve** (verifikasi
> runtime) + riset pola industri (AI SDK, Vercel Workflow, LangGraph) via context7/web + DB.
> **Belum mengubah kode** (riset dulu, sesuai permintaan).

---

## 0. Jawaban singkat (TL;DR)

**Ya — pendekatan saat ini over-engineering.** Kita **menulis ulang dengan tangan** apa yang eve
sudah sediakan secara native, lalu menambah beberapa lapis kompensasi di atasnya. Bukan karena
butuh kapabilitas baru, tapi karena kita **kurang memakai eve** (under-using), bukan kekurangan tool.

**Tidak — tidak butuh infrastruktur/library/framework baru.** eve **sudah** durable-workflow
(checkpoint per step, park tanpa konsumsi resource, stream durable yang bisa di-replay by index,
multi-client, background). Postgres yang kita punya sudah cukup sebagai store history. **Tanpa
Redis, tanpa pub/sub baru, tanpa SSE library.** Yang perlu justru **menghapus** kode, bukan menambah.

**Sebagian kompleksitas memang wajar** untuk agent long-running + HITL — TAPI bentuknya jauh lebih
kecil dari sekarang: **satu durable event stream (milik eve) + satu cursor index + token HITL yang
disimpan server-side.** Sisanya (3-source merge, poll 2 dtk, client-captured token, persist tiap
delta, compaction 3-lapis) bisa dibuang.

---

## 1. Apa yang eve SEBENARNYA sediakan (terverifikasi)

Semua di bawah dikutip dari docs eve ter-bundle (`node_modules/eve/docs/`) + diverifikasi di source
dist `0.11.6`.

### 1.1 Stream durable yang replayable by index — INI yang kita tiru dengan tangan
> *"The stream is durable. Every event is recorded before a step completes, so the whole stream is
> replayable. Pass `startIndex` to reconnect by event count and pick up where you dropped off, or
> rewind to the start."* — `docs/concepts/sessions-runs-and-streaming.md`

`GET /eve/v1/session/:id/stream?startIndex=N` = **resume bawaan eve**. Server skip event `< N` lalu
lanjut live. Inilah persis yang `useThreadResume` kita lakukan manual — tapi eve sudah
menjadikannya kontrak resmi. Client `eve/client` juga punya `ClientSession.stream({ startIndex })`.

### 1.2 `useEveAgent` TIDAK auto-attach saat mount (linchpin terverifikasi)
Source dist (`react/eve-agent-store.js`): `initialSession` + `initialEvents` **hanya seed state**
("seed prior state on construction"); **stream baru terbuka saat `send()`**, bukan saat mount, dan
**tidak ada flag `resume`/`autoAttach`**. → Jadi resume turn-in-flight **memang** harus kita buka
sendiri (premis lama benar). Tapi cara matang = **buka stream durable eve dari cursor** (1 fetch),
bukan 3-source merge + poll.

### 1.3 `continuationToken` di-ekspos ke handler channel SERVER-SIDE (kunci fix HITL)
Source dist (`public/definitions/defineChannel.d.ts`):
```ts
export interface ChannelSessionOps {
  readonly continuationToken: string;
  setContinuationToken(token: string): void;
}
// handler `events: { "session.waiting": (data, channel, ctx) => {...} }` menerima `channel.continuationToken`
```
Artinya: channel eve milik kita (`agent-v2/agent/channels/eve.ts`) bisa **menyimpan token segar
server-side tiap kali parkir** (`session.waiting`), key = sessionId. **Klien tak perlu menangkap
token sama sekali.** Ini menyelesaikan akar "answering HITL fails / no token" secara tuntas.
> Catatan: token **tidak** bisa di-regenerate via endpoint eve (hanya muncul di respons POST +
> handler channel). Karena channel = milik kita, kita jadikan server SoT untuk token.

### 1.4 HITL = park durable; jawab dengan `inputResponses` atau follow-up `message`
> *"eve emits an `input.requested` stream event… The turn parks at `session.waiting`, durably, for
> as long as it takes… The client answers with `inputResponses` (keyed by `requestId`) or a normal
> follow-up `message`… The run picks back up exactly where it parked. Because the pause is durable,
> nothing is held in memory while it waits — the process can restart and the parked turn survives."*
> — `docs/tools/human-in-the-loop.md`

### 1.5 Subagent = child session terpisah; parent HANYA dapat control-event
> *"Each delegated subagent spins up its own child session and stream. The parent stream carries
> only the control-plane events `subagent.called` and `subagent.completed`. To follow the child's
> full progress, read `subagent.called.data.childSessionId` and subscribe at
> `GET /eve/v1/session/:childSessionId/stream`."* — `docs/subagents.mdx`

DB membuktikan: thread `/deep` selesai punya **`subagent.completed` × 8** tapi **0 event subagent
selama subagent berjalan** → itulah **dead-air** 2–3,7 menit. **Bukan bug eve — desain.** Progres
subagent ada, tapi di **child stream** yang tak kita subscribe.

### 1.6 Background + multi-client = native, GRATIS
> *"An eve session is a durable conversation. It can run for days and survives process restarts and
> redeploys… the workflow suspends and holds no compute until the input it's waiting on arrives."*
> — `docs/concepts/execution-model-and-durability.md`

Run jalan terus server-side tanpa klien. Banyak klien boleh attach ke `GET …/stream` bersamaan
(read-only feed). → **"pindah halaman, run lanjut, balik lihat progres terbaru live"** = cukup
**re-attach ke stream dari cursor**. Tak perlu apa pun yang baru.

---

## 2. Apa yang KITA bangun di atasnya (inventaris over-engineering)

| Yang kita bangun | eve sudah sediakan | Verdict |
|---|---|---|
| `useThreadResume` (hand-roll NDJSON fetch + EOF-reconnect + idle-timeout) | `GET …/stream?startIndex=N` durable + `ClientSession.stream({startIndex})` | Reinvensi. Inti (fetch stream dari cursor) wajar; sisanya (EOF poll, backoff, merge) berlebih |
| `buildOrderedLog` **3-source merge** (poll ⊕ `agent.events` ⊕ `resumedEvents`) by index | Satu stream durable = satu log terurut | Buang — ganti 1 stream (active) + history terpisah |
| `useThreadEvents` **poll 2 dtk** (`?afterIndex`) | Stream durable sudah live + replay | Buang — redundan, DAN sumber query O(n²) |
| **Client-captured token** (`onSessionChange`→`saveContinuation`) | `channel.continuationToken` di handler `session.waiting` (server) | Pindah ke server — hapus kerapuhan |
| **Persist tiap delta 1:1** (`messageSoFar` kumulatif) → 32 MB/run | Stream durable eve = SoT turn aktif; history cukup pesan final | Buang persist delta — simpan pesan final saja |
| **Compaction 3 lapis** (SQL + `compactStreamingDeltas` + `compactThreadEvents`) | — | Hilang sendiri begitu delta tak dipersist |
| `useSmoothText` custom | — | Boleh tetap (kecil), tak terkait akar |

**Kenapa dulu di-hand-roll?** Alasan tercatat: *"eve/client menyeret runtime (node:module) tak bisa
di-bundle ke browser"* + *"useEveAgent tak resume di mount"*. **Keduanya benar sebagian** — tapi
solusinya **bukan** 3-source merge + poll: cukup **fetch endpoint stream durable eve** (HTTP biasa,
sudah kita proxy) dan **feed ke reducer yang sama**. Itu satu jalur, bukan tiga.

---

## 3. Akar tiap gejala dalam istilah arsitektur ini

- **Case A — kartu HITL tak muncul live, baru muncul setelah refresh.** Di jalur SEND live
  (`agent.events`), saat turn parkir eve menutup stream send; `agent.events` (buffer turn aktif)
  bisa **kehilangan ekor** `input.requested`/`session.waiting` saat di-handoff, sementara `base`
  (3-source) hanya sinkron via poll 2 dtk yang berat/telat → `busy` jadi `false` tapi
  `pendingInputRequests(base)` belum lihat part `approval-requested` → **0 kartu** sampai refresh
  menarik snapshot dari DB. Akar = **mengandalkan merge multi-source yang tak sinkron**, bukan satu
  stream durable yang otoritatif.
- **Case B — klik opsi error / no token.** Token di-capture klien dari boundary `session.waiting`.
  Kalau jalur live tak pernah sampai boundary bersih (Case A), token tak tersimpan → `continue`
  ditolak "Missing continuationToken". Akar = **token di klien**, bukan server.
- **Slow pasca-refresh / "Memuat thread…".** `/events` cold-load + tiap poll men-detoast **32 MB**
  (query compaction tanpa index, tanpa `afterIndex` di subquery). Akar = **persist tiap delta** →
  O(n²). (Lihat audit `hitl-streaming-audit-live.md`.)
- **Frozen 2–3,7 mnt.** Dead-air subagent (§1.5) — child stream tak di-subscribe.
- **Zombie (busy selamanya).** Turn crash (a.l. ENOSPC) tak menulis event terminal → `isStreamActive`
  (heuristik last-event) selamanya true. Akar = **tak ada reconciler** + **menebak status dari
  event terakhir** alih-alih status durable.

> Semua akar ini berakar pada **satu** keputusan arsitektur: menjadikan **gabungan klien (merge +
> poll + token + delta-persist)** sebagai SoT, alih-alih **stream durable eve + server**.

---

## 4. Arsitektur matang yang diusulkan (target)

Prinsip: **eve durable stream = SoT turn aktif. Postgres = history pesan final + token + status.
Klien = render, bukan rekonsiliasi.** Lima pilar:

### Pilar 1 — Satu stream, satu cursor (resume = live = background, satu mekanisme)
- Turn aktif (baik baru-`send` maupun resume pasca-refresh/nav) → **buka `GET /eve/v1/session/:id/
  stream?startIndex=N`** dan feed ke reducer eve. `N` = index event terakhir yang sudah dilihat.
- **Mount in-flight** → buka dari `startIndex = lastSeenIndex` → eve replay gap + live. **Tanpa poll,
  tanpa 3-source merge.** Background/nav-balik = kasus yang sama (re-attach dari cursor); run sudah
  jalan server-side.
- History turn lama → render dari **pesan final** (Postgres), bukan event log. Active turn =
  overlay stream di atas history. Dua bagian **terpisah jelas** (history vs active), bukan merge by-index.

### Pilar 2 — Token HITL disimpan SERVER-SIDE
- Di `agent-v2/agent/channels/eve.ts`, tambah `events: { "session.waiting": (d, channel) =>
  persistToken(sessionId, channel.continuationToken) }`. (1.3)
- Klien menjawab **lewat api-v2 by sessionId** (`POST /threads/:id/answer {requestId, optionId|text}`),
  api-v2 ambil token tersimpan → panggil eve `continue`. **Klien tak pernah pegang token.** Survive
  refresh/nav/redeploy. (Opsi lebih ringan: tetap kirim token ke klien via `initialSession`, tapi
  **sumbernya** persist server-side yang andal — bukan capture klien.)

### Pilar 3 — Persist pesan FINAL, bukan delta
- Jalur tulis (`store.ts`): berhenti `insert` tiap `message.appended` kumulatif. Simpan **pesan
  final per (turn, step)** saat `step.completed`/`message.completed` (sudah ada `recordAssistantMessage`).
- Hilangkan **3 lapis compaction** + query O(n²). Cold-load jadi kecil (pesan final, bukan 32 MB).
- Token-level live tetap dari **stream durable eve** (bukan dari delta Postgres).
- Cursor resume = `SessionState.streamIndex` milik eve (bukan `count(*)` baris kita) → decouple.

### Pilar 4 — Subagent: subscribe child stream (bunuh dead-air)
- Saat parent emit `subagent.called` (childSessionId), buka `GET …/session/:childSessionId/stream`
  dan tampilkan progres child di timeline parent (mis. "literature-searcher: cari arXiv… 8 ditemukan").
  Heartbeat alami → tak ada lagi diam 3 menit. (Verifikasi field pembawa `childSessionId` saat impl;
  DB kita saat ini menyimpan `subagent.completed`, perlu cek `subagent.called`.)

### Pilar 5 — Status durable + reconciler (bunuh zombie)
- Status turn dari **lifecycle event terminal** (`turn.completed/failed`, `session.waiting/completed/
  failed`), bukan tebak last-event. Turn crash → reconciler tandai `failed` + event terminal sintetik
  bila `streaming` tanpa event > N menit. (+ heartbeat child dari Pilar 4 menjaga turn hidup "fresh".)
- Operasional: **disk penuh = penyebab crash → zombie.** Jaga disk lega (lihat audit §ENOSPC).

---

## 5. Opsi & trade-off per area (matang)

### A. Mekanisme resume/stream
- **A1 (rekomendasi) — Proxy stream durable eve + reducer tunggal.** Browser fetch
  `GET /eve/v1/session/:id/stream?startIndex=N` (sudah ada Route Handler proxy), reduce sekali.
  Buang poll + 3-source. *Minimal, tanpa infra.* Ceiling: butuh sedikit logika "kapan buka stream"
  (mount-if-in-flight) — tapi jauh lebih kecil dari sekarang.
- **A2 — `WorkflowChatTransport`-style auto-resume** (pola AI SDK v7). Transport deteksi stream
  berakhir tanpa finish → reconnect otomatis. Elegan, tapi mengikat ke AI SDK transport; eve punya
  client sendiri → A1 lebih lurus.
- **A3 — Tetap pakai `useEveAgent` + thin server resume.** Karena `useEveAgent` tak attach di mount
  (§1.2), sediakan endpoint server (api-v2, node, boleh `eve/client`) yang attach lalu re-stream ke
  browser. Menghindari hand-roll di browser, tapi nambah hop. A1 lebih simpel.

### B. Token HITL
- **B1 (rekomendasi, matang) — Server SoT penuh.** Persist token di handler `session.waiting`;
  jawab via api-v2 by sessionId. Klien bebas token.
- **B2 (lazy) — Token tetap di `initialSession`, tapi sumber = persist server-side andal.** Perubahan
  kecil; hilangkan capture klien `onSessionChange` yang rapuh. Cukup untuk fix Case B sekarang.

### C. Storage history
- **C1 (rekomendasi) — Hanya pesan final.** Hapus persist delta; reload kecil & cepat.
- **C2 (band-aid) — Tetap persist delta + index ekspresi** untuk mempercepat query compaction. Tak
  menyelesaikan storage; hanya tunda. (lihat audit opsi C2.)

### D. Dead-air subagent
- **D1 (rekomendasi) — Subscribe child stream**, tampilkan progres.
- **D2 — Heartbeat parent** tiap 15–20 dtk saat menunggu subagent (lebih murah, kurang informatif).
  Bisa dikombinasi.

### E. Zombie
- **E1 — Reconciler server-side** (cron / on-open) tandai `streaming` basi → `failed` + terminal event.
- **E2 — Staleness guard klien** (last-event > ambang → treat settled). Pasangkan dengan D2 supaya
  ambang aman. (lihat audit §A.)

---

## 6. Apakah butuh infrastruktur / library / framework baru?

**Tidak.** Bukti dari riset pola industri:

- **AI SDK `resumable-stream` (Redis pub/sub)** ada **justru untuk backend stateless/serverless yang
  TIDAK durable** — Redis dipakai sebagai buffer durable. *Kita sudah punya backend durable (eve =
  Vercel Workflow) + event log Postgres → ingredient yang sama, tanpa Redis.* (Sumber: AI SDK
  "Chatbot Resume Streams"; `vercel/resumable-stream`.)
- **Vercel Workflow DevKit resumable streams** (`getRun(id).getReadable({ startIndex })`) = **tanpa
  Redis**, durabilitas inheren ke run — **persis model eve `startIndex`**. Ini "best fit" dan kita
  **sudah punya** (lewat eve). (Sumber: Workflow DevKit – Resumable Streams.)
- **SSE `Last-Event-ID`** = primitive generik (replay event setelah id terakhir). eve `startIndex`
  adalah bentuk yang sama. Tak perlu library SSE.
- **HITL tanpa token klien**: LangGraph `interrupt()`+`Command(resume)` by `thread_id`; Vercel
  Workflow `hook.resume(token)` by `toolCallId`. **Pola yang sama** bisa kita capai dalam batas eve
  via **token server-side** (§1.3) — `thread.id == eve sessionId` kita = "stable id" itu.

> Satu-satunya skenario yang menuntut infra baru (Redis) adalah jika kita **meninggalkan
> durabilitas eve** dan menjalankan agent stateless. Kita tidak melakukan itu — jadi **nol infra baru.**

---

## 7. Verdict over-engineering (jawab langsung ke owner)

**Kamu benar.** Yang terjadi sekarang over-engineering: kita membangun **resume + merge + poll +
token + delta-persist + compaction** untuk meniru kapabilitas yang **eve sudah berikan durable &
by-index**. Kompleksitas itu **bukan** harga wajib dari "agent long-running + HITL" — buktinya pola
matang (Workflow DevKit, LangGraph) justru **lebih sedikit bagian bergerak**: satu durable log + satu
cursor + resume by stable-id.

**Sebagian kompleksitas memang inheren** ke domain (durable run, park HITL, resume cursor, persist
history) — tapi eve **sudah menanggungnya**. Tugas kita tinggal **memakainya**, bukan menduplikasi.
Arah fix matang = **hapus lebih banyak daripada menambah**: turunkan ke 1 stream + token server-side
+ pesan final + child-subscribe + reconciler.

---

## 8. Migrasi bertahap (tanpa big-bang)

1. **B1/B2 token server-side** (kecil, fix Case B sekarang) — handler `session.waiting` persist token.
2. **A1 stream tunggal** — ganti `useThreadResume`+`buildOrderedLog`+poll dengan: history (pesan
   final) + overlay 1 stream durable dari cursor. Fix Case A + frozen-pasca-refresh.
3. **C1 pesan final** — stop persist delta; fix slow + storage O(n²). (Migrasi: turn lama tetap
   terbaca via fallback; turn baru ringan.)
4. **D1 child-subscribe** — fix dead-air.
5. **E1 reconciler** — fix zombie.

Tiap langkah berdiri sendiri & menghapus kode. Urutan 1→2 memberi dampak terbesar paling cepat.

---

## 9. Referensi

**eve (bundled docs, v0.11.6):** `docs/concepts/sessions-runs-and-streaming.md`,
`docs/concepts/execution-model-and-durability.md`, `docs/tools/human-in-the-loop.md`,
`docs/subagents.mdx`, `docs/guides/client/continuations.mdx`, `docs/guides/client/streaming.mdx`,
`docs/guides/frontend/overview.mdx`, `docs/channels/eve.mdx`.
**eve source (dist 0.11.6):** `react/eve-agent-store.js` (no mount-attach),
`public/definitions/defineChannel.d.ts` (`ChannelSessionOps.continuationToken`),
`protocol/routes.d.ts`, `protocol/message.d.ts`, `client/session.d.ts` (`stream({startIndex})`).
**Industri:** [AI SDK – Chatbot Resume Streams](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-resume-streams) ·
[vercel/resumable-stream](https://github.com/vercel/resumable-stream) ·
[Workflow DevKit – Resumable Streams](https://workflow-sdk.dev/docs/ai/resumable-streams) ·
[Workflow DevKit – Human-in-the-Loop](https://workflow-sdk.dev/docs/ai/human-in-the-loop) ·
[LangGraph – Interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts) ·
[WHATWG – Server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html).
**Audit pendamping:** `docs/v2/hitl-streaming-audit-live.md` (reproduksi live + bukti DB).
