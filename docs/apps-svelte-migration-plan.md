# Rencana migrasi lengkap `apps/web` ke `apps/svelte` (SvelteKit)

> Status: **PLAN — belum diimplementasikan**
>
> Disusun: 14 Juli 2026
>
> Baseline audit: working tree aktif branch `development`. `apps/web` di-**freeze** saat implementasi dimulai (lihat §0), jadi Phase 0 cukup mengunci satu commit reference.
>
> Bahasa: Indonesia; nama package, API, route, dan simbol kode tetap English sesuai `AGENTS.md`.

## 0. Konteks proyek dan keputusan right-sizing

> Ditambahkan 14 Juli 2026 setelah sesi grill. **Keputusan di seksi ini meng-override konstrain apa pun di bawah yang bertentangan.** Seksi detail (ledger, phasing, peta library, §3.4–3.7) tetap berlaku; yang berubah adalah *framing, konstrain, dan ceremony*.

**Realita yang membentuk plan ini:**

- Aqsha **belum production dan belum punya user.** Tidak ada pengalaman live yang perlu dilindungi.
- Driver utama = `apps/web` (Next.js) **berat saat local development**; driver strategis = tim **memang mau di Svelte jangka panjang** (DX/arah). Nol-user = **momen termurah seumur produk** untuk pindah.
- Konsekuensi: seluruh aparatus "migrasi produk ber-traffic" (rollback target, soak, canary, pixel-parity gate) **tidak relevan** dan dipangkas.

**Keputusan terkunci (hasil grill):**

1. **Strategi = idiomatic port, bukan strict 1:1 port.** Pertahankan sebagai *scope contract*: feature ledger (definisi "selesai"), phasing foundation-first, reuse backend/`chat-core`/pure-logic. **Buang** pixel-parity, byte-equivalent codec, "no redesign selamanya". Parity diturunkan dari *pixel/byte-identik* → **functional parity** (fitur jalan, terlihat benar). Tulis Svelte idiomatik (§3.4–3.7); batas komponen boleh menyimpang dari React bila Svelte menuntut.
2. **Eksekusi = agent-driven, per-fase berurutan**, dengan owner manusia sebagai **gate kualitas idiomatik + verifikasi parity** tiap fase. Koordinasi paralel (stable-ID locking, drift policy) dibuang; ledger = checklist scope Markdown.
3. **Web di-freeze total** selama migrasi (tanpa dual-maintenance). `apps/web` = **reference untuk di-diff saat porting**, dihapus setelah migrasi selesai — **bukan** rollback target.
4. **Rigor test = lean.** Pertahankan pure/contract test untuk logika *correctness-critical* (timeline reducer, byte export sitasi, upload state machine, BlockNote round-trip) + ~10 E2E happy-path kritis. Pixel visual-regression & a11y-audit formal **bukan blocking gate** (axe jalan sebagai warning).
5. **Cutover = sederhana.** Deploy Svelte ke subdomain, dogfood sendiri, flip domain saat puas. **Tidak ada** canary/shadow/soak-7hari/warm-14hari/rollback-triggers.
6. **Gerbang go/no-go keras di akhir Phase 1.** Spike jadi **satu vertical slice tersambung** (`sign-in svelte-clerk → buka thread → kirim → Mastra stream → streamdown render`) + **ukur resource dev SvelteKit vs Next**. Kalau satu dealbreaker (auth/streaming/streamdown) gagal → **batalkan setelah ~1 minggu**, jangan dipaksakan.
7. **Tangga fallback auth:** `svelte-clerk` (primer) → adapter tipis `@clerk/clerk-js` (fallback teknis) → batal/pause (backstop terakhir).
8. **Redesign = opportunistik saja.** Perbaikan remeh sambil porting (spacing, a11y, dead state) boleh; **tidak ada** kerja redesign terjadwal; layout/hierarki tetap seperti web. Redesign besar = pekerjaan terpisah *setelah* nyaman di Svelte.

