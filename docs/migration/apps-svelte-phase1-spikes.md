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
| 9 | Clerk SSR/token/2FA/reverification (+fallback `@clerk/clerk-js`) | **OWNER-RUN** | dealbreaker #1. Butuh Clerk keys. Lihat §"Connected slice". |
| 10 | Eden + `@tanstack/svelte-query` (per-request client + `dehydrate`/`HydrationBoundary` + reactive-options) | **OWNER-RUN** | Phase 2. Butuh `apps/api` jalan. Pola di §"Catatan". |
| 11 | Raw **Mastra streaming** | **OWNER-RUN** | dealbreaker #2. Butuh `apps/agent`. |
| 12 | `svelte-streamdown` custom renderer + security | **OWNER-RUN** | dealbreaker #3. Corpus parity + XSS. |
| 13 | Composer contenteditable + token chip (caret/IME/CJK) | **OWNER-RUN** | Phase 7; salah satu tersulit (§10 catatan). |
| 14 | long-thread anchoring / follow-bottom | **DEFERRED** | Phase 6/7 (`stick-to-bottom-svelte` vs virtual-chat). |
| 15 | `$env/dynamic/*` runtime injection (Infisical, container) | **DEFERRED** | Phase 2/12. |
| 16 | `ssr.noExternal` / mount client-only (BlockNote/EmbedPDF/Mermaid/streamdown) | **DEFERRED** | spike saat lib-nya masuk (Phase 6/9/10). |
| 17 | EmbedPDF Svelte | **DEFERRED** | Phase 9. |
| 18 | `svelte-dnd-action` (DnD library) | **DEFERRED** | Phase 9. |
| 19 | Content Collections + mdsvex | **DEFERRED** | Phase 4. |
| 20 | BlockNote core mount/event feasibility | **DEFERRED** | Phase 10 (fase terakhir). |
| 21 | Ukur resource dev SvelteKit vs Next | **OWNER-RUN (partial)** | angka Svelte di §"Resource"; head-to-head = owner. |

DEFERRED = bukan dealbreaker Phase 1; di-spike saat fase pemiliknya, sudah tercatat di ledger.

## Connected vertical slice (OWNER-RUN) — gerbang GO/NO-GO

Slice throwaway tapi end-to-end di path nyata (§0 #6, Phase 1 plan):

> **sign-in `svelte-clerk` → buka satu thread → kirim pesan → Mastra stream live → streamdown render**

Tidak dijalankan di sesi scaffold ini karena butuh: Clerk publishable/secret key live, `apps/api` + `apps/agent`
jalan (Postgres/Redis/MinIO via `infra/compose.dev.yaml`), dan minimal satu user + thread. Langkah owner:

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

### Hasil connected slice (diisi owner)

| Item | Hasil | Catatan |
|---|---|---|
| svelte-clerk SSR/token/2FA/reverif | ⬜ | |
| Mastra streaming live | ⬜ | |
| svelte-streamdown parity+security | ⬜ | |
| GO / NO-GO | ⬜ | |

## Resource dev SvelteKit vs Next (validasi driver §0)

Angka `apps/svelte` (sesi scaffold, mesin dev):

- Production build (`vite build`, adapter-node): **~1.3–1.4s** (scaffold minimal + 2 komponen shadcn).
- Server bundle: `index.js` ~132 kB (gzip ~33 kB).

Head-to-head vs `apps/web` (Next 16) = OWNER-RUN (butuh stack lengkap). Metode saran:
`hyperfine`/`/usr/bin/time -l` untuk cold `dev` start + RSS steady-state, dan build time, pada slice setara. Isi:

| Metric | apps/svelte | apps/web (Next 16) |
|---|---|---|
| cold `dev` ready (s) | ⬜ | ⬜ |
| RSS steady (MB) | ⬜ | ⬜ |
| production build (s) | ~1.3 | ⬜ |

## Catatan pola (untuk fase berikut)

- **TanStack Svelte Query gotcha:** argumen `create*` **wajib fungsi** — `createQuery(() => ({...}))`. Object polos
  memutus reaktivitas senyap (§3.6). `QueryClient` **per-request** via context (bukan singleton module-level, §3.5).
- **SSR leak:** dilarang module-level mutable state; shared state = class `$state` di `.svelte.ts` + context (§3.5).
- **Ikon vendored:** komponen `src/lib/components/ui/**` impor `@hugeicons/svelte` langsung (allowed, iconLibrary hugeicons).
  App code impor via `$lib/icons`. ESLint melarang `@lucide/svelte` di app code.
