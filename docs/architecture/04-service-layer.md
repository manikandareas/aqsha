# Aqsha V2 — Service Layer

> Service layer adalah **satu-satunya tempat business logic hidup**, sehingga tiga jenis caller — **route Elysia**, **Aqsha MCP server** (`apps/api-v2` `POST /mcp`), dan **BullMQ worker** — memakai fungsi yang sama tanpa redundansi. Ini menjawab persyaratan eksplisit: API yang berbagi logika harus berbagi fungsi. **eve agent bukan lagi caller in-process langsung**: ia mengakses data Aqsha sebagai **client** dari Aqsha MCP server (lewat eve connections), bukan via service-layer tool in-process (B7).

## Kenapa Service Layer

Di V1 (Convex), business logic dipanggil dari banyak tempat dan sebagian terduplikasi; lebih parah lagi, `apps/agents` me-*RPC* balik ke 28 endpoint `agent/service:*` Convex hanya untuk meminjam business logic (satu hop HTTP per operasi). Di V2 ada **tiga caller** untuk logika yang sama:

1. **Route Elysia** (`apps/api-v2/src/routes/*`) — surface HTTP/produk.
2. **Aqsha MCP server tool** (`apps/api-v2` `POST /mcp`, adapter MCP tipis ke `packages/services`) — agent eve menyimpan URL, mencari, verifikasi sitasi, dll. **sebagai client** dari MCP server (lewat eve connections `connection__aqsha__*` / `connection__aqsha_write__*`), bukan tool in-process.
3. **BullMQ worker** (`apps/api-v2/src/workers/*`) — feed hydration, extraction, enrichment, deletion.

Tanpa service layer, logika seperti "simpan URL ke workspace (dedupe + capacity + enqueue ingest)" akan ditulis ulang di tiga tempat. Dengan service layer, ketiganya memanggil **satu** `ArtifactService.saveUrl` — **satu rumah service, zero duplikasi**.

> **Beberapa tool tetap in-process authored (B4).** Sebagian kecil tool eve **tidak** lewat MCP karena butuh kapabilitas runtime eve: `verifyStatistics`/`runComputation` (butuh `ctx.getSandbox()` untuk docker sandbox deny-all) dan `proposeResearchPlan` (pure HITL gate, `needsApproval`). Selain itu, **semua** yang data-related pindah ke Aqsha MCP connection.

> **Trade-off jujur (B6).** Bridge MCP **memperkenalkan kembali satu hop HTTP** (web-v2/eve ↔ api-v2 `/mcp`) dan **surface auth keempat** — persis yang dihilangkan oleh tesis "zero RPC hop" awal dokumen ini. Owner **menerima** trade-off ini demi boundary MCP yang bersih, decoupled, dan reusable (MCP client lain bisa pakai server yang sama). eve men-scope connections untuk "server yang tidak kamu author"; di sini kita sengaja memakainya untuk server milik kita sendiri.

```
        Route Elysia    Aqsha MCP server tool         BullMQ worker
                         (connection__aqsha__*)
              \                    |                       /
               \                   |                      /
                ▼                  ▼                     ▼
              ┌───────────────────────────────────────────┐
              │      packages/services (BUSINESS LOGIC)     │   ← ownership, capacity, billing,
              │   WorkspaceService / ArtifactService / ...  │     validation, dedupe, state machine,
              └───────────────────────────────────────────┘     transaksi multi-tabel, orkestrasi side-effect
                          |                       |
                          ▼                       ▼
                ┌──────────────────┐     ┌──────────────────┐
                │ repositories (DB) │     │ clients (infra)   │
                │  Drizzle queries  │     │ r2/redis/clerk/   │
                │  + keyset cursor  │     │ polar/llm         │
                └──────────────────┘     └──────────────────┘
```

## Empat Lapisan (dependensi hanya ke bawah)

### 1) Delivery / Edge — tipis, hanya owner-resolution + shape

Tiga entrypoint paralel, semuanya tipis:

