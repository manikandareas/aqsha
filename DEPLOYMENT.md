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

Secrets live in **Infisical** (`https://secrets.aqshara.com`), not in the Dokploy Environment tab.
The app containers pull folder `/app` at start via their entrypoint (`infisical run`); the Dokploy tab
only holds the bootstrap + infra credentials that stock images read. See the full model + owner
checklist in **`docs/ops/secrets/infisical-strategy.md`**; the root **`.env.example`** is the annotated map
of what goes where (Bagian A = Dokploy, Bagian B/C/D = Infisical).

In the service's **Environment** tab, set only **Bagian A** of `.env.example`:

```dotenv
# A1 — Infisical bootstrap (machine identity dokploy-prod → reads /app)
INFISICAL_UNIVERSAL_AUTH_CLIENT_ID=   INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET=
INFISICAL_PROJECT_ID=   INFISICAL_API_URL=https://secrets.aqshara.com   INFISICAL_ENV=prod
# A2 — infra creds for the stock images (must match what /app references)
POSTGRES_PASSWORD=   REDIS_PASSWORD=   MINIO_ROOT_USER=   MINIO_ROOT_PASSWORD=
# A3 (optional) — IMAGE_TAG (pin/rollback to a sha-<short>)
```

Everything else — `DATABASE_URL`/`REDIS_URL`/`S3_*` (fixed internal wiring, stored in `/app` as
references to `/infra`), Clerk, LLM, Mayar, Sentry DSNs, Langfuse — is set in Infisical `/app`, not
here. `MASTRA_AGENT_ORIGIN = http://agent:4317` stays fixed in `compose.yaml`.

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

Browser presigned upload/download is cross-origin (`<domain>` → `assets.<domain>`). **No action
needed by default**: MinIO ships with global CORS open to all origins
(`MINIO_API_CORS_ALLOW_ORIGIN=*`), so presigned PUT/GET from the browser already works. Verify:

```bash
curl -s -D- -o /dev/null -X OPTIONS -H "Origin: https://<domain>" \
  -H "Access-Control-Request-Method: PUT" https://assets.<domain>/aqsha/x | grep -i access-control
# expect: 204 + access-control-allow-origin echoing the Origin
```

To *restrict* CORS to the app origin only, set `MINIO_API_CORS_ALLOW_ORIGIN=https://<domain>` on
the `minio` service env (Dokploy tab) and restart. (`mc cors set` per-bucket needs a newer MinIO
server release than the pinned image and fails with "functionality that is not implemented" — use
the env var instead.)

The bucket stays private (`minio-init` runs `mc anonymous set none`); access is via signed URLs only.

## Step 7 — Register webhooks

- **Clerk** → Webhooks → endpoint `https://api.<domain>/webhooks/clerk`; copy the signing secret into `CLERK_WEBHOOK_SIGNING_SECRET` and redeploy.
- **Mayar** → webhook URL `https://api.<domain>/webhooks/mayar/<MAYAR_WEBHOOK_SECRET>` (the secret is in the path; Mayar does not sign). Plans are matched by payment AMOUNT; the `MAYAR_MEMBERSHIP_PRODUCT_ID` / `MAYAR_*_TIER_ID` vars are optional fallbacks. See `apps/api/MAYAR-SETUP.md`.

## Step 8 — Verify

- `https://api.<domain>/ping` returns OK (server + clock).
- `https://<domain>` loads; sign-in works (Clerk).
- Create a thread → Astra streams (confirms web → `agent` proxy + DB projections).
- Upload an artifact (confirms presigned S3 + CORS).

## Observability & CI/CD — full activation runbook

The sections below are quick reference. For the **step-by-step go-live** (owner prerequisites, exact
env per pillar, verification checklists, troubleshooting) across CI/CD + Sentry (errors · logs ·
uptime · cron) + Langfuse on-demand, see **`docs/ops/observability/cicd-runbook.md`** (design rationale +
migration off Grafana/Kuma: `docs/ops/observability/sentry-consolidation-plan.md`).

## Observability (Langfuse) — optional

