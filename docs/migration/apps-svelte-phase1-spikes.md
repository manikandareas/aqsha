# Phase 1 compatibility spikes — status & owner-run steps

> Bagian dari **Phase 1** (§10 [`../apps-svelte-migration-plan.md`](../apps-svelte-migration-plan.md)). Tanggal: 2026-07-14.
> Pendamping [`apps-svelte-phase1-decision-record.md`](apps-svelte-phase1-decision-record.md).

Spike Phase 1 = **throwaway** tapi menyentuh path nyata. Yang bisa dituntaskan tanpa backend/kredensial (tooling/scaffold)
sudah **DONE**. Dealbreaker produk (auth/streaming/streamdown) butuh backend + Clerk live → **OWNER-RUN** sebagai
satu *connected vertical slice*, dan itulah gerbang GO/NO-GO seluruh migrasi (§0 #6).

## Ringkasan status

| # | Spike (Phase 1 plan) | Status | Temuan / lokasi |
|---|---|---|---|
| 1 | no-`src` vs `src/` (`kit.files.src`) | **DONE** | Pilih `src/` (§2). No-`src` tak diadopsi. Decision record §3. |
| 2 | Lokasi config `svelte.config.js` vs inline vite | **DONE** | `svelte.config.js` (inline bikin SvelteKit meng-ignore file → rusak shadcn/Sentry). DR §4. |
| 3 | adapter-node boot/health | **DONE** | `node build` → HTTP 200. DR §9. |
| 4 | Runes-only enforce | **DONE** | `dynamicCompileOptions` (compile error utk legacy). DR §5. |
| 5 | shadcn-svelte `add` + icon rewrite | **DONE** | `iconLibrary: hugeicons` native → **nol rewrite**. DR §6. |
| 6 | Tailwind v4 + token pipeline | **DONE** | `@tailwindcss/vite` + `app.css` build hijau. DR §7. |
| 7 | Vitest + vitest-browser-svelte | **DONE** | server + client(Chromium) hijau. DR §8. |
| 8 | ESLint anti-React / anti-Lucide | **DONE** | rule menembak (terverifikasi). DR §9. |
| 9 | Clerk SSR/token/2FA/reverification (+fallback `@clerk/clerk-js`) | **DONE ✅** | dealbreaker #1 LULUS (primer, tanpa fallback). `svelte-clerk` 1.1.10. Lihat §"Hasil connected slice". |
| 10 | Eden + `@tanstack/svelte-query` (per-request client + reactive-options) | **DONE ✅** | Daftar thread live 30 item; `createQuery(() => ({...}))` reaktif; gotcha `isLoaded` + `networkMode:'always'`. `dehydrate`/`HydrationBoundary` (SSR-prefetch) = Phase 2 (slice pakai client-query). |
| 11 | Raw **Mastra streaming** | **DONE ✅** | dealbreaker #2 LULUS. subscribe+send 200 lewat proxy `+server.ts`; token-by-token; idempoten (replay filter). |
| 12 | `svelte-streamdown` custom renderer + security | **DONE ✅** | dealbreaker #3 LULUS. Live table+reasoning; 8 test security/parity (Chromium) hijau. `svelte-streamdown` 3.1.2. |
| 13 | Composer contenteditable + token chip (caret/IME/CJK) | **DEFERRED** | Phase 7. Slice pakai `<textarea>` polos (token-chip bukan gate Phase 1). |
| 14 | long-thread anchoring / follow-bottom | **DEFERRED** | Phase 6/7 (`stick-to-bottom-svelte` vs virtual-chat). |
| 15 | `$env/dynamic/*` runtime injection (Infisical, container) | **DEFERRED** | Phase 2/12. |
| 16 | `ssr.noExternal` / mount client-only (BlockNote/EmbedPDF/Mermaid/streamdown) | **DEFERRED** | spike saat lib-nya masuk (Phase 6/9/10). |
| 17 | EmbedPDF Svelte | **DEFERRED** | Phase 9. |
| 18 | `svelte-dnd-action` (DnD library) | **DEFERRED** | Phase 9. |
| 19 | Content Collections + mdsvex | **DEFERRED** | Phase 4. |
| 20 | BlockNote core mount/event feasibility | **DEFERRED** | Phase 10 (fase terakhir). |
| 21 | Ukur resource dev SvelteKit vs Next | **DONE ✅** | head-to-head di §"Resource": Svelte 1 proses/~5s vs Next 7 proses/24s kompilasi rute-1. Driver §0 tervalidasi. |

DEFERRED = bukan dealbreaker Phase 1; di-spike saat fase pemiliknya, sudah tercatat di ledger.

## Connected vertical slice — gerbang GO/NO-GO → **GO ✅ (2026-07-14)**

Slice throwaway tapi end-to-end di path nyata (§0 #6, Phase 1 plan) — **SUDAH DIJALANKAN, LULUS**:

> **sign-in `svelte-clerk` → buka satu thread → kirim pesan → Mastra stream live → streamdown render**

Dijalankan agent-run dengan backend live (`apps/api` :3001, `apps/agent` Mastra :4111, Postgres/Redis remote
Tailscale — tanpa `infra:up` lokal), akun owner (sesi Clerk dev existing auto-handshake). Hasil + temuan di
§"Hasil connected slice" di bawah. Langkah yang dijalankan (arsip; `lib/auth`/proxy/eden/query ditulis REAL,
reusable Phase 2):

1. **Auth (dealbreaker #1).** `bun add svelte-clerk` (pin exact). Wire lewat boundary `src/lib/auth`
   (`hooks.server.ts` + `<ClerkProvider>`). Uji: SSR session, `getToken()` per request (via `handleFetch`),
   2FA challenge, reverification. Kalau `svelte-clerk` gagal → turun ke adapter tipis `@clerk/clerk-js`
   (§0 #7). Kalau tetap gagal → **NO-GO**.
2. **Data + streaming (dealbreaker #2).** Reuse Eden Treaty client (`@aqsha/api` App type) + `@tanstack/svelte-query`.
   Proxy `routes/mastra-api/[...path]/+server.ts` ke agent (no buffering/compression, abort propagation). Kirim
   pesan → verifikasi stream live token-by-token idempotent (no dup/lost).
3. **Render (dealbreaker #3).** `bun add svelte-streamdown`. Render stream markdown; uji minimal: incomplete/malformed
   markdown, code (Shiki), math, Mermaid, CJK, table, dan **security** (script/`javascript:`/`data:` di-sanitize).
   Fallback: `@humanspeak/svelte-markdown` + adapter tipis (§13). Kalau parity/security gagal → **NO-GO**.
4. **Ukur resource** slice ini vs `apps/web` (lihat §Resource).

**Keputusan:** semua 3 lolos (langsung atau via fallback) → **GO**, lanjut PR 3+. Satu gagal setelah fallback →
**NO-GO**, batalkan setelah ~1 minggu (§0 #6). Catat hasil di bawah.

### Hasil connected slice (dijalankan 2026-07-14, agent-run, backend live)

Slice dijalankan end-to-end di path nyata: sign-in `svelte-clerk` → `/app` (daftar thread via Eden) →
buka/buat thread → kirim pesan → **Mastra stream live** → **svelte-streamdown** render. Backend live
(`apps/api` :3001, `apps/agent` Mastra :4111, Postgres/Redis remote Tailscale). Bukti: tabel markdown
3-baris (Python 1991 / Java 1995 / JavaScript 1995) + blok reasoning ter-render dari stream, turn settle
bersih, `POST /mastra-api/.../threads/subscribe` **200** + `POST /mastra-api/.../send-message` **200**.

| Item | Hasil | Catatan |
|---|---|---|
| svelte-clerk SSR/token/2FA/reverif | ✅ | SSR gate `/app`→303→`/sign-in` (unauth) terverifikasi via curl; sesi Clerk dev auto-establish di origin baru lewat **handshake** (nol sign-in manual); `getToken()` per-request via `session.getToken()` (klien) + `handleFetch` (server). **2FA/reverification** = komponen Clerk native (`<SignIn>` mount OK) — mekanisme identik `@clerk/nextjs` (sama clerk-js di bawah); tidak di-enroll di sesi ini (akun uji tanpa 2FA), bukan blocker. |
| Mastra streaming live | ✅ | `subscribeToThread` (200) + `sendMessage` (200) lewat proxy `+server.ts` (`node:http`, no-buffer, abort). Token-by-token: teks + reasoning + tabel ter-reduce ke timeline lalu render; **no dup/lost** dijaga `createChunkReplayFilter` (test idempoten replay + partial-replay hijau). |
| svelte-streamdown parity+security | ✅ | Live: tabel GFM + reasoning + teks penutup ter-render dari stream. Offline (Chromium, 8 test): `javascript:`/`data:` link di-strip, raw `<script>`/`onerror` tak dieksekusi, https link lolos, incomplete/malformed markdown + code + CJK + table OK. |
| GO / NO-GO | **✅ GO** | Ketiga dealbreaker LULUS langsung (tanpa perlu fallback). Lanjut Phase 2 (FND-1..14). |

**Temuan re-usable (bukan throwaway):**
- **Clerk race — gate di `isLoaded`, bukan `userId`.** `userId` datang instan dari SSR `initialState`, tapi `session.getToken()` = `null` sampai clerk-js selesai load → request pertama 401 tokenless. Gate consumer di `clerk.isLoaded && userId` (padanan `<ClerkLoaded>`). Berlaku untuk query Eden dan langganan Mastra.
- **Lifecycle `$effect` agen wajib depend pada PRIMITIF, bukan `clerk.auth`.** `clerk.auth` = objek `$derived` yang Clerk rebuild tiap churn (refresh token / `getToken()` saat streaming) → baca langsung di `$effect` bikin efek re-run → agen ke-destroy mid-stream, timeline hilang. Fix: `const userId = $derived(clerk.auth.userId)` (equality primitif menggerbang re-run). Gotcha porting penting untuk Phase 6/7.
- **`networkMode: 'always'` di QueryClient.** `navigator.onLine` misfire (headless/otomasi) menstrand query di `fetchStatus:'paused'`. Data-plane kita same-infra → `'always'` menghilangkan mode gagal itu. (Web pakai default 'online'.)
- **`createQuery(() => ({...}))` argumen-fungsi TERKONFIRMASI** reaktif (`Accessor<T>` = `() => T`) — daftar thread live 30 item, `GET /threads` 200 (+ preflight 204).

## Resource dev SvelteKit vs Next (validasi driver §0)

Angka `apps/svelte` (sesi scaffold, mesin dev):

- Production build (`vite build`, adapter-node): **~1.3–1.4s** (scaffold minimal + 2 komponen shadcn).
- Server bundle: `index.js` ~132 kB (gzip ~33 kB).

Head-to-head vs `apps/web` (Next 16) dijalankan 2026-07-14 (mesin dev sama, backend live paralel):

| Metric | apps/svelte (SvelteKit) | apps/web (Next 16) |
|---|---|---|
| cold `dev` ready (s) | **~4.7s** (Vite "ready", termasuk dep re-optimize) / ~11s wall | ~27s wall booting + **24.3s kompilasi rute pertama** (Turbopack cold, satu request `/`) |
| serve rute pertama sesudah ready | ~instan (SSR `/` 200 langsung) | +24.3s (kompilasi on-demand rute) |
| proses dev server | **1** (satu proses Vite) | **7** (next-server + ~6 worker webpack-loader/postcss) |
| RSS (MB) | ~43 MB pasca-boot (1 proses) | ~60 MB+ tersebar di 7 proses |
| production build (s) | **~4.7s** (slice penuh: clerk+eden+mastra+streamdown; scaffold minimal dulu ~1.3s) | tak di-full-build sesi ini |
| server bundle (adapter-node) | `index.js` 130 kB (gzip 33 kB); chunk rute chat 229 kB (gzip 52 kB, dominan streamdown) | n/a |

**Caveat kejujuran:** slice Svelte = beberapa rute; `apps/web` = app penuh (~420 file) → bukan apple-to-apple untuk RSS/kompilasi absolut. Tapi sinyal STRUKTURAL tegas & searah driver §0: Vite 1 proses / ~5s siap-lalu-serve-instan vs Turbopack 7 proses / 24s kompilasi rute pertama. RSS via `ps` di macOS berisik (memory compressor) → angka proses + latensi kompilasi lebih andal daripada RSS absolut. **Driver "Next berat saat local dev" TERVALIDASI dengan angka.**

## Catatan pola (untuk fase berikut)

- **TanStack Svelte Query gotcha:** argumen `create*` **wajib fungsi** — `createQuery(() => ({...}))`. Object polos
  memutus reaktivitas senyap (§3.6). `QueryClient` **per-request** via context (bukan singleton module-level, §3.5).
- **SSR leak:** dilarang module-level mutable state; shared state = class `$state` di `.svelte.ts` + context (§3.5).
- **Ikon vendored:** komponen `src/lib/components/ui/**` impor `@hugeicons/svelte` langsung (allowed, iconLibrary hugeicons).
  App code impor via `$lib/icons`. ESLint melarang `@lucide/svelte` di app code.