- **Route Elysia**: plugin auth memverifikasi Clerk JWT → `ownerUserId` (`= identity.tokenIdentifier`) + `email`; route memvalidasi shape (`t.Object`/Zod, di-export Eden Treaty), memanggil **tepat satu** service method, mapping hasil ke HTTP, dan menerjemahkan `AppError` → JSON terstruktur (`lib/errors.ts`). Return-union produk (`EntitlementResult`, send-quota) dikembalikan sebagai body 200/402, **bukan throw**.
- **Aqsha MCP server tool**: handler MCP (`apps/api-v2` `POST /mcp`) menurunkan `ownerUserId` dari **per-user Clerk token** yang dibawa request MCP (`clerk.verifyToken()`, diverifikasi server-side; reuse `@clerk/backend` client yang sama dengan authPlugin Elysia) lalu memanggil **service method yang sama**. Tidak ada business logic di adapter MCP selain mapping input + trim payload yang model lihat. Ownership tetap ditegakkan di service layer. Human gate untuk tool side-effecting datang dari **approval connection eve** (`aqsha_write`, `approval: always()`/`once()`) yang mem-pause/resume durable session — gate bisnis "execute butuh propose yang disetujui" hidup di `execute()` MCP server (kode kita).
- **BullMQ worker**: processor menarik `ownerUserId`/id dari `job.data` lalu memanggil service method. Worker **tak pernah** menduplikasi logika — mis. `url-ingestion.worker` memanggil `PaperService.ingestUrl`, `feed-hydration.worker` memanggil `FeedService.refresh*`, `account-deletion.worker` memanggil `AccountDeletionService.purgeOwner`.

### 2) Service — satu-satunya rumah business rule

`packages/services/*`: ownership assertion, kapasitas plan (workspace/library), entitlement + debit kredit, validasi (`throwAppError` kode terstruktur), dedupe, state machine status, transaksi multi-tabel, dan orkestrasi side-effect (enqueue BullMQ, presign R2, index RAG). Service boleh memanggil service lain (komposisi atas duplikasi): `ArtifactService.saveUrl → WorkspaceService.ensureDefaultWorkspace`; `ThreadService.send → SendQuotaService.check → BillingService.consumeCredits`. Service **framework-agnostic**: tanpa import Elysia/eve/BullMQ, tanpa req/res — sehingga ketiga caller bisa memakainya. Service menerima handle transaksi (unit-of-work) agar invariant lintas-tabel jalan dalam satu transaksi Drizzle.

> **Ownership di service, bukan di edge.** Verifikasi JWT memang di edge, tapi assertion kepemilikan baris (`row.ownerUserId === ownerUserId`) ada **di service** — supaya eve tool & worker (yang melewati edge JWT) tetap terjaga sama ketatnya.

### 3) Repository — satu-satunya pemegang SQL

`packages/db/src/repositories/*`: satu repo per aggregate (`UserRepo`, `WorkspaceRepo`, `ArtifactRepo` + side-table repos, `FeedRepo`, `PaperMetadataRepo`, `ThreadRepo`, `RunRepo`, `BillingRepo`, `InterestRepo`). Repo memegang **semua** query/index Drizzle (where-clause index-backed seperti `by_owner_status_updated`), mengembalikan row bertipe, dan menerima `tx` opsional agar service bisa menyusun beberapa repo call secara atomik. Repo **tanpa business rule** (tanpa cek kapasitas/billing/ownership) — hanya persistensi bertipe + logika **keyset-pagination cursor** yang mengganti `paginate()` Convex.

### 4) Clients — adapter infra (tanpa domain logic, tanpa Drizzle)

