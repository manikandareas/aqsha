# Aqsha V2 — Technology Stack Overview

> Dokumen ini adalah titik masuk untuk semua dokumentasi V2. Baca dokumen ini lebih dulu sebelum dokumen lainnya.

## Konteks & Tujuan

V2 adalah migrasi dari arsitektur berbasis Convex (BaaS) ke **REST API mandiri + PostgreSQL**, dengan **agent runtime di atas framework eve (Vercel)**. Tujuannya:

- Kontrol penuh atas infrastructure (VPS + Docker)
- Tidak bergantung pada vendor BaaS (Convex cloud) — termasuk menghentikan biaya DB-bandwidth Convex yang memicu migrasi ini
- Skalabilitas yang lebih predictable dan biaya yang lebih terkontrol
- Kemampuan self-host seluruh stack

**Endgame: aggressive cutover.** V2 dibangun untuk mencapai parity (minus domain Skills) secepatnya, lalu **menggantikan V1 dan men-decommission Convex** dengan periode paralel seminimal mungkin (fresh-start, user onboard ulang). Selama pembangunan, V1 (`apps/web`, `apps/agents`, `packages/convex`) **tidak disentuh** dan tetap jalan sampai fase cutover terakhir.

## Dokumen Dalam Folder ini

| File | Isi |
|---|---|
| `00-overview.md` | Dokumen ini — ringkasan stack dan keputusan teknis |
| `01-tech-stack.md` | Detail setiap teknologi yang dipilih beserta alasannya |
| `02-api-domains.md` | Semua domain API, endpoint, runtime split (Elysia vs eve), dan urutan prioritas |
| `03-architecture.md` | Struktur monorepo, service layer, Docker Compose infra, deployment |
| `04-service-layer.md` | Service layer: business logic reusable yang dikonsumsi route + eve tool + worker |
| `05-api-contracts.md` | Kontrak request/response per endpoint (di-ground dari V1) |
| `06-implementation-phases.md` | Pembagian fase 0 → cutover; tiap fase testable, runnable, terlihat di UI |

## Stack Ringkas

| Layer | Teknologi |
|---|---|
| **API Framework** | Elysia (Bun-native, Eden Treaty type safety) |
| **Aqsha MCP server** | **MCP server (Streamable HTTP) di `apps/api-v2` (`POST /mcp`)** — adapter tipis (caller ke-4) di atas `packages/services`; jalur data agent ke data Aqsha sendiri |
| **Agent Runtime** | **eve** (Vercel) — durable agents filesystem-first, di-mount ke Next.js via `withEve()`; menjangkau data Aqsha lewat **eve connections** ke Aqsha MCP server |
| **Database** | PostgreSQL 17 (Docker) |
| **ORM** | Drizzle ORM + drizzle-kit |
| **Job Queue** | BullMQ (Redis-backed) — untuk job non-agent (feed hydration, extraction, deletion) |
| **Cache / Broker** | Redis 7 (Docker) |
| **File Storage** | **Cloudflare R2** (S3-compatible, cloud — tanpa container) |
| **Vector Search** | pgvector extension (RAG) |
| **Full-text Search** | PostgreSQL tsvector + GIN index |
| **Real-time** | Agent stream → eve NDJSON (`useEveAgent`); non-agent → polling + SSE |
| **Auth** | Clerk (tetap sama, JWT verification) |
| **Billing** | Polar SDK langsung (tetap sama, lepas dari `@convex-dev/polar`) |
| **Validasi** | Zod v4 |
| **Type-safe Client** | Eden Treaty (`@elysiajs/eden`) |
| **Frontend** | Next.js 16 + React 19 (app baru `apps/web-v2`) — host eve; **UI disalin apa adanya dari `apps/web`** (komponen, shadcn, global CSS, Tailwind) |
| **Runtime** | Bun 1.3.10 (pinned) |
| **Monorepo** | Bun workspaces |

## Struktur App Baru

```
aqsha/
├── apps/
│   ├── web/              # V1 — TIDAK DISENTUH (sampai cutover)
│   ├── agents/           # V1 — TIDAK DISENTUH (digantikan eve di web-v2)
│   ├── api-v2/           # V2 — Elysia REST API (domain non-agent + projeksi/bridge agent)
│   └── web-v2/           # V2 — Next.js frontend; meng-host agent eve (agent/ dir)
├── packages/
│   ├── convex/           # V1 — TIDAK DISENTUH (sampai cutover)
│   ├── agent-contracts/  # V1 — TIDAK DISENTUH
│   ├── ui/               # Shared — dipakai V2
│   ├── db/               # V2 — Drizzle schema + migrations (PostgreSQL + pgvector)
│   └── services/         # V2 — business-logic service layer (dikonsumsi route + eve tool + worker)
└── infra/
    └── compose.yaml      # HANYA PostgreSQL + Redis (jalan di VPS, diakses via Tailscale)
```

