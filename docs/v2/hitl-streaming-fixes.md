# HITL & Streaming Fixes — Thread Experience (eve)

> Branch: `feat/v2-agent`
> Cakupan: `apps/web-v2` (thread UI + proxy eve) dan `apps/agent-v2` (tool gate).
> Konteks: penambahan **approval** (`needsApproval`) dan **`ask_question`** untuk Astra, lalu
> serangkaian audit yang menemukan bug logika HITL + masalah streaming di local dev.

Dokumen ini merangkum **isu utama** yang kita hadapi dan **solusi yang sudah diimplementasikan**,
beserta mekanisme internal eve yang menjadi akar tiap masalah.

---

## 0. Ground truth eve yang relevan

Beberapa fakta dari source eve `0.11.6` yang dirujuk berulang di bawah:

- **Reducer event-log.** Timeline thread direkonstruksi dengan mereduksi event stream eve
  (`defaultMessageReducer`). Adapter di `eve-timeline.ts` me-reduce **event-log** ini (bukan
  hanya buffer live), agar reload/resume identik dengan live.
- **HITL = `input.requested`.** Approval tool (`needsApproval`) dan `ask_question` sama-sama
  muncul sebagai event `input.requested` → part `dynamic-tool` ber-state **`approval-requested`**.
- **`client.input.responded` itu event proyeksi KLIEN (optimistic).** Per dok
  `use-eve-agent.ts`: *"Optimistic events are reducer-facing projection events only. They are not
  exposed through `events`."* Artinya jawaban HITL **tidak pernah** masuk `agent.events` maupun
  event-log yang dipersist.
- **`ask_question` TIDAK meng-emit `action.result`.** Hanya approval yang **ditolak** yang
  meng-emit `action.result` (rejected); approval yang **disetujui** memicu eksekusi tool →
  `action.result`. `ask_question` tidak menghasilkan `action.result` sama sekali (terverifikasi
  via DB: callId `ask_question` tak punya baris `action.result`).
- **`continuationToken`** dicetak di route CREATE channel eve (`eve:<uuid>`), dikembalikan di
  respons POST `202`, dan hanya **disimpan klien** oleh `advanceSession` **bila stream mencapai
  boundary `session.waiting`** (`turn.completed` BUKAN boundary).
- **Proxy.** `useEveAgent` memanggil `/eve/v1/*` same-origin di web-v2, lalu diteruskan ke app
  `@aqsha/agent-v2` (`eve dev`/`eve start`). Channel eve yang melakukan auth (bearer Clerk).

---

## 1. Kartu HITL basi & menumpuk (P0 — paling kritis)

### Gejala
Setelah `/deep`, beberapa kartu `ask_question` lama **muncul kembali dan menumpuk** (3 kartu
sekaligus) di atas composer — termasuk setelah turn/riset selesai dan setelah refresh.

### Akar masalah
`pendingInputRequests` (di `eve-timeline.ts`) mula-mula menentukan "masih pending" dari
**ketiadaan `eve.inputResponse`** pada part, lalu sempat dikoreksi ke **state `approval-requested`**.
Keduanya **salah untuk `ask_question`**:

- `eve.inputResponse` hanya diisi event proyeksi klien `client.input.responded` → **tak pernah ada**
  di event-log yang direduksi → part selalu tampak "belum dijawab".
- `ask_question` tak pernah meng-emit `action.result`, jadi part-nya **nyangkut di
  `approval-requested` SELAMANYA** di turn lama → gate berbasis state pun tetap menampilkannya.

Karena eve serial per session, satu-satunya pertanyaan yang benar-benar menunggu user adalah yang
ada di **turn terakhir**.

### Solusi
`pendingInputRequests` kini hanya memindai **pesan asisten TERAKHIR** dan mengambil part
`approval-requested` di sana:

```ts
export function pendingInputRequests(events): PendingInputRequest[] {
  const { messages } = reduceEventsToMessageData(events);
  let last: EveMessage | undefined;
  for (const m of messages) if (m.role === "assistant") last = m; // turn terakhir
  if (!last) return [];

  const out: PendingInputRequest[] = [];
  const seen = new Set<string>();
  for (const part of last.parts) {
    if (part.type !== "dynamic-tool" || part.state !== "approval-requested") continue;
    const req = part.toolMetadata?.eve?.inputRequest;
    if (!req || seen.has(req.requestId)) continue;
    seen.add(req.requestId);
    out.push({ ...req, toolName: part.toolMetadata?.eve?.name ?? part.toolName });
  }
  return out;
}
```