The prod stack does **not** run Langfuse itself; the agent only **sends** traces to a self-hosted
Langfuse instance (token/cost per Astra + `/deep` run). Run Langfuse once, on the infra server, via
the `langfuse` profile of `infra/compose.dev.yaml` (Postgres + ClickHouse + Redis of its own; blob
reuses the app MinIO):

```bash
# on the infra server, with LANGFUSE_* filled in infra/.env
docker compose -f infra/compose.dev.yaml --profile langfuse up -d
```

Then point the prod agent at it by adding to Infisical `/app` (see `.env.example` → Bagian D9):

```dotenv
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

Branch flow: feature branches → `development` (integration + local test, **no deploy**) →
`staging` (deploys the staging stack) → `main` (deploys prod).

- **`ci.yml`** (PRs into `main`, `staging`, or `development`): typecheck + lint + full test suite
  against ephemeral Postgres(pgvector)+Redis service containers. The gate that says "this is green".
- **`deploy.yml`** (push to `main` → **prod**, push to `staging` → **staging**): re-runs the
  same gate → builds the 3 images in parallel with `docker buildx` (layer cache `type=gha`,
  per-image scope) → pushes to `ghcr.io/manikandareas/aqsha-{web,api,agent}` — `main` tags
  `:latest` + `:sha-<short>`, `staging` tags `:staging` + `:sha-<short>-staging` — → calls the
  Dokploy API (`POST /api/compose.deploy`) with that env's compose id so the right stack pulls its
  mutable tag and restarts. The Infisical env-slug (`prod`|`staging`, from the branch) selects both
  the `/build` values baked into the web image and the `/deploy` target.

`NEXT_PUBLIC_*` + the Sentry build args are pulled from **Infisical `/build`** at build time (via
`Infisical/secrets-action`) and baked into the web image; the Dokploy trigger creds come from Infisical
`/deploy`. Each image bakes `GIT_COMMIT` → Sentry `release` + Langfuse tag, so errors/traces tie back
to a commit. Full model + owner checklist: **`docs/ops/secrets/infisical-strategy.md`**.

**Owner prerequisites (one-time):**

1. **GHCR**: enable Packages on the repo. Create a classic PAT with `read:packages`; add it under
   Dokploy → **Settings → Registry** (`ghcr.io`, your username, the PAT) so Dokploy can pull the
   private images.
2. **GitHub → Settings → Secrets and variables → Actions** (just the Infisical bootstrap; everything
   else lives in Infisical `/build` + `/deploy`):
   - **Secrets**: `INFISICAL_CLIENT_ID`, `INFISICAL_CLIENT_SECRET` (from the `gh-actions` machine identity).
   - **Variables**: `INFISICAL_PROJECT_SLUG` (e.g. `aqsha`).
   - Remove the old ones once migrated: Secrets `DOKPLOY_*`, `SENTRY_AUTH_TOKEN`; Variables `NEXT_PUBLIC_*`,
     `SENTRY_ORG`, `SENTRY_PROJECT_WEB`.
3. `GITHUB_TOKEN` (auto-provided) pushes to GHCR via the workflow's `packages: write` permission — no
   extra secret needed for the push itself.

**Local / emergency build** (CI down): overlay `compose.build.yaml`, which re-adds `build:` and tags
the images with their GHCR name so a plain `docker compose up -d` runs them:

```bash
docker compose -f compose.yaml -f compose.build.yaml build
docker compose up -d
```

The images still start via the Infisical entrypoint: set the five `INFISICAL_*` bootstrap vars (env
`prod`) in an `.env` next to compose so `infisical run` pulls `/app`; if Infisical is unreachable,
leave them empty (entrypoint execs directly) and supply `/app` secrets via a compose `env_file:`
override. See `docs/ops/secrets/infisical-strategy.md` → "Local / emergency full-stack".

## Staging

Staging is a **second Dokploy Compose service on the same VPS**, running the same `compose.yaml`
from branch **`staging`**, fully isolated from prod (own Postgres/Redis/MinIO volumes, own
domains, own Infisical env). Every push to `staging` deploys it automatically (see CI/CD above);
promote by merging `development` → `staging` once integration testing passes.

Create it like Steps 1–8 with these deltas:

- **Step 1 (Compose app)**: branch `staging` instead of `main`; same `compose.yaml` path.
- **Step 2 (Environment tab)** — same Bagian A shape, different values:

  ```dotenv
  # A1 — bootstrap uses the dokploy-staging machine identity + staging env
  INFISICAL_UNIVERSAL_AUTH_CLIENT_ID=…dokploy-staging…   INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET=…
  INFISICAL_PROJECT_ID=…   INFISICAL_API_URL=https://secrets.aqshara.com   INFISICAL_ENV=staging
  # A2 — staging /infra creds (distinct from prod; must match what staging /app references)
  POSTGRES_PASSWORD=…   REDIS_PASSWORD=…   MINIO_ROOT_USER=…   MINIO_ROOT_PASSWORD=…
  # Stack isolation + image selection (prod leaves all three unset)
  AQSHA_PROJECT_NAME=aqsha-staging   # prefixes volumes + network → nothing shared with prod
  POSTGRES_HOST_PORT=5436            # 5435 is taken by the prod stack
  IMAGE_TAG=staging                  # rollback: sha-<short>-staging
  # Sentry (errors/logs/uptime) is env-gated by the DSNs in /app; staging uses SENTRY_ENVIRONMENT=staging
  # and its own uptime monitors at lower severity (see docs/ops/observability/cicd-runbook.md).
  ```

- **Step 3 (Domains)**: `staging.<domain>` → web:3000, `api.staging.<domain>` → api:3001,
  `assets.staging.<domain>` → minio:9000 (DNS A-records required, same VPS IP).
- **Infisical env `staging`** must be populated first (all four folders — see
  `docs/ops/secrets/infisical-strategy.md` → "Staging"): `/app` internal wiring uses
  `${staging.infra.*}` references (never paste `${prod.infra.*}` — `dokploy-staging` can't read
  prod, the container would crash-loop), Clerk **development instance** keys (`pk_test`/`sk_test`),
  `MAYAR_SERVER=sandbox` + sandbox key, `SENTRY_ENVIRONMENT=staging`,
  `S3_ENDPOINT=https://assets.staging.<domain>`; `/build` holds the staging `NEXT_PUBLIC_*`
  (fill **every** key `deploy.yml` passes as a build-arg — an empty one overrides the Dockerfile
  default); `/deploy` holds the same Dokploy URL/key plus **this** service's `DOKPLOY_COMPOSE_ID`.
