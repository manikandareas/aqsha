# Phase 4 decision record — public routes, auth screens, blog/changelog, SEO

> Bagian dari **Phase 4** (§10 [`svelte-plan.md`](svelte-plan.md)).
> Tanggal: 2026-07-14. Melanjutkan [`phase-3-decision-record.md`](phase-3-decision-record.md).
> Bahasa Indonesia; nama package/API/simbol tetap English (AGENTS.md).

Semua surface PUBLIK + SEO. **Bukan** produk (`/app` = Phase 6-9; settings/onboarding = Phase 5).
Ledger: [`parity-ledger.md`](parity-ledger.md) MKT-1..7 = **done**.

---

## 1. Struktur yang dibangun (§5.1)

| Area | File | Catatan |
|---|---|---|
| Content Collections | `content-collections.ts`, `content/{blog,changelog}/*.mdx`, `.content-collections/generated` (gitignored) | `@content-collections/vite` + `compileMarkdown` (HTML). Wiring: `vite.config.ts` plugin + `svelte.config.js` `kit.alias` + scripts. |
| SEO lib | `src/lib/seo/{config,metadata,structured-data,handlers}.ts`, `SeoHead.svelte`, `index.ts` (+ `handlers.spec.ts`) | Port `lib/seo-config.ts`+`lib/metadata.ts`. `SeoHead` render `<svelte:head>`. |
| SEO handlers | `src/routes/{robots.txt,sitemap.xml,manifest.webmanifest}/+server.ts`, `static/og.png`, `scripts/generate-og.mjs` | Pure builders di `handlers.ts`. OG statis (satori+resvg one-off). |
| Motion primitives | `src/lib/motion/{reveal,scroll,scroll-math,magnetic}.ts` (+ `scroll-math.spec.ts`) | Svelte-native padanan framer whileInView/useScroll/spring. |
| Marketing | `src/lib/features/marketing/{components/**(15),faq-data,pricing,types}.ts` (+ `pricing.spec.ts`) | Landing 6-section + FeatureFrame. |
| Blog | `src/lib/features/blog/{components/**(3),lib/{posts,format,layout},types}.ts` (+ `posts.spec.ts`) | + `src/lib/dates.ts` (formatDateId). |
| Changelog | `src/lib/features/changelog/{components/**(5),lib/{entries,categories,layout},types}.ts` | GenerativeCover di `src/lib/components/` (+ spec). |
| Routes | `src/routes/{+page,blog,blog/[slug],changelog,changelog/[slug],sign-up/[...rest]}` + sign-in update | SSR via `+page.server.ts`. |
| Error | `src/lib/components/ErrorStatePage.svelte`, `src/routes/+error.svelte` (diperkaya) | 404 + generic. |
| Env | `src/lib/env/{defaults,schema}.ts` (+ `PUBLIC_SITE_URL`, `PUBLIC_SEO_ALLOW_INDEXING`) | Additif. |
| Hooks | `src/hooks.server.ts` (+ `securityHeaders` + `manifest.webmanifest` public) | — |

## 2. Keputusan terkunci

1. **SPIKE Content Collections = `@content-collections/vite` + `compileMarkdown` (HTML string), BUKAN mdsvex.**
   Konten blog/changelog 100% **markdown murni** (nol JSX — cek: `grep '^import\|<[A-Z]' content/` kosong). `compileMarkdown`
   (@content-collections/markdown 0.1.4) me-reuse pipeline rehype web PERSIS (`remark-gfm` + `rehype-shiki` github-dark +
   `rehype-slug` + `rehype-autolink-headings` wrap) → **HTML byte-parity** dengan output web, di-render `{@html post.mdx}` ke
   `.aqsha-prose .blog-prose`/`.changelog-prose`. mdsvex DITOLAK: menghasilkan komponen Svelte + HTML divergen dari
   rehypeShiki/autolink web, dan menarik runtime. Field `mdx` = HTML string (bukan komponen). Skema/frontmatter/slug
   (`_meta.path`)/ordering/readingTime/excerpt IDENTIK. `mdx-components.tsx` (a rel=noreferrer, img lazy) di-mirror lewat
   rehype plugin build-time inline (`rehypeAqshaMdxLinks`) — internal link biasa (SvelteKit auto-enhance `<a>`).
   `allowDangerousHtml: true` (konten build-time trusted). **Fallback bila gagal** (tak terpakai): loader `import.meta.glob`
   + unified sendiri (pipeline sama).