`apps/api-v2/src/clients/*`:
- `r2.ts` — R2/S3 via `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`: `presignPut/presignGet/getObjectText/putObject/deleteObject`. **Satu-satunya** tempat key R2 di-sign/baca/tulis (mengganti `ctx.storage.*` Convex).
- `redis.ts` — singleton ioredis + helper: `setNxWithTtl` (idempotency webhook, ganti `authEvents`/`billingEvents`), `getJson/setJsonWithTtl` (cache `externalLookupCache`/`feedConsensus`), factory Queue/Worker BullMQ.
- `clerk.ts` — `@clerk/backend` + svix verify: `verifyWebhook`, `deleteUser` (404=ok), `getUser`.
- `polar.ts` — Polar SDK langsung (`@convex-dev/polar` **dihapus**): checkout/portal/change/cancel/getSubscription/syncProducts/verifyWebhook.
- `llm.ts` — handle provider Vercel AI SDK (`generateObject/generateText`) untuk method AI `FeedService`, `ThreadService.generateTitle`, fallback metadata `PaperService`. (Model agent sendiri dipanggil eve, bukan client ini.)

> **eve bukan client yang kita tulis.** eve di-mount via `withEve` dan memiliki state durabilitas session/turn/step. Untuk mengakses data Aqsha, agent eve menjadi **client dari Aqsha MCP server** lewat connections (`aqsha`/`aqsha_write`) — service di-*import oleh* adapter MCP di `apps/api-v2`, **bukan** oleh `execute()` tool in-process eve (kecuali tool pengecualian B4: sandbox + HITL gate). `api-v2` tidak memanggil eve kecuali bridge tipis opsional (memetakan thread produk ↔ `continuationToken` eve).

**Aturan pembeda**: *client* berbicara protokol ke satu sistem eksternal dan tak tahu tabel/aturan Aqsha; *service* memiliki domain, menegakkan ownership+capacity+billing+validasi, menyusun repository + client, dan adalah **satu-satunya tempat** sepotong logika hidup untuk ketiga caller.

## Kenapa Repository (bukan Drizzle langsung dari service)

Pakai **repository tipis** (satu per aggregate). Alasan ter-ground di codebase ini:
1. **Query yang sama dipakai banyak caller** — `ThreadRepo.findByThreadId` dibutuhkan `ThreadService.assertOwner` (route), bridge thread eve, dan worker; `ArtifactRepo.findActiveByOwnerArtifact` mem-back `get`/`getRenderPayload`/`getContentTarget` + 6 fungsi patch internal. Memusatkan where-clause index-backed mencegah index/filter drift (mis. V1 `listThreadsByWorkspace` melakukan filter in-memory karena tak ada index — repo memaksa index `(owner,workspace,lastActivityAt)` sebagai satu-satunya jalan).
2. **Invariant tersulit bersifat multi-tabel dalam satu transaksi** — `consumeCredits` (debit period + insert ledger + upsert daily rollup), split 5-tabel artifact, `syncArtifactWorkspaceMove` (cascade `workspace_id` ke 4 side table), cascade account-deletion. Repo yang menerima `tx` bersama membuat ini berjalan dalam **satu** transaksi Drizzle dengan row-lock untuk increment atomik — sama dengan atomisitas satu-mutation Convex V1 — tanpa menyebar plumbing tx ke route.
3. **Keyset cursor** rumit & per-tabel; enkapsulasi encode/decode cursor di repo (`FeedRepo.paginateByOrder`, `ThreadRepo.listByActivity`) menjaganya konsisten dan lepas dari service.
4. **Testability** untuk endgame cutover: service di-unit-test terhadap repo fake/in-memory (cermin V1 `MemoryStore` vs `ConvexStore`), dan ketiga caller (route + eve tool + worker) menjalankan service yang sudah teruji.

Repo tetap **bodoh** (tanpa kapasitas/billing/ownership). Pengecualian satu-satunya: query read-only sepele tanpa reuse boleh inline Drizzle di service; apa pun yang ditulis >1 jalur atau dibaca >1 caller lewat repo.

## Katalog Service

Tabel di bawah meringkas setiap service, *seam* berbagi paling penting (logika yang membunuh redundansi), dan caller-nya. Signature method lengkap ada di `packages/services` saat implementasi; kontrak endpoint terkait di [05-api-contracts.md](05-api-contracts.md).

