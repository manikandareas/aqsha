# Aqsha V2 — Architecture & Deployment

## Monorepo Structure

V2 ditambahkan **di sebelah** V1. Tidak ada perubahan pada `apps/web`, `apps/agents`, `packages/convex`, `packages/agent-contracts`, `packages/ui` sampai fase cutover.

```
aqsha/
├── apps/
│   ├── web/                    # V1 — TIDAK DISENTUH
│   ├── agents/                 # V1 — TIDAK DISENTUH (digantikan eve)
│   │
│   ├── api-v2/                 # V2 NEW — Elysia REST API (domain non-agent + projeksi/bridge agent)
│   │   ├── src/
│   │   │   ├── index.ts        # App entrypoint + listen + `export type App`
│   │   │   ├── plugins/
│   │   │   │   ├── auth.ts      # Clerk JWT → { ownerUserId, clerkUserId, email }
│   │   │   │   ├── rate-limit.ts  # macro Redis rate-limiter-flexible
│   │   │   │   └── cors.ts
│   │   │   ├── routes/          # controller TIPIS: auth → validasi → 1 service call → map
│   │   │   │   ├── users.ts  billing.ts  workspaces.ts  artifacts.ts
│   │   │   │   ├── threads.ts  feed.ts  papers.ts  webhooks.ts  admin.ts  commands.ts
│   │   │   │   ├── mcp.ts       # Aqsha MCP server (Streamable HTTP) di POST /mcp — adapter ke-4
│   │   │   │   │                #   atas @aqsha/services; auth per-request Clerk token (B1)
│   │   │   ├── workers/         # BullMQ (non-agent)
│   │   │   │   ├── feed-hydration.worker.ts   paper-enrichment.worker.ts
│   │   │   │   ├── url-ingestion.worker.ts    account-deletion.worker.ts
│   │   │   │   ├── thread-title.worker.ts
│   │   │   ├── clients/         # adapter infra (TANPA domain logic, TANPA Drizzle)
│   │   │   │   ├── r2.ts  redis.ts  clerk.ts  polar.ts  llm.ts
│   │   │   ├── worker-entrypoint.ts
│   │   │   └── lib/
│   │   │       ├── sse.ts       # SSE helper (non-agent job progress)
│   │   │       └── errors.ts    # AppError → HTTP terstruktur
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── web-v2/                 # V2 NEW — Next.js frontend + HOST agent eve (UI disalin dari apps/web)
│       ├── app/
│       │   ├── (auth)/  sign-in/  sign-up/
│       │   ├── onboarding/
│       │   ├── app/
│       │   │   ├── explore/  workspaces/  threads/  settings/
│       │   │   └── layout.tsx
│       │   └── layout.tsx
│       ├── agent/              # eve agent (di-discover withEve) — lihat di bawah
│       │   ├── agent.ts  instructions.md
│       │   ├── tools/  skills/  subagents/  channels/  schedules/  hooks/  sandbox/  lib/
│       │   ├── connections/    # eve MCP client connections (data bridge ke api-v2 /mcp)
│       │   │   ├── aqsha.ts        # read/research/citation (no approval) — B2
│       │   │   └── aqsha_write.ts  # side-effecting (approval: always()/once()) — B2
│       ├── lib/
│       │   ├── api.ts          # Eden Treaty client (+ Clerk token header)
│       │   └── query.ts        # TanStack Query helpers
│       ├── next.config.ts      # withEve(nextConfig, { eveRoot: 'agent/' })
│       ├── package.json
│       └── tsconfig.json
│
├── packages/
│   ├── convex/  agent-contracts/  ui/   # ui = shared (dipakai V2)
│   │
│   ├── db/                     # V2 NEW — Drizzle schema + migrations
│   │   ├── src/
│   │   │   ├── schema/         # users, workspaces, artifacts, threads, agent-runs, feed, billing, rag
│   │   │   ├── repositories/   # query Drizzle per-aggregate (satu-satunya pemegang SQL)
│   │   │   ├── migrations/
│   │   │   └── client.ts       # createDb()
│   │   ├── drizzle.config.ts
│   │   └── package.json
│   │
│   └── services/               # V2 NEW — business-logic service layer
│       └── src/                # UserService, WorkspaceService, ArtifactService, FeedService,
│                               # PaperService, BillingService, SendQuotaService, ThreadService,
│                               # RagService, ExploreService, InterestService, AccountDeletionService
│                               # → dikonsumsi route Elysia + eve tool + BullMQ worker (lihat 04)
│
├── infra/
│   ├── compose.yaml            # HANYA PostgreSQL + Redis (jalan di VPS)
│   ├── init-extensions.sql
│   └── .env.example
│
├── package.json                # Bun workspaces root
└── CLAUDE.md
```