2. **Wiring Content Collections = plugin (generate) + `kit.alias` (types), BUKAN tsconfig paths.** `@content-collections/vite`
   generate `.content-collections/generated` + watch saat dev/build. Type-resolution `import from 'content-collections'` via
   `kit.alias` (SvelteKit **menimpa** tsconfig `paths` → alias WAJIB lewat `kit.alias`). Scripts prefiks `content-collections build`
   (typecheck/test/build) menjamin generated ada sebelum svelte-check/vitest. Plugin **di-skip di vitest** (`process.env.VITEST`) —
   watcher-nya mencegah proses vitest exit ("close timed out"); test pakai generated yang sudah di-build.

3. **SEO metadata = `PageSeo` object → `SeoHead.svelte`.** SvelteKit tak menyuntik metadata seperti Next; `createPageMetadata`
   mengembalikan objek, `SeoHead` render tag `<svelte:head>`. `<title>` = template `%s | Aqsha`; og/twitter title = mentah
   (padanan Next `openGraph.title` verbatim). Nilai (title/desc/canonical/OG/Twitter/JSON-LD/verification) di-set agar identik
   output Next (terverifikasi di HTML served). JSON-LD via `{@html}` di head, `<` di-escape `<` + tag penutup di-concat
   (`</` + `script>`) anti breakout + anti no-useless-escape ESLint. `siteUrl` dari `PUBLIC_SITE_URL` runtime (domain-portable).

4. **OG image = ASET STATIS `og.png` (1200×630), bukan endpoint dinamis.** Web `opengraph-image.tsx` = `ImageResponse`/satori
   dinamis. Di apps/svelte dijadikan static (nol runtime/build dep → **bebas risiko native @resvg di Docker Phase 12**).
   Digenerate one-off `scripts/generate-og.mjs` (satori + @resvg/resvg-js ad-hoc + Inter TTF dari fontsource CDN), commit PNG.
   `og:image`/`twitter:image` = `${siteUrl}/og.png`; blog detail override ke cover absolut bila ada. DoD mengizinkan "static".

5. **SEO handlers = pure builders (`handlers.ts`) + `+server.ts` runtime-rendered.** robots/sitemap/manifest bergantung
   `siteUrl`/`allowIndexing` runtime (Infisical §3.7) → **BUKAN prerender** (bake env basi). Contract test byte-equiv
   (`buildRobotsTxt` indexable-branch = parity web robots.ts; `buildSitemapXml`; `buildWebManifest`). "byte-equivalent" =
   **semantik/values sama** (Next XML/robots serialization internal tak bisa di-byte-match persis; §0 turunkan ke functional).

6. **Preview-noindex gate = `PUBLIC_SEO_ALLOW_INDEXING` (default `false`).** Preview subdomain aman tak ter-index sampai cutover
   (§10 Phase 4). `false` → robots.txt `Disallow: /` + `<meta robots noindex>` + header `X-Robots-Tag: noindex, nofollow`.
   `true` (owner set saat flip domain, Phase 12) → robots parity web + tanpa noindex. Default AMAN (prod tanpa set = noindex,
   bukan index-preview-tak-sengaja).

7. **Motion = Svelte primitives + reduced-motion seam (Phase 3), bukan framer.** `reveal` (IntersectionObserver → `data-inview`
   + kelas Tailwind `data-[inview]:*` + `motion-reduce:*` fallback); `scrollProgress` (attach) + `computeScrollProgress`/`mapRange`
   (pure di `scroll-math.ts`, contract-tested) padanan `useScroll`/`useTransform`; `magnetic` (pointer + CSS transition, bukan
   spring); `CountUp`/`PriceOdometer` komponen. Mount entrance (hero clip sweep, 3D drop) = CSS `@keyframes` scoped +
   `motion-reduce:animation-none`. No-JS/reduced → konten tetap terlihat (armed-flag di reading-reveal). **Functional parity,
   bukan pixel** (§3.2).

