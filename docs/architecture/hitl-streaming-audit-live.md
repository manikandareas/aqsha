# Audit Langsung HITL & Streaming — Reproduksi E2E (browser + DB + network)

> Branch: `feat/v2-agent` · Tanggal audit: 2026-06-26
> Metode: kontrol **Claude-in-Chrome (Brave)** terhadap stack lokal yang baru di-start
> (`web-v2 :3000` → `api-v2 :3001` → `eve agent-v2 :4317`, data Postgres VPS `100.75.23.41`),
> + inspeksi langsung `chat_thread_events`/`chat_threads` (Postgres) + `read_network_requests`/
> `read_console_messages`.
> Konteks: lanjutan `hitl-streaming-fixes.md` (§1–§9). Owner melapor **4 gejala masih eksis**
> meski fix §9 sudah ada. Dokumen ini = hasil reproduksi langsung + akar yang sebenarnya tersisa
> + opsi solusi matang. **Belum ada perubahan kode** (audit-only, sesuai permintaan).

---

## 0. TL;DR (verdict)

Stack lokal **yang baru di-restart penuh** ternyata menjalankan fix §1–§9 dengan **benar**. Dari 4
gejala yang dilaporkan owner, **2 tidak ter-reproduksi** (sudah beres) dan **2 ter-reproduksi tapi
akarnya BUKAN yang ditangani §1–§9**:

| # | Gejala dilaporkan | Verdict live | Akar sebenarnya |
|---|---|---|---|
| 1 | Progres beku / hanya maju saat refresh | **Ter-reproduksi (2 bentuk)** | **(A) Thread "zombie"** (proses mati mid-turn → busy selamanya, composer terkunci, refresh tak menolong) **+ (B) dead-air subagent** 2–3 mnt (genuine) |
| 2 | Kartu HITL menumpuk / muncul lagi | **TIDAK ter-reproduksi** | Anti-pileup (`pendingInputRequests` last-assistant-message) bekerja |
| 3 | Lambat pasca-refresh (crawl / "Memuat thread…") | **Sebagian** | Cold-load ~2 dtk di thread 32 MB = **biaya query compaction** (detoast 32 MB tiap panggil), BUKAN payload (117 kB). `useSmoothText` fix benar |
| 4 | Menjawab HITL gagal (klik opsi / ketik) | **TIDAK ter-reproduksi** | Klik opsi & teks-bebas dua-duanya jalan; `continuation_token` tertangkap |

**Kesimpulan inti:** fix §1–§9 **secara kode sudah benar**. Yang membuat owner masih melihat "isu
tetap eksis" ada dua kemungkinan, dan keduanya nyata:

1. **Lingkungan basi (stale env).** Fix §9 **belum di-commit** (semua di working tree). Dua fix
   kunci — hapus `rewrites()` di `next.config.ts` **dan** Route Handler baru
   `app/eve/v1/[...path]/route.ts` — **butuh RESTART penuh Next**, bukan Fast Refresh. Saat audit,
   console menunjukkan `[Fast Refresh] rebuilding`. Jika owner mengedit file lalu hanya
   meng-andalkan HMR (tanpa kill+restart `dev:web-v2`), server bisa **masih memakai jalur
   rewrites lama** (buffer stream → beku) — persis gejala §5.
2. **Tiga akar yang §1–§9 memang tak menyentuh** (di bawah). Ini yang harus difokuskan ke depan.

---

## 1. Yang DIVERIFIKASI BEKERJA (live)

Satu run `/deep "manfaat dan risiko puasa intermiten untuk pemula"` (thread
`wrun_01KW17JPN7N28GBCAPCYEK700D`) dipakai untuk menguji jalur interaktif:

- ✅ **Turn pertama streaming + URL bump.** `POST /eve/v1/session` 202 → discovery
  `GET /threads/recent-active` → URL melompat `/app` → `/app/threads/wrun_…` saat agen menyusun
  jawaban (tak mendarat di halaman kosong).
