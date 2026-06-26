# Aqsha V2 — Technology Stack Detail

## Runtime & Package Manager

### Bun 1.3.10
Seluruh monorepo sudah pinned ke Bun 1.3.10 via `packageManager` field. V2 mengikuti konvensi yang sama. Tidak ada npm, pnpm, atau yarn.

---

## API Layer

### Elysia.js

**Peran**: HTTP API framework untuk `apps/api-v2` (semua domain **non-agent** + projeksi/bridge tipis untuk agent).

**Alasan dipilih**:
- Bun-native — tidak ada compatibility layer seperti yang diperlukan Fastify/Express
- **Eden Treaty**: type-safe API client dari server types ke frontend tanpa code generation — mirip dengan generated Convex types tapi untuk REST API
- Built-in plugin ecosystem: `@elysiajs/cors`, `@elysiajs/swagger`, dukungan macro
- Macro system untuk middleware reuse (auth guard, rate limit guard)

**Alternatif yang dipertimbangkan**:
- **Hono**: cross-runtime support yang tidak dibutuhkan (kita hanya Bun); Eden Treaty lebih unggul dari Hono RPC
- **Fastify**: Node.js-first, perlu adapter di Bun, overhead tidak perlu

**Pola Eden Treaty**:
```ts
// apps/api-v2/src/index.ts
import { Elysia } from 'elysia'
export const app = new Elysia()
  .get('/healthz', () => ({ ok: true }))
  .listen(3001)
export type App = typeof app

// apps/web-v2/lib/api.ts
import { treaty } from '@elysiajs/eden'
import type { App } from '@aqsha/api-v2'
export const api = treaty<App>(process.env.NEXT_PUBLIC_API_URL!)
```

**Lapisan**: route Elysia adalah controller tipis. Semua business logic ada di **service layer** (`packages/services`) yang juga dikonsumsi eve tool & BullMQ worker. Route hanya: verifikasi auth → validasi shape (Zod/`t.Object`) → panggil satu service method → map hasil ke HTTP. Lihat [04-service-layer.md](04-service-layer.md).

### Zod v4

**Peran**: Validasi request body, query params, dan response schema; juga `inputSchema` untuk eve tool (`defineTool`).

**Catatan**: V2 menggunakan Zod v4. Inferensi type identik dengan v3 untuk pola umum, tapi ada breaking changes di beberapa utilities.

### Aqsha MCP server

**Peran**: `apps/api-v2` meng-expose sebuah **MCP server** (Streamable HTTP) di `POST /mcp` — adapter tipis **baru** (caller ke-4) di atas `packages/services`, sejajar dengan route Elysia dan worker BullMQ. Logika tetap di service layer (zero duplication); MCP server hanya mengekspos service method sebagai MCP tool.

**Auth**: setiap request MCP diverifikasi dengan **Clerk token per-user** (`clerk.verifyToken` → `ownerUserId`), pakai client `@clerk/backend` yang sama dengan `authPlugin`. Kepemilikan ditegakkan di service layer.

**Konsumen**: agent eve adalah **client** MCP ini (lewat `agent/connections/*`), bukan pemanggil service in-process. Klien MCP lain bisa reuse server yang sama. Lihat detail jembatan di Agent Runtime di bawah dan [04-service-layer.md](04-service-layer.md).

---

## Agent Runtime

### eve (Vercel)

**Peran**: seluruh runtime agent Astra — menggantikan `apps/agents` (Claude Agent SDK) dan **membatalkan** rencana draft awal yang me-reimplementasi agent loop di Elysia + BullMQ.

**Model mental**: eve adalah framework "durable agents as ordinary files". Satu agent = satu direktori yang di-discover otomatis:

```
apps/web-v2/agent/
├── agent.ts          # defineAgent: model = field STATIK per-agent (gateway id mis. "anthropic/claude-opus-4.8")
├── instructions.md   # system prompt
├── tools/<name>.ts   # defineTool — HANYA tool yang WAJIB in-process: sandbox (verifyStatistics/runComputation) + HITL gate (proposeResearchPlan)
├── skills/<name>.md  # defineSkill — playbook di-load on-demand via load_skill (BUKAN domain API); /deep = skill deep-research
├── subagents/<name>/agent.ts  # subagent declared (deep research: literature/counter-evidence/citation-verify/writer)
├── channels/eve.ts   # channel + auth (custom Clerk AuthFn → ownerUserId)
├── connections/<name>.ts  # JALUR DATA UTAMA — jembatan MCP ke Aqsha MCP server (aqsha + aqsha_write)
├── schedules/<name>.ts  # cron yang jalan LEWAT agent (opsional)
├── hooks/<name>.ts   # observe-only: mirror event ke Postgres untuk activity UI
├── sandbox/sandbox.ts  # defineSandbox(docker()) — tepat satu sandbox per agent root; verifikasi statistik (ganti Daytona)
└── lib/              # kode bersama
```

> **agentKind (lite/pro)** adalah konsep produk/billing Aqsha, **bukan** "tier" eve. Hanya ada **dua** tipe agent: **lite** dan **pro**. Keduanya berbeda pada (1) **model** yang dipakai dan (2) **batasan** yang diberikan — pemanggilan tool, batas loop/step, dan sejenisnya. **Tidak ada `deep` sebagai agentKind**: mode **Deep Research** sepenuhnya memakai konvensi eve (**skill** `deep-research/SKILL.md` + **subagents** declared, plus kemungkinan built-in tools eve lain), jadi "deep" adalah sebuah *mode*, bukan tipe agent. eve tidak punya knob model per-turn (`defineDynamic` tidak meng-cover model), maka map `agentKind` ke (sub)agent declared yang masing-masing punya model statik di `agent.ts` (atau pilih `LanguageModel` provider di channel/orkestrator sebelum dispatch), lalu terapkan batasan tool/loop sesuai kind. Jika `agent.ts` ada, field `model` wajib; default eve lainnya `anthropic/claude-sonnet-4.6`.

**Yang di-handle eve (Domain 7)**:
- **Run loop & durabilitas** — turn/step durable via Workflow SDK; step yang sudah selesai tidak di-run ulang saat resume (mengganti replay `researchPhaseStates` buatan tangan + cron `agent-watchdog`).
- **Streaming** — NDJSON stream durable `GET /eve/v1/session/:sessionId/stream`. Frame `EveStreamFrame` mem-pakai diskriminan `type` (BUKAN `event`); payload ada di `data`. Nama event yang dipakai (NAMA-nya diverifikasi terhadap bundled docs; **key field payload exact harus di-re-verify terhadap `node_modules/eve` saat install**): `message.appended` (`data.messageDelta` + kumulatif `data.message`)/`message.completed` (`data.message` + `data.finishReason`), `reasoning.appended` (`data.reasoningDelta`)/`reasoning.completed` (`data.reasoning`), `action.result` (`data.result`), `subagent.called` (`data.{name,toolName,callId,childSessionId,sequence}`)/`subagent.completed` (`data.{subagentName,callId,output}`), `input.requested` (`data.requests`), `step.*`/`turn.*`/`session.*`. Urutan datang dari stream (bukan barrier `SegmentCoordinator` manual); reconnect via cursor session. Nama V1 (`text_segment`/`tool_start`/`subagent_start`/…) bukan frame eve — itu discriminator **proyeksi** PG (`agent_run_events.type`) yang dipetakan hook observe-only dari frame native (lihat [05-api-contracts.md](05-api-contracts.md) Domain 7).
- **Tools** — akses data dilakukan **lewat `connections` ke Aqsha MCP server** (qualified name `connection__aqsha__*` / `connection__aqsha_write__*`), bukan `execute()` service in-process. Hanya tool yang **wajib in-process** yang ditulis di `tools/`: sandbox (`verifyStatistics`/`runComputation`, butuh `ctx.getSandbox()`) dan HITL gate (`proposeResearchPlan`). Lihat subseksi **Akses data: jembatan MCP** di bawah.
- **Subagents** — `agent/subagents/<name>/agent.ts` (declared) + built-in `agent` tool. Task mode dipicu oleh `outputSchema` (BUKAN flag `background:false`). Subagent declared **tidak mewarisi apa pun** dari root (tools/skills/connections/instructions sendiri); executor dibagi via `packages/services`. Nama dir subagent tidak boleh bentrok dengan nama tool.
- **HITL** — `needsApproval` (`always()`/`once()`/`never()`/predikat) men-*pause* session durable dan resume saat user menjawab; approval **connection-level** juga jadi gate nyata yang pause/resume session. `ask_question` built-in untuk pertanyaan; plan-gate `proposeResearchPlan` = `needsApproval: once()`. Jawaban HITL via `agent.send({ inputResponses: [...] })` di session yang sama.
- **Deep research (`/deep`)** — **pure model-driven**: tidak ada kode orkestrasi deterministik (tidak ada `DEEP_PHASES`/`RunManager.executeDeepRun`). Di-drive oleh skill `agent/skills/deep-research/SKILL.md` (playbook load-on-demand) + subagent declared (`literature-searcher`/`counter-evidence`/`citation-verifier`/`writer`). Model memutuskan alur dan kapan delegasi; plan-gate `proposeResearchPlan` dipanggil duluan. Invariant **longgar**: drop ceiling biaya per-run + budget per-fase; kontrol biaya = `consumeCredits` per-call + monthly deep cap dari billing + fokus dari skill.

