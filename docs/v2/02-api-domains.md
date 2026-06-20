# Aqsha V2 — API Domain Breakdown

Berdasarkan audit mendalam terhadap kode V1 yang sebenarnya (`packages/convex` 33 tabel; `apps/agents` Claude Agent SDK; `apps/web` ~67 call yang dikonsumsi UI). Setiap endpoint di-*ground* ke fungsi Convex aslinya (kolom **Source**), dan endpoint draft lama yang **tidak punya backing V1 di-drop** (lihat akhir dokumen).

## Cara Membaca Dokumen Ini

- **Runtime** menandai siapa yang mengeksekusi: `elysia` (REST di `api-v2`), `eve` (agent runtime di `web-v2`), atau `hybrid` (Elysia mem-*persist*/menyediakan product surface, eve menggerakkan loop).
- **essential** = bagian dari core cutover minimal. Domain non-essential bersifat aditif dan boleh menyusul.
- **`deferred`** pada endpoint = di luar subset minimal domain itu; landing belakangan tanpa memblok cutover.
- Kontrak request/response tiap endpoint ada di [05-api-contracts.md](05-api-contracts.md); service yang menanganinya di [04-service-layer.md](04-service-layer.md).

V2 punya **10 domain** (domain "Skills" draft lama **di-drop** — skills adalah konsep internal eve, bukan surface API).

---

## Tier 1 — Foundation (essential)

### Domain 1 — Auth & Users · `elysia` · essential

Mirror Clerk → `users` lokal + state-machine deletion. `ownerUserId == identity.tokenIdentifier`, `clerkUserId == identity.subject` (pertahankan dua kolom). Avatar pindah dari sentinel Convex `storage:<id>` ke R2 key. `UserService.ensureCurrentUser` adalah *seam* provisioning yang dipanggil HTTP **dan** channel auth eve.

| Method | Path | Source (V1) | Deferred |
|---|---|---|---|
| POST | `/webhooks/clerk` | `http:/clerk/webhook` + `auth.processClerkWebhook` | |
| POST | `/users/me/sync` | `auth.syncCurrentUser` (ensureCurrentUser + default workspace) | |
| GET | `/users/me` | `auth.getCurrentUser` (+ resolveUserImage) | |
| PATCH | `/users/me` | `auth.updateDisplayName` | |
| POST | `/users/me/avatar/upload-url` | `auth.generateAvatarUploadUrl` (R2 presign) | ✓ |
| PUT | `/users/me/avatar` | `auth.setAvatarFromStorage` (R2 promote + GC) | ✓ |
| DELETE | `/users/me` | `auth.deleteCurrentAccount` + `accountCleanup.cleanupUserOwnedData` | |

**Service**: `UserService`, `AccountDeletionService`. **Worker**: `account-deletion` (cascade paginated, tanpa cap 500-row; V2 melebarkan cakupan ke tabel yang V1 lewatkan: `userOnboarding`/`userFeedInterests`/`hiddenFeedItems`/`feedInteractions`/`usageDailyRollup`). **Tabel**: `users` (+ idempotency webhook ke Redis `SETNX`).

### Domain 2 — Onboarding & Interests · `elysia` · essential

Wizard 3 langkah wajib (background → interests → source). `complete` menyemai `userFeedInterests` via `InterestService.seedInterests` (floor weight 2). **Tidak ada** CRUD interest mandiri di V1 → draft `GET/PUT /users/me/interests` di-drop.

| Method | Path | Source (V1) | Deferred |
|---|---|---|---|
| GET | `/onboarding/status` | `onboarding.getStatus` (soft auth) | |
| POST | `/onboarding/complete` | `onboarding.complete` + `feed.interests.seedFeedInterests` | |

**Service**: `OnboardingService`, `InterestService`. **Tabel**: `user_onboarding`, `user_feed_interests`.

### Domain 3 — Billing & Subscriptions · `elysia` · essential