- ✅ **Kartu HITL muncul.** `ask_question` ("Untuk apa hasil riset ini digunakan?") render sebagai
  kartu di atas composer + placeholder berubah jadi sadar-konteks.
- ✅ **Refresh saat parkir.** Reload di tengah kartu → kartu **tetap ada**, judul auto-gen, tanpa
  "Memuat thread…" macet. DB: `status=idle`, `last_event=session.waiting`,
  `continuation_token=eve:13c5acf3-…` **tersimpan** (single-namespace).
- ✅ **Menjawab via klik opsi.** Kartu hilang, turn baru jalan, **tanpa** `Session.send requires…`.
  Network: `POST /eve/v1/session/wrun_…` 200 + `GET …/stream?startIndex=76` 200 (selaras
  `liveStartIndex`).
- ✅ **Menjawab via teks bebas** (§4). Ketik "ya lanjutkan risetnya" → kartu hilang, **tak ada
  bubble user palsu**, riset lanjut → ter-route ke `inputResponses`, bukan turn baru.
- ✅ **Anti-pileup.** Saat kartu #2 (konfirmasi rencana) muncul, kartu #1 **sudah hilang** — hanya
  1 kartu tampil. Tak menumpuk.
- ✅ **Resume pasca-refresh men-track burst live.** Refresh saat subagent jalan → resume
  `GET …/stream?startIndex=358` terbuka + poll `?afterIndex=357` jalan; saat subagent selesai, UI
  menampilkan "Menelaah literatur · 8/12/9 hasil" **tanpa refresh lagi**.

Artinya: gejala #2 dan #4 **tidak bisa direproduksi** di stack yang benar; jalur resume §9.1 juga
**bekerja**.

---

## 2. Akar nyata #A — Thread "zombie" (busy selamanya) — **PALING PARAH**

### Bukti
Thread `wrun_01KVWSTHH4T32QZ47260BPPNX9` ("Tren Agen AI 2026"):

| field | nilai |
|---|---|
| `status` | **`streaming`** (sejak **06-24 12:52**, >2 hari) |
| `last_event_type` | **`message.appended`** (NON-terminal — mati di tengah "tulis laporan akhir") |
| `max_idx` | 1090 |
| `continuation_token` | ada |

Saat dibuka di browser:
- UI tampil **"Sedang bekerja… 12s"** + composer **terkunci ("Stop")** — padahal turn mati 2 hari lalu.
- Network: `GET /eve/v1/session/wrun_…/stream?startIndex=1091` → **`pending` (menggantung selamanya)**.
  eve menahan stream durable terbuka; workflow-nya suspended/mati → tak pernah emit → `resuming=true`
  selamanya.
- **Refresh tak menolong**: `status` permanen `streaming`, `last_event` permanen non-terminal,
  resume buka ulang stream yang sama (menggantung). User **tak bisa mengetik** (composer terkunci).

### Mekanisme
Klien menentukan "turn masih jalan" dari **tipe event TERAKHIR** (`isStreamActive` di
`eve-timeline.ts`). Turn yang **mati tanpa** menulis event terminal (`turn.completed`/`turn.failed`/
`session.waiting`/`session.failed`) → event terakhir selamanya non-terminal → `isStreamActive=true`
→ `streamActive=true` → resume enabled + `busy=true` → composer terkunci + resume menggantung.
Kode sendiri mengakui ini gap (`eve-timeline.ts`): *"turn yang MACET (proses mati tanpa
turn.completed) tetap tampak aktif → poll sampai user pindah thread; reconciler server-side adalah
peningkatannya."*

> Catatan: bahkan `IDLE_TIMEOUT_MS=600_000` (10 mnt) di `useThreadResume` tak menyelamatkan — saat
> resume menyerah, `busy` tetap `true` lewat `isStreamActive(base)` (event terakhir tetap
> non-terminal). Jadi lock-nya permanen.