### Akses data: jembatan MCP

Agent eve mengakses data Aqsha sendiri **lewat Aqsha MCP server**, bukan service-layer tool in-process. Owner menerima HTTP hop yang muncul kembali demi boundary MCP yang bersih, decoupled, dan reusable.

- **B1 — server**: `apps/api-v2` meng-host MCP server (Streamable HTTP) di `POST /mcp` di atas `packages/services` (zero duplication). Tiap request diautentikasi Clerk token per-user (`clerk.verifyToken` → `ownerUserId`); ownership ditegakkan di service layer.
- **B2 — dua connection** di-declare via `defineMcpClientConnection({ url, description, auth, principalType: 'user', tools, approval })`:
  - `agent/connections/aqsha.ts` (read/research/citation, **no approval**): `tools.allow` mis. `list_artifacts`, `get_artifact`, `get_render_payload`, `search_thread_documents` (RAG), `list_workspaces`, lookup paper/explore, feed reads, `search_web`, `search_arxiv`, `lookup_doi`, `verify_citations`, `verify_identifiers`.
  - `agent/connections/aqsha_write.ts` (side-effecting, `approval: always()`/`once()`): `save_url`, `propose_artifact`, `execute_artifact`, `create_workspace`, `rename_workspace`, `link_to_workspace`, `delete_artifact`.
  - `auth.getToken` mengembalikan Clerk bearer user; eve mengirim `Authorization: Bearer`; model **tidak pernah** melihat URL/token. Model menemukan tool via `connection__search` lalu memanggil qualified name (`connection__aqsha__search_thread_documents`, `connection__aqsha_write__execute_artifact`, dst.).
- **B3 — approval = gate eve nyata**: approval connection-level mem-pause/resume session durable (BUKAN hook). Maka pola V1 "double-gate karena hook tak bisa deny" diganti: gate manusia datang dari approval `aqsha_write`, sedangkan invariant bisnis "`execute_artifact` butuh `propose_artifact` yang ter-approve" hidup di `execute()` MCP server (kode kita).
- **B5 — providers** (Exa/Jina/Crossref/arXiv/OpenAlex): di-wrap `ResearchService` dan diekspos **lewat Aqsha MCP server** (pacer + TTL cache + `consumeCredits` server-side); agent menjangkaunya via `connection__aqsha__search_*`. Pacer/cache ada di **MCP server kita**, bukan di connection eve.
- **B4 — yang tetap in-process** (tidak bisa MCP): `verifyStatistics`/`runComputation` (butuh `ctx.getSandbox()`) + `proposeResearchPlan` (HITL gate murni) + built-ins. Semua yang terkait data pindah ke connection MCP.
- **B6 — trade-off (dicatat jujur)**: jembatan MCP memunculkan kembali satu HTTP hop (web-v2/eve ↔ api-v2 MCP) dan auth surface ke-4 yang justru dihilangkan oleh tesis zero-RPC-hop di [04-service-layer.md](04-service-layer.md). Owner menerima ini demi boundary MCP yang reusable. Catatan: docs eve men-scope connections ke "server yang tidak kamu author" — kita sengaja memakainya untuk server kita sendiri.

