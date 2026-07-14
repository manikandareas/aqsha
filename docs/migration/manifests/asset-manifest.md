# Asset & font manifest — `apps/web` → `apps/svelte`

> Dibuat **Phase 1**. Traceable source→target untuk static asset + spec self-host font (§6 map, task #6).

## Static assets disalin (Phase 1 — core kecil)

| Source (`apps/web`) | Target (`apps/svelte/static`) | Ukuran | Catatan |
|---|---|---|---|
| `app/favicon.ico` | `favicon.ico` | 14.7K | favicon utama |
| `app/apple-icon.png` | `apple-icon.png` | 16.4K | apple-touch-icon |
| `app/icon1.png` | `icon.png` | 7.3K | PNG icon |
| `public/web-app-manifest-192x192.png` | `web-app-manifest-192x192.png` | 17.7K | PWA manifest (Phase 4) |
| `public/web-app-manifest-512x512.png` | `web-app-manifest-512x512.png` | 90.4K | PWA manifest (Phase 4) |
| `public/logo.svg` | `logo.svg` | 32.6K | brand mark |

Di-wire di `src/routes/+layout.svelte` (`<svelte:head>` icon links). Manifest/robots/sitemap handler = Phase 4 (`+server.ts`).

## Disalin Phase 4 (bareng consumer marketing/error/SEO)

| Source (`apps/web`) | Target (`apps/svelte/static`) | Consumer |
|---|---|---|
| `public/landing/{hero-frame,frame-workspace,frame-astra,frame-citations,frame-provenance}.png` | `landing/*.png` (5 file, ~3.5MB each) | Hero + FeatureFrame (MKT-1) |
| `public/error.png` | `error.png` | ErrorStatePage generic (task 7) |
| `public/not-found.png` | `not-found.png` | ErrorStatePage 404 (task 7) |
| — (generatif satori+resvg, one-off) | `og.png` (1200×630) | OG/Twitter card (MKT-6); padanan `app/opengraph-image.tsx` dinamis, dijadikan STATIS (nol runtime dep). Regen: `scripts/generate-og.mjs`. |

`content/{blog,changelog}/*.mdx` disalin verbatim ke `apps/svelte/content/` (SoT konten; di-`.prettierignore`).

## Belum disalin (per-fase, bareng consumer)

Bulk brand sisa (`app/icon0.svg` 1.1MB, `public/pro-card.png` 1.5MB, `whimsical-floating-paper.png` 1.6MB,
`logo-*.png`, illustration SVG) **disalin saat surface konsumennya diport** (Phase 8/9) agar diff tetap terukur.
`next.svg`/`vercel.svg` **tidak** dibawa (artefak Next).

## Font self-host (spec — file + `@font-face` di Phase 3)

`apps/web` memuat via `next/font/google` (`app/layout.tsx`). Target Svelte: **self-host woff2 + `@font-face`**
(§6 map "next/font/google → self-host"). Variabel CSS & fallback **dipertahankan persis** (dipakai golden CSS).

| Font | CSS var | Subsets | Weights | Dipakai (`globals.css`) |
|---|---|---|---|---|
| Inter | `--font-sans` | latin | 400, 500, 600, 700 | body/sans |
| Instrument Serif | `--font-serif` (+ `--font-heading`) | latin | 400 | heading/serif |
| JetBrains Mono | `--font-mono` | latin | 400, 500 | code/mono |
| Caveat | `--font-hand` | latin | 400, 500, 600, 700 | hand/accent |

Rencana Phase 3: download woff2 (mis. via `@fontsource/*` atau file Google Fonts), taruh di `static/fonts/`,
tulis `@font-face` (`font-display: swap`) di golden CSS, set `--font-*` ke family self-host. Anti-flash theme (§3.7)
= inline script kecil di `app.html` set `.dark` sebelum paint (padanan `suppressHydrationWarning`). Font tanpa CSS
konsumen tak berarti di Phase 1 → sengaja ditunda ke port golden CSS.