**Ini kandidat terkuat "frozen, refresh tak menolong, tak bisa apa-apa" yang dirasakan owner.** Tiap
run `/deep` yang crash (OOM, dev restart, disk penuh — lihat §9.5 lama: ENOSPC) meninggalkan satu
thread zombie.

---

## 3. Akar nyata #B — Dead-air subagent 2–3 menit (genuine, "frozen" semu)

### Bukti
Pada run uji, subagent `literature-searcher` dipanggil sebagai **`actions.requested`** biasa
(**`n_subagent_events = 0`** — tak ada event `subagent.*` yang di-stream/persist ke induk). Saat 5
subagent jalan paralel (task-mode), stream induk **diam total**:

| snapshot | `max_idx` | `secs_since_last_event` |
|---|---|---|
| awal subagent | 357 | **170 dtk** (≈2m50s) macet di `step.completed` |
| fase berikutnya | 397 | **136 dtk** macet lagi |

Selama gap ini: resume stream terbuka (startIndex 358) **menerima 0**, poll `?afterIndex=357`
**balik kosong**, `max_idx` tak gerak. UI menampilkan snapshot + **"Sedang bekerja… N s"**
(`ElapsedLabel` berdetak). **Bukan rusak** — tapi 2–3 menit tanpa konten baru **terasa beku** bagi user.

### Mekanisme
Subagent task-mode berjalan di **child-session** sendiri; event progres mereka **tidak** di-forward
ke stream induk (DB-verified: 0 event `subagent.*`). Induk hanya menerima `action.result` saat tiap
subagent **selesai**. Di antaranya = dead-air. `/deep` punya BANYAK fase begini (5 lit-searcher →
counter-evidence → verify → sintesis), jadi beberapa gap 2–3 mnt menumpuk → terasa "beku berulang".

> Subkasus "refresh melompat maju": terjadi bila event **ter-persist** tapi jalur live tak
> menampilkannya. Di stack benar TIDAK ter-reproduksi (eve menahan stream + push burst → UI track
> live; lihat §1). Bila owner masih melihatnya, kemungkinan besar **stale env** (jalur rewrites lama
> mem-buffer) ATAU edge-case reconnect klien eve saat gap sangat panjang.

---

## 4. Akar nyata #C — Storage O(n²) + query compaction berat

### Bukti (DB)
`message.appended`/`reasoning.appended` membawa teks **kumulatif** (`messageSoFar`) dan **di-persist
1:1** (`projection.ts` hook `"*"` → `store.ts appendThreadEvent`). Akibatnya storage tumbuh O(n²):

| thread | events | payload | deltas | catatan |
|---|---|---|---|---|
| `wrun_01KVZ4WYH2…` | 6119 | **32 MB** | 6041 (=seluruh 32 MB) | 1 run `/deep` selesai |
| `wrun_01KVYWFCEF…` | 2731 | 10 MB | 2623 | — |

Compaction **jalur-baca** bekerja bagus: `listByThread` (SQL) memangkas **6119 baris/32 MB → 84
baris/117 kB** (~280×). **TAPI**:
- `/events` cold-load di thread 32 MB terukur **~1983 ms** (Performance API). Payload cuma 117 kB +
  latensi Tailscale rendah → **~2 dtk itu murni biaya query**: subquery `GROUP BY type, turn_id,
  (payload->'data'->>'stepIndex')` harus **men-detoast 32 MB JSONB** tiap panggil, dan satu-satunya
  index = `(thread_id, event_index)` (tak ada index pendukung GROUP BY).
- **Subquery compaction TIDAK ber-`afterIndex`** — ia meng-agregasi **seluruh thread** walau poll
  hanya minta ekor. Jadi **tiap poll 2 dtk** (saat turn aktif) men-detoast ulang seluruh log. Saat
  `/deep` berjalan, log membengkak → query poll makin berat → mendekati/melampaui interval 2 dtk →
  tekanan DB + poll telat. Ini memperburuk rasa "beku/lambat" pada thread besar/turn panjang.

