# @aqsha/www — Marketing site (Astro)

**Canonical marketing surface for Aqsha** — landing `/`, `/blog`, `/changelog`.
**No dependency on other `@aqsha/*` packages.** Deploy to Cloudflare Pages at `aqshara.com`.

Product app stays on VPS at `app.aqshara.com` (Next.js). Auth CTAs link there via `PUBLIC_APP_URL`.

`apps/web/features/marketing` is frozen leftover — do not edit it. Web `/` redirects here.

## Design system

Visual tokens match **Aqsha DS v2** (same as `apps/svelte` / `@aqsha/ui-svelte`): emerald primary, Nunito Sans headings, 2px borders, keycap/lip depth. Copied into `src/styles/tokens.css` + `components.css` + `public/fonts/` — no runtime dependency on other Aqsha packages.

## Local

```bash
# from monorepo root (worktree or main)
bun install
bun run dev:www
# → http://localhost:4321
```

```bash
bun run --filter '@aqsha/www' build
# output: apps/www/dist
```

## Env

Copy `.env.example`:

```
PUBLIC_SITE_URL=https://aqshara.com
PUBLIC_APP_URL=https://app.aqshara.com
```

## Cloudflare Pages

| Setting | Value |
|---|---|
| Framework | Astro |
| Root directory | `apps/www` (or monorepo root with filter build) |
| Build command | `bun install && bun run build` (from `apps/www`) |
| Output directory | `dist` |
| Env | `PUBLIC_SITE_URL`, `PUBLIC_APP_URL` |

If building from monorepo root: `bun install && bun run --filter '@aqsha/www' build` and set output to `apps/www/dist`.

## Cutover ops

1. DNS: apex / `www` → Cloudflare Pages (`@aqsha/www`); `app` → VPS
2. Dokploy/Traefik: point Next web service at `app.aqshara.com` only
3. Clerk Dashboard: allowed origins + redirect URLs for `https://app.aqshara.com` (and marketing origin if needed for deep links)
4. Uptime / health check for landing → `https://aqshara.com`
5. `apps/web` `/` already redirects to `NEXT_PUBLIC_SITE_URL` (default `https://aqshara.com`)
6. Delete `apps/web/features/marketing` once legacy blog/changelog chrome is gone

## Pricing snapshot

`src/data/plan-catalog.ts` is a zero-dep copy of public plan fields from `packages/services/src/plan.ts`.
`bun run check:plans` (part of www typecheck) fails the build if prices/limits drift.

## Feature identity

`src/data/features.ts` is the SSOT for feature keys, images, titles, and `#fitur-*` anchors used by hero collage, feature blocks, and mega-nav.

## Content

MDX lives in `src/content/blog` and `src/content/changelog` (Astro Content Collections). Edit here for the marketing site going forward.

## Hydration model

`src/pages/index.astro` owns the page graph:

- `client:load` — hero chrome + hero
- `client:visible` — marquee, compare, features, pricing, FAQ, bottom CTA
- static Astro — teaser + footer
