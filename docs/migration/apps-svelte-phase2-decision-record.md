# Phase 2 decision record — platform foundation (API, auth, env, query, Sentry, proxy)

> Bagian dari **Phase 2** (§10 [`../apps-svelte-migration-plan.md`](../apps-svelte-migration-plan.md)).
> Tanggal: 2026-07-14. Melanjutkan [`apps-svelte-phase1-decision-record.md`](apps-svelte-phase1-decision-record.md)
> + [`apps-svelte-phase1-spikes.md`](apps-svelte-phase1-spikes.md) (boundary slice ditulis REAL, di-extend di sini).
> Bahasa Indonesia; nama package/API/simbol tetap English (AGENTS.md).

Mengunci fondasi platform yang diwarisi tiap fitur Phase 3+. **Bukan** UI fitur (route demo `/app`, `/app/threads/[threadId]`,
`/sign-in` tetap scaffolding smoke). Ledger: [`apps-svelte-parity-ledger.md`](apps-svelte-parity-ledger.md) FND-1..14 = **done**.

---

## 1. Struktur `lib/` yang dibangun (§5.1)

| Folder | Isi | Boundary |
|---|---|---|
| `lib/api/` | `client.ts` (`createBrowserApiClient`), `context.ts` (`apiClientContext`/`getApiClient` = padanan `useApi()`), `index.ts` | client |
| `lib/query/` | `client.ts` (`createQueryClient`), `keys.ts` (registry, port verbatim), `unwrap.ts`, `index.ts` | client-safe |
| `lib/errors/` | `api-error.ts` (`readableApiErrorMessage`/`apiErrorCode`/`normalizeApiError`), `svelte.ts` (`failWithApiError`→`error()`) | pure |
| `lib/auth/` | `token.ts`, `context.svelte.ts` (`getAuthState`/`getAuthToken`/`getClerk`), `viewer-identity.ts` (pure), `viewer.svelte.ts` (class+context), `UserSync.svelte` | client |
| `lib/env/` | `defaults.ts` (pure, no-zod), `schema.ts` (zod, server/test), `public.ts` (`publicEnv`) | split |
| `lib/server/` | `env.ts` (`serverEnv`, boot validation), `api.ts` (`createServerApiClient`), `auth.ts` (`getAuth`/`requireUser`/`getServerToken`/`serverApiFor`) | **server-only** (`$lib/server`) |
| `lib/observability/` | `sample-rate.ts` (`parseSampleRate`/`parseSentryDsn`, pure), `sentry.ts` (`initClient/ServerSentry`) | split |
| `lib/plan/` | `catalog.ts` (pure-data mirror, §4.1) | pure |
| `lib/` | `context.ts` (`createContext<T>` factory — primitif fondasi, loose file) | client |
| `lib/components/layout/` | `AppProviders.svelte` (runtime providers, child `<ClerkProvider>`) | client |

**Reconsiliasi §5.1 (folder structure).** §5.1 ditulis framework-agnostik → tak mengantisipasi 3 folder yang
SvelteKit/Phase 2 butuhkan; §5.1 di plan sudah di-update (adendum) agar plan ⟷ realita konsisten:
- `lib/server/` — **satu-satunya** boundary server-only yang di-enforce compiler (konvensi `$lib/server`: impor dari
  client = build error). §5.1 `api/`+`auth/` datar tak bisa memuat kode server dengan aman (bakal bocor / butuh
  `$lib/server` juga). Jadi server `env`/`api`/`auth` di sini, client `api`/`auth` tetap di `lib/api`/`lib/auth`.
- `lib/env/` — env config client-safe + validasi (§3.7); §5.1 tak punya rumah env.
- `lib/plan/` — katalog plan browser-safe (§4.1); shared pure-data, bukan feature-specific.
- `lib/utils.ts` **tetap file** (bukan folder `utils/` seperti sketsa §5.1) — path terikat shadcn `components.json`
  (`"utils": "$lib/utils"`); mengubah ke folder melawan CLI shadcn (library-first §3.3, sama alasan Phase 1 pilih `src/`).