- Begitu user menjawab → turn baru dimulai → pesan asisten baru jadi yang terakhir → pertanyaan
  lama otomatis bukan lagi "terakhir" = **tidak pending** (anti-menumpuk).
- Turn selesai (sintesis) → pesan terakhir tak punya part `approval-requested` → **0 kartu**
  (anti-basi).
- Approval yang resolve mid-turn → `action.result` → state `output-*` → terfilter walau di turn
  terakhir.
- Batch paralel tetap didukung (semuanya di pesan terakhir yang sama).

**Catatan arsitektur:** `upsertMessage` eve meng-update pesan **in-place** (tak me-reorder), dan
turn serial dengan event terurut → pesan asisten terakhir di array = turn terbaru. Properti ini
yang membuat "pesan terakhir" andal.

### File
- `apps/web-v2/features/threads/lib/eve-timeline.ts`

---

## 2. Part HITL ganda di transkrip

### Gejala
Pertanyaan/approval yang sedang parkir juga muncul sebagai **tool-row generik** ("Bertanya",
"Menghapus artefak") di blok "Proses" — tampil ganda dengan kartu di atas composer.

### Solusi
`mapPart` menyembunyikan part HITL yang **masih** parkir dari transkrip; yang sudah diresolve tetap
tampil sebagai tool-row (jejak audit):

```ts
case "dynamic-tool": {
  if (part.state === "approval-requested") return null; // dirender sbg kartu, bukan tool-row
  // ...
}
```

### File
- `apps/web-v2/features/threads/lib/eve-timeline.ts`
- `apps/web-v2/features/threads/components/message-list.tsx` (komentar diluruskan)

---

## 3. Copy kartu approval berbahasa Inggris & bocor nama tool

### Gejala
Kartu approval untuk `delete_artifact` menampilkan prompt Inggris mentah
(`Approve tool call: delete_artifact`) + tombol **Yes/No** (di-generate eve di
`harness/input-extraction.ts`).

### Solusi
Tetap pakai gate native `needsApproval: always()` (dapat auto-deny-on-continue yang aman untuk aksi
destruktif), tapi **lokalkan di kartu** berdasar `toolName` yang kini ikut dibawa
`pendingInputRequests`:

```ts
const APPROVAL_COPY = {
  delete_artifact: {
    prompt: "Hapus dokumen ini? Tindakan ini permanen dan tidak bisa dibatalkan.",
    approve: "Hapus", deny: "Batal", danger: true,
  },
};
const DEFAULT_APPROVAL = { prompt: "Setujui tindakan ini?", approve: "Setujui", deny: "Tolak" };
```

`ask_question` (prompt/opsi ditulis model, sudah Bahasa Indonesia) dipakai apa adanya. Prop
`responding` & `DEFAULT_CONFIRM_OPTIONS` yang dead-code dihapus.

### File
- `apps/web-v2/features/threads/components/input-request-prompt.tsx`

---

## 4. Jawaban teks bebas untuk `ask_question`

### Gejala
Composer mengundang user mengetik jawaban, tapi teks dikirim sebagai **pesan biasa** →
`ask_question` ter-resolve `{status:"ignored"}` + teks jadi turn baru (bukan jawaban terstruktur).

### Solusi
Composer me-route teks ke `inputResponses` bila ada `ask_question` freeform yang parkir
(**bukan approval** — approval tetap wajib lewat tombol, mengetik = lanjut tanpa menyetujui = eve
auto-deny, aman untuk aksi destruktif):

```ts
const onComposerSend = (payload) => {
  const text = payload.text.trim();
  const targets = text
    ? hitlRequests.filter((r) => !isApprovalRequest(r) && acceptsFreeformText(r))
    : [];
  if (targets.length > 0) {
    void agent.send({ inputResponses: targets.map((r) => ({ requestId: r.requestId, text })) });
    return;
  }
  sendTurn(payload.text, payload.clientContext);
};
```