**Integrasi frontend (Next.js)**:
```ts
// apps/web-v2/next.config.ts
import { withEve } from 'eve/next'
export default withEve(nextConfig, { eveRoot: 'agent/' })

// komponen chat
const agent = useEveAgent({
  headers: async () => ({ authorization: `Bearer ${await getClerkToken()}` }),
  initialSession,                 // restore cursor {sessionId, continuationToken, streamIndex}
  onSessionChange: persistCursor, // persist SELURUH object cursor, bukan satu field
})
```
`withEve` meng-compile & mount agent (no CORS, no URL env). `useEveAgent` auto-discover route yang ter-mount.

**API client `useEveAgent`** hanya mengekspos: `data`, `status` (`"ready"|"submitted"|"streaming"|"error"`), `error`, `events`, `session` (cursor `{sessionId, continuationToken, streamIndex}`), `send(...)`, `stop()`, `reset()`. **Tidak ada** `respond()`/`start()`/`continue()`/`cancel()`. Pemetaan:
- mulai/lanjut turn → `await agent.send({ message })`.
- batalkan/interrupt → `agent.stop()`.
- jawab HITL → `agent.send({ inputResponses: [{ requestId, optionId? }] })` (pilih opsi) atau `agent.send({ message })` (free text), di session yang sama.
- baca request HITL yang ter-park dari `agent.data.messages.at(-1).parts.find(p => p.type === 'dynamic-tool' && p.toolMetadata?.eve?.inputRequest)?.toolMetadata.eve.inputRequest` (field `requestId`, `prompt`, `options`); default reducer menandainya responded.
- persist **seluruh** object cursor via `onSessionChange`/`initialSession`, bukan satu field tunggal.