`useSmoothText` fix (§9.2, mulai dari teks yang ada) **benar secara kode** (terbaca: `shownLen =
targetRef.current.length`), jadi crawl-dari-0 tidak akan terjadi pada thread yang kode-nya terpasang.

---

## 5. Temuan kecil

- **`ElapsedLabel` reset tiap refresh.** `useState(() => Date.now())` per-mount → thread zombie 2
  hari pun tampil "Sedang bekerja… 12s". Memperkuat ilusi "baru mulai kerja" pada turn yang sebenarnya
  mati. (Hitung dari `createdAt` event aktif pertama, bukan mount.)
- **Komentar usang `proxy.ts`** masih menyebut "rewrite Next (next.config) mem-proxy route eve" —
  padahal `rewrites()` sudah dihapus dan diganti Route Handler. Tidak fungsional, tapi menyesatkan.
- **Persist via `swallow("event", …)`** (projection): bila SATU insert gagal (mis. ENOSPC), event
  di-drop diam-diam → `event_index` DB bergeser dari index stream eve sebenarnya → cursor resume
  bisa meleset (di-flag di `streamIndexFromEvents`). Fragil tapi jarang.

---

## 6. Opsi solusi (matang, lazy-first)

### #A Zombie thread (PRIORITAS 1 — paling mengganggu, paling mudah)
- **A1 — Staleness guard di klien (paling lazy, ~10 baris).** `isStreamActive` kembalikan `false`
  bila event terakhir non-terminal **tapi `createdAt`-nya lebih tua dari ambang** (mis. 90–120 dtk).
  Efek: composer ke-unlock, resume berhenti, user bisa lanjut/retry. *Ceiling:* ambang harus > gap
  dead-air sah → **pasangkan dengan heartbeat (B3)** supaya turn yang benar-benar hidup tetap "fresh"
  dan ambang bisa ketat. Tanpa heartbeat, ambang harus ≥ ~3–4 mnt (lebih longgar, tetap memperbaiki
  zombie).
- **A2 — Reconciler server-side (durable, "fix benar").** Job berkala / on-thread-GET: thread
  `status='streaming'` tanpa event > N mnt → set `status='failed'` + append event terminal sintetik
  (`turn.failed`). Beres untuk semua klien + bersihkan DB. Ini "reconciler" yang dicatat TODO kode.
- **A3 — Tanya eve status sesi.** Cek state sesi/turn eve langsung (apakah workflow benar mati).
  Paling akurat, tapi tergantung API eve + lebih berat.
- **Rekomendasi:** A1 (+B3) **segera** untuk unblock; A2 sebagai pembersih durable.

### #B Dead-air subagent (PRIORITAS 2)
- **B3 — Heartbeat induk (paling lazy & paling berleverage).** Selama menunggu subagent, emit event
  "masih bekerja" berkala (mis. tiap 15–20 dtk) ke stream/persist. Sekaligus: (a) liveness nyata,
  (b) membuat staleness-guard A1 aman (turn hidup = `createdAt` selalu fresh; hanya turn mati yang
  jadi basi). Satu mekanisme, dua masalah teratasi.
- **B2 — Forward progres subagent ke induk (UX terbaik).** Jembatani event child-session (mis.
  `subagent.started/step/completed`, "literature-searcher: cari arXiv… 8 ditemukan") ke timeline
  induk. Saat ini **0** event subagent ter-forward → dead-air total. Bahkan progres kasar membunuh
  rasa beku. Lebih besar; cek dukungan eve untuk forwarding event subagent.
- **Rekomendasi:** B3 dulu (murah, sinergi dengan A1), B2 menyusul untuk UX kaya.

### #C Storage O(n²) + query compaction (PRIORITAS 3 — skala)
- **C2 — Index ekspresi (band-aid query, paling lazy, no migrasi data).** Tambah index untuk
  mendukung GROUP BY, mis. partial index pada delta:
  `(thread_id, type, turn_id, (payload->'data'->>'stepIndex'), event_index)`. Mempercepat subquery
  `max(event_index)` per step tanpa ubah kode. *Ceiling:* tak mengecilkan storage; payload tetap
  di-detoast saat SELECT baris final.