Placeholder composer juga sadar-konteks (approval → "Pilih opsi di atas untuk melanjutkan…").

### File
- `apps/web-v2/features/threads/components/chat-surface.tsx`
- helper `isApprovalRequest` / `acceptsFreeformText` di `eve-timeline.ts`

---

## 5. Akar TUNGGAL streaming: Next `rewrites()` menahan stream long-lived (LOCAL DEV)

Tiga gejala yang awalnya tampak terpisah ternyata **satu akar**. Penting: isu terjadi di
**local development, tanpa nginx/produksi**. Rantainya:

```
browser → next dev (rewrites /eve/v1/*) → eve dev (agent-v2 :4317)
```

Satu-satunya hop proxy = **Next `rewrites()`**. Tanda-tandanya klasik **proxy mem-buffer stream
long-lived**:

- **Stream pendek self-closing → lolos.** Resume pasca-refresh = replay event yang sudah
  persisted; server kirim cepat lalu EOF → proxy flush saat tutup. **Itu sebabnya "refresh works".**
- **Stream long-lived (turn in-flight) → tertahan.** Selama turn berjalan, koneksi GET stream tetap
  terbuka; `rewrites()` ke origin eksternal tak meneruskan body inkremental untuk koneksi yang tak
  kunjung tutup → event ditahan.

### Gejala turunan

| # | Gejala | Sebab |
|---|---|---|
| **5a** | Progres beku, perlu refresh | event live ditahan proxy (stream tak pernah tutup → tak flush) |
| **5b** | `Session.send requires a non-empty message, inputResponses, or both` saat klik opsi | boundary `session.waiting` ikut tertahan → `advanceSession` membuang `continuationToken` → klik = `inputResponses` tanpa token → `createHandleMessageBody` return `null` → throw |
| **5c** | Nav-balik (pindah halaman lalu kembali) tak ada card | resume turn-in-flight = stream long-lived → tertahan → tak update sampai refresh |

**Bukti 5b (DB):**

| thread | `continuation_token` | hasil |
|---|---|---|
| `wrun_01KVYZTRP9…` (gagal) | **NULL** | macet di pertanyaan pertama |
| `wrun_01KVYWFCEF…` (sukses) | `eve:02a77b0f-…` | riset selesai penuh |

Server pada kedua thread mem-park dengan benar (`input.requested` → `turn.completed` →
`session.waiting`). Bedanya murni: klien yang gagal **tak pernah menangkap** `continuationToken`
karena `session.waiting` tak sampai. `refresh` **tidak** memperbaiki 5b: saat mount,
`initialSession.continuationToken = threadDetail.continuationToken` = NULL → thread ter-brick.

### Solusi: proxy streaming eksplisit (Route Handler)

`/eve/v1/*` dipindah dari `rewrites()` ke **Route Handler streaming**:

```ts
// apps/web-v2/app/eve/v1/[...path]/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const AGENT_ORIGIN = process.env.AGENT_ORIGIN ?? "http://localhost:4317";

async function proxy(req: NextRequest): Promise<Response> {
  const target = `${AGENT_ORIGIN}${req.nextUrl.pathname}${req.nextUrl.search}`;
  const headers = new Headers(req.headers);
  headers.delete("host"); headers.delete("connection"); headers.delete("content-length");
  const init: RequestInit = { method: req.method, headers, redirect: "manual", signal: req.signal };
  if (req.method !== "GET" && req.method !== "HEAD") init.body = await req.arrayBuffer();

  const upstream = await fetch(target, init);
  const resHeaders = new Headers(upstream.headers);
  resHeaders.delete("content-length"); resHeaders.delete("content-encoding");
  resHeaders.set("x-accel-buffering", "no");
  return new Response(upstream.body, { status: upstream.status, headers: resHeaders }); // STREAM
}
export const GET = proxy;
export const POST = proxy;
```

- `return new Response(upstream.body)` mengalirkan `ReadableStream` upstream **apa adanya**,
  termasuk long-lived — pola streaming standar App Router (yang dipakai app AI chat). `rewrites()`
  bukan jalur ini.