> **Repository layer** hidup di `packages/db/src/repositories` (dekat schema). Boundary lapisan dijelaskan penuh di [04-service-layer.md](04-service-layer.md): `route/tool/worker → service → repository (Drizzle) + clients (infra)`.

> **UI tidak berubah dari V1.** `apps/web-v2` menyalin komponen & elemen UI langsung dari `apps/web` — termasuk konfigurasi **shadcn** (`components.json`), **global CSS** (`globals.css`), **Tailwind v4**, **HugeIcons**, dan token `@aqsha/ui`. Yang berbeda hanya lapisan data (Eden Treaty/TanStack Query + `useEveAgent`), bukan presentasi/komponen.

---

## eve di Monorepo

Agent eve **tidak** menjadi service tersendiri. Ia di-*mount* ke dalam `apps/web-v2` (Next.js):

```ts
// apps/web-v2/next.config.ts
import { withEve } from 'eve/next'
const nextConfig = { /* ... */ }
export default withEve(nextConfig, { eveRoot: 'agent/' })
```

Folder `apps/web-v2/agent/` adalah definisi agent (tools, skills, subagents, schedules, channels, hooks, sandbox, connections). Untuk **data milik Aqsha sendiri**, eve agent **bukan** in-process service caller: tool data dijangkau lewat MCP connection (`agent/connections/aqsha.ts` + `aqsha_write.ts`) ke Aqsha MCP server di `api-v2` `POST /mcp` (B7). Owner menerima HTTP hop yang diperkenalkan kembali demi boundary MCP yang bersih, decoupled, dan reusable. Tool yang **tetap in-process** (import langsung `@aqsha/services` / `ctx.getSandbox()`) terbatas pada sandbox/HITL-gate: `verifyStatistics`/`runComputation` (butuh sandbox) dan `proposeResearchPlan` (HITL gate murni). Service di `@aqsha/services` tetap **modul yang sama** yang dipakai route Elysia, MCP server, & worker (lihat [04-service-layer.md](04-service-layer.md)). Durabilitas run disimpan eve (Workflow SDK) di `.workflow-data` pada volume persisten (self-host) — bukan di Postgres. Postgres hanya menyimpan proyeksi product (chat history, run events, sources, HITL) lewat hook observe-only eve.

> **Decision-record — durabilitas single-node (D1)**: `.workflow-data` di volume VPS = single-node, file-backed (Workflow world lokal = single-machine on disk). **Invariant**: runtime eve/`web-v2` HARUS jalan sebagai **SATU replica** sampai Workflow world non-lokal (Postgres/Redis-backed) GA di eve. **Tidak ada autoscaling** untuk proses eve (Next.js front-of-house tetap boleh scale). Wajib **backup manual `.workflow-data`** (snapshot volume terjadwal sebelum deploy/restart). **Trigger switch-to-Vercel** (deploy `web-v2`+eve ke Vercel demi Vercel Workflow, walau memecah deployment & bertentangan dengan "semua di VPS"): butuh >1 replica / butuh managed run dashboard / recovery crash berulang. Selama trigger belum terpicu, tetap di VPS single-node. Ditinjau ulang saat fase cutover ([06](06-implementation-phases.md)).

---

## Docker Compose — Infra Only (di VPS, diakses via Tailscale)

Compose **hanya** menjalankan infrastruktur (PostgreSQL + Redis). **Tidak ada** container `api`, `web`, atau `minio` — R2 adalah layanan cloud, dan `api-v2`/`web-v2` dijalankan sebagai proses (host/systemd) yang terhubung ke infra **lewat Tailscale**. Compose ini dijalankan langsung di dalam VPS.

### `infra/compose.yaml`

```yaml
# Dijalankan DI VPS. api-v2/web-v2 (lokal saat dev, atau proses host saat prod) menjangkau
# Postgres+Redis lewat Tailscale hostname/IP. Tidak ada api/web/minio di sini.
services:
  postgres:
    image: pgvector/pgvector:pg17
    restart: unless-stopped
    environment:
      POSTGRES_DB: aqsha
      POSTGRES_USER: aqsha
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init-extensions.sql:/docker-entrypoint-initdb.d/01-extensions.sql
    ports:
      # Bind ke interface Tailscale agar tidak terekspos ke publik.
      # Ganti 100.x.y.z dengan Tailscale IP VPS (atau pakai MagicDNS hostname di klien).
      - "100.x.y.z:5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U aqsha"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    ports:
      - "100.x.y.z:6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

volumes:
  postgres_data:
  redis_data:
```