| Service | Dikonsumsi | *Shared seam* yang membunuh redundansi |
|---|---|---|
| **UserService** | route, worker | `ensureCurrentUser` (provision `users` + default workspace) dipakai route auth-bootstrap, worker webhook Clerk, dan `OnboardingService.complete` (self-heal) — V1 menduplikasi self-heal ini di `syncCurrentUser` **dan** `onboarding.complete`. |
| **AccountDeletionService** | route, worker | `purgeOwner` (cascade owner-data + sweep R2) dipanggil route self-delete **dan** worker webhook `user.deleted` — cascade sama, hanya self-delete yang juga panggil Clerk. |
| **OnboardingService** | route | `complete` me-reuse `UserService.ensureCurrentUser` + `InterestService.seedInterests(topicsForInterestFields(...),2)`. |
| **InterestService** | route, eve-tool, worker | `topInterestTopics` adalah satu *seam* (`feed.userInterestTopics`) untuk feed scoring + explore recommendation seed + `explainRelevance`; `bumpInterests` (+1 save / +2 research / −1 hide) dibagi semua jalur save/hide/interaction. |
| **BillingService** | route, eve-tool, worker | `consumeCredits` = write-path **paling terbagi**: eve tool (tiap call model), send-gate (route), dan worker AI/enrichment semuanya debit lewatnya — dan **harus** bump period + ledger + daily rollup dalam **satu transaksi**. `getSnapshot`/`ensureCreditPeriod` dibagi `billing.current` & `usage.currentPeriod`. |
| **WorkspaceService** | route, eve-tool, worker | `create`/`rename` dipakai route publik **dan** eve tool (`createFromAgentInternal`/`renameFromAgentInternal` V1); `ensureDefaultWorkspace` (cold-start) dipakai `UserService` sign-in, `ArtifactService.linkToWorkspace`, dan `saveUrl`. |
| **ArtifactService** | route, eve-tool, worker | `saveUrl` = target tunggal "Save-to-Workspace" (UI feed/explore + tombol reader + eve tool); `linkToWorkspace` menyatukan dua nama V1 (`linkArtifactToWorkspace`/`saveAttachmentToWorkspace`); `finalizeUpload` menyatukan `createFromStorage`/`createThreadAttachmentFromStorage`/`finalizeStoredArtifact`. |
| **PaperService** | route, eve-tool, worker | `upsertResolvedPaperMetadata` (monotonik rank manual>resolver>llm) = **satu writer** untuk ingestUrl + enrichUploaded; `fetchOpenAlexWorks` (cache+bucket) = spine OpenAlex untuk explore search + lane feed. |
| **FeedService** / **FeedInteractionService** / **FeedAiService** | route, worker | save/hide/record id-based **dan** unified-discovery ref-based melewati helper yang sama (+ `InterestService.bump` + `ensureFeedItemForPaperKey`); `deriveOrderAt`+`deriveSearchText` jalan di **setiap** write feed. |
| **ThreadService** | route, eve-tool, worker | `send` (gabungan `startThread`+`sendMessage` lewat `SendQuotaService`); `assertOwner(threadId)` dipakai semua read/context/upload-presign; method WRITE (run/event/message) dipanggil **hook eve** untuk mirror activity ke PG (ganti RPC `ConvexStore`). |
| **SendQuotaService** | route, eve-tool | `check` (= `checkAndConsumeSendQuota` V1: estimasi token, pilih feature/model/requiredPlan, `consumeCredits`, 3 bucket rate-limit Redis); `getSendStatus` (read non-consuming) untuk cooldown composer — pakai definisi bucket Redis yang sama. |
| **ExploreService** | route, eve-tool | `searchPapers` seed rekomendasi dari `InterestService.topInterestTopics` + persist via `PaperService.upsertPaperCache`; `getOrFetchPaper` reuse `fetchOpenAlexWorks` + resolver key (doi/arxiv/title). |
| **RagService** | eve-tool, worker | `index` dibagi `ArtifactService.finalizeUpload` (teks PDF inline `unpdf`/`mammoth`/utf8), ingestUrl, dan reindex setelah link headless→workspace; `searchThreadDocuments` = jalur RAG eve tool (V1 delegasi ke `@convex-dev/rag`). |