Polar via SDK langsung + mirror `billing_subscriptions` (lepas dari `@convex-dev/polar`). Write-path kritis = `consumeCredits` (atomik: period + ledger + daily rollup dalam satu transaksi), dipanggil eve tool, send-gate, dan worker. Blokir kuota = return-union, bukan throw. Catalog plan = SSOT pricing.

| Method | Path | Source (V1) | Deferred |
|---|---|---|---|
| POST | `/webhooks/polar` | `http:/polar/events` + `billing.entitlements.syncSubscriptionFromPolar` | |
| GET | `/billing/current` | `billing.current.get` (snapshot + ensureCreditPeriod) | |
| GET | `/billing/plans` | `billing.products.list` (publik) | |
| GET | `/billing/usage/activity` | `billing.usage.activity` | |
| GET | `/billing/usage/current-period` | `billing.usage.getCurrentPeriod` | ✓ |
| POST | `/billing/checkout` | `billing.checkout.create` | |
| POST | `/billing/portal` | `billing.portal.create` | |
| POST | `/billing/subscription/change` | `billing.subscription.change` | |
| POST | `/billing/subscription/cancel` | `billing.subscription.cancel` | |
| POST | `/billing/products/sync` | `billing.products.sync` (admin/cron) | ✓ |

**Service**: `BillingService`. **Tabel**: `billing_subscriptions`, `billing_credit_periods`, `provider_usage_ledger`, `usage_daily_rollup`, `admin_entitlements` (+ idempotency webhook ke Redis).

---

## Tier 2 — Core Product (essential)

### Domain 4 — Workspaces & Folders · `elysia` · essential

`WorkspaceService.create/rename` adalah *seam* tiga-caller (route publik + eve tool `createWorkspace`/`renameWorkspace`). Kapasitas plan (free=1/starter=5/plus=20/admin=∞). **V1 hanya archive** (tak ada unarchive/hard-delete). Draft `/workspaces/:id/members`, `/default`, `DELETE` di-drop (tak ada di V1).

| Method | Path | Source (V1) | Deferred |
|---|---|---|---|
| GET | `/workspaces` | `workspaces.list` (paginated) | |
| GET | `/workspaces/:id` | `workspaces.get` (soft ownership) | |
| POST | `/workspaces` | `workspaces.create` / `createFromAgentInternal` | |
| PATCH | `/workspaces/:id` | `workspaces.rename` / `updateEmoji` / `renameFromAgentInternal` | |
| POST | `/workspaces/:id/archive` | `workspaces.archive` (idempotent) | |
| GET | `/workspaces/:id/folders` | `workspaces.folders.list` | |
| POST | `/workspaces/:id/folders` | `workspaces.folders.create` | |
| PATCH | `/folders/:id` | `workspaces.folders.rename` | |
| POST | `/folders/:id/move` | `workspaces.folders.move` (cascade workspaceId) | ✓ |
| DELETE | `/folders/:id` | `workspaces.folders.remove` (orphan artifacts) | |

**Service**: `WorkspaceService` (+ folder methods). **Tabel**: `workspaces`, `workspace_folders`.

### Domain 5 — Artifacts & Library · `hybrid` · essential

Split 5 tabel (`artifacts` parent + `contents`/`extractions`/`paper_metadata`/`urls`). *Seam* kunci yang dipakai HTTP + eve tool + worker: `ArtifactService.saveUrl` (Save-to-Workspace + trigger ingest), `linkToWorkspace` (gabungkan dua nama V1 `linkArtifactToWorkspace`/`saveAttachmentToWorkspace`), `finalizeUpload` (semua upload lewat satu pipeline), `applyAgentAction` (tulis artifact dari agent, born-headless). Storage Convex `_storage` → R2 key. **Fix kebocoran V1**: delete kini juga membebaskan blob R2 + entry RAG.