**Catatan penting & open items** (lihat [02-api-domains.md](02-api-domains.md) Domain 7 untuk detail):
- **Auth Clerk-on-eve** (build task, bukan open risk): eve mendukung **custom `AuthFn` sebagai first-class** dalam ordered auth-walk `eveChannel({ auth: [...] })`. Tulis `clerkAuthFn` yang memverifikasi Clerk Bearer lewat **`clerk.verifyToken()`** — reuse `@clerk/backend` client yang **sama** dengan `authPlugin` Elysia (satu sumber verifikasi; `oidc()` hanya bila JWKS Clerk dikonfirmasi memenuhi audience/issuer `verifyOidc`) → `SessionAuthContext { principalType: "user", principalId == ownerUserId }`, `return null` bila token absen/invalid. **Array auth produksi `= [clerkAuthFn(), ownershipAuthFn]`**: **drop `vercelOidc()`** (stack self-host VPS, bukan Vercel) dan **gate `localDev()` hanya untuk non-prod** (jangan jadikan satu-satunya authenticator — vektor Host-spoof; reverse proxy harus menormalkan/strip `Host`). **Session ownership (A8):** route-auth eve TIDAK menegakkan kepemilikan session, jadi `ownershipAuthFn` me-resolve owner session (dari map thread↔session) dan `throw ForbiddenError` saat `principalId != owner` pada `/session/:id` dan `/session/:id/stream` (alternatif: proxy tipis api-v2 di depan stream). Hanya `ownerUserId` inisiator boleh continue/stream session-nya.
- **Workflow world untuk self-host**: durabilitas eve punya dua "world" — *local world* (file `.workflow-data` di disk) dan *Vercel Workflow*. Stack kita self-host (VPS), jadi default-nya `.workflow-data` di volume persisten VPS (single-node). Swapping ke world berbasis Postgres/Redis adalah kapabilitas **future** (belum GA). **Open decision** dicatat di fase cutover.
- **`execute_artifact` gate** (per B3): gate manusia kini datang dari **approval connection `aqsha_write`** (gate eve nyata yang pause/resume session) — bukan hook (hook observe-only, tak bisa deny). Invariant bisnis "`execute_artifact` butuh `propose_artifact` ter-approve" hidup di `execute()` **MCP server** (cek row proposal ter-approve di Postgres), kode kita.
- **Providers** (Exa/Jina/Crossref/arXiv/OpenAlex) (per B5): di-wrap `ResearchService` dan diekspos **lewat Aqsha MCP server** (pacer + TTL cache + `consumeCredits` server-side); agent menjangkaunya via `connection__aqsha__search_*`. Pacer/cache ada di MCP server kita, bukan di connection eve.
- **Sandbox verifikasi** (per A3): pakai `agent/sandbox/sandbox.ts` (layout folder, wajib bila men-seed `agent/sandbox/workspace/**`) atau shorthand `agent/sandbox.ts` — **jangan** `agent/sandbox/<name>.ts` (tepat satu sandbox per agent root). Biarkan factory `docker()` egress **OPEN** agar `bootstrap()` bisa install R/packages, lalu enforce `networkPolicy: 'deny-all'` di `onSession({ use }) => await use({ networkPolicy: 'deny-all' })`. Docker hanya menghormati allow-all/deny-all (tidak ada domain allow-list; pakai `microsandbox()` bila perlu lebih halus). Subagent declared **tidak mewarisi** sandbox. Mengganti `@daytona/sdk`; ekstraksi klaim LLM tetap di runtime tool agar tanpa egress.
- **Harness tool policy** (per A6): eve mengirim **semua** built-in ON secara default (`bash`, `read_file`, `write_file`, `glob`, `grep`, `web_fetch`, `web_search`, `todo`, `ask_question`, `agent`, `load_skill`, `connection_search`). Research agent harus `disableTool()` `bash`/`write_file`/`glob`/`grep` di root, dan disable/approval-gate `web_search`/`web_fetch` agar akses web dipaksa lewat research tool Aqsha MCP server (yang bawa pacer/cache). `web_search` tidak punya executor lokal.
- **Versi eve**: target eve v0.11.6. eve belum ter-install di repo — bundled docs (`~/.agents/skills/eve/docs`) jadi source of truth; **NAMA** event/API diverifikasi terhadap bundled docs, tapi **key field payload exact** harus di-re-verify terhadap `node_modules/eve` saat install. eve masih **beta** — API bisa berubah; risiko untuk endgame cutover.

---

## Database Layer

### PostgreSQL 17 (Docker)

**Peran**: Primary database, menggantikan Convex DB.

**Extension yang diaktifkan** (`infra/init-extensions.sql`):
- `vector` (pgvector): vector similarity search untuk RAG (menggantikan `@convex-dev/rag`)
- `uuid-ossp`: UUID generation di level DB
- `unaccent`: normalisasi teks untuk full-text search

**Pemetaan dari Convex** (lihat detail per-tabel di [02-api-domains.md](02-api-domains.md)):
- `_id` implisit → PK eksplisit. Tabel agent sudah pakai string id eksternal (`thr_*`/`run_*`) sehingga map bersih; tabel lain (`workspaces`/`artifacts`/`feed_items`) mint PK baru (`uuid`/`text`).
- `_creationTime` → kolom epoch-ms `bigint` (`created_at`) agar nilai di kontrak identik dengan V1.
- `v.union(v.literal(...))` → `text` + `CHECK` (atau enum PG).
- `v.id("_storage")` → kolom `*_r2_key text` (object key R2).
- kolom JSON Convex (`rawJson`/`metadataJson`/`payloadJson`/…) → `jsonb`.
- `.searchIndex(...)` di `feedItems` → kolom `tsvector` GENERATED + GIN (leksikal; **bukan** pgvector).