- `AppProviders.svelte` dipindah ke `lib/components/layout/` agar cocok §5.1 `components/{ui,layout,ai-elements}`.
- Sisa Phase 1 slice (`lib/threads/`, `lib/components/Markdown.svelte`) = scaffolding demo; relokasi ke `lib/features/*`
  saat Phase 6/7 (bukan cakupan Phase 2).

Root: `hooks.client.ts` (baru, Sentry), `hooks.server.ts` (di-extend), `routes/+error.svelte`, `routes/sentry-tunnel/+server.ts`,
`routes/mastra-api/[...path]/proxy.ts` (helper), `app.d.ts` (App.Error `{message,code}`), `vite.config.ts` (Sentry plugin kondisional).

## 2. Keputusan terkunci

1. **Env: zod SERVER-only, fail-fast boot (§3.7).** `lib/env/schema.ts` (zod) diimpor HANYA `lib/server/env.ts` + test →
   zod tak masuk client bundle (terverifikasi). `lib/server/env.ts` memvalidasi PUBLIC + PRIVATE saat import (= boot,
   dipicu `hooks.server.ts`); env salah → `ZodError` saat server start (terverifikasi: `CLERK_SECRET_KEY` invalid → crash,
   tak serve). Client baca `publicEnv` (typed, default via `defaults.ts` tanpa zod) — nilai sudah tervalidasi server.
   Private di `$lib/server` → SvelteKit MEMBLOKIR impor client (compile error).
2. **Auth gate = mirror `proxy.ts` PENUH, bukan cuma `/app`.** `proxy.ts` memproteksi SEMUA route kecuali allow-list
   (`/`, `/sign-in(.*)`, `/sign-up(.*)`, `/blog(.*)`, `/changelog(.*)`, `sitemap.xml`, `robots.txt`, `/sentry-tunnel(.*)`);
   `/mastra-api` di-exclude (punya `MastraAuthClerk` sendiri). `guard` di `hooks.server.ts` menegakkan hal sama.
3. **Onboarding gate = SERVER gate (mirror `app/app/layout.tsx`), bukan client `onboarding-gate.tsx`.** Web punya dua:
   RSC `app/app/layout.tsx` (blocking, authoritative, redirect pra-render) + client `OnboardingGate` (loading overlay).
   Phase 2 memport yang authoritative ke `hooks.server.ts`: `/app*` un-onboarded → `303 /onboarding`, redirect HANYA saat
   positif `!completed` (error transient → render, parity). `!event.isSubRequest` cegah double-fetch. Client overlay = Phase 3 shell.
4. **API client: context (padanan `useApi()`), bukan singleton.** `AppProviders` (child `<ClerkProvider>` + `<QueryClientProvider>`)
   membangun Eden client ber-auth per-request + set `apiClientContext` + `viewerContext` + mount `<UserSync/>`. `useClerkContext()`
   valid di sana karena parent set context sebelum child init.
5. **Plan catalog: pure-data mirror di `apps/svelte`, TANPA dependency `@aqsha/services`.** `dist/plan.js` mengimpor shared
   tsup chunk (`chunk-*.js`) → mengimpornya menarik kode lain → **bukan** boundary-safe. §4.1 ("prefer shared pure-data export")
   + constraint "jangan sentuh `packages/*`" → mirror manual (pola `apps/web/features/<x>/types.ts`) + contract test invariant.
   Cakupan = katalog + selektor pure (marketing Phase 4); server-only (estimateCredits/billing/admin-env) TIDAK dibawa.