| Method | Path | Source (V1) | Deferred |
|---|---|---|---|
| GET | `/workspaces/:id/artifacts` | `artifacts.listByWorkspace` | |
| GET | `/workspaces/:id/artifacts/context-picker` | `artifacts.listForContextPicker` | |
| GET | `/artifacts/:id` | `artifacts.get` | |
| GET | `/artifacts/:id/render-payload` | `artifacts.getRenderPayload` (R2 signed GET) | |
| POST | `/artifacts/upload-url` | `artifacts.generateUploadUrl` (R2 presign) | |
| POST | `/workspaces/:id/artifacts/upload` | `artifacts.uploads.createFromStorage` (finalize) | |
| POST | `/threads/:id/attachments/upload` | `artifacts.uploads.createThreadAttachmentFromStorage` (headless) | |
| POST | `/workspaces/:id/documents` | `artifacts.createDocument` | |
| PUT | `/artifacts/:id/document` | `artifacts.updateDocument` | |
| POST | `/workspaces/:id/artifacts/url` | `artifacts.createUrl` (`saveUrl`) | |
| POST | `/artifacts/:id/link-workspace` | `artifacts.linkArtifactToWorkspace` | |
| PATCH | `/artifacts/:id` | `artifacts.rename` / `move` | |
| DELETE | `/artifacts/:id` | `artifacts.remove` (+ R2/RAG cleanup) | |
| POST | `/artifacts/:id/retry-url-extraction` | `artifacts.retryUrlExtraction` | ✓ |

**Service**: `ArtifactService`, `StorageService`, `PaperService` (metadata enrichment), `RagService` (index). **Worker**: `paper-enrichment`, `url-ingestion`. **Tabel**: `artifacts` (+ 4 side tables).

---

## Tier 3 — Agent Runtime (essential)

### Domain 6 — Threads & Chat (persistence / product surface) · `hybrid` · essential

**Split tegas**: run loop, streaming, subagents, HITL gating, deep research → **eve (Domain 7)**. Yang **tinggal di Elysia di sini** = thread index/history UI + send entrypoint (gerbang kuota) + wiring attachment/context + projeksi HITL yang di-list frontend. Send entrypoint memanggil `SendQuotaService.check` lalu menyerahkan turn ke eve (bukan `dispatchRun`). 27-endpoint `requireServiceToken agent/service.*` + bridge `dispatchRun`/`forwardCancel`/`forwardResume` + `watchdogSweep` **lenyap** (eve in-process via `withEve`).

| Method | Path | Source (V1) | Deferred |
|---|---|---|---|
| GET | `/threads` | `agent.queries.listThreads` (keyset) | |
| GET | `/workspaces/:id/threads` | `agent.queries.listThreadsByWorkspace` | |
| GET | `/threads/:id` | `agent.queries.getThread` | |
| GET | `/threads/:id/messages` | `agent.queries.listMessages` (cursor) | |
| POST | `/threads` | `agent.startThread` (quota gate → eve) | |
| POST | `/threads/:id/messages` | `agent.sendMessage` (quota gate + reply-in-progress) | |
| DELETE | `/threads/:id` | `agent.removeThread` (+ cleanup sources/artifacts) | |
| GET | `/threads/:id/artifacts` | `agent.queries.listArtifacts` | |
| GET | `/threads/:id/sources` | `agent.queries.listSourcesByThread` (projeksi eve) | ✓ |
| GET | `/send-status` | `agent.rateLimits.getSendStatus` + server time | |
| GET | `/commands` | `agent.listCommands` (palette statis; logic di eve) | ✓ |

**Service**: `ThreadService`, `SendQuotaService`, `ContextService`. **Tabel**: `chat_threads`, `chat_messages` (proyeksi; durabilitas run dimiliki eve).

### Domain 7 — Agent Runs, Streaming, HITL & Deep Research · `eve` · essential

**Dimiliki eve**, dikonsumsi via `useEveAgent` (di-mount `withEve` di `apps/web-v2`). Channel HTTP eve menggantikan `POST /threads/:id/runs`, `GET/DELETE /runs/:runId`, SSE run-events, `/runs/:runId/subagents`, dan agent-runner/agent-watchdog buatan tangan. PG hanya menyimpan proyeksi product (chat history, run events untuk activity, sources, HITL) lewat **hook observe-only**.