- **C1 — Stop persist delta tersusul (jalur-tulis, fix nyata storage).** Di `store.ts`, untuk
  `*.appended` **UPDATE baris delta (type,turnId,stepIndex) yang sama** alih-alih INSERT baru →
  storage O(n) (32 MB → ~117 kB at-rest), query baca trivial (tak perlu compaction). **Syarat:**
  pisahkan **cursor resume dari jumlah baris** (resume `startIndex` harus = index stream eve, bukan
  `count`). Simpan index stream eve native per thread. Medium, tapi menyelesaikan akar.
- **C4 — Jangan persist delta sama sekali.** Persist hanya event non-delta + **teks final** per
  (turn, step) saat `step.completed`. Token-level live tetap dari stream eve (bukan DB). Kemenangan
  storage terbesar + baca paling simpel; resume token-level mid-step datang dari stream eve, DB cukup
  untuk reload. Sama-sama butuh decouple cursor (seperti C1).
- **Rekomendasi:** C2 **segera** (cepat, aman); lalu C1 **atau** C4 + decouple cursor sebagai fix akar.

### Kecil
- **`ElapsedLabel`**: hitung dari `createdAt` event aktif pertama turn, bukan `Date.now()` mount.
- Luruskan komentar `proxy.ts` (sudah Route Handler, bukan rewrites).

---

## 7. Rekomendasi prioritas

1. **Verifikasi lingkungan dulu (gratis).** Pastikan owner menjalankan **`bun dev:v2` segar**
   (kill semua, lalu start) — `next.config.ts` + Route Handler baru **wajib restart penuh Next**,
   tak cukup Fast Refresh. Konfirmasi di Network tab: `/eve/v1/.../stream?startIndex=` ter-request
   dan men-`pending` saat turn jalan. Bila ya, gejala #2/#4 mestinya hilang (sesuai audit ini).
2. **A1 + B3** (staleness guard + heartbeat) — membunuh zombie & melembutkan dead-air. Dampak
   tertinggi, usaha terendah.
3. **C2** (index) — redam tekanan query poll pada thread besar.
4. **A2 / B2 / C1-C4** — fix durable (reconciler, forward subagent, decouple cursor) sebagai fase
   berikutnya.
5. **Commit fix §9** yang masih di working tree, supaya tidak hilang & deploy konsisten.

---

## 8. Lampiran — cara cek lingkungan tidak basi

- `git status` → fix §9 masih `M`/`??` (uncommitted). Pastikan file aktif di server = versi ini.
- Restart penuh: kill `dev:web-v2`/`dev:eve`/`dev:api`, lalu `bun dev:v2`. **Jangan** andalkan HMR
  untuk `next.config.ts` & route handler baru.
- Network saat `/deep` aktif: harus ada `GET /eve/v1/session/<id>/stream?startIndex=N` (status
  `pending`/`200`) **dan** `GET /threads/<id>/events?afterIndex=N`. Bila yang muncul malah jalur
  rewrites lama / tak ada Route Handler → stale.
- DB sanity: `select status,count(*) from chat_threads group by 1;` — banyak `streaming` basi =
  zombie menumpuk (butuh A1/A2).

---

## 9. Ringkasan thread bukti

| thread | peran di audit |
|---|---|
| `wrun_01KW17JPN7N28GBCAPCYEK700D` | run `/deep` uji — semua jalur interaktif + dead-air subagent |
| `wrun_01KVWSTHH4T32QZ47260BPPNX9` | **zombie** `status=streaming` 2 hari, composer terkunci, resume menggantung |
| `wrun_01KVZ4WYH2Y6S8RXK232YHVRZJ` | `/deep` selesai 32 MB/6119 event — cold-load ~2 dtk (biaya query compaction) |