- Same-origin tetap terjaga (bearer Clerk diteruskan; `/eve/v1` sudah di-exclude dari Clerk
  middleware di `proxy.ts`).
- `rewrites()` dihapus dari `next.config.ts`.

Dengan event live (incl. `session.waiting`) tiba real-time → **5a, 5b, 5c selesai dari satu akar**.

### Resiliensi tambahan
`maxReconnectAttempts: 120` di `useAstraAgent` (default eve = 3) — cadangan untuk putus sungguhan
(dev restart, gap idle subagent yang lama). Boundary `session.waiting/completed/failed`
menghentikan loop reconnect seketika saat turn selesai, jadi nilai tinggi tak menimbulkan churn.

### File
- `apps/web-v2/app/eve/v1/[...path]/route.ts` (baru)
- `apps/web-v2/next.config.ts` (hapus `rewrites()`)
- `apps/web-v2/features/threads/lib/use-astra-agent.ts` (`maxReconnectAttempts`)

---

## 5b. Resume macet setelah refresh/nav-balik (poll-on-EOF) — BUKAN proxy

### Gejala (tersisa setelah fix Section 5)
Saat long-running task berjalan, lalu **refresh/pindah-halaman → kembali**: progres tampak
**macet** (tetap "on progress", bukan stop) — tak ada step lanjutan. Tiap **refresh** memunculkan
snapshot progres terbaru, refresh lagi maju lagi, sampai akhirnya respons terakhir.

### Akar masalah (ASIMETRI klien, terkonfirmasi dari source eve)
Bukan proxy. Route Handler meneruskan stream eve apa adanya (termasuk EOF-nya). Akarnya: **eve dev
menutup body GET `/stream` per-snapshot** (bukan satu tail panjang yang dijaga terbuka sampai turn
usai), dan **dua jalur klien menanganinya berbeda**:

| Jalur | Saat EOF bersih tanpa boundary | Hasil |
|---|---|---|
| **Send** (`#createEventStream`, eve) | **reconnect** dari cursor (poll) sampai boundary | progres live ✓ |
| **Resume** (`useThreadResume`, hand-rolled meniru `openStreamIterable`) | **`return`/stop** (anggap turn selesai) | macet (satu snapshot) ✗ |

`openStreamIterable` memang `return` pada EOF bersih (hanya reconnect saat *disconnect error*),
dan `useThreadResume` menirunya (`stop = true` di EOF). Jadi begitu eve dev menutup body di tengah
turn, resume berhenti setelah satu snapshot → "macet"; refresh = re-fetch snapshot baru + resume
ulang → maju satu langkah lagi. Itulah pola "refresh → maju, refresh lagi → maju".

### Solusi
`useThreadResume` kini **meniru jalur SEND**: pada EOF bersih, berhenti **hanya** bila event
terakhir = boundary turn (`session.waiting`/`session.completed`/`session.failed`); selain itu
**reconnect dari `nextIndex` (poll)** untuk mengejar event baru.

```ts
for await (const ev of readNdjson(res.body)) { /* …push, bumpIdle, nextIndex++ */ }
// EOF bersih:
if (lastEventIsTerminal(acc)) stop = true;     // turn settle/parkir → berhenti
else await sleep(EOF_POLL_DELAY_MS);           // belum → reconnect dari nextIndex (poll)
```

- `IDLE_TIMEOUT_MS` dinaikkan 120s → **600s** agar bertahan melewati gap subagent `/deep` yang
  panjang (mis. 5,5 mnt tanpa event) tanpa menyerah; tetap menghentikan turn yang benar-benar
  mati/hang.
- Robust untuk dua kemungkinan runtime: bila body **di-tail** (tetap terbuka) → satu baca panjang,
  berhenti di boundary; bila body **per-snapshot** → poll tiap `EOF_POLL_DELAY_MS`. Cursor
  (`nextIndex`) maju monoton → tiap reconnect hanya menarik event baru (tanpa re-fetch).
- Overlay tetap disjoint by-cursor; reducer eve idempoten (upsert by id/callId) → tak ada duplikat.

### File
- `apps/web-v2/features/threads/lib/use-thread-resume.ts`

---

## 6. Ringkasan file yang berubah