8. **`@aqsha/services` TIDAK dibawa (§4.1).** for-you-section + structured-data pakai `$lib/plan/catalog` (mirror pure-data FND-13).
   Harga/JSON-LD di-derive dari `PLAN_CATALOG`/`PUBLIC_PLAN_KEYS`.

9. **Route group `(marketing)` = chrome bersama landing+blog+changelog.** Web punya header/footer di TIGA tempat:
   `landing-page.tsx` (render sendiri) + `app/{blog,changelog}/layout.tsx`. Di Svelte disatukan jadi SATU
   `src/routes/(marketing)/+layout.svelte` (`<div flex-col><LandingHeader/><div flex-1>{children}</div><LandingFooter/></div>`)
   yang membungkus landing (`(marketing)/+page`), blog, changelog — DRY, header/footer DIHAPUS dari `LandingPage.svelte`.
   Group URL-transparan (`(marketing)/blog`→`/blog`). sign-in/sign-up TIDAK di group (layout terpusat tanpa chrome). 404
   blog (`error(404)`) bubble ke ROOT `+error.svelte` di bawah root layout SAJA (bukan chrome group) → ErrorStatePage
   full-page tanpa header/footer = **parity web** (root not-found). Link blog/changelog pakai `resolve()` inline.
   `svelte/no-navigation-without-resolve` **dimatikan untuk `features/marketing/**`** (anchor-heavy `/#section` + query
   `/sign-up?plan=` yang resolve tak modelkan; deploy root = base-path no-op; matches preseden `ui/**`).

10. **Security headers additif (web tak punya).** `next.config.ts` web KOSONG dari redirects/headers/CSP → tak ada yang di-port.
    `securityHeaders` handle (innermost) set `X-Content-Type-Options: nosniff` + `Referrer-Policy` + `X-Frame-Options: SAMEORIGIN`
    + `X-Robots-Tag` (preview). CSP TIDAK diperketat (parity web tanpa CSP; risiko pecah Clerk/Sentry/streamdown). Sanitasi =
    MDX build-time trusted + escaping default Svelte.

11. **Auth screens = svelte-clerk + `@clerk/themes` shadcn.** `appearance={{theme: shadcn}}` (@clerk/themes 2.4.57) di root
    ClerkProvider (mengalir ke `clerk.load`). SignIn/SignUp auto-derive `path` dari route; `signUpUrl`/`fallbackRedirectUrl`
    (sign-in→/app) + `forceRedirectUrl`/`fallbackRedirectUrl` (sign-up→/onboarding) eksplisit = parity web. Server redirect if authed.

## 3. Gotcha & temuan reusable (untuk fase berikut)

- **`</script>` literal di komentar/string blok `<script>` Svelte = penutup dini.** Komentar `SeoHead` yang memuat `</script>`
  memicu "Unterminated comment". Solusi: hindari literal; concat `</` + `script>` (juga lolos ESLint no-useless-escape, tak
  seperti `<\/script>`). (Bake ulang temuan `**/*` Phase 3.)
- **SvelteKit menimpa tsconfig `paths`** → alias pihak-ketiga (content-collections) WAJIB via `kit.alias`, bukan tsconfig `paths`
  (kalau tsconfig paths dipakai, `$lib`/`$app` SvelteKit hilang).
- **`@content-collections/vite` watcher mencegah vitest exit** → guard plugin dgn `process.env.VITEST`; alias tetap dari kit.alias,
  generated tetap ada dari prefiks script test.
- **`compileMarkdown(context, document, options)` — context DULU** (sama urutan `compileMDX` web). Return `Promise<string>` HTML.
- **`$env/dynamic/public` RESOLVE di vitest server project** (node env) — `handlers.spec.ts` impor `config.ts` (→ publicEnv) lolos.
  Jadi test boleh sentuh modul yang baca `$env` (bukan cuma pure record fn seperti dugaan Phase 2).
- **Svelte transition attach (`scrollProgress`/`magnetic`) buat SEKALI (`const`/`$derived`), jangan inline** — inline = attachment
  baru tiap render → re-attach thrash. Baca prop di attach → warning `state_referenced_locally`; bungkus `$derived(...)`.
- **Reveal tanpa flash no-JS**: elemen VISIBLE default via `motion-reduce:opacity-100`; attach yang meng-hide + observe hanya jalan
  saat JS + non-reduced. Reading-reveal pakai `armed` flag (kata penuh sampai attach jalan).