### `infra/init-extensions.sql`
```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";     -- pgvector (RAG)
CREATE EXTENSION IF NOT EXISTS "unaccent";
```

> **Catatan Tailscale**: jalankan `compose up -d` di VPS. Di mesin dev (dan di proses prod `api-v2`/`web-v2`), `DATABASE_URL`/`REDIS_URL` menunjuk ke Tailscale hostname/IP VPS. Karena port di-bind ke interface Tailscale (`100.x.y.z`), Postgres/Redis tidak pernah terekspos ke internet publik. Tidak perlu override `compose.dev.yml` — infra-nya satu dan dipakai bersama oleh dev & prod.

---

## Environment Variables

### `infra/.env.example` (di VPS, untuk Compose)
```bash
# Database
POSTGRES_PASSWORD=changeme_strong_password
# Redis
REDIS_PASSWORD=changeme_redis_password
```

### `apps/api-v2/.env.example`
```bash
# Konek ke infra via Tailscale (hostname MagicDNS atau IP 100.x.y.z)
DATABASE_URL=postgresql://aqsha:${POSTGRES_PASSWORD}@vps-aqsha.tailnet.ts.net:5432/aqsha
REDIS_URL=redis://:${REDIS_PASSWORD}@vps-aqsha.tailnet.ts.net:6379

# Cloudflare R2 (S3-compatible — tidak ada container)
R2_ACCOUNT_ID=xxx
R2_ACCESS_KEY_ID=xxx
R2_SECRET_ACCESS_KEY=xxx
R2_BUCKET=aqsha
R2_ENDPOINT=https://xxx.r2.cloudflarestorage.com

# Clerk
CLERK_SECRET_KEY=sk_xxx
CLERK_WEBHOOK_SIGNING_SECRET=whsec_xxx
# Polar
POLAR_ACCESS_TOKEN=polar_xxx
POLAR_WEBHOOK_SECRET=xxx
POLAR_STARTER_PRODUCT_ID=xxx
POLAR_PLUS_PRODUCT_ID=xxx
# Providers / agent
ANTHROPIC_API_KEY=sk-ant-xxx          # atau gateway: ANTHROPIC_BASE_URL + ANTHROPIC_AUTH_TOKEN
OPENALEX_API_KEY=xxx
# Admin allowlist
ADMIN_OWNER_IDS=user_xxx,user_yyy

PORT=3001
```

### `apps/web-v2/.env.example`
```bash
NEXT_PUBLIC_API_URL=https://api.aqsha.app        # atau Tailscale host saat dev
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_xxx
CLERK_SECRET_KEY=sk_xxx                           # untuk server-gate onboarding/status
# eve durability (self-host)
EVE_WORKFLOW_DATA_DIR=/var/lib/aqsha/.workflow-data
```

---

## Bun Workspaces Update

```json
{
  "workspaces": [
    "apps/web",
    "apps/agents",
    "apps/api-v2",
    "apps/web-v2",
    "packages/convex",
    "packages/agent-contracts",
    "packages/ui",
    "packages/db",
    "packages/services"
  ]
}
```

---

## Dev Commands

Tambahan ke root `package.json` scripts (script V1 tidak disentuh):

```json
{
  "scripts": {
    "dev:api": "bun run --filter '@aqsha/api-v2' dev",
    "dev:web-v2": "bun run --filter '@aqsha/web-v2' dev",
    "dev:workers": "bun run --filter '@aqsha/api-v2' workers",
    "db:generate": "bun run --filter '@aqsha/db' generate",
    "db:migrate": "bun run --filter '@aqsha/db' migrate",
    "db:studio": "bun run --filter '@aqsha/db' studio"
  }
}
```

> Tidak ada `dev:infra` di mesin dev — infra hidup di VPS (`docker compose -f infra/compose.yaml up -d` dijalankan di VPS sekali). Dev cukup `bun run dev:api` + `dev:web-v2`, keduanya menunjuk ke Tailscale host. Untuk dev fully-lokal opsional, jalankan Postgres/Redis lokal dan arahkan `DATABASE_URL`/`REDIS_URL` ke `localhost`.

