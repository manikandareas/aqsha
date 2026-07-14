# Phase 1 decision record — scaffold `apps/svelte` + compatibility spikes

> Bagian dari **Phase 1** (§10 [`../apps-svelte-migration-plan.md`](../apps-svelte-migration-plan.md)).
> Tanggal: 2026-07-14. Baseline freeze `apps/web`: commit `ec04389` ([`baseline.md`](baseline.md)).
> Bahasa Indonesia; nama package/API/simbol tetap English (AGENTS.md).

Dokumen ini mengunci keputusan konkret Phase 1: cara scaffold, versi terpin, struktur, lokasi config,
model reaktivitas, UI/icon, testing, dan status setiap **compatibility spike**. Hasil spike produk
(auth/streaming/streamdown) yang butuh backend + kredensial live dicatat di
[`apps-svelte-phase1-spikes.md`](apps-svelte-phase1-spikes.md) sebagai **OWNER-RUN**.

---

## 1. Cara scaffold (CLI, bukan manual)

```bash
# SvelteKit app (minimal, TS), tanpa install (bun workspace meng-install di root)
bunx sv create apps/svelte --template minimal --types ts --no-add-ons --no-install --no-download-check

# Add-ons resmi, opsi eksplisit → non-interaktif
bunx sv add --cwd apps/svelte \
  sveltekit-adapter=adapter:node tailwindcss=plugins:none eslint prettier \
  vitest=usages:unit,component playwright \
  --no-git-check --no-download-check --no-install
```

`sv` CLI **v0.16.3**. Semua add-on tersetup sekali jalan. Demo route + `vitest-examples` bawaan scaffold dihapus (greenfield bersih).

## 2. Versi terpin (verifikasi §17 saat Phase 1)

| Package | Versi | Catatan |
|---|---|---|
| `svelte` | `^5.56.1` | Runes-only (§3.4). |
| `@sveltejs/kit` | `^2.63.0` | Config bisa inline sejak 2.62 — **tidak dipakai**, lihat §4. |
| `@sveltejs/adapter-node` | `^5.5.4` | Node server (Dokploy), boot terverifikasi (§9). |
| `@sveltejs/vite-plugin-svelte` | `^7.1.2` | — |
| `vite` | `^8.0.16` | — |
| `typescript` | `^6.0.3` | strict (tsconfig extends `.svelte-kit/tsconfig.json`). |
| `tailwindcss` + `@tailwindcss/vite` | `^4.3.0` | Tailwind v4, CSS-first config. |
| `vitest` | `^4.1.8` | — |
| `vitest-browser-svelte` | `^2.1.1` | Component test lane (§11.1, ganti `@testing-library/svelte`). |
| `@playwright/test` / `playwright` | `^1.60.0` | E2E + browser provider vitest. |
| `eslint` | `^10.4.1` | flat config; `typescript-eslint` `^8.63`. |
| `bits-ui` | `^2.18.1` | headless primitive shadcn-svelte. |
| `@hugeicons/svelte` | `^1.1.4` | render `HugeiconsIcon`. |
| `@hugeicons/core-free-icons` | `^4.2.2` | glyph set. |
| `tailwind-variants` | `^3.2.2` | varian shadcn. |
| `tw-animate-css` | `^1.4.0` | animasi (import di `app.css`). |
| `@internationalized/date` | `^3.12.2` | peer bits-ui. |
| shadcn-svelte CLI | `1.4.1` | dijalankan via `npx` (Node), bukan `bunx --bun` — lihat §6. |

`clsx`, `tailwind-merge` mengikuti util `cn`. **Tidak ada** React/Next/Radix-React di dependency (gate Phase 1).

## 3. Struktur: `src/` (default SvelteKit), bukan no-`src`

Keputusan: **pakai `src/` default** (§2 rekomendasi). No-`src` (`kit.files.src: "."`) **tidak diuji/diadopsi**
karena §2 sudah merekomendasikan `src/` dan opsi no-`src` ditandai deprecated + berisiko ke shadcn CLI/Sentry/adapter.
`apps/svelte` app baru → tak ada file yang harus dipindah, jadi tak ada motivasi kosmetik no-`src`.

Layout no-`src` di §5.1 **di-superseded** → semua folder shared masuk `src/lib` agar dapat alias `$lib`:

| §5.1 (no-src) | Aktual (`src/`) |
|---|---|
| `routes/` | `src/routes/` |
| `lib/{api,auth,query,url-state,errors,icons,observability,utils}` | `src/lib/{...}` (dibuat per-fase; `utils`, `icons` sudah ada) |
| `components/{ui,layout,ai-elements}` | `src/lib/components/{ui,layout,ai-elements}` |
| `features/*` | `src/lib/features/*` |
| `styles/`, `content/` | `src/styles/` (Phase 3), `src/content/` (Phase 4) |
| `app.html`, `app.d.ts`, `svelte.config.js`, dst | `src/app.html`, `src/app.d.ts`, root `svelte.config.js` |

Alias tambahan (`$components`, `$features`) **tidak** dibuat — `$lib/components` / `$lib/features` sudah cukup dan cocok dengan default shadcn-svelte.

## 4. Lokasi config: `svelte.config.js` (bukan inline di `vite.config.ts`)

Scaffold `sv` menaruh config Kit **inline** di `vite.config.ts` (fitur SvelteKit ≥2.62). **Dipindah** ke
`svelte.config.js` konvensional karena dokumentasi SvelteKit menyatakan: *"If the config is defined via the
Vite plugin, the `svelte.config.js` file is ignored"* — dan `svelte.config.js` adalah yang dibaca **shadcn-svelte
CLI, Sentry SvelteKit, dan editor extension**. Inline = memutus tooling itu. `vite.config.ts` kini tipis
(`tailwindcss()` + `sveltekit()` + config Vitest saja).

## 5. Reaktivitas: runes-only, di-enforce compiler

`svelte.config.js` memakai `dynamicCompileOptions` → `runes: true` untuk file app (bukan `node_modules`):
sintaks legacy (`export let`, `$:`, `on:*`) jadi **compile error**, lebih kuat dari lint. Dependency legacy di
`node_modules` tetap kompilasi normal (tak dipaksa runes). Ini menegakkan §3.4 di level build.

## 6. UI (shadcn-svelte) + ikon (Hugeicons) — **temuan spike penting**

- **Style `nova`, baseColor `neutral`, menuColor `default`, menuAccent `subtle`** = padanan terdekat `radix-nova`
  (web) dan cocok byte-untuk-byte dengan `apps/web/components.json` kecuali icon/font.
- **`iconLibrary: hugeicons`** — enum `components.json` shadcn-svelte **secara native** mendukung
  `["lucide","tabler","hugeicons","phosphor","remixicon"]`. Set ke `hugeicons` → CLI `add` meng-generate import
  dari `@hugeicons/svelte` + `@hugeicons/core-free-icons`, **nol `@lucide/svelte`**. Diverifikasi: `checkbox`
  ter-generate memakai `HugeiconsIcon` + `Tick02Icon`/`MinusSignIcon`.
  → **Gotcha §6/§13 "rewrite import ikon ke lib/icons" TERELIMINASI** untuk komponen vendored. Tak perlu rewrite tiap `add`.
- **init v1.4.1 interaktif** (preset design-system = kode **bit-packed base62**, tak bisa di-generate aman non-interaktif).
  Diputuskan: **reproduksi deterministik** setara `init` + preset `nova`:
  - `components.json` ditulis manual (schema resmi diverifikasi via `schema.json`).
  - `src/lib/utils.ts` = `cn` (konten dari registry `utils.json`).
  - `src/app.css` di-generate dari registry `colors/neutral.json` (`:root`/`.dark` + `@theme inline`).
  - runtime deps di-install via `bun add`; komponen ditambah via CLI `npx shadcn-svelte add <name> --no-deps --yes`.
- shadcn CLI dijalankan via **`npx`** (Node ≥22) — `bunx --bun` memicu warning "unsupported runtime".
- **Icon boundary** `src/lib/icons/index.ts`: app code (non-vendored) impor ikon dari `$lib/icons`. Mapping penuh
  (mirror `@aqsha/ui/icons`) = Phase 3.

## 7. CSS / tokens

`src/app.css` = `@import 'tailwindcss'` + `tw-animate-css` + `@custom-variant dark` + token neutral (`:root`/`.dark`)
+ `@theme inline`. **Ini theming scaffold saja** — Phase 3 mengganti seluruh token dengan **golden CSS** hasil port
`apps/web/app/globals.css` (§9.1). Radius = `0.625rem` (nilai registry neutral).