| Interaksi | Path / mekanisme | Source / penjelasan | Deferred |
|---|---|---|---|
| Start session | eve `POST .../v1/session` | ganti `dispatchRun` + `createRun` | |
| Continue session | eve `POST .../v1/session/:id` | follow-up turn (continuationToken) | |
| Stream | eve `GET .../v1/session/:id/stream` (NDJSON) | ganti listRuns 250ms + StreamBridge | |
| Cancel | eve interrupt | ganti `cancelRun` + `forwardCancel` (sticky canceled) | |
| HITL respond | eve `needsApproval`/`ask_question` resume | ganti `interactions.respond` + `forwardResume` | |
| Data tools (Aqsha MCP) | eve connection → `connection__aqsha__*` / `connection__aqsha_write__*` | semua tool data (artifact/workspace/research/citation/feed/paper) lewat Aqsha MCP server, BUKAN `defineTool` in-process | sebagian ✓ |
| Tools (in-process) | `defineTool.execute()` (sisa) | hanya tool yang butuh `ctx.getSandbox()` (`verifyStatistics`/`runComputation`) + gerbang HITL (`proposeResearchPlan`) + built-ins | |
| Plan gate | `proposeResearchPlan` = `defineTool` `needsApproval: once()` (in-process, pure HITL, tanpa side effect) | ganti runManager Branch B / `resolvePlanDecision`; resolve via path HITL eve `send({inputResponses})` | |
| Pending interactions (proyeksi) | `GET /threads/:id/pending-interactions` (Elysia) | `agent.queries.listPendingInteractions` | |

**Aqsha MCP server (`POST /mcp`)**: agent eve mengakses data Aqsha sendiri **bukan** lewat tool service-layer in-process, melainkan via in-house **Aqsha MCP server** (Streamable HTTP) yang di-host `apps/api-v2` di `POST /mcp` — adapter tipis ke-**4** di atas `packages/services` (berdampingan dengan route Elysia + worker BullMQ; logic tetap di service, zero duplication). Tiap request di-auth dengan Clerk token per-user (`clerk.verifyToken` → `ownerUserId`), ownership di-enforce di service layer. eve mendeklarasikan dua connection: `agent/connections/aqsha.ts` (read/research/citation — tanpa approval) dan `agent/connections/aqsha_write.ts` (side-effecting `save_url`/`propose_artifact`/`execute_artifact`/`create_workspace`/dst — `approval: always()`). Approval = gerbang eve nyata (pause/resume session durable), bukan hook; invariant bisnis (mis. `execute_artifact` butuh `propose_artifact` yang sudah di-approve) hidup di `execute()` MCP server. Provider riset (Exa/Jina/Crossref/arXiv/OpenAlex) dibungkus `ResearchService` dan diekspos lewat MCP server ini (pacer + TTL cache + `consumeCredits` server-side). **Trade-off (diterima owner)**: bridge MCP me-*reintroduce* satu HTTP hop (`web-v2`/eve ↔ `api-v2` MCP) + surface auth ke-4 yang tesis zero-RPC-hop di [04-service-layer.md](04-service-layer.md) semula hilangkan — ditukar dengan boundary MCP yang bersih, decoupled, dan reusable (klien MCP lain bisa pakai server yang sama). Catatan: dokumen eve men-scope connection ke "server yang bukan kamu yang tulis"; di sini sengaja dipakai untuk server milik sendiri.