**Full-text search via tsvector**:
```sql
ALTER TABLE feed_items
  ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(search_text, ''))
  ) STORED;
CREATE INDEX feed_items_search_idx ON feed_items USING GIN(search_vector);
-- search_text diderivasi (deriveSearchText: title+summary+topics, lowercase, cap 2000) di SETIAP write feed_items.
```

### Drizzle ORM + drizzle-kit

**Peran**: TypeScript ORM + schema management, di `packages/db`. Query SQL-transparan, schema-as-code, migrasi explicit (`generate` + `migrate`, tanpa auto-apply berbahaya). Drizzle dipanggil **hanya** dari repository layer (lihat [04-service-layer.md](04-service-layer.md)).

**Struktur packages/db**:
```
packages/db/
├── src/
│   ├── schema/
│   │   ├── users.ts        # users
│   │   ├── workspaces.ts   # workspaces, workspace_folders
│   │   ├── artifacts.ts    # artifacts + 4 side tables (contents/extractions/paper_metadata/urls)
│   │   ├── threads.ts      # chat_threads, chat_messages
│   │   ├── agent-runs.ts   # agent_runs, agent_run_events, pending_interactions, research_sources
│   │   ├── feed.ts         # feed_items, explore_papers, saved/hidden, interactions, interests
│   │   ├── billing.ts      # subscriptions, credit_periods, usage_ledger, daily_rollup
│   │   ├── rag.ts          # pgvector embeddings (ragEntryId seam)
│   │   └── index.ts        # re-export semua
│   ├── migrations/         # generated by drizzle-kit
│   ├── client.ts           # createDb() factory
│   └── index.ts
├── drizzle.config.ts
└── package.json
```

---

## Async Jobs & Scheduled Tasks

### BullMQ (Redis-backed)

**Peran**: Job queue untuk pekerjaan **non-agent** (data ingestion, extraction, deletion). Durabilitas run agent ditangani eve (Workflow SDK), **bukan** BullMQ.

**Alasan dipilih vs alternatif**: Temporal (managed, overhead), Trigger.dev (vendor lock-in). BullMQ self-hosted, Redis-backed, battle-tested, TypeScript-first.

**Jobs yang dimigrasikan dari Convex**:

| Convex (V1) | BullMQ Queue | Trigger |
|---|---|---|
| `feed/hydrateCycle` cron 3h (5 lane) | `feed-hydration` (repeatable + child jobs) | Cron `0 */3 * * *` |
| metadata enrichment (resolver+LLM) | `paper-enrichment` | On upload PDF (resolver-first + LLM fallback) |
| `explore`/URL ingest | `url-ingestion` | On `ArtifactService.saveUrl` |
| account deletion cascade | `account-deletion` | On user delete / Clerk webhook |
| title generation | `thread-title` | After first turn |
| stalled agent run sweep | _(eve Workflow SDK + BullMQ stalled-job)_ | — |

> **Di-drop dari draft awal**: `agent-watchdog` (durabilitas run kini punya eve) dan job `deep-research` (di-orkestrasi sebagai satu session eve dengan subagents). Worker memanggil service layer yang sama dengan route/eve — lihat [04-service-layer.md](04-service-layer.md).

**Worker structure** (di `apps/api-v2`, atau worker entrypoint terpisah):
```
apps/api-v2/src/workers/
├── feed-hydration.worker.ts     # refreshTrendingPapers/Topics/GoogleNews/FactCheck + enrich
├── paper-enrichment.worker.ts   # resolver-first + LLM fallback (monotonic metadata rank, no GROBID)
├── url-ingestion.worker.ts      # classify academic/generic → crawl/resolve → finalize
├── account-deletion.worker.ts   # paginated owner cascade (tanpa cap 500-row)
└── thread-title.worker.ts       # generateObject judul thread
```

---

## Cache & Broker

### Redis 7 (Docker)