- **Badge/Announcement/Button shadcn-svelte render `<a>` saat `href`** (svelte:element / `{#if href}`) → pill/button-link tanpa
  wrapper. `no-navigation-without-resolve` TIDAK menandai `href` pada KOMPONEN (hanya `<a>` native) → ErrorStatePage `<Button href>` aman.
- **Intl.NumberFormat id-ID currency** memakai NBSP (U+00A0) → `.replace(/\s+/g,'')` (menghapus NBSP) → `Rp49.000`.
- **Route group masuk ke RouteId `resolve` untuk route BER-PARAM.** Setelah `(marketing)` group, `resolve('/blog/[slug]', {slug})`
  gagal ("Expected 1 arguments, got 2") — id-nya kini `/(marketing)/blog/[slug]`. Route STATIS tetap lolos via overload
  pathname (`resolve('/blog')` → `/blog`), tapi param route WAJIB id ber-prefix group. URL hasil tetap grup-stripped (`/blog/{slug}`).

## 4. Gate Phase 4 (§10) — HIJAU

| Cek | Perintah / bukti | Hasil |
|---|---|---|
| Typecheck | `bun run --filter @aqsha/svelte typecheck` | **0 errors / 0 warnings** |
| Lint | `bun run --filter @aqsha/svelte lint` | Prettier clean + ESLint 0 |
| Test | `bun run --filter @aqsha/svelte test` | **21 files / 107 tests pass** (clean exit) |
| Build | `bun run --filter @aqsha/svelte build` | OK (adapter-node) |
| Boot routes | `node build` + curl | `/` 200, `/blog` 200, `/changelog` 200, blog/changelog detail 200, `/sign-in` 200, `/sign-up` 200, `/robots.txt` 200, `/sitemap.xml` 200, `/manifest.webmanifest` 200, `/og.png` 200, `/app`→303→`/sign-in`, 404 render ErrorStatePage |
| SEO parity | grep HTML served | title `... \| Aqsha`, canonical absolut, og/twitter values, JSON-LD graph (Org/WebSite/SoftwareApp/FAQ), robots preview-noindex |
| Handlers | curl bodies | robots preview `Disallow: /`; sitemap XML urls+priority+lastmod; manifest JSON parity |
| Security headers | curl `-D -` | `X-Content-Type-Options`/`Referrer-Policy`/`X-Frame-Options`/`X-Robots-Tag` present |
| Boundary client | grep `.svelte-kit/output/client` | **no React/Radix-React/Lucide** (termasuk pasca @clerk/themes) |

Contract tests baru: `handlers.spec.ts` (robots/sitemap/manifest byte-equiv), `scroll-math.spec.ts` (scroll-progress math +
mapRange), `pricing.spec.ts` (formatIdr/formatCount/priceLabel/planFeatureRows ∞), `generative-cover.spec.ts`
(hashIndex determinisme + firstInitial code-point), `posts.spec.ts` (Content Collections ordering/non-draft/slug/url).

## 5. Yang TIDAK dikerjakan / ditunda (di luar Phase 4)

- **Eyeball visual per-viewport/theme** (§9.3, non-blocking) = OWNER: landing 6-section + blog/changelog + auth di 390/768/1280/1536
  + light/dark + reduced-motion. Verifikasi fungsional (boot/route/SEO/render section+prose+shiki) HIJAU.
- **Lighthouse a11y/SEO** = OWNER manual (§10 gate "tidak lebih buruk"); markup semantik + JSON-LD + meta lengkap.
- **Auth E2E riil** (sign-in/up flow ke Clerk instance) = OWNER (butuh sesi test). Mekanisme identik Phase 1 GO.
- **Set `PUBLIC_SEO_ALLOW_INDEXING=true`** = OPS Phase 12 (flip domain). Sampai itu preview noindex.
- **OG regen bila copy `ogImage` berubah** = manual (`scripts/generate-og.mjs`).
- **Bulk brand asset sisa** (icon0.svg, pro-card, logo-*.png, illustrations) = disalin Phase 8/9 bareng consumer.
- **Upload source-map Sentry** = OPS (Phase 2).