| File | Perubahan |
|---|---|
| `app/eve/v1/[...path]/route.ts` | **Baru** — proxy streaming eve (gantikan rewrites) |
| `next.config.ts` | Hapus `rewrites()` `/eve/v1/*` |
| `features/threads/lib/use-astra-agent.ts` | `maxReconnectAttempts: 120` |
| `features/threads/lib/use-thread-resume.ts` | Resume reconnect-poll on EOF-tanpa-boundary (anti-macet pasca refresh/nav); idle 120s→600s |
| `features/threads/lib/eve-timeline.ts` | `pendingInputRequests` (last-assistant-message) + `isApprovalRequest`/`acceptsFreeformText` + `PendingInputRequest.toolName` + `mapPart` sembunyikan HITL parkir |
| `features/threads/components/input-request-prompt.tsx` | Copy approval ter-lokalisasi; hapus dead `responding`/`DEFAULT_CONFIRM_OPTIONS` |
| `features/threads/components/chat-surface.tsx` | Freeform → `inputResponses`; placeholder sadar-konteks |
| `features/threads/components/message-list.tsx` | Luruskan komentar HITL |
| `features/threads/lib/eve-timeline.test.ts` | +tes anti-basi & anti-menumpuk lintas turn |
| `apps/agent-v2/agent/tools/delete_artifact.ts` | `needsApproval: always()` (gate UI) |

---

## 7. Verifikasi

- **Unit tests** `eve-timeline.test.ts`: 22/22 hijau (termasuk replika persis bug 3-kartu-menumpuk
  & kartu-basi-pasca-selesai).
- **Typecheck** web-v2: bersih.
- **Lint** web-v2: 0 error.

### Tes manual yang perlu dijalankan owner
1. **Restart `dev:web-v2`** (perubahan `next.config.ts` + route handler baru perlu restart Next).
2. `/deep <topik>`:
   - progres mengalir live (tak beku),
   - klik opsi pada kartu → jalan (tak ada `Session.send requires…`),
   - ketik jawaban di composer → terkirim sbg jawaban terstruktur,
   - pindah halaman lalu kembali → progres/kartu tampil tanpa refresh.
3. `delete_artifact`: kartu Bahasa Indonesia ("Hapus dokumen ini?" / **Hapus** / **Batal**).

---

## 8. Batasan & tindak lanjut

- **Verifikasi streaming butuh dev server berjalan.** Perbaikan proxy diuji via typecheck/lint,
  tapi perilaku streaming inkremental hanya terbukti saat dijalankan. Bila Route Handler masih
  kurang (mis. `eve dev` sendiri yang menahan, bukan rewrite), langkah lanjut: arahkan klien eve
  langsung ke `:4317` + aktifkan CORS dev di channel eve (keluarkan Next dari jalur sepenuhnya).
- **Thread ter-brick lama (token NULL) tak bisa dipulihkan** — token `eve:<uuid>` hanya hidup di
  respons POST (sekali) + kunci internal workflow; tak ada salinan server yang queryable. Mulai
  `/deep` baru untuk mengetes.
- **Fragilitas mendasar (upstream eve):** kemampuan menjawab HITL bergantung pada klien menangkap
  `continuationToken` dari boundary `session.waiting`. Selama streaming andal, ini aman; idealnya
  eve menyediakan token yang dapat dipulihkan server-side (usulan upstream).
- **`ask_question` tanpa `action.result`** berarti Q&A yang dijawab via opsi tak meninggalkan
  bubble user di transkrip (jawaban = tool-result, bukan pesan). Saat ini diterima; bila ingin
  jejak Q&A eksplisit, perlu render terpisah.

---

## 9. Audit E2E langsung (browser + DB) — akar SEBENARNYA + fixes

> Setelah fix §1–§8 ter-deploy di dev, owner melapor isu yang sama MASIH terjadi. Dilakukan
> audit E2E langsung: kontrol browser (Claude-in-Chrome) + inspeksi `chat_thread_events`
> (Postgres VPS) + `read_network_requests`/`read_console_messages`. Ditemukan **tiga akar
> berbeda** yang §1–§8 belum sentuh. Semua di bawah **terverifikasi live**, bukan hanya
> typecheck.