- **Steps 5–7** are identical, run against the staging stack: migrate via the Dokploy terminal
  (`docker compose --profile migrate run --rm migrate`), CORS on the staging bucket with the
  staging origin, and Clerk (dev instance) + Mayar (sandbox) webhooks pointed at
  `api.staging.<domain>`.
- **Verify isolation**: `docker compose ls` shows `aqsha` and `aqsha-staging`; GHCR `:latest`
  digest is untouched by a staging deploy; the staging page's view-source shows `pk_test_` and
  `api.staging.<domain>` (proof the staging `/build` was baked, not prod's).

## Observability (Sentry) — optional

Error tracking across all four runtimes. One Sentry org, **3 projects**: `aqsha-web`, `aqsha-api`
(api + worker, split by the `process` tag), `aqsha-agent`. Everything is **env-gated** — with the
DSNs empty the SDKs are silent no-ops, so this can ship dark and light up later.

Set the runtime DSNs in Infisical `/app` (see `.env.example` → Bagian D8):

```dotenv
SENTRY_DSN_WEB=...     SENTRY_DSN_API=...     SENTRY_DSN_AGENT=...
SENTRY_ENVIRONMENT=production
# SENTRY_TRACES_SAMPLE_RATE=0   # 0 = error-only (conserves the 5k-errors/mo free tier)
```

Client-side web errors need the browser DSN **baked at build**: set `NEXT_PUBLIC_SENTRY_DSN` +
`SENTRY_ORG` / `SENTRY_PROJECT_WEB` + `SENTRY_AUTH_TOKEN` in Infisical `/build` (pulled by CI at build,
see the CI prerequisites above). Session Replay is off and tracing defaults to 0
to protect the free-tier quota. Verify by throwing a test error per runtime and confirming it lands
in the right project, symbolicated, tagged with the commit `release`.

## Observability (Sentry-first + Langfuse on-demand)

**Sentry is the daily incident console** — errors, selected structured logs, uptime, and cron
monitoring, all in one place. **Langfuse is the specialist tool** for LLM trace/token/cost/eval and
is opened only when analysing agent behaviour or spend, not as an alert inbox. Rationale and the full
runbook: `docs/ops/observability/cicd-runbook.md`.

What each signal owns:

- **Errors** (web / api / worker / agent) → **Sentry**, tagged `release` (= commit) + `environment`
  + `service`/`process`. See "Sentry" above for enabling the three DSNs.
- **Selected structured logs** → **Sentry Logs**, enabled automatically when a DSN is present. api +
  worker bridge chosen Pino records (all `warn`/`error` + allow-listed `notable` info such as
  `api_started`, `workers_started`, `feed_hydration_cycle_fanout`) through the facade in
  `apps/api/src/lib/log.ts`; the agent sends selected lifecycle logs via `logOps`. Access-log volume
  and `debug`/`trace` never leave stdout. Attributes are an allow-list of low-cardinality fields
  (`requestId`, `queue`, `jobId`, `status`, …) with secret/PII redaction; full stdout stays readable
  via `docker logs`/Dokploy.
- **Cron monitoring** → the worker wraps the repeatable `feed-hydration-cycle` in `Sentry.withMonitor`
  (crontab `0 */3 * * *`), so Sentry alerts if a cycle **fails to run**, not only if it errors while
  running. The monitor is upserted automatically on the first check-in.
- **LLM trace / token / cost / eval** → **Langfuse** only (see below). Not duplicated into Sentry
  tracing; server `tracesSampleRate` stays low/off and the agent's stays `0`.
- **Container stdout** (Postgres/Redis/MinIO and the apps) → `docker logs`/Dokploy as a short-lived
  operational fallback; not shipped anywhere.
- **Host disk/RAM/container-restart** → the VPS provider / Dokploy threshold alerts (point them at the
  same notification channel). There is no time-series metrics store after Grafana was removed.

> **Master kill-switch:** set `AQSHA_OBSERVABILITY=off` in Infisical `/app` to silence **all** agent
> Mastra exporters at once (storage traces + Langfuse), without unpicking individual keys. Empty/unset
> = on (default). It does **not** touch Sentry (error tracking is governed by the DSNs and stays on).

## Uptime monitoring (Sentry Uptime)

Uptime lives in **Sentry Uptime** alongside errors — one console, one notification channel. Use the
existing endpoints:

- `https://aqshara.com` — web availability (add a body/keyword check on the landing page).
- `https://api.aqshara.com/health/ready` — API **plus** its dependencies (Postgres + Redis + object
  storage), because `/health/ready` fails when any of them is down. Do **not** use `/ping` as the
  primary readiness check — it deliberately skips dependencies.

Set both up as production monitors in the Sentry UI (Alerts → Uptime). If the plan allows only one,
prioritise `/health/ready`. **Staging** uses separate monitors with lower notification severity so it
never pages production on-call. The agent has no public domain and is **not** exposed just for a
health check — it's covered by Dokploy container state, proxy errors from web, and its boot/unhandled
errors in Sentry.

> Route every Sentry alert (new/regressed error, error spike, terminal BullMQ failure, readiness
> down, quota 70%/90%) to the **same** channel. Don't mirror app alerts into Langfuse.

## Updating

Push to `main` → CI gates, builds, pushes to GHCR, and triggers the Dokploy deploy automatically
(no manual Redeploy needed). Re-run **Step 5** (the `migrate` profile) if the change includes a new
migration. Changing a runtime secret means editing Infisical `/app` and restarting the service (no
rebuild). Changing `NEXT_PUBLIC_*` means editing Infisical `/build` and pushing to `main` (CI rebuilds
the web image, since these are baked at build).

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