**Deep research (`/deep`)**: **pure model-driven** — digerakkan skill `agent/skills/deep-research/SKILL.md` (load-on-demand, frontmatter "Use when the user runs /deep or asks for a thorough, citation-verified research report"), **tanpa kode orkestrasi deterministik** (tidak ada lagi `DEEP_PHASES`/`DEEP_PHASE_POLICIES`/`RunManager.executeDeepRun`/"deep sebagai dynamic-workflow tool" sebagai driver). Body skill = metodologi: propose plan + plan-gate dulu → fan-out `literature-searcher` per sub-pertanyaan → delegasi `counter-evidence` lalu `citation-verifier` → tulis dengan `writer`; **model** yang memutuskan alur dan kapan mendelegasi (eve men-dispatch tool call paralel secara concurrent). Subagents = declared `agent/subagents/{literature-searcher,counter-evidence,citation-verifier,writer}/agent.ts` (masing-masing punya `instructions.md` + `tools/` re-authored; task mode via `outputSchema`; tak mewarisi apa pun dari root; share executor via `packages/services`). Plan gate = `proposeResearchPlan` (`defineTool` in-process, `needsApproval: once()`, tanpa side effect) — skill menyuruh model memanggilnya lebih dulu, di-resolve lewat path HITL eve `send({inputResponses})`. Verifikasi statistik tetap root in-process: `verifyStatistics` (auto/read-only) + `runComputation` (`needsApproval`) memiliki satu sandbox `docker()` deny-all (`defineSandbox` ganti Daytona). **Invariant dilonggarkan**: hard per-run cost ceiling (`ASTRA_MAX_RUN_BUDGET_USD`) + budget per-phase **di-drop**; kontrol biaya = `consumeCredits` per-call (tiap panggilan model/provider men-debit) + monthly deep cap dari billing + focus guidance di skill. Stabilitas penomoran sitasi jadi tanggung jawab prompt subagent `writer`, bukan counter orkestrator. Durabilitas step Workflow SDK (step selesai tak di-run ulang) tetap dipertahankan. Workflow tool eksperimental (`agent/tools/workflow.ts`) = eskalasi opt-in saja (fan-out runtime-computed atas subagents), default tetap delegasi skill+subagent biasa. Marker activity: tanpa phase loop → progres subagent diturunkan dari `subagent.called.childSessionId` (di-mirror server-side via hook observe-only ke `agent_run_events` keyed by `runId`), dikelompokkan per nama subagent + tool call. **Open items**: Workflow world self-host (`.workflow-data` single-node vs custom Postgres/Redis world, belum GA). **Build tasks** (sudah punya jalur jelas di eve 0.11.6, bukan open risk): auth Clerk via custom `AuthFn` first-class + enforce kepemilikan session sendiri. Lihat [01-tech-stack.md](01-tech-stack.md).

**Tabel proyeksi**: `agent_runs`, `agent_run_events`, `pending_interactions`, `research_sources`.

---

## Tier 4 — Discovery (non-essential, aditif)

### Domain 8 — Feed & Discovery · `hybrid` · non-essential

Read/save/hide/search = Elysia murni (`FeedService` over PG). **Hydration** = lane BullMQ repeatable (ganti cron 3h `hydrateCycle`): `refreshTrendingPapers`/`refreshTrendingTopics`(GDELT)/`refreshGoogleNews`(RSS)/`refreshFactCheckClaims`/`enrichGoogleNewsArticles`. AI surface (consensus/ideas/explain) = action LLM tipis lewat service + `consumeCredits` (tetap Elysia, tak dikopel ke agent). Search = `tsvector`/GIN (bukan pgvector). Save-to-Workspace mendelegasi ke `ArtifactService.saveUrl`.

| Method | Path | Source (V1) | Deferred |
|---|---|---|---|
| GET | `/feed` | `feed.getFeedPaginated` (by_order, For You/Top/Topics) | |
| GET | `/feed/home` | `feed.getFeed` (bento) | |
| GET | `/feed/search` | `feed.searchDiscovery` (tsvector) | |
| GET | `/feed/:id` | `feed.getFeedItem` | |
| GET | `/feed/:id/related` | `feed.getRelatedFeedItems` | ✓ |
| GET | `/feed/saved-refs` | `feed.getSavedDiscoveryRefs` | ✓ |
| GET | `/feed/hidden-refs` | `feed.getHiddenDiscoveryRefs` | |
| POST | `/feed/discovery/save` | `feed.saveDiscoveryItem` (+ interest +1) | |
| POST | `/feed/discovery/unsave` | `feed.unsaveDiscoveryItem` | ✓ |
| POST | `/feed/discovery/hide` | `feed.hideDiscoveryItem` (+ interest −1) | |
| POST | `/feed/discovery/interaction` | `feed.recordDiscoveryInteraction` | |
| GET | `/feed/papers-by-keys` | `feed.papersByKeys` | ✓ |
| POST | `/feed/consensus` | `feed.consensus.getConsensus` (consumeCredits) | ✓ |
| POST | `/feed/explain-relevance` | `feed.ai.explainRelevance` | ✓ |
| POST | `/feed/explain-term` | `feed.ai.explainTerm` | ✓ |
| POST | `/feed/ideas` | `feed.ideas.generateIdeas` | ✓ |