### 9.0 Fondasi yang sudah dibenahi sebelum audit (4 layer)
- **B (proxy `node:http`):** `app/eve/v1/[...path]/route.ts` ditulis ulang dari `fetch`/undici ke
  `node:http`/`node:https` + `upstream.setTimeout(0)`. undici default `bodyTimeout` 300 dtk
  MEMBUNUH koneksi stream saat gap subagent idle (terverifikasi 341 dtk > 300). Soket node:http
  tanpa idle-timeout → stream long-lived bertahan.
- **C (api incremental):** `GET /threads/:id/events?afterIndex=N` (delta) + `GET /threads/recent-active?since=`.
- **D (klien O(n)):** `buildOrderedLog` dedup by `event_index` (ganti `mergeStreamEventLogs`
  O(n²) `JSON.stringify`); `busy` diturunkan dari `isStreamActive(base)`; first-turn URL bump
  dini; poll incremental.
- **A (elapsed):** `ElapsedLabel` "Sedang bekerja… M:SS" untuk dead-air subagent.

### 9.1 Akar "frozen until refresh" SEBENARNYA: bug React StrictMode di resume
Console membuktikan saat refresh di tengah turn: `enabled:true, status:"ready", streamActive:true`
TAPI `resuming:false` dan **resume stream `/eve/v1/.../stream` TAK PERNAH terbuka**. Sebab:
guard `startedKeyRef` di `useThreadResume`. React **StrictMode (dev)** menjalankan effect
**mount→cleanup→mount**: run-1 set ref + buka stream → cleanup batalkan → run-2 lihat
`ref === sessionId` → **early-return → stream mati selamanya**. Jadi pasca-refresh TAK ADA
streaming token-level; cuma poll (yang dulu O(n²) → beku). **Itulah "frozen until refresh".**
(Bug PRA-ADA di hook resume, bukan dari §1–§8.)

**Fix:** hapus guard `startedKeyRef` (cleanup effect SUDAH meng-abort loop lama sebelum re-run;
deps `[enabled, sessionId]`, idempoten via dedup-by-index). `setResuming(true)` dipindah ke
dalam IIFE async (hindari `react-hooks/set-state-in-effect`).
**Terverifikasi live:** resume `GET /stream?startIndex=169` held-open `pending`; `streamIndex`
naik **183→205→225→250 dalam 7 dtk** (`resuming:true`); sintesis stream token-level pasca-refresh.
- File: `features/threads/lib/use-thread-resume.ts`.

### 9.2 "Token per token sangat lama setelah refresh": `useSmoothText` re-reveal dari NOL
`useSmoothText` memulai `shownLen = 0` tiap mount. Saat cold-load/refresh turn in-flight,
jawaban-sejauh-ini (terukur **23.750 char**) di-ketik ULANG dari 0 @ ~180 char/dtk = **±2 menit
merangkak**, padahal datanya sudah ada. Inilah gejala "lambat" paling kelihatan setelah refresh.

**Fix:** mulai dari teks yang SUDAH ada — `useState(text)` + `shownLen = targetRef.current.length`;
animasi hanya untuk PERTUMBUHAN baru (turn fresh `text=""` → tetap mengetik dari awal).
**Terverifikasi live:** pasca-refresh jawaban penuh tampil <1 dtk, tak ada crawl.
- File: `features/threads/lib/use-smooth-text.tsx`.

### 9.3 Akar terbesar: log event **O(n²) = 23 MB** (cumulative `messageSoFar`)
eve `message.appended`/`reasoning.appended` membawa `messageSoFar`/`reasoningSoFar` **KUMULATIF**
(tumbuh sampai 20.553 char); reducer eve me-**REPLACE** part teks tiap delta (bukan append). Hook
proyeksi persist 1:1 → 3.090 delta × teks-kumulatif = **18–23 MB** untuk SATU thread `/deep`.
Akibat (DB-verified `pg_column_size`):
- **Cold-load >9 dtk** ("Memuat thread…") — api-v2 menarik 23 MB dari Postgres VPS (remote) tiap buka.
- **Jank per-token** — klien me-reduce 23 MB tiap delta (O(n²) sepanjang turn).