---

## VPS Deployment

```bash
# 1. Install Docker + Tailscale di VPS, join tailnet
curl -fsSL https://get.docker.com | sh
curl -fsSL https://tailscale.com/install.sh | sh && tailscale up

# 2. Clone repo
git clone git@github.com:your-org/aqsha.git /opt/aqsha && cd /opt/aqsha

# 3. Infra (HANYA postgres + redis)
cp infra/.env.example infra/.env   # isi password
docker compose -f infra/compose.yaml up -d

# 4. Migrasi
bun install
bun run db:migrate

# 5. Build eve agent SEBELUM start web-v2 (D2) — meng-compile definisi agent/
bun run --filter '@aqsha/web-v2' eve build      # eve build (wajib sebelum web-v2 start)

# 6. Jalankan api-v2 + workers + web-v2(+eve) sebagai proses host/systemd
#    (BUKAN di Compose). web-v2 meng-host eve; .workflow-data di volume persisten
#    (single replica + backup manual — lihat invariant D1).
bun run --filter '@aqsha/api-v2' start          # API + (atau) worker entrypoint terpisah
bun run --filter '@aqsha/web-v2' start          # Next.js + eve (withEve)
```

### Reverse Proxy (Nginx, contoh untuk api-v2 + web-v2)
```nginx
server {
  server_name api.aqsha.app;
  location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    # SSE / long-lived stream (job progress + eve NDJSON jika di-proxy)
    proxy_set_header Connection '';
    proxy_http_version 1.1;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 3600s;
  }
}
server {
  server_name app.aqsha.app;
  location / {
    proxy_pass http://127.0.0.1:3000;   # web-v2 + eve
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    # eve NDJSON stream hidup di SINI (bukan hanya api.aqsha.app) — stream-safe (D2)
    proxy_buffering off;
    proxy_read_timeout 3600s;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
  }
}
```

> **Webhook** Clerk & Polar dipoint ke `https://api.aqsha.app/webhooks/clerk` dan `/webhooks/polar`. Idempotency (Redis `SETNX`) membuat overlap singkat saat cutover aman.

---

## Eden Treaty di apps/web-v2

```ts
// apps/web-v2/lib/api.ts
import { treaty } from '@elysiajs/eden'
import type { App } from '@aqsha/api-v2'

export const api = treaty<App>(
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001',
  { headers: () => ({ Authorization: `Bearer ${getClerkToken()}` }) }
)

// Penggunaan dengan TanStack Query:
const { data } = useQuery({
  queryKey: ['workspaces'],
  queryFn: async () => {
    const { data, error } = await api.workspaces.get()
    if (error) throw error
    return data
  },
})
```

Chat agent memakai `useEveAgent` (bukan Eden) — lihat [01-tech-stack.md](01-tech-stack.md).

---

## Migrasi Data dari Convex — Fresh Start (default)

Per keputusan **aggressive cutover**, default-nya **fresh start tanpa migrasi data Convex**; user onboard ulang (wizard sudah wajib). Alasan: (1) `_id` implisit Convex tidak memetakan ke skema PK PG sehingga migrasi faithful butuh id-remapping penuh lintas FK; (2) kelas data terbesar regenerable — `feed_items`/`explore_papers` diisi ulang oleh cron hydration dalam hitungan jam, dan embeddings RAG harus di-index ulang; (3) `ragEntryId` adalah handle opaque `@convex-dev/rag` tanpa padanan PG.

> Jika owner kelak ingin mempertahankan artifact user, satu-satunya yang layak di-script adalah `workspaces` + `artifacts`(+contents/urls/paper_metadata) + blob R2 (download dari Convex storage → re-upload R2 → re-key → re-index RAG) via `packages/db/scripts/migrate-from-convex.ts` — **di luar** cutover default.

---

## Monitoring & Observability

- **BullMQ Dashboard**: `bull-board` di `/admin/bull` (admin only) — visibilitas queue yang dulu ditangani dashboard Convex.
- **eve runs**: visibilitas run agent lewat activity stream (frame NDJSON di-mirror ke `agent_run_events`) + `.workflow-data` (self-host).
- **PostgreSQL**: `pg_stat_statements` untuk query monitoring.
- **Health**: `GET /health/ready` mengecek koneksi PG, Redis, dan R2.
- **Logs**: structured JSON via `pino`.