**Service**: `FeedService`, `FeedInteractionService`, `FeedAiService`, `InterestService`. **Worker**: `feed-hydration`. **Tabel**: `feed_items`, `explore_papers`, `saved_feed_items`, `hidden_feed_items`, `feed_interactions`, `feed_sources`, `feed_consensus` (atau Redis).

### Domain 9 — Papers & External Lookup (Explore) · `elysia` · non-essential

`explore_papers` = cache paper bersama (`feed_items.paper_key` references-nya, hindari duplikasi). `PaperService.upsertResolvedPaperMetadata` enforce monotonisitas rank metadata (manual>resolver>llm) — **satu writer**. `OPENALEX_API_KEY` wajib. Draft `/papers/by-url`, `/by-doi`, `/recent` + tabel `paper_authors`/`paper_citations` di-drop (tak ada di V1).

| Method | Path | Source (V1) | Deferred |
|---|---|---|---|
| GET | `/papers/search` | `explore.searchPapers` (waterfall + cache) | |
| GET | `/papers/:key` | `explore.getOrFetchPaper` (+ getPaper) | |

**Service**: `ExploreService`, `PaperService`. **Tabel**: `explore_papers` (+ `artifact_paper_metadata` lintas Domain 5).

---

## Tier 5 — Ops (non-essential)

### Domain 10 — Admin & Health · `elysia` · non-essential

Net-new (Convex punya dashboard managed). Liveness/readiness PG+Redis+R2; introspeksi queue BullMQ (`bull-board`). Rate-limit admin = counter Redis (tak ada tabel `rateLimits`). **R2, bukan MinIO.**

| Method | Path | Source | Deferred |
|---|---|---|---|
| GET | `/health` | net-new (liveness) | |
| GET | `/health/ready` | net-new (PG+Redis+R2) | ✓ |
| GET | `/admin/jobs` | net-new (bull-board) | ✓ |
| POST | `/admin/feed/hydrate` | `feed.hydrateCycle` (trigger manual) | ✓ |

---

## Domain yang Di-drop dari Draft Awal

1. **Skills (Domain 10 lama)** — di-drop total. Skills = `agent/skills/*.md` (di-load on-demand `load_skill`), bukan domain API. Tidak pernah ada tabel `skills` di Convex. Slash-command (10 command incl `/deep`) pindah ke layer composer/eve; hanya `GET /commands` (palette statis, deferred) tersisa.
2. **Agent loop Elysia+BullMQ buatan tangan** — `POST /threads/:id/runs`, `GET/DELETE /runs/:runId`, SSE `/runs/:runId/events`, `/runs/:runId/subagents`, `services/agent-runner.ts`, `workers/agent-watchdog.worker.ts` — **diganti eve** (Domain 7). `dispatchRun`/`forwardCancel`/`forwardResume` + `watchdogSweep` + 27-endpoint `agent/service.*` token-authed dihapus (eve in-process; Workflow SDK + BullMQ stalled-job menggantikan watchdog).
3. **Domain 9 Research (Deep) standalone** — `/research/sessions/*`, `/plan/approve`, `/verifications` — disubsumsi eve (Domain 7): `/deep` = satu session eve **pure model-driven** (skill `deep-research/SKILL.md` + declared subagents, tanpa orkestrasi deterministik); durabilitas step = Workflow SDK; plan-gate = `proposeResearchPlan` (`needsApproval: once()`).
4. **MinIO** — semua referensi MinIO (compose + presign) diganti **Cloudflare R2** (S3-compatible, cloud, tanpa container). Compose hanya Postgres + Redis di VPS via Tailscale.
5. **Endpoint tanpa backing V1** — `GET /workspaces/:id/members`, `POST /workspaces/:id/default`, `DELETE /workspaces/:id` (V1 hanya archive); `GET /artifacts/:id/versions` (tak ada version history — overwrite single-revision); `GET/PUT /users/me/interests` (interest hanya di-set saat onboarding); `/papers/by-url`, `/papers/by-doi`, `/papers/recent` + tabel `paper_authors`/`paper_citations`.
6. **GROBID** — di-drop total dari V2. Metadata paper kini **resolver-first (Crossref/OpenAlex/arXiv) + LLM fallback** (rank `manual>resolver>llm`), bukan header GROBID; teks PDF untuk RAG diekstrak **inline** (`unpdf`/`mammoth`/utf8) saat `finalizeUpload`. Yang dihapus: endpoint `GET /papers/:id/extraction-status` + `POST /papers/:id/retry-grobid`, worker `paper-extraction` (GROBID), env `GROBID_URL`, dan literal `metadataSource:"grobid"`. (Catatan konteks: di V1 berbasis Convex pun GROBID sudah bukan jalur utama metadata.)

