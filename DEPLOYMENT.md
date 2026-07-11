# Deployment (Dokploy)

Aqsha deploys as a single Docker Compose stack via **Dokploy**. Dokploy clones this repo,
builds the per-app images from `compose.yaml`, runs the stack, and fronts the public services
with Traefik + Let's Encrypt.

> `compose.yaml` (repo root) = full stack (apps + infra). `infra/compose.dev.yaml` = local-dev
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

Click **Deploy**. Dokploy builds the three images (web/api/agent) and starts the stack
(`minio-init` creates the bucket and exits). First build is the slow one.

## Step 5 — Run database migrations

The stack does not auto-migrate. After the first deploy (and after any schema change), run once
via the Dokploy terminal for the **api** service (or `docker compose exec` on the host):

```bash
bun run db:migrate
```

`DATABASE_URL` is already set in the api container, so this applies all Drizzle migrations to
Postgres.

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

## Updating

Push to the deployed branch and click **Redeploy** in Dokploy (or enable auto-deploy on push).
Re-run **Step 5** if the change includes a new migration. Changing `NEXT_PUBLIC_*` requires a
rebuild (they are baked into the web image).

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
