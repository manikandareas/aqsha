# Deployment (Dokploy)

Aqsha deploys as a single Docker Compose stack via **Dokploy**. Dokploy clones this repo,
builds the per-app images from `compose.yaml`, runs the stack, and fronts the public services
with Traefik + Let's Encrypt.

> `compose.yaml` (repo root) = full stack (apps + infra). `infra/compose.dev.yaml` = local-dev
> infra only (Postgres/Redis/MinIO). Never deploy the dev file.

## Services

| Service         | Port | Public?     | Domain (example)                   | Notes                                                          |
| --------------- | ---- | ----------- | ---------------------------------- | -------------------------------------------------------------- |
| **web**         | 3000 | ✅          | `aqshara.com` (+ apex for landing) | Next.js app + landing; hosts the same-origin `/eve/v1/*` proxy |
| **api**         | 3001 | ✅          | `api.aqshara.com`                  | Elysia REST; browser API + Clerk/Mayar webhooks                |
| **minio**       | 9000 | ✅          | `assets.aqshara.com`               | Object storage; browser uploads/downloads via presigned URLs   |
| minio (console) | 9001 | optional    | `minio.aqshara.com`                | Admin UI only                                                  |
| **agent**       | 4317 | ❌ internal | —                                  | eve runtime; reached by `web` at `http://agent:4317`           |
| **worker**      | —    | ❌ internal | —                                  | BullMQ consumers (reuses the api image)                        |
| **postgres**    | 5432 | ❌ internal | —                                  | pgvector                                                       |
| **redis**       | 6379 | ❌ internal | —                                  | queues + rate limit                                            |

## Prerequisites

- A server with **Dokploy** installed and a domain whose DNS A-records point at it.
- DNS records for `@`, `api`, `assets` (+ optional `minio` for the console) → server IP.
- External accounts/keys: **Clerk** (app + secret + webhook secret), **Mayar** (API key + 6 membership product IDs — see `apps/api/MAYAR-SETUP.md`), an **OpenAI-compatible** LLM provider (chat + fast + embedding), and optional research keys (Firecrawl/Jina/OpenAlex/Semantic Scholar). A **Mapbox** token for the Explore globe.

## Step 1 — Create the Compose app

In Dokploy: **Create Project → Create Service → Compose**.

- **Provider**: Git → this repository, branch `main` (or your release branch).
- **Compose Path**: `compose.yaml`.
- **Compose Type**: Docker Compose.

## Step 2 — Set environment variables

In the service's **Environment** tab, set the variables below (values feed `${VAR}` in
`compose.yaml`). Full descriptions live in each app's `.env.example`.

**Infra / secrets**

```
POSTGRES_PASSWORD=        REDIS_PASSWORD=
MINIO_ROOT_USER=          MINIO_ROOT_PASSWORD=      MINIO_BUCKET=aqsha
```

**Public URLs / wiring**

```
# NEXT_PUBLIC_* are build args baked into the web bundle — set them BEFORE the first build.
NEXT_PUBLIC_API_URL=https://api.<domain>
NEXT_PUBLIC_MAPBOX_TOKEN=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
# S3_ENDPOINT MUST be the public MinIO URL (presigned URLs inherit this host).
S3_ENDPOINT=https://assets.<domain>
```

**Shared backend (api + worker + agent)** — see `apps/api/.env.example` / `apps/agent/.env.example`

```
CLERK_SECRET_KEY=
AQSHA_EMBEDDING_API_KEY=    AQSHA_EMBEDDING_BASE_URL=
AQSHA_RAG_EMBEDDING_MODEL=text-embedding-3-small   AQSHA_RAG_EMBEDDING_DIMENSION=1536
OPENALEX_API_KEY=  JINA_API_KEY=  UNPAYWALL_EMAIL=  AQSHA_CONTACT_EMAIL=  SEMANTIC_SCHOLAR_API_KEY=
```

**api / worker only**

```
CLERK_WEBHOOK_SIGNING_SECRET=
AQSHA_FAST_MODEL_API_KEY=   AQSHA_FAST_MODEL_BASE_URL=   AQSHA_FAST_MODEL=gpt-4o-mini
MAYAR_SERVER=production     MAYAR_API_KEY=   MAYAR_WEBHOOK_SECRET=
MAYAR_STARTER_MONTHLY_PRODUCT_ID=  MAYAR_STARTER_YEARLY_PRODUCT_ID=
MAYAR_PLUS_MONTHLY_PRODUCT_ID=     MAYAR_PLUS_YEARLY_PRODUCT_ID=
MAYAR_ULTRA_MONTHLY_PRODUCT_ID=    MAYAR_ULTRA_YEARLY_PRODUCT_ID=
LLM_METADATA_ENABLED=false
AQSHA_ADMIN_OWNER_USER_IDS=        AQSHA_ADMIN_EMAILS=
```

**agent only**

```
OPENAI_API_KEY=   OPENAI_BASE_URL=
AQSHA_LITE_MODEL=gpt-4o   AQSHA_LITE_CONTEXT_WINDOW=128000
FIRECRAWL_API_KEY=   CROSSREF_MAILTO=
```

`AGENT_ORIGIN` is fixed to `http://agent:4317` in `compose.yaml` — do not set it.

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
- **Mayar** → webhook URL `https://api.<domain>/webhooks/mayar/<MAYAR_WEBHOOK_SECRET>` (the secret is in the path; Mayar does not sign). Create the 6 membership products and fill the `MAYAR_*_PRODUCT_ID` vars. See `apps/api/MAYAR-SETUP.md`.

## Step 8 — Verify

- `https://api.<domain>/ping` returns OK (server + clock).
- `https://<domain>` loads; sign-in works (Clerk).
- Create a thread → Astra streams (confirms web → `agent` proxy + DB projections).
- Upload an artifact (confirms presigned S3 + CORS).

## Updating

Push to the deployed branch and click **Redeploy** in Dokploy (or enable auto-deploy on push).
Re-run **Step 5** if the change includes a new migration. Changing `NEXT_PUBLIC_*` requires a
rebuild (they are baked into the web image).

## Backups & single-replica note

- `agent` keeps eve durable run state in the `agent_workflow_data` volume (`.workflow-data`). It is
  file-backed and single-node — **run exactly one `agent` replica** and snapshot this volume before
  redeploys.
- Back up the `postgres_data` and `minio_data` volumes on a schedule.

## Local development

Not Dokploy — run infra locally and the apps with bun:

```bash
docker compose -f infra/compose.dev.yaml up -d
bun install && bun run db:migrate
bun dev
```