---

## Apa yang Dimiliki eve (ringkas)

eve memiliki **seluruh runtime agent**: run loop (durable turn/step, step selesai tak di-run ulang), streaming (NDJSON terurut), subagents (deep research), HITL (`needsApproval` + `ask_question`), dan deep research (`/deep` = satu session **pure model-driven** via skill + declared subagents, bukan orkestrasi deterministik). eve juga memiliki state durabilitas session/turn/step. **Akses data Aqsha**: agent menjangkau data milik Aqsha sendiri lewat **Aqsha MCP server** (`POST /mcp` di `api-v2`) + eve connection (`connection__aqsha__*` / `connection__aqsha_write__*`), **bukan** tool `defineTool` in-process — owner menerima HTTP hop yang di-reintroduce demi boundary MCP yang reusable. Hanya tool yang butuh `ctx.getSandbox()` (`verifyStatistics`/`runComputation`) + gerbang HITL pure (`proposeResearchPlan`) + built-ins yang tinggal in-process; SEMUA tool data (artifact/workspace/research/citation/feed/paper) pindah ke connection MCP, dan logic-nya tetap satu di `packages/services` (zero duplication; MCP server = caller ke-4 setelah route Elysia + worker BullMQ). Surface agent di api-v2 menjadi **tipis**: thread index/header/history (keyset), dua send entrypoint (hanya `SendQuotaService.check` lalu serahkan ke eve), delete thread, proyeksi per-thread (artifacts/sources/pending-interactions, di-mirror dari eve via hook observe-only), `send-status`, `/commands` statis, plus `POST /mcp` (Aqsha MCP server) sebagai surface api-v2 baru. PG **tidak** me-rehost AgentStore — hanya proyeksi yang di-query UI.

---

## Strategi Migrasi Inkremental (bukan big-bang)

Route split memungkinkan V2 dirilis dalam **vertical slice**, tiap slice digerbangi milestone yang terlihat di UI (lihat [06-implementation-phases.md](06-implementation-phases.md)):

- **Core cutover minimal (essential)**: Domain 1 Auth, 2 Onboarding, 3 Billing, 4 Workspaces, 5 Artifacts, 6 Threads-persistence, 7 eve-runtime.
- **Aditif (non-essential)**: 8 Feed, 9 Papers, 10 Admin — bisa menyusul. Catatan: "essential/aditif" menandai status **pemblokir cutover**, BUKAN urutan build. Feed (non-essential) sengaja dibangun lebih awal di [06-implementation-phases.md](06-implementation-phases.md) Fase 4 sebagai milestone visual rendah-risiko (tanpa dependensi eve), sebelum Billing/chat — lihat prinsip sekuensing #5 di doc fase.
- Tag `deferred` menandai endpoint non-inti sehingga sebuah domain bisa landing dengan subset minimal dulu.
- Tag `hybrid` pada Threads/Artifacts/Feed adalah kunci: persistence + product surface live duluan di Elysia, dan **service layer yang sama** mem-back caller eve nanti — tidak ada throwaway work. eve (komponen paling berisiko karena beta + open decision self-host) baru di kritikal-path saat slice chat.
- Tiap lane cron non-agent = job BullMQ repeatable independen yang bisa dinyalakan satu per satu.