**Fix (3 lapis, semua simpan hanya delta TERAKHIR per `(type, turn, stepIndex)`):**
1. **DB query** `ChatThreadEventRepo.listByThread`: filter SQL buang delta tersusul.
   Terukur **23 MB/3543 row → 124 kB/87 row** (185×), `max(event_index)` tetap (3542=3542) →
   **cursor resume tetap benar**.
2. **Klien reduce** `compactStreamingDeltas` di `reduceEventsToMessageData` (eve-timeline.ts) →
   reduce hanya teks-final per langkah; hasil reduksi IDENTIK (tested 29/29).
3. **Akumulasi poll** `compactThreadEvents` di `useThreadEvents` (api.ts) → `prev` tetap mungil
   (poll kembalikan delta-tail step aktif tiap tick di index baru; tanpa dedup `prev` tumbuh O(n²) lagi).

Token-level realtime TETAP via resume stream eve. **Terverifikasi live:** cold-load penuh
(23.750 char) **<3 dtk** (sebelumnya masih "Memuat thread…" di 9 dtk).
- File: `packages/db/src/repositories/chatThreadEventRepo.ts`, `features/threads/lib/eve-timeline.ts`,
  `features/threads/api.ts`.

### 9.4 Yang TETAP genuine (bukan bug)
- **Dead-air subagent.** DB-verified: parent dapat **0 event 2–3 mnt** saat subagent task-mode
  jalan (mis. `max_idx` macet 102 selama 139 dtk; 149 selama 120 dtk). Tak ada yang bisa
  di-stream (belum ada datanya); poll auto-recover tiap gap (102→147→…), `ElapsedLabel` tampilkan
  liveness. Refresh TAK menolong di tengah gap.
- **Rate model.** Delta ~7 char tiap ~330 ms (deepseek-v4-flash via gateway OpenAI-compatible) =
  batas atas upstream; frontend tak bisa lebih cepat dari produksi token.

### 9.5 Catatan operasional
- **Disk penuh (ENOSPC)** sempat memblok edit/cmd di tengah sesi & kemungkinan memperburuk
  kestabilan dev (tab crash, Next gagal nulis cache). Pastikan disk lega saat dev.
- **Storage DB tetap O(n²)** — compaction §9.3 hanya di jalur BACA (query). Tabel masih simpan
  cumulative penuh. Tindak lanjut opsional: strip `messageSoFar` di tulisan (`store.ts`) atau
  jangan persist delta sama sekali (butuh decouple cursor dari hitungan persisted).

### 9.6 Verifikasi
- Gates: `tsc` 0 (db/services/api-v2/web-v2), `eslint` 0, `eve-timeline.test.ts` 29/29.
- Live E2E (browser + DB + network): first-turn URL, resume token-level pasca-refresh, HITL kartu
  tanpa flicker, elapsed timer, cold-load <3 dtk, poll incremental `afterIndex`, recovery gap
  subagent — semua terkonfirmasi.

### 9.7 Ringkasan file (sesi audit)
| File | Perubahan |
|---|---|
| `features/threads/lib/use-thread-resume.ts` | Hapus guard `startedKeyRef` (fix StrictMode resume mati); `setResuming` ke IIFE |
| `features/threads/lib/use-smooth-text.tsx` | Mulai reveal dari teks yang ada (anti crawl-dari-0 pasca refresh) |
| `packages/db/src/repositories/chatThreadEventRepo.ts` | Compaction SQL delta kumulatif (23MB→124kB) |
| `features/threads/lib/eve-timeline.ts` | `compactStreamingDeltas` sebelum reduce (anti jank per-token) |
| `features/threads/api.ts` | `compactThreadEvents` di akumulasi poll (prev tetap mungil) |
| `app/eve/v1/[...path]/route.ts` | Proxy `node:http` tanpa idle-timeout (§9.0-B) |
| `apps/api-v2/src/routes/threads.ts` | `?afterIndex` + `/recent-active?since=` (§9.0-C) |
| `features/threads/lib/use-astra-agent.ts` | Discovery sessionId turn-pertama → bump URL dini (§9.0-D) |
| `features/threads/components/chat-surface.tsx` | `buildOrderedLog` + `busy` dari base (§9.0-D) |
| `features/threads/components/message-list.tsx` | `ElapsedLabel` dead-air (§9.0-A) |
