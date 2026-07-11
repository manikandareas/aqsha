# Deployment (Dokploy)

Aqsha deploys as a single Docker Compose stack via **Dokploy**. The app images (web/api/agent) are
**built in CI** (GitHub Actions) and pushed to **GHCR**; `compose.yaml` references them by `image:`
only, so Dokploy just **pulls the finished images and restarts** the stack (no build on the VPS).
Dokploy fronts the public services with Traefik + Let's Encrypt. See **[CI/CD](#cicd)** below.

> `compose.yaml` (repo root) = full stack (apps + infra), images from GHCR. Local/emergency host
> build: overlay `compose.build.yaml` (re-adds `build:`). `infra/compose.dev.yaml` = local-dev
> infra only (Postgres/Redis/MinIO). Never deploy the dev file.

## Services

| Service         | Port | Public?     | Domain (example)                   | Notes                                                          |
| --------------- | ---- | ----------- | ---------------------------------- | -------------------------------------------------------------- |
| **web**         | 3000 | ✅          | `aqshara.com` (+ apex for landing) | Next.js app + landing; hosts the same-origin `/mastra-api/*` proxy |
| **api**         | 3001 | ✅          | `api.aqshara.com`                  | Elysia REST; browser API + Clerk/Mayar webhooks                |
| **minio**       | 9000 | ✅          | `assets.aqshara.com`               | Object storage; browser uploads/downloads via presigned URLs   |
| minio (console) | 9001 | optional    | `minio.aqshara.com`                | Admin UI only                                                  |
| **agent**       | 4317 | ❌ internal | —                                  | Mastra runtime (Astra); reached by `web` at `http://agent:4317` |
| **worker**      | —    | ❌ internal | —                                  | BullMQ consumers (reuses the api image)                        |
| **postgres**    | 5432 | ❌ internal | —                                  | pgvector                                                       |
| **redis**       | 6379 | ❌ internal | —                                  | queues + rate limit                                            |

## Prerequisites

- A server with **Dokploy** installed and a domain whose DNS A-records point at it.
- DNS records for `@`, `api`, `assets` (+ optional `minio` for the console) → server IP.
- External accounts/keys: **Clerk** (app + secret + webhook secret), **Mayar** (API key + webhook secret — see `apps/api/MAYAR-SETUP.md`), an **OpenAI-compatible** LLM provider (chat + fast + embedding), and optional research keys (Firecrawl/OpenAlex/Semantic Scholar/Mistral OCR).

## Step 1 — Create the Compose app

In Dokploy: **Create Project → Create Service → Compose**.

- **Provider**: Git → this repository, branch `main` (or your release branch).
- **Compose Path**: `compose.yaml`.
- **Compose Type**: Docker Compose.

## Step 2 — Set environment variables

In the service's **Environment** tab, paste and fill the root **`.env.example`** — it is the
single source of truth for every `${VAR}` referenced by `compose.yaml`, with per-variable
descriptions and which values are required vs optional.

The minimum required set:

```
# Infra / secrets
POSTGRES_PASSWORD=   REDIS_PASSWORD=   MINIO_ROOT_USER=   MINIO_ROOT_PASSWORD=
# Public URLs (NEXT_PUBLIC_* are build args baked into the web bundle — set BEFORE the first build;
# S3_ENDPOINT MUST be the public MinIO URL — presigned URLs inherit this host)
NEXT_PUBLIC_API_URL=https://api.<domain>   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
S3_ENDPOINT=https://assets.<domain>
# Clerk + LLM + billing
CLERK_SECRET_KEY=   CLERK_WEBHOOK_SIGNING_SECRET=
OPENAI_API_KEY=   AQSHA_FAST_MODEL_API_KEY=   AQSHA_EMBEDDING_API_KEY=
MAYAR_SERVER=production   MAYAR_API_KEY=   MAYAR_WEBHOOK_SECRET=
```

Internal service-to-service wiring (`DATABASE_URL`, `REDIS_URL`, `MASTRA_AGENT_ORIGIN` =
`http://agent:4317`) is fixed in `compose.yaml` — do not set it.

## Step 3 — Assign domains

In the service's **Domains** tab add (HTTPS + Let's Encrypt for each):

