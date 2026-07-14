# Env manifest — `apps/web` (baseline `ec04389`)

Semua env var yang dikonsumsi `apps/web`, scope-nya, dan mapping ke SvelteKit. Sumber: `rg 'process\.env\.'` + `apps/web/.env.example` + `next.config.ts`/`proxy.ts`/Sentry config.

> **Gotcha wajib (§3.7):** `apps/svelte` **harus** memakai `$env/dynamic/*`, **bukan** `$env/static/*`. Env di-inject Infisical (`infisical run`) saat container start, bukan build; `$env/static/*` di-bake saat build → nilai basi/kosong di production. Public → `$env/dynamic/public` (prefix `PUBLIC_`, boleh masuk client). Rahasia server → `$env/dynamic/private` (dilarang masuk client bundle). Validasi semua saat boot.

## Public (client-exposed) — Next `NEXT_PUBLIC_*` → SvelteKit `PUBLIC_*`

| Next.js | SvelteKit (`$env/dynamic/public`) | Konsumen di web | Catatan |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | `PUBLIC_API_URL` | Eden Treaty client (`lib/api-client.ts`) | Base URL `apps/api`. Dev `http://localhost:3001`. |
| `NEXT_PUBLIC_SITE_URL` | `PUBLIC_SITE_URL` | SEO: `lib/seo-config.ts`, `metadata.ts`, robots/sitemap/OG | URL kanonik, tanpa trailing slash. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk provider | `svelte-clerk` butuh publishableKey. |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `PUBLIC_CLERK_SIGN_IN_URL` | Clerk routing | `/sign-in`. |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `PUBLIC_CLERK_SIGN_UP_URL` | Clerk routing | `/sign-up`. |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | `PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | Clerk redirect | `/app`. |
| `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` | `PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` | Clerk redirect | `/app`. |
| `NEXT_PUBLIC_SENTRY_DSN` | `PUBLIC_SENTRY_DSN` | `instrumentation-client.ts` | Client Sentry DSN. |
| `NEXT_PUBLIC_AGENTATION_ENDPOINT` | `PUBLIC_AGENTATION_ENDPOINT` | `AgentationDevToolbar` (dev-only) | Optional; default `:4747`. Dev annotation tidak ship ke prod (§2 dev annotation). |

## Private (server-only) → SvelteKit `$env/dynamic/private`

| Env | Konsumen di web | Target Svelte | Catatan |
|---|---|---|---|
| `CLERK_SECRET_KEY` | Clerk server/auth | `$env/dynamic/private` | Token flow via `handleFetch` (§3.6). Tidak boleh ke client. |
| `MASTRA_AGENT_ORIGIN` | Proxy `/mastra-api/*` (`proxy.ts` / mastra route) | `$env/dynamic/private` | Target proxy streaming ke `apps/agent`. Prod compose `http://agent:4317`. |

## Build-time (source maps / release) — Sentry Vite plugin

| Env | Konsumen | Target Svelte | Catatan |
|---|---|---|---|
| `SENTRY_AUTH_TOKEN` | Upload source map saat build | env build (bukan `$env/*`) | **Warning `sentry_auth_token= is not a valid secret` saat build api/agent = BENIGN (web-only)** — memory observability. |
| `SENTRY_DSN_WEB` | `sentry.server.config.ts` | `$env/dynamic/private` | Server DSN. |
| `SENTRY_ENVIRONMENT` | Sentry init | `$env/dynamic/private` | staging/production. |
| `SENTRY_ORG` | Sentry Vite plugin (build) | env build | Untuk `@sentry/sveltekit` sourcemaps. |
| `SENTRY_PROJECT_WEB` | Sentry Vite plugin (build) | env build | Nama project Sentry web. |
| `SENTRY_RELEASE` | Sentry init/build | `$env/dynamic/private` / `GIT_COMMIT` | Release identifier. |
| `SENTRY_TRACES_SAMPLE_RATE` | Sentry init | `$env/dynamic/private` | Gotcha memory: web pernah duplikat `parseSampleRate`. |

## Framework/runtime (disediakan platform — tak perlu mapping app)

| Next.js | Ekuivalen SvelteKit | Catatan |
|---|---|---|
| `NODE_ENV` | `import.meta.env.MODE` / `dev` dari `$app/environment` | — |
| `NEXT_RUNTIME` | — (tak ada padanan) | Pakai `browser`/`building` dari `$app/environment` untuk guard SSR. |
| `CI` | `process.env.CI` | Test/build guard; tetap boleh via `process.env` di config Node. |

## Baru di `apps/svelte` (adapter-node, §3.7/§12) — belum ada di web

| Env | Fungsi |
|---|---|
| `ORIGIN` | Wajib adapter-node untuk form action/CSRF. |
| `PROTOCOL_HEADER` / `HOST_HEADER` | Alternatif di belakang reverse proxy Dokploy. |
| `PORT` / `HOST` | Bind server adapter-node. |

Config terkait: pakai `trustedOrigins` (`checkOrigin` deprecated). Semua nilai runtime via Infisical (`$env/dynamic/*`), bukan build-bake.
