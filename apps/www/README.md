# @aqsha/www — Marketing site (Astro)

**Canonical marketing surface for Aqsha** — landing `/`, `/blog`, `/changelog`, and launch gate `/waitlist`.
**No dependency on other `@aqsha/*` packages.** Deploy to Cloudflare Pages at `aqshara.com`.

Product app stays on VPS at `app.aqshara.com` (Next.js) when product is live. During waitlist launch, all marketing CTAs point to `/waitlist` (not Clerk sign-in/up).

`apps/web/features/marketing` is frozen leftover — do not edit it. Web `/` redirects here.

## Design system

Visual tokens match **Aqsha DS v2** (same as `apps/web` / `@aqsha/ui-svelte`): emerald primary, Nunito Sans headings, 2px borders, keycap/lip depth. Copied into `src/styles/tokens.css` + `components.css` + `public/fonts/` — no runtime dependency on other Aqsha packages.

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

For waitlist submit/verify locally, also run the API (`bun run dev:api`) with Postgres + Redis, and set `PUBLIC_API_URL=http://localhost:3001` in `apps/www/.env`.

## Env

Copy `.env.example`:

```
PUBLIC_SITE_URL=https://aqshara.com
PUBLIC_APP_URL=https://app.aqshara.com
PUBLIC_API_URL=https://api.aqshara.com
```

Local override: `PUBLIC_API_URL=http://localhost:3001`.

## Waitlist

- `/waitlist` is the public launch gate (email + optional company/university).
- Browser posts to the public Elysia API (`PUBLIC_API_URL`) at `POST /waitlist` and `POST /waitlist/verify`.
- Production requires a verified Resend sender domain and matching `WAITLIST_FROM_EMAIL` on the API runtime (`RESEND_API_KEY` only in Infisical / secret storage — never in client env).
- MVP has no admin UI or CSV export; owners delete rows via SQL if needed.
- Verification emails are launch notification only, not marketing newsletter.

## Cloudflare Pages

| Setting | Value |
|---|---|
| Framework | Astro |
| Root directory | `apps/www` (or monorepo root with filter build) |
| Build command | `bun install && bun run build` (from `apps/www`) |
| Output directory | `dist` |
| Env | `PUBLIC_SITE_URL`, `PUBLIC_APP_URL`, `PUBLIC_API_URL` |

If building from monorepo root: `bun install && bun run --filter '@aqsha/www' build` and set output to `apps/www/dist`.

## Cutover ops

1. DNS: apex / `www` → Cloudflare Pages (`@aqsha/www`); `app` → VPS
2. Dokploy/Traefik: point Next web service at `app.aqshara.com` only (when product is deployed)
3. Clerk Dashboard: allowed origins + redirect URLs for `https://app.aqshara.com` (and marketing origin if needed for deep links)
4. Uptime / health check for landing → `https://aqshara.com`
5. `apps/web` `/` already redirects to `NEXT_PUBLIC_SITE_URL` (default `https://aqshara.com`)
6. Delete `apps/web/features/marketing` once legacy blog/changelog chrome is gone
7. Ensure API CORS reflects marketing origin (`PUBLIC_SITE_URL`) so `/waitlist` can POST from Pages

## Pricing snapshot

`src/data/plan-catalog.ts` is a zero-dep copy of public plan fields from `packages/services/src/plan.ts`.
`bun run check:plans` (part of www typecheck) fails the build if prices/limits drift.

## Feature identity

`src/data/features.ts` is the SSOT for feature keys, images, titles, and `#fitur-*` anchors used by hero collage, feature blocks, and mega-nav.

`src/data/compare-rows.ts` is the SSOT for the Why Aqsha comparison table copy.

Shared doodle primitives live in `src/components/marketing/doodles.tsx` (starburst, spark, hand note, drawn arrow). Editorial motion tokens (`EASE_OUT`, `FRAME_SPRING`, `IN_VIEW_ONCE`) live in `src/lib/motion.ts`.

## Content

MDX lives in `src/content/blog` and `src/content/changelog` (Astro Content Collections). Edit here for the marketing site going forward.

## Hydration model

`src/pages/index.astro` owns the page graph:

- `client:load` — hero chrome + hero
- `client:visible` — marquee, compare, features, pricing, FAQ, bottom CTA
- static Astro — teaser (CSS entrance motion) + footer

`/waitlist` and `/waitlist/verify` hydrate only their form/verification islands with `client:load`.