| Host                        | Service | Container port |
| --------------------------- | ------- | -------------- |
| `<domain>` (+ apex)         | `web`   | 3000           |
| `api.<domain>`              | `api`   | 3001           |
| `assets.<domain>`           | `minio` | 9000           |
| `minio.<domain>` (optional) | `minio` | 9001           |

`agent`, `worker`, `postgres`, `redis` get **no** domain.

## Step 4 — Deploy

Add the GHCR registry credential first (**[CI/CD](#cicd)** → prerequisites) so Dokploy can pull the
private images, then click **Deploy**. Dokploy **pulls** the web/api/agent images from GHCR and
starts the stack (`minio-init` creates the bucket and exits) — no build on the VPS, so it's fast.
This requires the images to already exist in GHCR: push to `main` once (CI builds + pushes them) or
build locally and push (`compose.build.yaml`) before the first Deploy.

## Step 5 — Run database migrations

The stack does not auto-migrate. After the first deploy (and after any schema change), run the
one-shot `migrate` service (api image + internal `DATABASE_URL`, exits when done) from the Dokploy
terminal or the host:

```bash
docker compose --profile migrate run --rm migrate
```

Kept manual (never auto-on-boot) so multiple app containers starting at once can't race the same
migration. Equivalent fallback inside the running api container: `bun run db:migrate`.

## Step 6 — MinIO bucket CORS

Browser presigned upload/download is cross-origin (`<domain>` → `assets.<domain>`). Allow it on
the bucket (Dokploy terminal on `minio`, or any `mc` client):

```bash
mc alias set local http://localhost:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
mc cors set local/aqsha <(echo '{"CORSRules":[{"AllowedOrigins":["https://<domain>"],"AllowedMethods":["GET","PUT","HEAD"],"AllowedHeaders":["*"],"ExposeHeaders":["ETag"]}]}')
```

The bucket stays private (`minio-init` runs `mc anonymous set none`); access is via signed URLs only.

## Step 7 — Register webhooks

- **Clerk** → Webhooks → endpoint `https://api.<domain>/webhooks/clerk`; copy the signing secret into `CLERK_WEBHOOK_SIGNING_SECRET` and redeploy.
- **Mayar** → webhook URL `https://api.<domain>/webhooks/mayar/<MAYAR_WEBHOOK_SECRET>` (the secret is in the path; Mayar does not sign). Plans are matched by payment AMOUNT; the `MAYAR_MEMBERSHIP_PRODUCT_ID` / `MAYAR_*_TIER_ID` vars are optional fallbacks. See `apps/api/MAYAR-SETUP.md`.

## Step 8 — Verify

- `https://api.<domain>/ping` returns OK (server + clock).
- `https://<domain>` loads; sign-in works (Clerk).
- Create a thread → Astra streams (confirms web → `agent` proxy + DB projections).
- Upload an artifact (confirms presigned S3 + CORS).

## Observability (Langfuse) — optional

The prod stack does **not** run Langfuse itself; the agent only **sends** traces to a self-hosted
Langfuse instance (token/cost per Astra + `/deep` run). Run Langfuse once, on the infra server, via
the `langfuse` profile of `infra/compose.dev.yaml` (Postgres + ClickHouse + Redis of its own; blob
reuses the app MinIO):

```bash
# on the infra server, with LANGFUSE_* filled in infra/.env
docker compose -f infra/compose.dev.yaml --profile langfuse up -d
```

Then point the prod agent at it by adding to the Dokploy **Environment** tab:

```
LANGFUSE_PUBLIC_KEY=pk-lf-...     # = LANGFUSE_PUBLIC_KEY seeded on the Langfuse project
LANGFUSE_SECRET_KEY=sk-lf-...     # = LANGFUSE_SECRET_KEY
LANGFUSE_BASE_URL=https://langfuse.<domain>   # or http://<TAILSCALE_IP>:3000 (must be reachable from the agent container)
```

Leaving them empty disables tracing (no crash). Prod traces are tagged `environment=production`
(`NODE_ENV` is set on the agent service), so they don't mix with dev. Expose the Langfuse UI over a
Traefik subdomain or keep it Tailscale-only. After first traces arrive, register custom model prices
(`gpt-5.1`, `gpt-5.4-mini`) in the Langfuse UI so the cost column is accurate.

> Cross-stack networking: the prod stack (`compose.yaml`) and the Langfuse profile run in separate
> Compose projects, so the agent reaches Langfuse via a routable URL (subdomain or Tailscale IP),
> not the internal `langfuse-web:3000` DNS name.

## CI/CD

Builds run **off the VPS**. `.github/workflows/` drives it:

- **`ci.yml`** (PRs into `main`): typecheck + lint + full test suite against ephemeral
  Postgres(pgvector)+Redis service containers. The gate that says "this is green".
- **`deploy.yml`** (push to `main`): re-runs the same gate → builds the 3 images in parallel with
  `docker buildx` (layer cache `type=gha`, per-image scope) → pushes to
  `ghcr.io/manikandareas/aqsha-{web,api,agent}` tagged `:sha-<short>` **and** `:latest` → calls the
  Dokploy API (`POST /api/compose.deploy`) so the VPS pulls `:latest` and restarts.

`NEXT_PUBLIC_*` are baked into the web image **at build time in CI** from GitHub **repo Variables**
(source of truth for build args; runtime env stays in Dokploy). Each image bakes `GIT_COMMIT` →
Sentry `release` + Langfuse tag, so errors/traces tie back to a commit.

**Owner prerequisites (one-time):**

1. **GHCR**: enable Packages on the repo. Create a classic PAT with `read:packages`; add it under
   Dokploy → **Settings → Registry** (`ghcr.io`, your username, the PAT) so Dokploy can pull the
   private images.
2. **GitHub → Settings → Secrets and variables → Actions**:
   - **Secrets**: `DOKPLOY_URL` (e.g. `https://dokploy.example.com`), `DOKPLOY_API_KEY` (profile →
     API key), `DOKPLOY_COMPOSE_ID` (the Compose service id), `SENTRY_AUTH_TOKEN` (source-map upload).
   - **Variables**: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL`,
     `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT_WEB` (mirror the values in Dokploy's
     Environment tab — keep them in sync).
3. `GITHUB_TOKEN` (auto-provided) pushes to GHCR via the workflow's `packages: write` permission — no
   extra secret needed for the push itself.

**Local / emergency build** (CI down): overlay `compose.build.yaml`, which re-adds `build:` and tags
the images with their GHCR name so a plain `docker compose up -d` runs them:

```bash
docker compose -f compose.yaml -f compose.build.yaml build
docker compose up -d
```

## Observability (Sentry) — optional

Error tracking across all four runtimes. One Sentry org, **3 projects**: `aqsha-web`, `aqsha-api`
(api + worker, split by the `process` tag), `aqsha-agent`. Everything is **env-gated** — with the
DSNs empty the SDKs are silent no-ops, so this can ship dark and light up later.

Fill in the Dokploy **Environment** tab (see `.env.example` → Sentry block):

```
SENTRY_DSN_WEB=...     SENTRY_DSN_API=...     SENTRY_DSN_AGENT=...
SENTRY_ENVIRONMENT=production
# SENTRY_TRACES_SAMPLE_RATE=0   # 0 = error-only (conserves the 5k-errors/mo free tier)
```

Client-side web errors need the browser DSN **baked at build**: set `NEXT_PUBLIC_SENTRY_DSN` (repo
Variable) + `SENTRY_ORG` / `SENTRY_PROJECT_WEB` (Variables) + `SENTRY_AUTH_TOKEN` (Secret, for
source-map upload) as in the CI prerequisites above. Session Replay is off and tracing defaults to 0
to protect the free-tier quota. Verify by throwing a test error per runtime and confirming it lands
in the right project, symbolicated, tagged with the commit `release`.

## Updating

Push to `main` → CI gates, builds, pushes to GHCR, and triggers the Dokploy deploy automatically
(no manual Redeploy needed). Re-run **Step 5** (the `migrate` profile) if the change includes a new
migration. Changing `NEXT_PUBLIC_*` now means updating the GitHub **Variable** and pushing (CI
rebuilds the web image) — it is no longer a Dokploy-side rebuild.

## Backups

- All durable state lives in Postgres (including Mastra `mastra_*` run state) and MinIO — back up
  the `postgres_data` and `minio_data` volumes on a schedule. No app container holds file-backed
  state.

## Local development

Not Dokploy — run infra locally and the apps with bun:

```bash
docker compose -f infra/compose.dev.yaml up -d
bun install && bun run db:migrate
bun dev
```