> **Catatan label kolom "Dikonsumsi".** Di tabel di atas, `eve-tool` kini berarti **diakses agent eve sebagai _client_ dari Aqsha MCP server** (`connection__aqsha__*` / `connection__aqsha_write__*` → adapter MCP di `apps/api-v2 /mcp` → service yang **sama**), **bukan** pemanggilan `execute()` service in-process (B7). Pengecualian in-process (B4): `SandboxService.verifyStatistics`/`runComputation` (butuh `ctx.getSandbox()`) dan `proposeResearchPlan` (HITL gate) tetap tool authored in-process. `BillingService.consumeCredits` tetap write-path paling terbagi — untuk jalur agent ia dipanggil oleh adapter MCP server (bukan tool in-process), dengan idempotency key per-step (lihat §Transaksi).

### Sub-modul & helper (di-referensikan 02/05/06)

Beberapa nama service muncul di [02-api-domains.md](02-api-domains.md)/[05-api-contracts.md](05-api-contracts.md)/[06-implementation-phases.md](06-implementation-phases.md) sebagai **sub-modul** dari service di atas (dipisah saat implementasi bila file `*.service.ts`-nya membesar) — tetap satu lapisan service, satu rumah business rule:

- **`ThreadService.send` adalah seam tunggal**; `startThread()` dan `sendMessage()` adalah dua **entrypoint HTTP** (Domain 6) ke seam itu (`send` dengan/atau tanpa `threadId`). 05 mendokumentasikannya sebagai dua route; 04 menyebut seam-nya `send`.
- **`MessageService` / `RunService` / `InteractionService` (alias HitlService)** — sub-modul `ThreadService` untuk proyeksi `chat_messages` / `agent_runs`+`agent_run_events` / `pending_interactions` (ditulis oleh hook eve observe-only).
- **`ContextService`** — sub-modul `ThreadService` untuk hidrasi @mention (cap 8 artifacts / 30 items); memanggil `ArtifactService` + `WorkspaceService`.
- **`StorageService`** — wrapper domain tipis di atas client `r2.ts` (presign/get/store/delete + threshold inline-vs-R2); dipakai `ArtifactService`/`UserService` (avatar). Boleh dianggap bagian `ArtifactService` bila lebih disukai.
- **`CitationService` / `SandboxService` / `ResearchService`** — service agent untuk verifikasi sitasi, sandbox statistik (`defineSandbox(docker())`), dan pencarian + persist `research_sources`. `CitationService` & `ResearchService` di-*expose lewat Aqsha MCP server* (mis. `connection__aqsha__verify_citations`, `connection__aqsha__search_*` dengan pacer + TTL cache + `consumeCredits` server-side) — agent eve mengaksesnya sebagai client. **`SandboxService` adalah pengecualian** (B4): `verifyStatistics`/`runComputation` tetap tool in-process authored karena butuh `ctx.getSandbox()`, **tidak** lewat MCP.
- **`ExploreService` / `PaperService.upsertPaperCache` (PaperCacheService)** — spine paper bersama (cache `explore_papers` + waterfall provider).
- **`FeedAiService.getConsensus`** — meter consensus ada di `FeedAiService` (bukan service terpisah); semua surface AI feed (consensus/ideas/explain) di-gate `consumeCredits`.
- **`RateLimiterService`** — wrapper tipis di atas bucket Redis (`rate-limiter-flexible`, lihat [01-tech-stack.md](01-tech-stack.md)); dipakai macro Elysia + `SendQuotaService` + tool provider eve. Bukan business logic, lebih dekat ke util/client.

## Contoh Konkret — Satu Fungsi, Tiga Caller

**`ArtifactService.saveUrl`** dipanggil identik dari route, Aqsha MCP server tool, dan (efeknya) worker:

```ts
// packages/services/src/artifact.service.ts  — SATU sumber kebenaran
export async function saveUrl(
  ownerUserId: string,
  input: { workspaceId: string; folderId?: string; url: string; title?: string },
  ownerEmail?: string,
): Promise<{ artifactId: string }> {
  await WorkspaceService.assertOwner(ownerUserId, input.workspaceId, { requireActive: true })
  const normalized = normalizeUrl(input.url)
  const existing = await ArtifactRepo.findByNormalizedUrl(ownerUserId, input.workspaceId, normalized)
  if (existing) return { artifactId: existing.id }            // idempotent dedupe
  await assertLibraryCapacity(ownerUserId)                    // kapasitas plan
  const artifactId = await ArtifactRepo.insertUrlArtifact(ownerUserId, { ...input, normalized })
  await enqueue('url-ingestion', { ownerUserId, artifactId }) // side-effect: worker
  return { artifactId }
}
```

```ts
// 1) Route Elysia — POST /workspaces/:id/artifacts/url
.post('/workspaces/:id/artifacts/url', async ({ ownerUserId, params, body }) =>
  ArtifactService.saveUrl(ownerUserId, { workspaceId: params.id, url: body.url, title: body.title }))

// 2) Aqsha MCP server tool — apps/api-v2/src/mcp/server.ts (di-expose di POST /mcp)
//    Agent eve memanggilnya sbg client lewat connection__aqsha_write__save_url
mcp.tool('save_url', {
  description: 'Save a URL into the user’s workspace library.',
  inputSchema: { workspaceId: z.string(), url: z.string() },
}, async ({ workspaceId, url }, { auth }) => {
  const ownerUserId = await clerk.verifyToken(auth.bearer)            // per-user Clerk token
  return ArtifactService.saveUrl(ownerUserId, { workspaceId, url })   // service method yang SAMA
})

// 3) Worker — url-ingestion.worker.ts memakai PaperService.ingestUrl (sibling), yang dipicu enqueue di atas
```

Tidak ada satupun dari ketiga caller yang menyalin logika dedupe/kapasitas/enqueue — semuanya ada di `saveUrl`. Agent eve tidak memanggil `saveUrl` in-process; ia memanggil tool `save_url` di Aqsha MCP server, yang men-delegate ke service method yang sama.

## Transaksi & Atomisitas

Invariant lintas-tabel berjalan dalam **satu** transaksi Drizzle melalui `tx` yang diteruskan ke repo. Contoh paling kritis — `BillingService.consumeCredits` (cermin satu-mutation Convex V1):

```ts
export async function consumeCredits(input: ConsumeInput): Promise<EntitlementResult> {
  const credits = input.credits ?? estimateCredits(input)
  const gate = await requireEntitlement(input.ownerUserId, input.requiredPlan, credits)
  if (!gate.ok) return gate                                   // return-union, BUKAN throw
  await db.transaction(async (tx) => {
    await BillingRepo.debitPeriod(input.ownerUserId, credits, tx)        // row-locked atomic
    await BillingRepo.insertUsageLedger(input, credits, tx)
    await BillingRepo.upsertDailyRollup(input, credits, tx)
  })
  return { ok: true }
}
```

> **Idempotency `consumeCredits` (A9).** Sebuah step eve yang ter-interupsi akan **re-run saat resume**, sehingga debit per-model-call bisa terjadi dua kali. Tambahkan **idempotency key per-turn/step** pada debit ledger, dicek di **transaksi Drizzle yang sama** (mis. `insert ... on conflict (idempotencyKey) do nothing` sebelum `debitPeriod`), agar crash-resume tidak men-double-debit.

## Testing

- **Service** di-unit-test terhadap repo fake/in-memory (cepat, tanpa DB) — meniru `MemoryStore` V1.
- **Repository** di-integration-test terhadap Postgres Compose (cursor, index, transaksi).
- **Edge** (route/tool/worker) di-test tipis: auth + mapping + return-union; logika sudah teruji di service.
- Karena ketiga caller memakai service yang sama, satu test service melindungi route, Aqsha MCP server tool, dan worker sekaligus.

> Lihat [06-implementation-phases.md](06-implementation-phases.md): service layer diperkenalkan di Fase 1 dan **ditumbuhkan tiap fase, tidak pernah diduplikasi**.