> Catatan: agent runtime (eve) **tidak** menjadi service Elysia/BullMQ tersendiri. eve di-mount ke dalam `apps/web-v2` (Next.js) via `withEve()`; folder `agent/` (tools, skills, subagents, schedules, channels) hidup di dalam `apps/web-v2`. Lihat [03-architecture.md](03-architecture.md).

## Keputusan Desain Kritis

### 1. Elysia bukan Hono
Monorepo sudah menggunakan Bun sebagai runtime. Elysia adalah framework Bun-native yang memberikan **Eden Treaty** — end-to-end type safety dari API ke frontend tanpa code generation manual (mirip dengan generated types Convex tapi untuk REST API).

### 2. Drizzle ORM bukan Prisma
Drizzle memberikan SQL yang transparan, tidak ada "magic" schema sync, dan migrasi via `drizzle-kit` yang explicit. Lebih ringan dan lebih cocok untuk schema 33 tabel yang sudah dipetakan dari Convex.

### 3. eve untuk agent runtime (bukan port manual Claude Agent SDK)
`apps/agents` V1 adalah service Claude Agent SDK (run loop, tools, subagents, deep research, sandbox verifikasi). Di V2, seluruh runtime ini **diganti** dengan framework **eve** (Vercel): agent didefinisikan sebagai file di disk (`tools/`, `skills/`, `subagents/`, `schedules/`, `channels/`), durable via Workflow SDK (pause/resume crash-safe), HITL native via `needsApproval`, dan di-mount ke Next.js via `withEve()` + `useEveAgent()`. Ini **menghapus** rencana draft awal yang me-reimplementasi agent loop secara manual di Elysia + BullMQ (`agent-runner`, `agent-watchdog`, SSE run-events buatan sendiri). Lihat [01-tech-stack.md](01-tech-stack.md) dan [02-api-domains.md](02-api-domains.md) Domain 7. eve berstatus **beta** — risiko yang dicatat untuk endgame cutover.

Agent **tidak** memanggil service layer in-process untuk data Aqsha. Sebaliknya, ia menjangkau data Aqsha sendiri lewat **MCP bridge**: eve `connections` (`agent/connections/aqsha.ts` read/research + `agent/connections/aqsha_write.ts` side-effecting) ke **Aqsha MCP server** di `apps/api-v2`. Model menemukan tool via `connection__search` dan memanggil nama qualified (`connection__aqsha__search_thread_documents`, `connection__aqsha_write__execute_artifact`, dst.); model tidak pernah melihat URL/token. Yang **tetap** in-process sebagai `tools/` authored hanyalah tool yang tidak bisa lewat MCP: `verifyStatistics`/`runComputation` (butuh `ctx.getSandbox()`) dan `proposeResearchPlan` (HITL gate murni, `needsApproval`), plus built-in eve. Lihat [04-service-layer.md](04-service-layer.md). `/deep` kini **murni model-driven**: dikendalikan SKILL playbook + subagent yang dideklarasikan, **bukan** loop orkestrasi deterministik.

### 4. BullMQ untuk job non-agent (bukan Temporal/Trigger.dev)
BullMQ self-hosted via Redis. Mendukung cron, delayed jobs, retry, multi-stage. Dipakai untuk async **non-agent**: feed hydration, paper enrichment (metadata resolver+LLM), URL ingestion, account deletion. Durabilitas run agent ditangani eve (Workflow SDK), bukan BullMQ — jadi `agent-watchdog` dan job `deep-research` dari draft awal **di-drop**.