---

## Ringkasan Endpoint

| Domain | Runtime | Essential | Endpoint (REST) |
|---|---|---|---|
| 1 Auth & Users | elysia | ✓ | 7 |
| 2 Onboarding & Interests | elysia | ✓ | 2 |
| 3 Billing & Subscriptions | elysia | ✓ | 10 |
| 4 Workspaces & Folders | elysia | ✓ | 10 |
| 5 Artifacts & Library | hybrid | ✓ | 14 |
| 6 Threads & Chat (persistence) | hybrid | ✓ | 11 |
| 7 Agent Runtime (eve) | eve | ✓ | eve channel + 1 projeksi + `POST /mcp` (Aqsha MCP server, api-v2) |
| 8 Feed & Discovery | hybrid | — | 16 |
| 9 Papers & External Lookup | elysia | — | 2 |
| 10 Admin & Health | elysia | — | 4 |
| **Total** | | | **~76 REST + eve runtime** |

---

## Pemetaan Schema (33 tabel Convex → PostgreSQL)

Konvensi pemetaan: `_id` → PK eksplisit (tabel agent sudah pakai `thr_*`/`run_*`; lainnya mint `uuid`/`text`); `_creationTime`/timestamp → `bigint` epoch-ms; `v.union(v.literal)` → `text`+`CHECK`; `v.id("_storage")` → `*_r2_key text`; kolom JSON → `jsonb`; array → `text[]`/`numeric[]`/`jsonb`; search index feed → `tsvector`+GIN. Tabel ephemeral/cache (`externalLookupCache`, `feedConsensus`, dedupe `authEvents`/`billingEvents`) lebih cocok di **Redis** (TTL/SETNX).

| Convex (V1) | PostgreSQL V2 |
|---|---|
| `users` | `users` (+ Redis idempotency untuk `authEvents`) |
| `userTokens` | ditangani Clerk langsung |
| `userOnboarding`, `userFeedInterests` | `user_onboarding`, `user_feed_interests` |
| `workspaces`, `workspaceFolders` | `workspaces`, `workspace_folders` |
| `subscriptions`/billing tables | `billing_subscriptions`, `billing_credit_periods`, `provider_usage_ledger`, `usage_daily_rollup`, `admin_entitlements` |
| `artifacts` (+ contents/extractions/paperMetadata/urls) | `artifacts` + 4 side tables (split 1:1/1:N dipertahankan) |
| `feedItems` | `feed_items` (+ `tsvector` GIN; `paper_key` → `explore_papers.key`) |
| `explorePapers` | `explore_papers` |
| `savedFeedItems`/`hiddenFeedItems`/`feedInteractions`/`feedSources` | tabel senama |
| `feedConsensus`, `externalLookupCache` | Redis (TTL) — atau PG bila preferensi satu store |
| `chatThreads`, `chatMessages` | `chat_threads`, `chat_messages` (proyeksi) |
| `agentRuns`, `agentRunEvents`, `pendingInteractions`, `researchSources` | senama (proyeksi; durabilitas run dimiliki eve) |
| `researchPhaseStates` | opsional proyeksi (step-checkpointing dimiliki eve) |
| RAG (`@convex-dev/rag`, `ragEntryId`) | pgvector embeddings (`packages/db`) |
| `rateLimits` | Redis (bukan tabel) |
| `authEvents`, `billingEvents` | Redis `SETNX`+TTL |
| `skills` | tidak ada (dulu pun tak ada tabel) → `agent/skills/*.md` |