## 8. Testing

- `vitest.config` (di `vite.config.ts`) 2 project: **server** (node, `src/**/*.{test,spec}.{js,ts}`) + **client**
  (browser Chromium via `@vitest/browser-playwright`, `src/**/*.svelte.{test,spec}.{js,ts}`).
- Smoke terpasang & hijau: `src/lib/utils.spec.ts` (pure `cn`) + `src/lib/smoke.svelte.spec.ts`
  (render `Checkbox` shadcn di Chromium). Import context pakai `vitest/browser` (bukan `@vitest/browser/context` yang deprecated).
- Playwright E2E: config bawaan tetap; suite E2E kritis (§11.3) diisi per-fase.

## 9. Monorepo wiring + verifikasi gate

- `apps/svelte` ditambah ke `workspaces` root; name `@aqsha/svelte`, `engines.node >=24`.
- Root script **additive** (defaults `dev`/`build`/`test`/`lint`/`typecheck` **tak diubah**, §12):
  `dev:svelte`, `build:svelte`, `start:svelte` (`node build`), `lint:svelte`, `typecheck:svelte`, `test:svelte`.
- `.env`/env runtime: `$env/dynamic/*` (§3.7) = pekerjaan Phase 2 (belum ada env di Phase 1).

**Hasil verifikasi (gate teknis Phase 1 — semua HIJAU):**

| Cek | Perintah | Hasil |
|---|---|---|
| Sync | `svelte-kit sync` | OK |
| Typecheck | `bun run typecheck:svelte` | 0 errors / 0 warnings |
| Build | `bun run build:svelte` | OK (adapter-node) |
| adapter-node boot | `PORT=3100 node build` + curl `/` | **HTTP 200** |
| Lint | `bun run lint:svelte` | Prettier clean + ESLint 0 error |
| Contract rules | eslint atas import `react`/`@lucide/svelte` | **memblokir** (2 error, terverifikasi) |
| Test | `bun run test:svelte` | 2 files / 4 tests pass (server + browser) |
| No React prod dep | grep dependency | tak ada react/next/radix-react |

## 10. Asset & font (traceable)

Disalin ke `apps/svelte/static/` (core, kecil): `favicon.ico`, `apple-icon.png`, `icon.png` (dari `app/icon1.png`),
`web-app-manifest-192x192.png`, `web-app-manifest-512x512.png`, `logo.svg`. Bulk marketing/brand PNG (mis. `pro-card.png`
1.5MB) **disalin bareng consumer surface-nya** (Phase 4) agar diff tetap terukur. Manifest asset: [`manifests/asset-manifest.md`](manifests/asset-manifest.md).

**Font (self-host, §6 map):** web pakai `next/font/google` — **Inter** (`--font-sans`), **Instrument Serif**
(`--font-serif`/`--font-heading`), **JetBrains Mono** (`--font-mono`), **Caveat** (`--font-hand`). Phase 3 (golden CSS)
men-download woff2 + `@font-face` (font tanpa CSS yang mereferensikannya tak berarti di Phase 1). Spec di asset-manifest.

## 11. Status GO/NO-GO (§0 #6, §16 #1)

**Gate teknis scaffold: LULUS.** Semua dealbreaker *tooling* Phase 1 bersih (adapter-node, shadcn+hugeicons,
runes-enforce, vitest-browser, no-React, build/lint/typecheck/test hijau, no-`src`→`src/` diputuskan).

**Keputusan GO/NO-GO SELURUH migrasi BELUM final** — 3 dealbreaker *produk* menuntut backend + kredensial live
dan **harus dijalankan owner** sebagai satu **connected vertical slice** sebelum commit ke PR 3+:

1. `svelte-clerk` SSR token + 2FA + reverification (tangga fallback §0 #7).
2. Raw **Mastra streaming** end-to-end.
3. `svelte-streamdown` parity + security (citation/stats/viz/Shiki/math/Mermaid/CJK/malformed).

Plus **ukur resource dev SvelteKit vs Next** pada slice itu (validasi driver §0). Detail langkah OWNER-RUN:
[`apps-svelte-phase1-spikes.md`](apps-svelte-phase1-spikes.md). Bila salah satu gagal setelah menempuh fallback →
**NO-GO, batalkan setelah ~1 minggu** (§0 #6), jangan dipaksakan.
