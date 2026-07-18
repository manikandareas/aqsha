# @aqsha/www — Marketing site (Astro)

Standalone marketing surface for Aqsha: landing `/`, `/blog`, `/changelog`.
**No dependency on other `@aqsha/*` packages.** Deploy to Cloudflare Pages at `aqshara.com`.

Product app stays on VPS at `app.aqshara.com` (Next.js). Auth CTAs link there via `PUBLIC_APP_URL`.

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

## Cutover ops (does NOT modify `apps/web`)

1. DNS: apex / `www` → Cloudflare Pages (`@aqsha/www`); `app` → VPS
2. Dokploy/Traefik: point Next web service at `app.aqshara.com` only
3. Clerk Dashboard: allowed origins + redirect URLs for `https://app.aqshara.com` (and marketing origin if needed for deep links)
4. Uptime / health check for landing → `https://aqshara.com`
5. Leave marketing routes in `apps/web` untouched until a separate cleanup decision

## Pricing snapshot

`src/data/plan-catalog.ts` is a **manual copy** of public plan fields from product catalog. Update it when prices/limits change.

## Content

MDX lives in `src/content/blog` and `src/content/changelog` (Astro Content Collections). Copied from web at creation time — edit here for the marketing site going forward.