**Peran ganda**:
1. **BullMQ broker**: backend untuk job queues
2. **Rate limit store**: token bucket via `rate-limiter-flexible` (mengganti `@convex-dev/rate-limiter`)
3. **Cache layer**: external link/paper preview, RSS/OpenAlex hasil, consensus cache (30 hari)
4. **Idempotency**: `SETNX`+TTL untuk dedupe webhook (mengganti tabel `authEvents`/`billingEvents`)

**Rate limit rules** (di-port dari `limits.ts` V1; dipakai oleh `SendQuotaService` + per-provider buckets). Contoh utama:

| Rule | Limit | Window | Scope |
|---|---|---|---|
| `sendMessage` | 2 req | 5 detik | Per-user (cap burst) |
| `globalSendMessage` | 1000 req | 1 menit | Global |
| `globalTokenUsage` | 100000 tok | 1 menit | Global |
| `workspaces:create` | 3 req | 1 jam | Per-user |
| `artifacts:create` | 20 req | 1 menit | Per-user |
| `artifacts:upload` | 5 req | 1 menit | Per-user |
| `externalSearchPerUser` | 20 req | 1 menit | Per-user |
| `openAlexSearchGlobal` | 30 req | 1 menit | Global |
| `arxivSearchGlobal` | 1 req | 3 detik | Global (pacer) |
| `crossrefLookupGlobal` | 30 req | 1 menit | Global |
| `sandboxComputePerUser` | 5 req | 1 menit | Per-user |
| `citationVerifyPerUser` | 10 req | 1 menit | Per-user |

```ts
// Elysia macro untuk rate limiting (route non-agent)
import { RateLimiterRedis } from 'rate-limiter-flexible'
export const rateLimitMacro = (app: Elysia) =>
  app.macro({
    rateLimit(rule: string) {
      return {
        async beforeHandle({ ownerUserId, set }) {
          try {
            await limiters[rule].consume(ownerUserId)
          } catch {
            set.status = 429
            return { error: 'rate_limited', code: 'rate_limited' }
          }
        }
      }
    }
  })
```

> Tidak ada tabel `rateLimits` di PG — semua counter di Redis.

---

## File Storage

### Cloudflare R2

**Peran**: object storage S3-compatible (cloud) untuk semua blob — menggantikan Convex `storage`. **Bukan MinIO**, **tanpa container** (R2 adalah layanan cloud; infra Compose hanya Postgres + Redis).

**Alasan**: egress gratis, S3-compatible. Diakses lewat `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` dengan custom endpoint R2 — sehingga kode storage tidak terikat ke R2 dan tetap testable terhadap bucket dev.

**Buckets** (atau prefix dalam satu bucket):
- `papers` — PDF + extracted TEI/sections/refs dari paper akademik
- `artifacts` — file artifacts workspace (PDF, DOCX, markdown oversized, images)
- `avatars` — avatar user (ganti sentinel `storage:<id>`)
- `exports` / `tmp` — archive export sementara & upload sebelum finalize

**Pola presigned URL** (frontend tidak pernah pegang kredensial R2; lihat pola tiga-langkah di [05-api-contracts.md](05-api-contracts.md)):
```ts
// clients/r2.ts — satu-satunya tempat key R2 di-sign/baca/tulis
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,            // https://<acct>.r2.cloudflarestorage.com
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
})

export const presignPut = (key: string, contentType: string) =>
  getSignedUrl(r2, new PutObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key, ContentType: contentType }), { expiresIn: 3600 })

export const presignGet = (key: string, ttl = 3600) =>
  getSignedUrl(r2, new GetObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key }), { expiresIn: ttl })
```

> **Fix kebocoran V1**: di V1, hapus artifact hanya soft-delete dan tidak pernah membebaskan blob/RAG entry. Di V2, `ArtifactService.remove` meng-enqueue penghapusan object R2 + entry pgvector.

---

## Authentication

### Clerk (tetap, tidak berubah)

**Peran**: Auth provider — OAuth, passkeys, session management. Clerk = source of truth identitas; tabel `users` PG adalah mirror lokal + state-machine deletion.