**Seksi yang di-superseded:** §1 poin 2/7 (relaxed), §3.1/§3.2 (reframed), §9 gate (di-downgrade), Phase 0 (disederhanakan), Phase 12 (dipangkas jadi keputusan #5), §16 poin 5/6 (dihapus).

## 1. Tujuan dan hasil akhir

Membangun aplikasi baru `apps/svelte` dengan Svelte 5 + SvelteKit yang mencapai parity penuh terhadap `apps/web`, tanpa menghapus atau mengganti `apps/web` selama migrasi maupun saat cutover awal.

Hasil akhir wajib memenuhi seluruh hal berikut:

1. Semua route, feature, state URL, loading/error state, auth gate, permission, billing/rate-limit behavior, integrasi, streaming, upload, export, dan editor yang hidup di `apps/web` tersedia di `apps/svelte`.
2. UI/UX tidak *didesain ulang* secara terjadwal. Layout, hierarchy, dan copy tetap sama; token/spacing/typography sebagai baseline. Perbaikan remeh opportunistik diperbolehkan dan parity = functional (bukan pixel-identik) — lihat §3.2.
3. CSS Aqsha tetap menjadi kontrak visual. Komponen React/Radix dipindah ke shadcn-svelte/Bits UI, tetapi class, variant, token, dan computed visual result tetap dipertahankan.
4. Library Svelte yang matang selalu didahulukan. Kode adapter buatan sendiri hanya boleh muncul bila tidak ada package Svelte yang cukup matang atau bila adapter tipis dibutuhkan untuk mempertahankan contract Aqsha.
5. Backend dan domain model tidak ditulis ulang: `apps/api`, `apps/agent`, `packages/services`, `packages/db`, dan kontrak data tetap menjadi sumber yang sama.
6. `@aqsha/chat-core` tetap dipakai untuk primitives timeline/chat yang framework-agnostic. `apps/svelte` tidak boleh mengimpor `@aqsha/db` atau `@aqsha/services` ke browser bundle.
7. Cutover disederhanakan (§0 #5): deploy Svelte ke subdomain → dogfood → flip domain saat puas. `apps/web` bertahan sebagai **reference untuk di-diff saat porting** dan dihapus setelah migrasi selesai — **bukan** rollback target dengan soak/canary (nol user).

## 2. Keputusan yang sudah dikunci

| Area | Keputusan |
|---|---|
| Lokasi app | App baru bernama `@aqsha/svelte` di `apps/svelte`; `apps/web` tidak dipindah atau dihapus. |
| Framework | Svelte 5 dengan runes + SvelteKit current stable pada saat Phase 1 dimulai. Versi aktual dipin setelah compatibility spike, bukan memakai angka dari plan ini. **Runes mode only**: dilarang `export let`, `$:`, store untuk state komponen, `<slot>`, `on:*`, `use:` — lihat §3.4. |
| Runtime production | `@sveltejs/adapter-node`, dijalankan sebagai Node server di Docker/Dokploy. API dan worker tetap Bun; agent tetap Node/Mastra. |
| Package manager | Bun `1.3.10` saja. Semua command memakai `bun`/`bunx`. |
| Struktur | **Rekomendasi: pakai default `src/` SvelteKit untuk app greenfield ini.** Melawan struktur default (`kit.files.src: "."`) demi konsistensi kosmetik dengan `apps/web` bukan tradeoff yang sehat: opsi itu ditandai deprecated, dan hampir semua plugin/tool (shadcn-svelte CLI, Content Collections, Sentry vite plugin, adapter) mengasumsikan `src/`. `apps/svelte` adalah app baru, bukan `apps/web`; tak ada file yang harus dipindah. No-`src` hanya boleh dipertahankan bila spike Phase 1 membuktikan zero-friction pada SEMUA plugin dan versi terpin; kalau ada satu saja yang goyah, pakai `src/`. Keputusan final dicatat di decision record Phase 1. |
| Auth | Tetap Clerk. Gunakan `svelte-clerk` community adapter melalui boundary internal `lib/auth`; jangan menyebarkan API package itu ke semua feature. |
| UI primitives | shadcn-svelte sebagai source komponen dan styling; Bits UI sebagai headless primitive di bawahnya. |
| Icon | `@hugeicons/svelte` + `@hugeicons/core-free-icons`; buat satu adapter `lib/icons` yang mempertahankan nama/icon mapping Aqsha. Tidak ada direct Lucide dependency. |
| Data fetching | Eden Treaty client yang sama + `@tanstack/svelte-query`; query keys, stale policy, invalidation, error normalization, dan optimistic behavior disalin dari web. **`QueryClient` per-request** (context, bukan singleton module-level — cegah SSR leak), dan argumen `create*` **wajib dibungkus fungsi** `createQuery(() => ({...}))` (lihat §3.6). Default parity = tetap client-side query; `load` hanya untuk SSR-first (SEO/redirect/content). |
| Chat renderer | Kandidat utama `svelte-streamdown`, dengan parity spike wajib untuk citation, stats-viz, deep-viz, Shiki, math, Mermaid, CJK, table, incomplete Markdown, dan security pipeline. |
| DnD | `svelte-dnd-action` untuk library drag/drop; marquee selection tetap memakai model pure TypeScript yang sudah ada. |
| PDF | `@embedpdf/svelte-pdf-viewer`/EmbedPDF Svelte sebagai engine; toolbar/chrome di-style dengan shadcn-svelte agar hasil visual tetap identik. |
| Theme | `mode-watcher`, class `.dark`, dan token OKLCH yang sama. |
| URL state | `runed` `useSearchParams` atau primitive SvelteKit bila spike menunjukkan serializer lebih cocok; contract parser/encoder dari `nuqs` harus dipertahankan lewat contract tests. |
| Form | Default = **pertahankan TanStack mutation** (parity: API contract, optimistic update, error normalization, toast/copy semua sudah hidup di layer itu). `sveltekit-superforms`+Zod dipakai **SPA/client mode** hanya bila form butuh validation lifecycle non-trivial (mis. onboarding multi-step, settings kompleks) — bukan sebagai form action SSR baru, agar timing/error copy tidak berubah. Dialog sederhana pakai runes + Zod. Tidak boleh ada dua sumber kebenaran untuk mutation yang sama. |
| Toast | shadcn-svelte Sonner (`svelte-sonner`). |
| Motion | Svelte `transition`/`animate` untuk kasus native; package `motion` framework-agnostic untuk spring/gesture/scroll yang perlu menyamai `motion/react`. |
| Blog/changelog | Content Collections Vite untuk collection/schema/build + `mdsvex`/Svelte renderer untuk konten. Metadata, slug, ordering, Shiki, heading anchor, dan structured data tetap sama. |
| Editor | BlockNote ditempatkan paling akhir. Gunakan `@blocknote/core` vanilla dan Svelte UI adapter karena BlockNote tidak menyediakan UI Svelte resmi. Format persisted tidak diubah. |
| Dev annotation | Agentation React tidak dibawa ke production. Evaluasi `agentation-svelte` hanya sebagai dev-only dependency; bila belum layak, feature dev toolbar boleh ditunda tanpa memblokir product parity, tetapi keputusan dicatat. |
| State management | Class dengan field `$state` di file `.svelte.ts` + `createContext`; **dilarang module-level mutable state** (bocor antar-user saat SSR). Pure reducer/codec/model tetap `.ts` murni tanpa runes. Lihat §3.5. |
| Environment | **`$env/dynamic/*` (bukan `$env/static/*`)** untuk semua nilai runtime karena env di-inject Infisical saat runtime, bukan build. Public → `PUBLIC_*` via `$env/dynamic/public`; rahasia via `$env/dynamic/private`. Lihat §3.7. |
| Error handling | `appError` dipetakan ke SvelteKit: `error()` + `+error.svelte` untuk expected, `handleError` (client+server) untuk unexpected → Sentry. Payload tetap `{message,code,severity,field}`. |
| Testing | Vitest + **`vitest-browser-svelte`** untuk component/interaction (rekomendasi resmi tim Svelte, menggantikan `@testing-library/svelte`); Playwright untuk E2E/visual; pure test tanpa DOM. |
| Utilities | `runed` untuk padanan React hook (`useSearchParams`, `PersistedState`, `Previous`, `Debounced`, `resource`, media query) sebelum menulis util sendiri. |

## 3. Prinsip non-negotiable

### 3.1 Zero feature loss

Rasional di sini adalah **scope discipline, bukan user-protection** (nol user): daftar ini menjaga rewrite raksasa agar benar-benar *selesai* dan tak kehilangan fitur secara diam-diam. Tidak ada route/feature yang dianggap “selesai” hanya karena halaman dapat dirender. Parity fungsional mencakup:

- happy path, empty state, loading, offline/degraded, forbidden, not-found, retry, dan partial failure;
- pointer, keyboard, focus restoration, roving tabindex, Escape behavior, screen-reader label, dan reduced motion;
- deep link/query parameter, browser Back/Forward, redirect, refresh, session restore, dan mobile drawer state;
- streaming reconnect/abort/revive, billing/rate-limit gate, durable run, download, clipboard, file drop, drag/drop, multi-select, dan upload retry;
- light/dark, desktop/mobile, collapsed/expanded panel, long content, CJK, math, code, Mermaid, tables, citations, dan malformed streaming Markdown.

### 3.2 Tidak ada redesign terjadwal (perbaikan opportunistik boleh)

Per §0 keputusan #8: **layout, hierarchy, dan copy tetap seperti web**; migrasi bukan proyek redesign. Namun karena nol-user, perbaikan **remeh yang opportunistik** saat porting diperbolehkan — spacing kecil, a11y, dead/empty state, fixing bug visual jelas — tanpa perlu approval terpisah. Yang **dilarang**: kerja redesign terjadwal, mengubah hierarchy/layout/copy suatu surface, atau menggabung redesign besar ke dalam port sehingga variabel jadi tak terukur. Redesign besar = pekerjaan terpisah *setelah* surface itu ported & stabil di Svelte. Parity di sini = **functional + terlihat benar**, bukan pixel-identik.

### 3.3 Library-first, bukan dependency-first

Urutan keputusan untuk setiap komponen:

1. cek komponen shadcn-svelte yang sudah ada;
2. cek API Bits UI yang menjadi primitive-nya;
3. cek registry shadcn-svelte dan package Svelte resmi/aktif;
4. cek apakah package framework-agnostic existing dapat direuse;
5. baru buat adapter Aqsha yang paling tipis;
6. custom implementation penuh hanya bila empat langkah pertama tidak memenuhi contract.

Setiap custom adapter wajib memiliki catatan singkat berisi package yang dievaluasi, gap-nya, contract yang dipertahankan, dan test yang mencegah drift.

### 3.4 Model reaktivitas Svelte 5 — runes-first, effect-averse

Porting React→Svelte paling sering rusak di lapisan reaktivitas, bukan markup. Aturan wajib, di-enforce ESLint + review:

- **Runes mode only.** Dilarang legacy: `export let` → `$props`; `$:` → `$derived`/`$effect`; `writable`/`readable` untuk state komponen → `$state`; `<slot>`/`$$slots`/`<svelte:fragment>` → snippet + `{@render}`; `on:click` → `onclick`; `use:action` → `{@attach}`; `<svelte:component>` → komponen dinamis langsung; `class:` → array/objek clsx-style di `class`.
- **`$effect` adalah escape hatch, bukan padanan `useEffect`.** Larangan default menerjemahkan `useEffect`→`$effect` satu-per-satu; ini sumber bug over-fire terbesar saat porting. Turunan state pakai `$derived`/`$derived.by`; respon interaksi pakai event handler / function binding; sinkron ke library eksternal (D3, BlockNote, PDF, Mermaid, Shiki) pakai `{@attach}`; observasi sumber eksternal pakai `createSubscriber`; listener `window`/`document` pakai `<svelte:window>`/`<svelte:document>`. **Dilarang set `$state` di dalam `$effect`** kecuali benar-benar tak ada jalan lain, dan wajib dicatat + `$inspect.trace`.
- **Keyed `{#each}`** dengan key unik stabil (ID, bukan index) untuk semua list timeline/library/feed/thread.
- **`$state.raw`** untuk payload besar yang hanya di-reassign (response query, snapshot timeline) — hindari overhead proxy deep-reactivity.
- **Props diperlakukan mutable**: nilai turunan prop pakai `$derived`, jangan hitung sekali saat init.
- `children`/render-prop React → **snippet**; komponen yang menerima `ReactNode` di-port ke `Snippet` prop.

### 3.5 State management dan keamanan SSR

- **Dilarang module-level mutable state.** State reaktif di module scope bocor antar-user saat SSR (satu proses Node melayani banyak request — isu keamanan pada app ber-auth). Shared state pakai **class field `$state` di `.svelte.ts`** yang di-provide lewat **context** (`createContext`, bukan `setContext/getContext` telanjang) sehingga scoped per request/tree. Pure reducer/codec/model tetap `.ts` murni.
- **`QueryClient` per-request**, persis pola `useState(() => new QueryClient())` di `apps/web/lib/query-provider.tsx`. Jangan singleton module-level. SSR pakai `dehydrate` di server + `<HydrationBoundary>` di client.
- Viewer/identity/session state ikut aturan sama — tak ada cache sesi global; hydration test wajib memverifikasi tidak ada kebocoran lintas user.

### 3.6 Data loading — `load` vs client query

`apps/web` adalah SPA client-heavy. **Default parity = pertahankan client-side query** untuk state `/app` agar contract query key/policy/optimistic/error identik byte-for-byte. SvelteKit `load` dipakai hanya untuk yang memang SSR-first: public/SEO routes, redirect + auth gate, blog/changelog content, metadata — atau bila `load` jelas memperbaiki LCP tanpa mengubah contract.

- Argumen `create*` TanStack Svelte Query **wajib dibungkus fungsi** — `createQuery(() => ({...}))`, `createMutation(() => ({...}))`. Object polos memutus reaktivitas secara senyap. Ini gotcha porting utama dari React Query.
- Token Clerk untuk fetch di server (`+*.server.ts`/`load`/proxy) mengalir lewat **`handleFetch`** hook, bukan client `getToken`. Definisikan sekali di boundary `lib/auth`.
- Invalidation `load` pakai `depends()`/`invalidate()`; invalidation Query tetap `queryClient.invalidateQueries`. Jangan campur dua sumber kebenaran untuk data yang sama.
- Link preloading (`data-sveltekit-preload-data`) diset agar perceived-perf setara prefetch `next/link`.

### 3.7 Environment, config, dan runtime

- **Wajib `$env/dynamic/*`, bukan `$env/static/*`** untuk semua nilai runtime. Env di-inject Infisical (`infisical run`) saat container start, bukan build; `$env/static/*` di-bake saat build → nilai basi/kosong di production. Public → `$env/dynamic/public` (`PUBLIC_` prefix, boleh masuk client), rahasia server → `$env/dynamic/private` (tak boleh masuk client bundle). Semua env divalidasi saat boot.
- adapter-node butuh `ORIGIN` (atau `PROTOCOL_HEADER`/`HOST_HEADER` di belakang proxy) untuk form action/CSRF; gunakan `trustedOrigins` (`checkOrigin` deprecated).
- Library browser-only (BlockNote, EmbedPDF, Mermaid, streamdown renderer, pdf.js) rawan pecah saat SSR: butuh `ssr.noExternal` di `vite.config.ts` dan/atau dynamic import + guard `browser`/mount client-only. Ini spike Phase 1, bukan asumsi.
- Anti-flash theme: inline script kecil di `app.html` menetapkan class `.dark` sebelum paint (padanan `suppressHydrationWarning` next-themes); `mode-watcher` mengelola sisanya.

## 4. Snapshot audit `apps/web`

Snapshot ini adalah petunjuk awal, bukan angka final Phase 0:

- sekitar 420 file TypeScript/TSX di `apps/web`;
- sekitar 295 file TSX dan 37.000+ baris TSX;
- sekitar 248 file memakai `"use client"`;
- 32 file route/layout/handler utama;
- 69 file memakai API Next.js;
- integrasi React-specific terbesar: React, Next navigation/link/image, `motion/react`, Clerk Next, React Query, Radix, Streamdown React, BlockNote React, DnD Kit, React PDF, nuqs, dan Sentry Next.

CSS yang menjadi baseline visual:

- `apps/web/app/globals.css` — root/dark tokens, semantic colors, typography, animations, responsive behavior, prose/chat, table, PDF, citation highlight, scrollbar, dan component-specific selectors;
- `apps/web/app/styles/blocknote-aqsha.css` — skin editor;
- `packages/ui/src/styles/globals.css` — token/utilities shared yang perlu dibandingkan, walau package `@aqsha/ui` sendiri React-only;
- semua class/variant lokal pada `apps/web/components/**` dan `apps/web/features/**`.

### 4.1 Boundary yang tidak boleh ikut terbawa

`apps/svelte` tidak boleh mengimpor runtime `@aqsha/services`/`@aqsha/db`. Audit menemukan `apps/web/features/marketing/components/for-you-section.tsx` dan `structured-data.tsx` memakai `@aqsha/services/plan`. Phase 2 harus mempertahankan nilai/copy yang sama melalui contract browser-safe—prefer shared pure-data export atau payload API—bukan membawa service/database code ke bundle Svelte.

## 5. Target arsitektur

```text
Browser
  └─ apps/svelte (SvelteKit + adapter-node)
       ├─ public/SEO/content routes
       ├─ protected /app routes + Clerk session gate
       ├─ Eden Treaty → apps/api
       └─ /mastra-api/* streaming proxy → apps/agent

apps/api (Bun/Elysia) ── packages/services ── packages/db/Postgres
       └─ BullMQ/Redis workers

apps/agent (Node/Mastra) ── packages/services / packages/chat-core

apps/web (Next/React)
  └─ tetap hidup sebagai reference implementation dan rollback target
```

### 5.1 Struktur target `apps/svelte`

```text
apps/svelte/
├── app.d.ts
├── app.html
├── components.json
├── hooks.client.ts
├── hooks.server.ts
├── package.json
├── svelte.config.js
├── tsconfig.json
├── vite.config.ts
├── routes/
│   ├── +layout.svelte
│   ├── +layout.ts
│   ├── +error.svelte
│   ├── (public)/
│   ├── app/
│   ├── mastra-api/[...path]/+server.ts
│   ├── robots.txt/+server.ts
│   ├── sitemap.xml/+server.ts
│   └── manifest.webmanifest/+server.ts
├── lib/
│   ├── api/
│   ├── auth/
│   ├── query/
│   ├── url-state/
│   ├── errors/
│   ├── env/            # ← ditambah Phase 2: env config client-safe + validasi (§3.7)
│   ├── server/         # ← ditambah Phase 2: server-only ($lib/server enforced) — env/api/auth
│   ├── plan/           # ← ditambah Phase 2: katalog plan browser-safe (§4.1)
│   ├── icons/
│   ├── observability/
│   └── utils/
├── components/
│   ├── ui/
│   ├── layout/
│   └── ai-elements/
├── features/
│   ├── marketing/
│   ├── blog/
│   ├── changelog/
│   ├── onboarding/
│   ├── settings/
│   ├── thread-experience/
│   ├── threads/
│   ├── explore/
│   ├── discovery/
│   ├── workspaces/
│   ├── artifacts/
│   └── citations/
├── styles/
│   ├── globals.css
│   └── blocknote-aqsha.css
├── content/
├── static/
└── tests/
    ├── contracts/
    ├── e2e/
    └── visual/
```

Feature names sengaja mengikuti `apps/web` agar pencarian source→target mudah dan review mismatch dapat dilakukan per folder.

> **Adendum Phase 2 (2026-07-14):** tiga folder `lib/` ditambahkan yang tak terantisipasi di draft §5.1 semula (§5.1 ditulis framework-agnostik): `lib/server/` (satu-satunya boundary server-only yang di-enforce compiler oleh SvelteKit via konvensi `$lib/server` — memuat `env.ts`/`api.ts`/`auth.ts`; §5.1 `api/`+`auth/` datar tak bisa memuat kode server dengan aman), `lib/env/` (env config client-safe + validasi zod, §3.7; §5.1 tak punya rumah env), dan `lib/plan/` (katalog plan browser-safe, §4.1). `utils` TETAP file `lib/utils.ts` (bukan folder) mengikuti konvensi shadcn-svelte (`components.json` `"utils": "$lib/utils"`) — library-first (§3.3), jangan lawan tooling. Detail: [`migration/apps-svelte-phase2-decision-record.md`](migration/apps-svelte-phase2-decision-record.md) §1.

## 6. Peta library React/Next → Svelte

| Existing di `apps/web` | Target di `apps/svelte` | Status/ketentuan |
|---|---|---|
| Next App Router | SvelteKit filesystem routing, `load`, form actions, hooks | Native; route URL tetap identik. |
| `next/link`, `next/navigation` | `<a>`, `$app/navigation`, `$app/state` | Native; preserve replace/push/scroll/focus semantics. |
| `next/image` | SvelteKit enhanced image/Vite asset handling atau `<img>` terukur | Jangan mengubah crop, aspect ratio, loading priority, atau CLS. |
| `next/font/google` | Self-host font files + `@font-face` | Lebih deterministik; pertahankan variable names/fallbacks. |
| `@clerk/nextjs` | `svelte-clerk` di balik `lib/auth` | Community-maintained; pin exact version dan punya auth E2E. |
| `@tanstack/react-query` | `@tanstack/svelte-query` | Official TanStack adapter; query keys/policies identik. **Gotcha: `create*` argumen wajib fungsi** `createQuery(() => ({...}))`; `QueryClient` per-request; SSR via `dehydrate`+`<HydrationBoundary>`. |
| Eden Treaty client | Existing `@aqsha/api/client`/Eden core | Reuse karena fetch-based; wrapper token berubah. |
| `nuqs` | `runed` `useSearchParams` + Zod/contract codec | Dipilih setelah serializer spike; URL output harus byte-equivalent untuk state yang sama. |
| React shadcn + `radix-ui` | shadcn-svelte + Bits UI | Salin variant/class Aqsha; jangan pakai default theme secara visual. |
| `cmdk` | shadcn-svelte Command | Bits-backed. |
| `vaul` | shadcn-svelte Drawer/`vaul-svelte` | Preserve snap, overlay, Escape, focus, mobile breakpoint. |
| `frimousse` | shadcn-svelte Calendar/Date Picker | Verify locale/timezone dan keyboard behavior. |
| `sonner` | `svelte-sonner` lewat shadcn-svelte | Copy/duration/action tetap. |
| `next-themes` | `mode-watcher` | `.dark`, system theme, hydration-safe. |
| `@aqsha/ui/icons` | local `lib/icons` backed `@hugeicons/svelte` | Mapping nama/icon/stroke harus sama; no Lucide. **Gotcha: shadcn-svelte `add` menuntun import `@lucide/svelte`** (dari `components.json.iconLibrary`) — setiap komponen yang di-generate wajib di-rewrite ke `lib/icons`; lint melarang import `@lucide/svelte` langsung di kode Aqsha (boleh transitif seperti web). |
| `motion/react` | Svelte transitions/animate + `motion` JS | Simpan duration/easing/spring constants dari source. |
| `streamdown` + plugins | `svelte-streamdown` | Kandidat utama; wajib spike dan fixture parity. |
| `use-stick-to-bottom` | `stick-to-bottom-svelte` atau `@humanspeak/svelte-virtual-chat` | Jangan tambah virtualization bila mengubah behavior; pilih lewat long-thread spike. |
| `@dnd-kit/core` | `svelte-dnd-action` | Accessibility, drag overlay, folder drop, touch, auto-scroll diuji. |
| `react-pdf` + `pdfjs-dist` | EmbedPDF Svelte | Gunakan custom UI/theme; preserve citation link/fallback. |
| `qrcode.react` | `@svelte-put/qr` | Prefer helper SVG/data URL; visual snapshot untuk QR 2FA. |
| `@content-collections/next` + MDX React | `@content-collections/vite` + `mdsvex` | Schema/frontmatter/ordering/slug sama. |
| `@sentry/nextjs` | `@sentry/sveltekit` | Client/server hooks, release, environment, source maps, tunnel parity. |
| `@blocknote/react`, `@blocknote/shadcn`, XL AI | `@blocknote/core` + Svelte adapter | Fase terakhir; persisted JSON/schema/AI review/citation tidak boleh berubah. |
| `agentation` | dev-only `agentation-svelte` bila lolos audit | Bukan runtime feature; jangan ship ke production. |
| `date-fns`, Zod, nanoid, Mermaid, Shiki, D3, clsx, CVA, tailwind-merge | Tetap dipakai | Framework-agnostic. |

### 6.1 Library gate

Sebelum dependency masuk lockfile, catat versi, release terakhir, license, Svelte 5 support, SSR behavior, tree-shaking, browser support, open security issue, fixture Aqsha yang berhasil/gagal, dan fallback bila package berhenti terawat. Untuk tiap package yang punya sisi browser-only atau ship CJS/tanpa ESM (BlockNote, EmbedPDF, Mermaid, streamdown), catat keputusan `ssr.noExternal` vs dynamic import + guard `browser`, karena default SSR SvelteKit akan mengeksekusinya di server.

## 7. Route parity map

Rest parameter SvelteKit `[...rest]` juga dapat match kosong ketika berada di ujung route, sehingga dapat menggantikan optional catch-all Next untuk Clerk.

| URL | Source `apps/web` | Target `apps/svelte` |
|---|---|---|
| `/` | `app/page.tsx`, `features/marketing/**` | `routes/(public)/+page.svelte`, `features/marketing/**` |
| `/sign-in/*` | `app/sign-in/[[...rest]]/page.tsx` | `routes/(auth)/sign-in/[...rest]/+page.svelte` |
| `/sign-up/*` | `app/sign-up/[[...rest]]/page.tsx` | `routes/(auth)/sign-up/[...rest]/+page.svelte` |
| `/onboarding` | `app/onboarding/**`, `features/onboarding/**` | `routes/onboarding/+page.svelte`, `features/onboarding/**` |
| `/blog` | `app/blog/page.tsx`, `features/blog/**` | `routes/(content)/blog/+page.svelte` |
| `/blog/[slug]` | `app/blog/[slug]/page.tsx`, `components/mdx-components.tsx` | `routes/(content)/blog/[slug]/+page.{server.ts,svelte}` |
| `/changelog` | `app/changelog/page.tsx`, `features/changelog/**` | `routes/(content)/changelog/+page.svelte` |
| `/changelog/[slug]` | `app/changelog/[slug]/page.tsx` | `routes/(content)/changelog/[slug]/+page.{server.ts,svelte}` |
| `/app` | `app/app/(product)/page.tsx`, thread experience | `routes/app/(product)/+page.svelte` |
| `/app/threads` | redirect page | `routes/app/(product)/threads/+page.server.ts` redirect |
| `/app/threads/[threadId]` | `app/app/(product)/threads/[threadId]/**` | equivalent Svelte route |
| `/app/explore` | route + `features/explore/**` | equivalent Svelte route |
| `/app/explore/[paperRef]` | route + discovery paper reader | equivalent Svelte route |
| `/app/explore/n/[id]` | route + news reader | equivalent Svelte route |
| `/app/workspaces` | route + `workspaces-index-page.tsx` | equivalent Svelte route |
| `/app/workspaces/[workspaceId]` | route + workspace detail | equivalent Svelte route |
| `/app/workspaces/[workspaceId]/artifacts/[artifactId]` | route + artifact reader shell | equivalent Svelte route |
| `/app/settings` | redirect page | `routes/app/settings/+page.server.ts` redirect |
| `/app/settings/overview` | page + `overview-page.tsx` | equivalent Svelte route |
| `/app/settings/account` | page + `account-page.tsx` | equivalent Svelte route |
| `/app/settings/appearance` | page + `appearance-page.tsx` | equivalent Svelte route |
| `/app/settings/integrations` | page + `integrations-page.tsx` | equivalent Svelte route |
| `/app/settings/personalization` | page + `personalization-page.tsx` | equivalent Svelte route |
| `/app/settings/security` | page + `security-page.tsx` | equivalent Svelte route |
| `/app/settings/usage-billing` | page + `usage-billing-page.tsx` | equivalent Svelte route |
| `/mastra-api/[...path]` | `app/mastra-api/[...path]/route.ts` | `routes/mastra-api/[...path]/+server.ts` |
| SEO/static handlers | `robots.ts`, `sitemap.ts`, `manifest.ts`, icons, OG/Twitter images | `+server.ts`/static assets; output snapshot identik |
| global error/not found | `error.tsx`, `global-error.tsx`, `not-found.tsx` | root/nested `+error.svelte` + Sentry capture |

## 8. Feature parity ledger

Ledger ini menjadi minimum scope. Phase 0 mengubahnya menjadi file machine-readable yang berisi owner phase, source files, target files, fixtures, screenshot IDs, dan status.

### 8.1 App foundation dan shared chrome

Source utama:

- `apps/web/app/layout.tsx`, `app/app/layout.tsx`, `app/app/(product)/layout.tsx`
- `apps/web/components/app-shell.tsx`, `app-sidebar.tsx`, `nav-user.tsx`
- theme, onboarding gate, authenticated user sync, toaster, loading overlay
- `apps/web/components/layout/**`

Parity: protected `/app`, redirects, onboarding gate, user sync, desktop/mobile sidebar, collapsed cookie, nav/user menu, detail split, side-panel expand/collapse, responsive drawer, container queries, provider order, loading/error surfaces.

### 8.2 Marketing, blog, changelog, SEO

Source utama:

- `apps/web/features/marketing/**`, `features/blog/**`, `features/changelog/**`
- `apps/web/content-collections.ts`, `components/mdx-components.tsx`
- `apps/web/lib/metadata.ts`, `seo-config.ts`
- root OG/Twitter/sitemap/robots/manifest handlers.

Parity: seluruh landing section/interaction/copy, list/detail konten, categories/dates/prose/code, canonical/OG/Twitter/JSON-LD, sitemap/robots/manifest/icon, dan public plan catalog.

### 8.3 Onboarding

Source: `apps/web/app/onboarding/**`, `apps/web/features/onboarding/**`.

Parity: steps background/interests/source/finish, minimum tiga interest, validation/progress/back-next, resume, auth redirects, completion route.

### 8.4 Settings dan account lifecycle

Source: `apps/web/features/settings/api.ts`, `components/**`, `security/**`, `lib/**`.

Parity: overview/account/appearance/personalization; name/interests/preferences; sign-out/delete; usage/current plan/checkout/portal/change/cancel; password/2FA/reverification/sessions; Mendeley/Zotero connect/callback/status/refresh/disconnect; rail/mobile/copy/dialog/toast.

### 8.5 Thread experience dan Astra chat

Source utama:

- `apps/web/features/thread-experience/**`, `features/threads/**`
- `apps/web/components/ai-elements/**`, `components/thread-shell.tsx`
- `apps/web/app/mastra-api/[...path]/route.ts`
- `apps/web/lib/context-selection.ts`, `document-edit-bus.ts`.

Parity:

- thread recent/pinned/create/rename/pin/delete;
- Lite/Pro, composer contenteditable token chips, slash command, mentions, pinned context, attachments;
- durable Mastra `/deep`, subscribe/observe/abort/reconnect/revive/settle/regenerate/failure/notices;
- 400-message history seed, timeline reducer, send status/cooldown/rate/billing;
- reasoning/plan/HITL/search/tool/source/reference download/analysis export;
- panels dan URL serialization;
- citation, stats-viz, deep-viz, GFM/table/Shiki/math/Mermaid/CJK/caret;
- scroll anchoring, follow-bottom, long thread, reduced motion.

Pure/model modules seperti `features/threads/lib/mastra-timeline.ts`, panel codecs, attachment buckets, citation/stats/viz transforms, dan `@aqsha/chat-core` dipindah/reuse sebelum UI. React hooks/views dipisahkan dari pure logic.

### 8.6 Explore dan discovery

Source: `apps/web/features/explore/**`, `features/discovery/**`, explore routes.

Parity: home bento, feed/search/suggestion, URL state, card variants, house ads, record/hide interaction, paper/news reader, related, PDF thumb, Ask Astra context/side panel, ID/reference resolution, loading/error/not-found.

### 8.7 Workspaces dan library

Source:

- `apps/web/features/workspaces/**`, workspace routes
- `apps/web/components/library-*`
- `apps/web/lib/library-grid.ts`, upload limits/policy, panel surface.

Parity:

- list/create/update/archive workspace;
- root/folder board, one-level folders, breadcrumb, search/filter/sort/group;
- folder/artifact create/rename/move/delete;
- grid/card/context menu/multi-select/marquee/keyboard/DnD;
- upload max 20, concurrency 3, per-file progress, continue-on-failure, retry failed only, MIME policy;
- upload toast dan enrichment/extraction status;
- panel URL state `chat`, `cite`, `cite:<id>`;
- artifact reader page/panel, title/metadata/Markdown/document/Mermaid/PDF/delete;
- responsive panel dan Ask Astra selection.

### 8.8 Artifacts dan Citation Manager

Source: `apps/web/features/artifacts/**`, `features/citations/**`, `components/citation/**`, dan citation/artifact portions di workspaces.

Parity artifacts: list/context/detail/render, create/update/rename/move/delete, save/retry URL, upload/link, citation format, save-to-workspace.

Parity Citation Manager: list/filter/tags/detail/CRUD/restore, DOI/artifact creation, copy, bulk actions, duplicates/merge, `.bib`/`.ris` preview→commit, BibTeX/RIS/CSL JSON export, provider folders/sync preview→commit, style/document render/provenance/linked artifact, empty/missing/deleted states, panel deep links.

### 8.9 BlockNote editor — fase terakhir

Source:

- `blocknote-document-editor.tsx`, `blocknote-editor-loader.tsx`
- `blocknote-citation-schema.tsx`, `blocknote-citation-store.ts`
- `citation-picker-dialog.tsx`
- `apps/web/app/styles/blocknote-aqsha.css`
- `features/workspaces/utils/artifact-editor-model.ts`.

Parity:

- existing `blocksJson`, Markdown, plain text tanpa data migration;
- editing/toolbar/link/slash/side-menu/table/file UI yang dipakai;
- inline `citation` dan block `bibliography` dengan schema/props/node ID sama;
- citation picker/locator/missing/bibliography;
- autosave/debounce/saved/error/unmount flush/reconciliation;
- XL AI transport, Ask Astra selection, AI streaming edit, accept/reject;
- keyboard/paste/undo/redo/mobile/dark/export compatibility.

## 9. Strategi CSS dan visual parity

### 9.1 Golden CSS contract

1. Salin `apps/web/app/globals.css` sebagai starting point `apps/svelte/styles/globals.css`.
2. Jangan membersihkan token/class selama migrasi.
3. Pertahankan `:root`, `.dark`, `@theme inline`, variants, typography, shadows, colors, scrollbar, prose, panel, composer, viz, shimmer, reduced-motion.
4. Ganti hanya import/selector framework-specific: React BlockNote, `.react-pdf__*`, dan `[data-streamdown]` bila output Svelte berbeda.
5. Tambah `@source` file `.svelte`/registry yang benar; jangan memakai default palette/radius shadcn bila berbeda.

### 9.2 Primitive port order

1. Button, badge, card, input, textarea, separator, skeleton, spinner, avatar.
2. Tooltip, popover, hover card, collapsible.
3. Dialog, sheet, drawer, dropdown/context menu, select, command.
4. Tabs, scroll area, sidebar, input-group, link preview.
5. Announcement, flicker spinner, confirm dialog, panel controls.

Setiap primitive harus menyalin variant/default, DOM role/ARIA/data-state, portal/z-index, focus/Escape/outside-click; memiliki fixture semua states; dan lolos visual diff serta keyboard test light/dark.

### 9.3 Visual regression matrix

Viewport minimum: 390×844, 768×1024, 1280×800, 1536×960, serta panel expanded/collapsed. Themes/states minimum: light/dark; default/hover/focus/active/disabled/open/loading/error/empty; content pendek/panjang/CJK; reduced motion.

Gate (di-downgrade per §0 #4, nol user): **eyeball diff terhadap screenshot reference web** + segelintir Playwright screenshot untuk sanity — **bukan** pixel-diff blocking. Yang tetap diperiksa manual: layout jelas melenceng, wrapping/overflow rusak, focus ring hilang, overlay/z-index kacau, animation kritis patah. Perbedaan minor bukan blocker.

## 10. Fase implementasi terurut

Tidak boleh mulai fase berikutnya bila gate yang menjadi dependency-nya gagal.

### 10.1 Quick source index per phase

Tabel ini adalah entry point pencarian. Agent tetap wajib menjalankan `rg` untuk consumer/transitive dependency sebelum mengubah target.

| Phase | Entry modules di `apps/web` |
|---|---|
| 0 | `app/**`, `components/**`, `features/**`, `lib/**`, `package.json`, `next.config.ts`, `content-collections.ts`, `proxy.ts`, instrumentation/Sentry files |
| 1 | `package.json`, `components.json`, `app/globals.css`, `app/mastra-api/[...path]/route.ts`, `features/threads/lib/citation-markdown.ts`, `features/workspaces/components/pdf-artifact-viewer.tsx`, `blocknote-document-editor.tsx` |
| 2 | `lib/api*.ts`, `lib/api-query.ts`, `lib/api-error.ts`, `lib/auth-server.ts`, `lib/query-provider.tsx`, `lib/use-viewer-identity.ts`, `proxy.ts`, `app/mastra-api/[...path]/route.ts`, Sentry config/instrumentation |
| 3 | `app/globals.css`, `app/styles/**`, `components/ui/**`, `components/app-shell.tsx`, `components/app-sidebar.tsx`, `components/nav-user.tsx`, `components/layout/**`, theme/toast/loading components |
| 4 | `app/page.tsx`, `app/sign-in/**`, `app/sign-up/**`, `app/blog/**`, `app/changelog/**`, `features/marketing/**`, `features/blog/**`, `features/changelog/**`, `components/mdx-components.tsx`, `lib/metadata.ts`, `lib/seo-config.ts` |
| 5 | `app/onboarding/**`, `features/onboarding/**`, `app/app/settings/**`, `features/settings/**` |
| 6 | `features/threads/lib/**`, `components/ai-elements/**`, `lib/context-selection.ts`, `lib/document-edit-bus.ts`, `app/mastra-api/[...path]/route.ts` |
| 7 | `features/thread-experience/**`, `features/threads/components/**`, `features/threads/api.ts`, `components/thread-shell.tsx`, `components/ai-elements/**` |
| 8 | `app/app/(product)/explore/**`, `features/explore/**`, `features/discovery/**` |
| 9 | `app/app/(product)/workspaces/**`, `features/workspaces/**` selain BlockNote editor, `features/artifacts/**`, `features/citations/**`, `components/library-*`, `components/citation/**`, upload/library helpers |
| 10 | `features/workspaces/components/blocknote-*`, `citation-picker-dialog.tsx`, `features/workspaces/utils/artifact-editor-model.ts`, `app/styles/blocknote-aqsha.css`, artifact/citation APIs |
| 11 | seluruh target ledger + semua existing tests di `apps/web`; config CSS/build/Sentry/deployment untuk cross-app comparison |
| 12 | `next.config.ts`, web Docker/Compose/CI/Dokploy definitions, env examples, proxy/Sentry config, root scripts sebagai deployment baseline |

### Phase 0 — Bekukan baseline dan buat parity harness

Source audit: seluruh `apps/web/app`, `components`, `features`, `lib`, public/assets, package/config/content/Sentry, root scripts/deployment, API client/contracts, `@aqsha/chat-core`.

Disederhanakan per §0 (web freeze + agent-sequential + lean): **tanpa** golden video, cross-app pixel same-suite, drift policy, atau pilihan dual-maintenance (freeze sudah diputuskan).

Pekerjaan:

1. **Freeze `apps/web`** dan kunci satu commit reference.
2. Generate route, import, feature, dan env manifest (entry point pencarian source→target untuk agent).
3. Buat `docs/migration/apps-svelte-parity-ledger.md` — checklist scope Markdown: route, source/target module, phase, status, notes. Bukan sistem klaim konkuren (eksekusi sequential, satu owner).
4. Simpan network/payload fixtures correctness-critical tanpa secret/PII (timeline, citation export, upload).
5. Ambil beberapa screenshot reference web per surface untuk **eyeball diff** (bukan pixel-gate).

Gate: 100% route/feature ada di ledger; web ter-freeze & commit reference tercatat; hanya harness/doc berubah.

### Phase 1 — Scaffold `apps/svelte` dan compatibility spikes

1. Buat `@aqsha/svelte` dengan Svelte 5/SvelteKit/adapter-node/strict TS/ESLint/Prettier/Vitest/Testing Library/Playwright.
2. Uji no-`src` via `kit.files.src: "."` terhadap routes, aliases, Content Collections, shadcn CLI, Sentry, adapter-node; catat deprecation.
3. Tambah root scripts additive `dev:svelte`, `build:svelte`, `start:svelte`; jangan ganti defaults.
4. Install skill implementasi `bun x skills add huntabyte/shadcn-svelte`; skill membaca target `components.json`.
5. Konfigurasi Tailwind v4/aliases/CSS/style terdekat `radix-nova`, tetapi visual ditentukan CSS Aqsha.
6. Copy/share static assets dan self-host fonts secara traceable.

Spikes wajib: Clerk SSR/token/2FA/reverification (+ evaluasi fallback direct `@clerk/clerk-js`); Eden + Svelte Query (per-request client + `dehydrate`/`HydrationBoundary` + reactive-options); raw Mastra streaming; Svelte Streamdown custom renderer/security; long-thread anchoring; EmbedPDF; DnD; Content Collections+mdsvex; BlockNote core mount/event feasibility; **composer contenteditable + token chip** (contenteditable Svelte + `bind`/function binding + caret/IME/CJK — salah satu bagian tersulit, jangan diasumsikan trivial); **`$env/dynamic/*` runtime injection** end-to-end lewat Infisical di container; **`ssr.noExternal` / browser-only mount** untuk BlockNote/EmbedPDF/Mermaid/streamdown; **shadcn-svelte `add` → rewrite import ikon ke `lib/icons`**.

Spike wajib berbentuk **satu vertical slice tersambung** (bukan eksperimen terpisah): `sign-in svelte-clerk → buka satu thread → kirim pesan → Mastra stream live → streamdown render`. Throwaway, tapi end-to-end di path nyata. Sekalian **ukur konsumsi resource dev SvelteKit vs Next** pada slice ini untuk memvalidasi driver dengan angka.

**Gerbang GO/NO-GO keras (§0 #6):** akhir Phase 1 = keputusan lanjut/batal untuk SELURUH migrasi. NO-GO bila salah satu dealbreaker gagal — `svelte-clerk` (SSR token/2FA/reverification, setelah menempuh tangga fallback §0 #7), raw Mastra streaming, atau `svelte-streamdown` parity/security. Bila NO-GO → **batalkan setelah ~1 minggu**, jangan dipaksakan.

Gate teknis: lint/typecheck/test/build hijau; adapter-node starts/healthchecks; decision record setiap spike; no React production dependency; no-`src` plugins aman atau (rekomendasi §2) pakai `src/`.

### Phase 2 — Platform foundation, API, auth, env, observability

Source:

- `apps/web/lib/api-client.ts`, `api-server.ts`, `api.ts`, `api-query.ts`, `api-error.ts`
- auth/viewer/query provider/proxy/Mastra route
- Sentry config/instrumentation dan layouts/env/deployment.

Pekerjaan:

1. Port API client/server/query/unwrap/error normalization.
2. Inject Clerk token per request; jangan pakai singleton lintas session.
3. Auth facade `getAuth`, `requireUser`, `getToken`, signed states, user/session/reverification.
4. `hooks.server.ts` session + protected `/app` + onboarding server gate.
5. Map public env ke `PUBLIC_*` via `$env/dynamic/public`; rahasia via `$env/dynamic/private`; **jangan `$env/static/*`** (env di-inject runtime oleh Infisical, bukan build); validasi semua saat boot.
6. Port proxy GET/POST/PATCH/PUT/DELETE, auth/header rules, no compression/buffering/idle timeout, abort propagation.
7. Port Sentry SvelteKit hooks/release/env/redaction/source maps/tunnel.
8. Port query key registry/policies.
9. Selesaikan browser-safe public plan catalog tanpa services/db import.

Gate: auth matrix, cross-user cache, normalized errors, proxy first-byte/idle/abort/reconnect/header/large payload, dan Sentry source-map staging hijau.

### Phase 3 — Design system, theme, shell, layout

Source: golden CSS, `apps/web/components/ui/**`, `packages/ui` sebagai visual/icon reference, app shell/sidebar/layout files.

Pekerjaan: port CSS/fonts, shadcn-svelte/Bits primitives, Hugeicons adapter/gallery, theme tanpa flash, shell/sidebar/nav/panels/loading/errors, URL/cookie persistence, motion/reduced-motion.

Gate: primitive visual/a11y, shell screenshots semua viewports/themes, keyboard/focus/layering/body lock; tidak ada React/Radix React/Lucide/direct React UI imports.

### Phase 4 — Public routes, auth screens, blog/changelog, SEO

Port landing per section, Clerk screens, collection schema/renderer/list/detail, metadata/JSON-LD/OG/Twitter/sitemap/robots/manifest/icons. Preview deployment `noindex` sampai cutover.

Gate: content/metadata snapshots, public links/redirects, CSP/sanitization, Lighthouse a11y/SEO tidak lebih buruk.

### Phase 5 — Onboarding dan Settings

Port onboarding state machine, all settings routes, billing, Clerk password/2FA/reverification/sessions, QR via `@svelte-put/qr`, provider integrations, delete/sign-out.

Gate: onboarding resume, Clerk test-instance account/security, billing/provider fixtures, visual/a11y semua settings.

### Phase 6 — Thread model, streaming renderer, chat core

Source utama:

- `features/threads/lib/mastra-client.ts`, `use-mastra-agent.ts`, `mastra-timeline.ts`
- `citation-markdown.ts`, `stats-markdown.ts`, `viz-markdown.ts`
- AI message/response/citation/table/code/reasoning components.

Pekerjaan:

1. Ekstrak/reuse reducers/codecs pure TS dan port tests dahulu.
2. Svelte state layer memisahkan durable/query/URL/ephemeral state.
3. Integrasikan Mastra dan exact event ordering/idempotency.
4. Buat Svelte Streamdown adapter + citation/stats/deep-viz components.
5. Preserve sanitize/harden; jangan melonggarkan untuk custom tags.
6. Port conversation viewport/anchoring via pemenang Phase 1.
7. Stress test malformed/incomplete/high-frequency/long history/reconnect.

Gate: timeline fixture output sama, Markdown visual/semantic corpus setara, XSS tests, no duplicate/lost messages, memory/CPU/scroll tidak material lebih buruk.

### Phase 7 — Thread experience UI dan full Astra flows

Port home/recent/thread shell, composer/token/slash/mentions/context/attachments/agent selector, messages/tools/sources/artifacts/export, URL panels/responsive drawer, `/deep` plan/HITL/search/stats/viz/results, rate/billing/access states, durable reload/abort/regenerate/revive.

Gate: critical chat E2E 100% kedua apps, visual diff panels, byte/filename downloads, keyboard composer, production-like `/deep` staging soak.

### Phase 8 — Explore dan discovery

Port Explore/search/topic URL, feed/cards/ads/interactions, paper/news readers/related/PDF thumb, Ask Astra context, error/not-found semantics.

Gate: feed fixture output, Back/Forward/refresh, all card/reader visual variants, exact Ask Astra payload.

### Phase 9 — Workspaces, library, artifacts, citations, PDF

Exclude editable BlockNote. Urutan internal:

1. data/query/models;
2. workspace CRUD;
3. board/root/folder/search/filter/sort;
4. selection/marquee/context menu;
5. DnD/move/drop;
6. upload queue/toast/retry;
7. artifact renderers;
8. Citation Manager/import/export/duplicates/sync;
9. workspace chat/citation panel;
10. EmbedPDF + citation links.

Gate: model tests, upload max/concurrency/progress/failure/retry, DnD mouse/touch/keyboard, citation bytes/filenames, provider flows, PDF zoom/search/link/theme parity. Preview may mark document editing read-only, tetapi bukan cutover candidate.

### Phase 10 — BlockNote Svelte adapter dan document editing

1. Pin schema-compatible `@blocknote/core`; no simultaneous format upgrade.
2. Browser-only mount/unmount dan cleanup subscriptions.
3. Svelte UI via official vanilla events: formatting/link/file/side/suggestion/table UI yang dipakai.
4. Port citation/bibliography tanpa serialized prop changes.
5. Per-editor citation store, bukan global.
6. Port picker/slash/usage reconciliation.
7. Port autosave/flush/error/document edit bus.
8. Integrate AI core/transport + Svelte accept/reject UI bila React XL UI tidak reusable.
9. Round-trip React→Svelte→React dan Svelte→React→Svelte untuk document corpus.

Gate: zero-loss round-trip 100%, editor/autosave/citation tests, paste/undo/slash/citation/AI E2E, visual editor parity, no React runtime island, no database/document migration.

Rollback selama preview boleh mengarahkan edit ke web; production cutover dilarang sebelum editor gate hijau.

### Phase 11 — Full parity dan hardening

Di-lean-kan per §0 #4/#5 (nol user): tanpa soak 7 hari, tanpa full visual-regression blocking.

1. Ledger 100%; `not-applicable` perlu persetujuan owner.
2. ~10 E2E happy-path kritis hijau (§11.3).
3. Eyeball visual sanity per surface (bukan pixel-gate).
4. Axe = **warning**; keyboard/focus dicek manual pada flow kritis (composer, dialog, sidebar).
5. **Security audit tetap wajib** (hygiene pra-launch): auth/token/env/XSS/upload/redirect/CSRF/proxy — bukan soal user, tapi soal benar.
6. Bandingkan bundle + resource dev SvelteKit vs Next (validasi driver §0; angka utama sudah dari Phase 1).
7. Sentry client/server hooks + source maps terverifikasi.
8. Dependency/license/maintenance audit (peta library §6.1).
9. Degraded tests API/agent/stream/upload/provider.

Gate: no P0/P1 functional mismatch, semua commands hijau, no critical regression, security audit bersih.

### Phase 12 — Deploy dan cutover (disederhanakan)

Dipangkas drastis per §0 #5 (nol user → tak ada canary/shadow/soak/warm-rollback/rollback-trigger). Yang tersisa:

1. Service Docker/Compose/Dokploy Svelte terpisah (adapter-node); build workspace deps, non-root, health/readiness, graceful shutdown streams, bebas secret di client artifact.
2. Configure adapter-node `ORIGIN`/`PROTOCOL_HEADER`/`HOST_HEADER` + `trustedOrigins`; env via `$env/dynamic/*` (Infisical runtime, §3.7).
3. Deploy ke **subdomain internal** dengan API/agent yang sama + cookie/domain aman; **dogfood sendiri**.
4. **Flip domain** saat puas (owner sign-off). `apps/web` dihentikan; disimpan di git sebagai reference sampai keputusan hapus terpisah.
5. Ubah root defaults (`dev`/`build`) via PR terpisah, bukan bagian cutover.

## 11. Strategi test

### 11.1 Existing tests yang diprioritaskan

- thread experience model/auth/cache/rate tests;
- Citation Manager export content/filename/blob;
- workspace upload max/concurrency/progress/failure/retry/type;
- BlockNote parse/plain-text/autosave;
- marquee selection;
- artifact citation;
- library grouping/move/root/folder/filter/sort/search;
- workspace panel URL;
- paper metadata.

Pure tests tidak bergantung DOM Svelte. Component/interaction tests memakai **`vitest-browser-svelte`** (rekomendasi resmi tim Svelte saat ini, menggantikan `@testing-library/svelte` yang berbasis jsdom); browser/visual/E2E memakai Playwright.

### 11.2 Contract tests lintas framework

Input sama harus menghasilkan URL serialization, API path/body/header/error, timeline order, citation/export bytes/filename, upload transitions, BlockNote JSON/Markdown/plain text, metadata/SEO output, CSS tokens dan key geometry yang sama.

### 11.3 Critical E2E suite

1. landing → sign-up/sign-in;
2. onboarding/resume;
3. create/send thread → durable stream → reload/continue;
4. `/deep` plan/HITL/result/references/export;
5. explore → reader → Ask Astra;
6. workspace/folder → multi-upload/retry/move/drag;
7. artifact/PDF;
8. Citation import/merge/export/provider sync;
9. document citation/bibliography/AI/autosave/reopen;
10. profile/security/2FA/session/billing/integrations/delete.

## 12. CI, scripts, deployment

Additive scripts dahulu:

```text
dev:svelte       bun run --filter '@aqsha/svelte' dev
build:svelte     bun run --filter '@aqsha/svelte' build
start:svelte     bun run --filter '@aqsha/svelte' start
lint:svelte      bun run --filter '@aqsha/svelte' lint
typecheck:svelte bun run --filter '@aqsha/svelte' typecheck
test:svelte      bun run --filter '@aqsha/svelte' test
```

Root lint/typecheck/test boleh memasukkan Svelte setelah scaffold stabil. Root production build/dev tidak diganti sampai cutover PR.

Image Svelte harus build workspace deps, menghasilkan adapter-node, run non-root, membawa static/source maps sesuai policy, expose health/readiness, graceful shutdown streams, dan bebas secret pada client artifacts.

## 13. Risk register

| Risiko | Dampak | Mitigasi/gate |
|---|---|---|
| Clerk adapter community tertinggal | Auth/security blocker | `lib/auth`, exact pin, SSR/token/2FA/reverification E2E, fallback direct Clerk JS evaluation. |
| `kit.files.src` deprecated | No-`src` dapat rusak | Spike + pin; perubahan struktur perlu keputusan eksplisit. |
| Svelte Streamdown mismatch | Citation/viz/security/streaming rusak | Corpus/custom hooks/security tests; fallback `@humanspeak/svelte-markdown` + thin adapter. |
| BlockNote React-first | Custom work/data loss | Last phase, vanilla core, round-trip corpus, no format upgrade. |
| EmbedPDF UI berbeda | Reader regression | Custom toolbar/theme/tests; fallback direct PDF.js adapter. |
| DnD semantics berbeda | Salah move/a11y | Pure model, keyboard/touch/drop tests, optimistic rollback. |
| URL codec berbeda | Deep link/back-forward rusak | Byte-equivalent codec tests. |
| Moving target web | Feature hilang | Web **di-freeze total** (§0 #3) + commit reference + ledger. |
| Framework CSS selector | Hidden visual drift | Selector inventory/computed style/visual diff. |
| React-only `@aqsha/ui` | React bundle bocor | Svelte local UI/icon adapter; only pure CSS/data reuse. |
| SSR/query cache leakage | Cross-user/stale data | Per-request client/hydration tests/no global session cache. |
| Proxy buffering/timeout | Chat/deep macet | First-byte/idle/abort/reconnect tests + proxy config. |
| `useEffect`→`$effect` porting reflex | Reaktivitas over-fire/loop/bug senyap | Runes standard §3.4; lint anti-legacy; `$derived`/`{@attach}` default; review menolak `$effect` yang set state. |
| Module-level state SSR leak | Data user bocor lintas request | Context + `.svelte.ts` §3.5; per-request QueryClient; hydration cross-user test. |
| `$env/static` di-bake saat build | Env prod basi/kosong | Wajib `$env/dynamic/*`; smoke test container membaca env Infisical runtime. |
| SSR-eksekusi library browser-only | Build/hydration crash (BlockNote/PDF/Mermaid) | Spike `ssr.noExternal`/dynamic import + guard `browser`; gate mount client-only. |
| shadcn-svelte membawa `@lucide/svelte` | Bocor Lucide, langgar kontrak ikon | Rewrite import ke `lib/icons` tiap `add`; lint larang import langsung. |
| TanStack `create*` object polos | Query tak reaktif senyap | Contract/lint: argumen wajib fungsi `() => ({...})`. |

## 14. Urutan PR yang disarankan

1. Baseline manifests + parity harness.
2. Scaffold, CI, adapter-node, spikes.
3. API/auth/query/env/Sentry/proxy.
4. CSS + primitive batch 1.
5. Overlay/menu/form primitives + shell.
6. Public/auth/blog/changelog/SEO.
7. Onboarding/settings/security/billing/integrations.
8. Pure timeline/URL/models + contracts.
9. Streaming Markdown/chat core.
10. Composer/thread/panels.
11. `/deep`/HITL/viz/sources/export.
12. Explore/discovery.
13. Workspace/library/upload/DnD.
14. Artifacts/Citations/PDF.
15. BlockNote core adapter.
16. BlockNote citation/AI/autosave.
17. Lean hardening (§11 di-lean-kan).
18. Deploy subdomain → dogfood → flip domain (§12 disederhanakan).

Jangan gabungkan cutover dengan BlockNote implementation atau dependency major upgrades. **Ingat gerbang go/no-go Phase 1** sebelum berkomitmen ke PR 3+.

## 15. Petunjuk agent pelaksana

Sebelum setiap phase:

1. Baca `AGENTS.md` dan phase ini.
2. Audit ulang source path; code lebih authoritative dari plan.
3. Cari seluruh imports/consumers/tests/CSS dengan `rg`.
4. Klaim stable IDs di ledger.
5. Jalankan Web baseline dan ambil screenshots/interaction notes.
6. Cek local shadcn docs/registry/Bits/Svelte packages sebelum custom code.
7. Port pure tests/model sebelum view.
8. Jangan ubah copy/layout/token/motion/route/API/persisted format tanpa approval.
9. Jangan memperbaiki bug existing diam-diam; catat parity bug atau follow-up dua-app.
10. Update ledger, mapping, screenshots, dan verification di PR.

Per ledger item wajib ada source/target modules, tests sesuai risiko, visual/a11y, loading/error/degraded, URL/API persistence, tanpa flag/TODO yang menyembunyikan gap, dan review `parity-complete`.

## 16. Definition of Done migrasi

1. Gerbang go/no-go Phase 1 = GO (§0 #6).
2. Semua route §7 punya URL/auth/loading/error/redirect yang sama; SEO/metadata untuk route publik.
3. Semua feature §8 `parity-complete` secara **fungsional** (jalan + terlihat benar, bukan pixel-identik).
4. BlockNote React↔Svelte round-trip zero loss.
5. Pure/contract test correctness-critical + ~10 E2E happy-path + lint/typecheck/build hijau (axe = warning, bukan blocking; §0 #4).
6. Kode Svelte idiomatik (§3.4–3.7): tak ada legacy-mode, tak ada `$effect` abuse, tak ada module-level state, tak ada React/Radix-React/direct-Lucide import.
7. Cutover subdomain→domain selesai; `apps/web` dihentikan, disimpan di git sebagai reference (dihapus di pekerjaan terpisah).
8. Perubahan default runtime/root scripts dilakukan pada cutover PR terpisah.

## 17. Referensi riset

Periksa ulang current version pada Phase 1:

- SvelteKit routing: <https://svelte.dev/docs/kit/advanced-routing>
- SvelteKit configuration: <https://svelte.dev/docs/kit/configuration>
- SvelteKit adapter-node: <https://svelte.dev/docs/kit/adapter-node>
- shadcn-svelte skill: <https://www.shadcn-svelte.com/docs/skills>
- shadcn-svelte dark mode: <https://www.shadcn-svelte.com/docs/dark-mode/svelte>
- Bits UI: <https://www.bits-ui.com/docs/components>
- Clerk SDK/community adapters: <https://clerk.com/docs/reference/overview>
- Clerk Svelte adapter: <https://github.com/wobsoriano/svelte-clerk>
- TanStack Query Svelte: <https://tanstack.com/query/latest/docs/framework/svelte/overview>
- AI SDK Svelte: <https://ai-sdk.dev/docs/getting-started/svelte>
- Sentry SvelteKit: <https://docs.sentry.io/platforms/javascript/guides/sveltekit/>
- Hugeicons Svelte: <https://hugeicons.com/docs/integrations/svelte/overview>
- Runed URL state: <https://runed.dev/docs/utilities/use-search-params>
- Svelte Streamdown: <https://github.com/beynar/svelte-streamdown>
- fallback renderer: <https://github.com/humanspeak/svelte-markdown>
- Svelte DnD Action: <https://github.com/isaacHagoel/svelte-dnd-action>
- EmbedPDF Svelte: <https://www.embedpdf.com/docs/svelte/viewer/getting-started>
- Svelte QR: <https://svelte-put.vnphanquang.com/docs/qr>
- BlockNote vanilla: <https://www.blocknotejs.org/docs/getting-started/vanilla-js>
- Content Collections Vite: <https://www.content-collections.dev/docs/quickstart/vite>
- SvelteKit `$env` (dynamic vs static): <https://svelte.dev/docs/kit/$env-dynamic-private>
- SvelteKit hooks (`handleFetch`/`handleError`): <https://svelte.dev/docs/kit/hooks>
- SvelteKit adapter-node `ORIGIN`/CSRF: <https://svelte.dev/docs/kit/adapter-node>
- TanStack Svelte Query SSR: <https://tanstack.com/query/latest/docs/framework/svelte/ssr>
- Runes reactivity guide: <https://svelte.dev/docs/svelte/what-are-runes>
- vitest-browser-svelte: <https://github.com/vitest-dev/vitest-browser-svelte>

Package tidak dianggap aman hanya karena tercantum. Phase 1 tetap memeriksa release, license, maintenance, SSR/Svelte 5 support, dan security posture.
