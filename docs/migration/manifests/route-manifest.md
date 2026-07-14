# Route manifest — `apps/web` (baseline `ec04389`)

Semua route/layout/handler Next.js App Router + URL + target Svelte (peta §7). Sumber: `find apps/web/app`. Target route memakai default `src/` SvelteKit (§2 rekomendasi); keputusan final no-`src` dicatat Phase 1. Route group `(auth)`/`(content)`/`(product)` di target sesuai §7.

**Total: 45 file route** (25 `page`/`route`, 6 `layout`, 6 `loading`, 3 error, 5 SEO handler).

## Layout & global surfaces

| Source (`apps/web/app/`) | URL scope | Target (`apps/svelte/routes/`) | Phase |
|---|---|---|---|
| `layout.tsx` | root | `+layout.svelte` + `+layout.ts` | 3 |
| `app/layout.tsx` | `/app` shell | `app/+layout.svelte` (+ session gate) | 2–3 |
| `app/(product)/layout.tsx` | `/app` product | `app/(product)/+layout.svelte` | 3 |
| `app/settings/layout.tsx` | `/app/settings` | `app/settings/+layout.svelte` | 5 |
| `blog/layout.tsx` | `/blog` | `(content)/blog/+layout.svelte` | 4 |
| `changelog/layout.tsx` | `/changelog` | `(content)/changelog/+layout.svelte` | 4 |
| `error.tsx` | route error | nested `+error.svelte` + Sentry capture | 2–3 |
| `global-error.tsx` | root fatal | root `+error.svelte` + `handleError` | 2 |
| `not-found.tsx` | 404 | `+error.svelte` (status 404) | 3 |

## Public — marketing, auth, content

| URL | Source | Target | Phase |
|---|---|---|---|
| `/` | `page.tsx` + `features/marketing/**` | `(public)/+page.svelte` | 4 |
| `/sign-in/*` | `sign-in/[[...rest]]/page.tsx` | `(auth)/sign-in/[...rest]/+page.svelte` | 4 |
| `/sign-up/*` | `sign-up/[[...rest]]/page.tsx` | `(auth)/sign-up/[...rest]/+page.svelte` | 4 |
| `/blog` | `blog/page.tsx` + `features/blog/**` | `(content)/blog/+page.svelte` | 4 |
| `/blog/[slug]` | `blog/[slug]/page.tsx` + `mdx-components.tsx` | `(content)/blog/[slug]/+page.{server.ts,svelte}` | 4 |
| `/changelog` | `changelog/page.tsx` + `features/changelog/**` | `(content)/changelog/+page.svelte` | 4 |
| `/changelog/[slug]` | `changelog/[slug]/page.tsx` | `(content)/changelog/[slug]/+page.{server.ts,svelte}` | 4 |

> **Public gotcha (memory):** proxy/route matcher `/changelog(.*)` wajib public; mapping auth-gate diport ke `hooks.server.ts` (Phase 2).

## Onboarding

| URL | Source | Target | Phase |
|---|---|---|---|
| `/onboarding` | `onboarding/page.tsx` + `features/onboarding/**` | `onboarding/+page.svelte` (+ server gate) | 5 |

## Protected — `/app` product

| URL | Source | Target | Phase | Loading |
|---|---|---|---|---|
| `/app` | `app/(product)/page.tsx` | `app/(product)/+page.svelte` | 7 | `(product)/loading.tsx` → `+layout`/skeleton |
| `/app` (shell) | `app/loading.tsx` | — | 3 | `app/loading.tsx` → app shell skeleton |
| `/app/threads` | `app/(product)/threads/page.tsx` (redirect) | `app/(product)/threads/+page.server.ts` redirect | 7 | — |
| `/app/threads/[threadId]` | `app/(product)/threads/[threadId]/page.tsx` | equivalent Svelte route | 7 | `[threadId]/loading.tsx` |
| `/app/explore` | `app/(product)/explore/page.tsx` + `features/explore/**` | equivalent | 8 | — |
| `/app/explore/[paperRef]` | `explore/[paperRef]/page.tsx` + discovery reader | equivalent | 8 | `[paperRef]/loading.tsx` |
| `/app/explore/n/[id]` | `explore/n/[id]/page.tsx` + news reader | equivalent | 8 | `n/[id]/loading.tsx` |
| `/app/workspaces` | `app/(product)/workspaces/page.tsx` | equivalent | 9 | — |
| `/app/workspaces/[workspaceId]` | `workspaces/[workspaceId]/page.tsx` | equivalent | 9 | `[workspaceId]/loading.tsx` |
| `/app/workspaces/[workspaceId]/artifacts/[artifactId]` | `.../artifacts/[artifactId]/page.tsx` | equivalent | 9–10 | — |

## Settings

| URL | Source | Target | Phase |
|---|---|---|---|
| `/app/settings` | `app/settings/page.tsx` (redirect) | `app/settings/+page.server.ts` redirect | 5 |
| `/app/settings/overview` | `settings/overview/page.tsx` | equivalent | 5 |
| `/app/settings/account` | `settings/account/page.tsx` | equivalent | 5 |
| `/app/settings/appearance` | `settings/appearance/page.tsx` | equivalent | 5 |
| `/app/settings/integrations` | `settings/integrations/page.tsx` | equivalent | 5 |
| `/app/settings/personalization` | `settings/personalization/page.tsx` | equivalent | 5 |
| `/app/settings/security` | `settings/security/page.tsx` | equivalent | 5 |
| `/app/settings/usage-billing` | `settings/usage-billing/page.tsx` | equivalent | 5 |

## API / proxy

| URL | Source | Target | Phase |
|---|---|---|---|
| `/mastra-api/[...path]` | `mastra-api/[...path]/route.ts` | `mastra-api/[...path]/+server.ts` | 2 |

> Preserve: GET/POST/PATCH/PUT/DELETE, auth/header rules, no compression/buffering/idle timeout, abort propagation (§2 Phase 2 #6).

## SEO / static handlers

| URL | Source | Target | Phase |
|---|---|---|---|
| `/robots.txt` | `robots.ts` | `robots.txt/+server.ts` | 4 |
| `/sitemap.xml` | `sitemap.ts` | `sitemap.xml/+server.ts` | 4 |
| `/manifest.webmanifest` | `manifest.ts` | `manifest.webmanifest/+server.ts` | 4 |
| `/opengraph-image` | `opengraph-image.tsx` | `+server.ts` / static asset | 4 |
| `/twitter-image` | `twitter-image.tsx` | `+server.ts` / static asset | 4 |

> Output snapshot handler harus identik (§7). SEO/metadata driver: `lib/seo-config.ts` (SSOT), `lib/metadata.ts`.