6. **Sentry: `Sentry.init` inline di hooks, vite plugin kondisional (source-map saja).** SDK runtime aktif via
   `initClient/ServerSentry` di `hooks.{client,server}.ts` — mandiri dari plugin. `sentrySvelteKit()` di `vite.config.ts`
   (async → `Promise<Plugin[]>` di array, Vite await) HANYA saat trio `SENTRY_AUTH_TOKEN`+`ORG`+`PROJECT` ada (mirror web
   `sourcemapUploadEnabled`), `autoInstrument:false` (tracing 0). Tunnel `+server.ts` (SSRF-guard: hanya DSN terkonfigurasi).
   `sendDefaultPii:false`. Wiring code-complete; upload source-map staging perlu token (task-accepted).

## 3. Gotcha & temuan reusable (untuk fase berikut)

- **`/*/` di dalam block comment = penutup komentar dini.** Komentar `apps/web/features/*/types.ts` mengandung `*/` →
  menutup `/** */` di tengah → sisanya di-parse sebagai kode ("Unterminated template literal"). JANGAN tulis glob `*/`
  (atau string apa pun ber-`*/`) di block comment; pakai `<x>`/ellipsis. Berlaku semua `.ts`.
- **zod di client node 4 = `@aqsha/client-js`, BUKAN env schema.** `@mastra/client-js` mendeklarasikan+membundel `zod`;
  route threads (demo Phase 1) mengimpornya → zod ada di chunk client route itu. Env schema kita terverifikasi **absen**
  dari client (`parsePublicEnv`/`parsePrivateEnv` tak ditemukan). Bukan regresi Phase 2; route demo throwaway.
- **`getClerk()` return type via `ClerkContext['clerk']`, bukan `HeadlessBrowserClerk`/`BrowserClerk`.** Tipe internal itu
  tak diekspos subpath publik `svelte-clerk`; derive dari `ClerkContext`.
- **`UserSync` $effect wajib depend `$derived` PRIMITIF** (`const userId = $derived(auth.userId)`), bukan `auth.userId`
  langsung — objek `clerk.auth` rebuild tiap churn token → re-fire. (Bake temuan Phase 1 b.)
- **`$env/dynamic/public` typed via `publicEnv`**, bukan dibaca `env.PUBLIC_*` langsung — bertipe + berdefault + satu titik ubah.

## 4. Gate Phase 2 (§10) — HIJAU

| Cek | Perintah / bukti | Hasil |
|---|---|---|
| Typecheck | `bun run --filter @aqsha/svelte typecheck` | **0 errors / 0 warnings** |
| Lint | `bun run --filter @aqsha/svelte lint` | Prettier clean + ESLint 0 |
| Test | `bun run --filter @aqsha/svelte test` | **13 files / 72 tests pass** |
| Build | `bun run --filter @aqsha/svelte build` | OK (adapter-node) |
| adapter-node boot + auth matrix | `node build` + curl | `/` 200, `/sign-in` 200, **`/app`→303→`/sign-in`**, tunnel GET 405 |
| Env fail-fast | `node build` dgn `CLERK_SECRET_KEY` invalid | **ZodError saat boot, tak serve** |
| Boundary client | grep `.svelte-kit/output/client` | **no secret / no `@aqsha/db`·services / no React / env-schema absen** |

Contract tests correctness-critical: error normalization, queryKey codec, env validation schema, sample-rate/DSN parse,
plan invariants, QueryClient cross-user isolation, viewer resolve, proxy (header/first-byte/abort/large-payload).

## 5. Yang TIDAK dikerjakan (di luar Phase 2)

- UI fitur & shell (theme/toast/sidebar/tooltip/motion) = Phase 3; route demo tak diinvestasi.
- SSR-first `dehydrate`+`<HydrationBoundary>` = pola tersedia (per-request QueryClient), di-wire saat route SSR-first (Phase 4/7).
- Reverification/2FA flow penuh = Phase 5 (seam `getClerk()` disiapkan).
- Client `OnboardingGate` loading-overlay = Phase 3 shell (server gate authoritative sudah di FND-8).
- Upload source-map Sentry ke staging = perlu `SENTRY_AUTH_TOKEN`+`ORG`+`PROJECT` dari Infisical (OPS).