**Integrasi di API V2 (plugin Elysia)**:
```ts
import { createClerkClient } from '@clerk/backend'
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })

export const authPlugin = new Elysia()
  .derive(async ({ headers, set }) => {
    const token = headers.authorization?.replace('Bearer ', '')
    if (!token) { set.status = 401; return { ownerUserId: null } }
    const payload = await clerk.verifyToken(token)
    return {
      ownerUserId: payload.tokenIdentifier ?? payload.sub, // canonical owner key (== V1 identity.tokenIdentifier)
      clerkUserId: payload.sub,
      email: payload.email,
    }
  })
```

**Integrasi di eve**: channel `agent/channels/eve.ts` memverifikasi Bearer Clerk yang dikirim `useEveAgent` dan memetakannya ke `ownerUserId` (custom `clerkAuthFn` + `ownershipAuthFn` — build task, lihat eve section di atas).

**Webhook**: `POST /webhooks/clerk` — handle `user.created`/`updated`/`deleted` (svix verify), idempotency via Redis `SETNX`. `user.deleted` memicu `AccountDeletionService`.

---

## Billing

### Polar SDK (tetap, di-reimplementasi langsung)

**Peran**: subscription + credit management. Billing tetap Polar, tapi lewat **Polar SDK langsung** + mirror lokal `billing_subscriptions` (mengganti komponen `@convex-dev/polar`).

**Integrasi**: `POST /webhooks/polar` (verify signature → `BillingService.applyPolarWebhook`, idempotent via Redis). `BillingService.consumeCredits` adalah write-path tersibuk & terbagi (route send-gate + eve tool + worker), dan **harus** atomik: debit `billing_credit_periods` + insert `provider_usage_ledger` + upsert `usage_daily_rollup` dalam satu transaksi. Blokir kuota = return-union (`{ ok:false, reason }`), bukan throw. Lihat [04-service-layer.md](04-service-layer.md).

---

## Real-time

### Agent: eve NDJSON stream; non-agent: polling + SSE

**Agent (Domain 7)** — streaming jawaban/reasoning/tool/subagent ditangani **eve** lewat NDJSON stream yang dikonsumsi `useEveAgent`. Tidak ada SSE run-event buatan sendiri, tidak ada `StreamBridge`/`SegmentCoordinator` manual. Activity view-model dibangun dari frame stream eve + hook observe-only yang mirror ke `agent_run_events` (untuk history yang queryable).

**Non-agent** — read yang dulu reaktif di Convex menjadi **TanStack Query polling + invalidasi**. SSE Elysia (`async function*`) dipakai hanya bila perlu stream progress job (mis. status ingestion).

**Kenapa begini**: semua use case realtime agent adalah one-way (server→client) dan kini milik eve; menghapus read reaktif 250ms menghilangkan read-amplification yang jadi akar biaya Convex.

```ts
// Non-agent polling
const { data: feed } = useQuery({
  queryKey: ['feed', tab],
  queryFn: () => api.feed.get({ query: { tab } }),
  refetchInterval: 30_000,
})
```

---

## Frontend (apps/web-v2)

### Next.js 16 + React 19
Versi mengikuti `apps/web`. **UI V2 tidak berubah dari V1** — `apps/web-v2` menyalin langsung komponen & elemen UI dari `apps/web`, termasuk konfigurasi **shadcn** (`components.json`), **global CSS** (`globals.css`), **Tailwind v4**, **HugeIcons**, dan token `@aqsha/ui`. Yang berganti hanya **lapisan data** (Convex → Eden Treaty/TanStack Query + `useEveAgent`), **bukan** presentasi/komponen. **Meng-host agent eve** via `withEve()` (folder `agent/` di root project web-v2).

### TanStack Query v5
Dipakai untuk semua server state non-agent — menggantikan reactive Convex queries dengan polling + invalidasi. State agent dikelola `useEveAgent`.

### Eden Treaty
Type-safe API client dari Elysia App type. Di-install sebagai workspace dep dari `@aqsha/api-v2`. Token Clerk di-inject di header.