### 5. Cloudflare R2 bukan MinIO
Storage memakai **Cloudflare R2** (S3-compatible, egress gratis), diakses lewat `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (presigned PUT/GET). R2 adalah layanan cloud — **tidak ada container MinIO** di Docker Compose, dan infra Compose hanya berisi Postgres + Redis. Karena pakai S3 SDK, kode storage tidak terikat ke R2.

### 6. PostgreSQL full-text + pgvector (bukan Elasticsearch)
`tsvector` + GIN index untuk pencarian leksikal (feed items, search discovery). `pgvector` khusus untuk embeddings RAG (mengganti `@convex-dev/rag`). Tidak perlu service search tambahan.

### 7. Real-time: eve untuk agent, polling/SSE untuk sisanya
Streaming jawaban/aktivitas agent ditangani **eve** (NDJSON stream via `useEveAgent`) — bukan SSE buatan sendiri. Read non-agent yang dulu reaktif di Convex menjadi TanStack Query polling + invalidasi; SSE Elysia dipakai hanya bila perlu stream status job. Ini sekaligus menghilangkan read-amplification 250ms yang jadi akar biaya Convex. Catatan: **nama** event stream (mis. `message.appended`, `subagent.called`, `input.requested`) diverifikasi terhadap dokumen eve yang di-bundle, tapi **key payload exact-nya** (frame `EveStreamFrame` pakai diskriminan `type` + payload di bawah `data`) harus di-verifikasi ulang terhadap `node_modules/eve` saat install — eve belum terpasang di repo.

### 8. Clerk tetap digunakan
Tidak ada alasan migrasi auth provider. Clerk tetap handle OAuth + passkeys + JWT. API V2 memverifikasi JWT Clerk di tiap request (plugin auth), dan channel eve memverifikasi JWT yang sama (custom auth) untuk memetakan ke `ownerUserId`.

### 9. Polar SDK langsung (lepas dari komponen Convex)
Billing tetap Polar, tapi di-reimplementasi via Polar SDK langsung + mirror lokal `billing_subscriptions` (mengganti `@convex-dev/polar`). Invariant penting dipertahankan: `consumeCredits` atomik (period + ledger + daily rollup dalam satu transaksi), dan blokir kuota dikembalikan sebagai return-union, bukan throw.

### 10. Skills bukan domain API
Domain "Skills" pada draft awal **di-drop**. Skills adalah konsep internal eve (`agent/skills/*.md`, playbook yang di-load on-demand via `load_skill`), bukan surface API publik. Slash-command (`/deep`, dll.) pindah ke layer composer/eve; hanya palette statis `GET /commands` yang tersisa (deferred). Metodologi `/deep` hidup sebagai playbook di `agent/skills/deep-research/SKILL.md` (load-on-demand) yang menyetir model + subagent yang dideklarasikan.

### 11. MCP bridge untuk data Aqsha (bukan tool service-layer in-process)
Agent eve menjangkau data Aqsha **sendiri** lewat **Aqsha MCP server** (Streamable HTTP, `POST /mcp` di `apps/api-v2`) + eve `connections` — **bukan** memanggil `packages/services` langsung di proses. MCP server adalah adapter tipis (caller ke-4 di samping route Elysia + worker BullMQ); logic tetap satu di `packages/services` (zero duplication), dan tiap request di-auth dengan Clerk token per-user (`clerk.verifyToken` → `ownerUserId`, ownership di service layer). Dua connection: `aqsha` (read/research/citation, tanpa approval) dan `aqsha_write` (side-effecting: `save_url`, `propose_artifact`, `execute_artifact`, workspace ops, delete — `approval`). Approval kini **gate eve nyata** di level connection (pause/resume durable session), bukan hook; invariant bisnis (mis. `executeArtifact` butuh `proposeArtifact` yang approved) hidup di `execute()` MCP server. Provider riset (Exa/Jina/Crossref/arXiv/OpenAlex) dibungkus `ResearchService` dan diekspos lewat MCP server, jadi pacer/TTL cache + `consumeCredits` tetap di sisi server kita.

**Trade-off jujur (B6):** MCP bridge **mengembalikan satu HTTP hop** (web-v2/eve ↔ api-v2 MCP) dan permukaan auth ke-4 yang justru dihapus oleh tesis "zero RPC hop" di [04-service-layer.md](04-service-layer.md). Owner menerima ini demi boundary MCP yang bersih, decoupled, dan reusable (MCP client lain bisa pakai server yang sama). Catatan: dokumen eve memang menyaratkan `connections` untuk "server yang tidak kamu author" — di sini kita sengaja memakainya untuk server milik sendiri. **Pengecualian in-process (B4):** `verifyStatistics`/`runComputation` (butuh sandbox) dan `proposeResearchPlan` (HITL gate) tetap sebagai authored `tools/`, tidak lewat MCP.

## Referensi Audit

Dokumen V2 disusun berdasarkan audit mendalam terhadap kode V1 yang sebenarnya:
- `packages/convex/` — 33 tabel, schema + validator, fungsi per-domain, cron, dan rate-limit rules
- `apps/agents/` — Claude Agent SDK app (run loop, tools, subagents, deep research, sandbox) → dipetakan ke konsep eve
- `apps/web/` — ~67 call Convex yang benar-benar dikonsumsi UI + surface route (untuk phasing yang terlihat di UI)
