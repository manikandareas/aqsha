# Aqsha V2 — Implementation Phases (0 → Cutover)

> Pembagian implementasi end-to-end. **Setiap fase**: (a) **testable** (unit/integration/e2e), (b) langsung **runnable** dengan perintah konkret, dan (c) menunjukkan **progres yang terlihat di UI** `web-v2`. Bukan lapisan horizontal — tiap fase adalah **vertical tracer-bullet** tipis (drizzle table → service → route/eve → layar web-v2) sehingga selalu ada sesuatu yang bisa dijalankan dan dilihat.

## Prinsip Sekuensing

1. **Auth bootstrap dulu** — tiap tabel owner-scoped berkunci `ownerUserId == identity.tokenIdentifier`, dan `ensureCurrentUser` adalah _seam_ provisioning yang harus jalan sebelum ada data owner. P0 mendirikan rail; P1 mengirim sign-up→onboarding.
2. **Service layer diperkenalkan di P1 dan ditumbuhkan tiap fase — tak pernah diduplikasi** (lihat [04-service-layer.md](04-service-layer.md)). Inti audit: `SendQuotaService.check`/`WorkspaceService.create`/`ArtifactService.saveUrl`/`consumeCredits` harus dapat dipanggil ketiga caller.
3. **Workspaces (P2) sebelum Artifacts (P3)** — artifact FK ke workspace; cold-start default workspace adalah prasyarat save/upload.
4. **R2 landing di dalam Artifacts (P3)** sebagai tracer presign→PUT→finalize.
5. **Feed (P4)** independen dari agent → milestone visual andalan cepat; worker hydration (ganti cron 3h Convex) landing di sini.
6. **Billing (P5) sebelum chat** — `checkAndConsumeSendQuota` memanggil `consumeCredits` sebelum tiap run.
7. **eve chat (P6)** port terbesar (depend service+billing+R2+threads); **deep research (P7)** memperluasnya.
8. **Discovery polish (P8)** + **account lifecycle/admin (P9)** melengkapi parity.
9. **Cutover (P10)** terakhir & agresif: fresh-start (tanpa migrasi data Convex), decommission V1.

> Risiko sengaja ditata: eve (beta + **decision-record single-node self-host**, D1) **tidak** di kritikal-path awal. Karena Threads di-split (persistence Elysia + runtime eve), index/history thread & send-gate bisa dibangun/diuji terhadap stub eve sebelum runtime durable penuh landing. Data Aqsha dijangkau eve lewat **Aqsha MCP server** (P6) — adapter MCP ke-4 di atas `packages/services`, bukan tool service-layer in-process.

---

## Fase 0 — Foundations runnable

**Goal**: stand-up skeleton V2 agar satu nilai trivial mengalir end-to-end: Postgres+Redis di Compose (VPS via Tailscale), `packages/db` dengan satu tabel ter-migrasi, route health Elysia ber-Eden Treaty, dan shell Next 16 `web-v2` yang merender ping. Belum ada business logic — murni rail.

**Scope**:

- `infra/compose.yaml`: HANYA `postgres` (pgvector/pgvector:pg17) + `redis:7-alpine`. `init-extensions.sql` (vector/uuid-ossp/unaccent). Tanpa api/web/minio (R2 cloud).
- `packages/db`: `drizzle.config.ts`, `createDb()`, schema pertama `users` (ownerUserId text PK, clerkUserId text unique, deletion\* bigint epoch-ms). Generate + apply migration.
- `apps/api-v2`: Elysia `GET /healthz` ({ok,db,redis} dengan SELECT 1 + Redis PING) + `GET /ping` ({pong,serverTime}). `export type App`. `@elysiajs/cors`+`@elysiajs/swagger`. Catatan arah: api-v2 juga akan menjadi rumah **Aqsha MCP server** (Streamable HTTP `POST /mcp`, adapter ke-4 di atas `packages/services`) yang dibangun penuh di P6 — di P0 cukup skeleton/route placeholder bila perlu, belum ada tool.
- `apps/web-v2`: Next 16.2.6 + React 19. **UI disalin apa adanya dari `apps/web`** (komponen + elemen UI, shadcn `components.json`, `globals.css`, Tailwind v4, HugeIcons, token `@aqsha/ui`) — UI tidak berubah, yang berganti hanya lapisan data. `lib/api.ts = treaty<App>(...)`. Route `/` memanggil `api.ping.get()` dan render serverTime. Belum ada Clerk.
- Root workspaces + scripts (`db:generate`/`db:migrate`/`db:studio`/`dev:api`/`dev:web-v2`). V1 tak disentuh.

**Deliverable**: halaman `localhost:3000` yang mengambil & menampilkan `serverTime` api-v2 lewat Eden Treaty type-checked, Postgres+Redis live, tabel `users` dibuat migrasi drizzle.

**uiVisible**: buka `localhost:3000` → shell Aqsha minimal menampilkan timestamp server live dari api-v2 (membuktikan rail db+redis+api+eden+web tersambung). Refresh → timestamp update.

**howToRun**:

```bash
# di VPS sekali: docker compose -f infra/compose.yaml up -d
bun install
bun run db:generate && bun run db:migrate
bun run dev:api        # :3001
bun run dev:web-v2     # :3000
# verifikasi: curl <tailscale-host or localhost>:3001/healthz ; buka :3000
```

**testable**: unit `createDb()` SELECT 1; integration `GET /healthz` → {ok,db,redis:true}; migration idempotent (re-run no-op, cek `information_schema`); e2e `/` render serverTime>0; gate `bun run typecheck` hijau, App type resolve di web-v2.

**exitCriteria**: compose Postgres(pgvector)+Redis sehat & reachable via Tailscale; migrasi `users`+index applied, `db:studio` jalan; `/healthz`+`/ping` 200 real-check; web-v2 boot Next 16 + token `@aqsha/ui` + render serverTime; typecheck hijau; V1 tetap build.

---

## Fase 1 — Auth bootstrap + onboarding

**Goal**: vertical pertama yang terlihat user. Clerk di web-v2; JWT diverifikasi plugin Elysia → `ownerUserId`; `UserService` provisioning (mirror Clerk → `users` + default workspace); wizard onboarding 3 langkah ber-gate server-side. Menegakkan pola service layer + split `ownerUserId`/`clerkUserId`.

**Scope**:

- `packages/db`: `workspaces` (status CHECK active|archived, index by_owner_status_updated/by_owner_updated), `user_onboarding` (1:1, interests text[], completedAt bigint), idempotency webhook (`authEvents` PG atau Redis SETNX). FK → users.
- `apps/api-v2/plugins/auth.ts`: Clerk `verifyToken` → `{ ownerUserId=tokenIdentifier, clerkUserId=subject, email }`; 401 bila absen. Macro auth tunggal.
- `packages/services`: `UserService.ensureCurrentUser` (upsert users + `ensureDefaultWorkspaceForOwner` "Workspace Saya"), `getCurrentUser`, `OnboardingService.getStatus`(soft)/`complete` (validasi BACKGROUND_IDS/SOURCE_IDS, interests≥3, seed `InterestService.seedFeedInterests` weight 2).
- Route: `POST /users/me/sync`, `GET /users/me`, `GET /onboarding/status`, `POST /onboarding/complete`, `POST /webhooks/clerk` (svix verify, idempotent).
- web-v2: Clerk provider, `AuthenticatedUserSync` (POST /users/me/sync sekali per userId), `/sign-in`+`/sign-up` catch-all, `/onboarding` wizard, `/app` server-gate (fetch onboarding/status, redirect un-onboarded). `lib/api.ts` inject token Clerk.

**Deliverable**: user sign-up → ter-provision (users + default workspace) → menyelesaikan wizard → interest ter-seed → diarahkan ke `/app`, semua via `UserService`/`OnboardingService`.

**uiVisible**: visitor klik Sign up → auth Clerk → wizard wajib (welcome→background→interests≥3→source) → submit → redirect `/app`. Reload `/app` tak lagi tampilkan wizard; akun baru tampilkan. Loop "sign up → onboard" terlihat utuh.

**howToRun**: set `CLERK_SECRET_KEY`+`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`+`CLERK_WEBHOOK_SIGNING_SECRET`; `db:migrate`; `dev:api`+`dev:web-v2`; sign up di `:3000`.

**testable**: unit `ensureCurrentUser` idempotent (default workspace dibuat sekali); `complete` tolak <3 interest/background buruk/lainnya-tanpa-other; integration `POST /users/me/sync` (mock token) insert users+default ws, `onboarding/status` false→true; `POST /webhooks/clerk` proses sekali (dedupe); e2e sign up→wizard→/app + redirect un-onboarded; gate auth plugin 401 tanpa Bearer.

**exitCriteria**: `ownerUserId==tokenIdentifier` & `clerkUserId==subject` tersimpan terpisah; default workspace auto-create; server-gate redirect tanpa flash; `UserService`+`OnboardingService`+`InterestService.seedFeedInterests` ada di `packages/services` (di-import route saja sejauh ini); web-v2 bawa token Clerk di tiap call Eden.

---

## Fase 2 — Workspaces CRUD

**Goal**: surface produk penuh pertama via service layer: `WorkspaceService` (create+capacity, rename, updateEmoji, archive, list paginated) + folder CRUD/move/remove, dengan index workspaces & detail header di web-v2.

**Scope**:

- `packages/db`: `workspace_folders` (status CHECK, index by_owner_workspace_status_updated/by_owner_workspace_name). Konstanta kapasitas (`PLAN_CATALOG.workspaceLimit` free=1/starter=5/plus=20/admin=∞) sebagai modul konstanta bersama (billing penuh di P5; plan default 'free' + admin allowlist env).
- `packages/services` `WorkspaceService`: `create` (capacity, normalizeName, emoji deterministik FNV, status active), `rename`, `updateEmoji` (guard single-grapheme), `archive` (idempotent, no unarchive), `list`. `FolderService`: list(take 200)/create(unik per owner+workspace)/rename/move(re-parent + cascade `workspaceId` — _seam_ `syncArtifactWorkspaceMove` di-stub sampai P3)/remove(soft, orphan). Helper `assertWorkspaceOwner`/`assertFolderOwner`. Kode `appError` (`workspace_limit_reached`, `workspace_emoji_invalid`).
- Route `routes/workspaces.ts`: list/get/create/rename(PATCH)/emoji(PATCH)/archive + folders CRUD+move+remove. Auth macro + rate limit `workspaces:create` 3/jam Redis.
- web-v2: `/app/workspaces` index (list, create dialog, archive) via TanStack Query+Eden; `/app/workspaces/[id]` detail header (emoji picker, rename, archive) + folder list/create/rename. `WorkspacePicker` reusable.

**Deliverable**: Workspaces index + detail dengan create/rename/emoji/archive & folder management, persist di PG via service.

**uiVisible**: `/app/workspaces` → lihat workspace (default dari P1), buat baru (terblok dengan pesan di cap free=1), rename, ganti emoji, archive, buka workspace, create/rename/move/delete folder. Terlihat: "organize research into workspaces".

**testable**: unit capacity per plan (free=1 throw di create ke-2), emoji multi-grapheme ditolak, archive idempotent, folder dedupe nama; integration CRUD round-trip + ownership null/403 + cursor pagination; folder move re-parent + (saat artifact ada) cascade via seam; e2e create→rename→emoji→archive + folder; gate rate-limit 429 setelah 3 create/jam.

**exitCriteria**: `WorkspaceService`+`FolderService` dengan invariant ownership+capacity+emoji; web-v2 index+detail+folder reaktif (invalidasi TanStack); gate kapasitas (free=1) + override admin-allowlist di-stub untuk P5; `appError` ter-surface ke UI lewat mapper readable.

---

## Fase 3 — Artifacts + R2 storage

**Goal**: tracer storage R2 presign→PUT→finalize, split 5-tabel artifact, `ArtifactService` (saveUrl/createDocument/upload/render-payload/move/rename/remove), metadata-enrichment (resolver+LLM) + URL ingestion sebagai worker BullMQ (**tanpa GROBID**), dan library workspace + reader artifact di web-v2.

**Scope**:

- `packages/db`: `artifacts` (parent; enum text+CHECK; `storage_id`→`*_r2_key`; `workspace_id` nullable headless; `rag_entry_id`; 5 index by*owner*\*) + `artifact_contents` (1:1, blocksJson jsonb) + `artifact_extractions` (1:N, status CHECK) + `artifact_paper_metadata` (1:1, authors jsonb, keywords/affiliations text[], metadataSource CHECK) + `artifact_urls` (1:1, unique(owner,workspace,normalized_url)). Konstanta libraryItemLimit.
- `packages/services` `StorageService`: `presignUpload` (R2 PUT), `getSignedReadUrl`, `storeBlob`, `readText`, `deleteObject`. Threshold inline-vs-storage (ARTIFACT_BODY_INLINE_LIMIT=700_000; upload 900_000).
- `packages/services` `ArtifactService`: createDocument, generateUploadUrl (presign, thread/workspace-scoped), finalizeUpload (validateUpload 50MB/allow-list, ekstrak teks unpdf/mammoth/utf8 → RAG, offload R2, queue paper-enrichment metadata resolver+LLM), createUrl (saveUrl: normalizeUrl+dedupe+insert+enqueue), updateDocument, getRenderPayload (discriminated union, signed GET pdf/docx), get/list/listForContextPicker, rename/move(+syncArtifactWorkspaceMove)/remove (+ delete blob R2 + entry RAG — **fix leak V1**), linkArtifactToWorkspace, retryUrlExtraction. `PaperMetadataService.upsert` monotonik rank.
- Worker BullMQ: `paper-enrichment` (resolver+LLM metadata, **no GROBID**), `url-ingestion` (classify→OA PDF download→convert→finalize / else metadata-only / Jina generic). Route `artifacts.ts`+`papers.ts` (search/getOrFetchPaper).
- web-v2: library `/app/workspaces/[id]` (upload PDF, add URL, create doc, rename/move/remove, folder nav), reader `/.../artifacts/[id]` (react-pdf, markdown editor, URL crawl view). `SaveToWorkspaceButton` (createUrl) reusable.

**Deliverable**: pipeline upload→ekstrak teks→index + ingestion URL via R2 + BullMQ, dengan library workspace fillable & reader artifact (PDF/doc/URL) + metadata enrichment.

**uiVisible**: buka workspace, upload PDF (teks ter-ekstrak + metadata paper ter-resolve), add URL (crawl & resolve), create+edit markdown doc, rename/move/delete, buka reader. Terlihat: "research library yang bisa diisi, dibaca, diedit".

**howToRun**: set R2 env (`R2_ACCOUNT_ID`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`/`R2_BUCKET`/`R2_ENDPOINT`); `db:migrate`; `dev:api`(+workers)+`dev:web-v2`; upload PDF di workspace.

**testable**: unit presign valid PUT, validateUpload tolak >50MB/tipe, dedupe normalizeUrl, threshold offload R2, remove hapus object; integration presign→PUT→finalize bikin artifacts+contents 'ready', getRenderPayload signed URL pdf; worker enrichment tulis paper_metadata (resolver+LLM), url-ingestion resolve DOI→OA PDF/else metadata-only, monotonik rank tak downgrade; e2e upload PDF status flip, add URL resolve, edit doc, render reader; gate rate-limit upload(5/min)+create(20/min).

**exitCriteria**: R2 presign/PUT/finalize jalan; `storage_id` sepenuhnya R2 key; remove bebaskan blob (leak fixed); split 5-tabel + path headless; worker BullMQ (tanpa scheduler Convex) attempt-guard+backoff; `saveUrl`/`finalizeUpload`/`linkToWorkspace` fungsi service tunggal; library+reader+retry visible.

---

## Fase 4 — Discovery Feed read path

**Goal**: milestone visual andalan: feed `/app/explore` (For You/Top/Topics, infinite scroll), reader detail paper/news/fact-check, sinyal save/hide/interaction, dan worker hydration (ganti cron 3h Convex) meng-ingest OpenAlex/Google News/GDELT/FactCheck ke PG dengan full-text PG.

**Scope**:

- `packages/db`: `feed_items` (kind/provider/retraction CHECK, authors/topics text[], sparkline numeric[], primaryClaim jsonb, `paper_key` → explore_papers.key, `order_at` bigint NOT NULL, `search_text` + kolom `tsvector` GENERATED + GIN — bukan pgvector), `explore_papers` (key unique PK), `feed_sources`, `saved_feed_items`/`hidden_feed_items`/`feed_interactions`, `user_feed_interests` (dari P1), `feed_consensus` (atau Redis), `domain_reliability`. `externalLookupCache` → Redis TTL.
- `packages/services` `FeedService` (getFeed bento; getFeedPaginated by_order cursor + re-rank For You/Top/Topics + matchesTopicCategory read-time; getFeedItem/related/papersByKeys), `FeedInteractionService` (save/unsave/hide/record + unified discovery refs: saveDiscoveryItem materialisasi paper via ensureFeedItemForPaperKey + interest +1; getSaved/HiddenRefs), helper `deriveOrderAt`+`deriveSearchText` di setiap write, `PaperCacheService.upsert`, `ExploreService.getOrFetchPaper`.
- Worker `feed-hydration` (repeatable `0 */3 * * *`, ganti hydrateCycle): child jobs refreshTrendingPapers (OpenAlex)/refreshTrendingTopics (GDELT 5.2s)/refreshGoogleNews (RSS)/refreshFactCheckClaims/enrichGoogleNewsArticles. Provider lib + pacer/TTL Redis. Route `feed.ts`+`explore.ts`.
- web-v2: `/app/explore` DiscoveryPage (For You/Top/Topics, infinite scroll, save/hide, 'start research' stub→P6), reader `/app/explore/[paperRef]` (getOrFetchPaper + SaveToWorkspaceButton P3), `/app/explore/n/[id]` (news+related), `/app/explore/f/[id]` (fact-check + papersByKeys; consensus stub→P5/P8). HomeExploreBento di `/app`.

**Deliverable**: feed discovery ter-populate, personalized, infinite-scroll + 3 reader detail + sinyal save/hide, di-feed worker hydration ke PG dengan full-text PG.

**uiVisible**: `/app/explore` → feed personalized paper/news/fact-check, switch For You/Top/Topics, scroll infinite, hide (hilang), save paper ke workspace, buka detail + related. Cron hydration mengisi konten nyata. Milestone: "feed riset hidup & personal".

**howToRun**: set `OPENALEX_API_KEY` (+ opsional provider keys); `db:migrate`; start API+workers; trigger job `feed-hydration` sekali manual untuk seed; `dev:web-v2`; buka `/app/explore`.

**testable**: unit re-rank top≠foryou, deClump cap 2, derive di tiap write, saveDiscoveryItem materialisasi sekali; integration worker ingest payload OpenAlex/GoogleNews (dedupe), searchDiscovery (tsvector) filter kind/fromYear, getFeedItem/related/papersByKeys/getOrFetchPaper, hidden/saved refs by feed-id+paper-key; e2e buka explore, switch tab, scroll, hide, save, buka 3 reader; gate pacers + cron repeatable.

**exitCriteria**: cron `feed-hydration` ganti 3h Convex & populate; tsvector+GIN back searchDiscovery (pgvector khusus RAG); For You/Top/Topics + infinite scroll + save/hide jalan; 3 reader render + related; SaveToWorkspaceButton pakai `ArtifactService.saveUrl` P3; sinyal interest (+1/+2/−1) tulis `user_feed_interests`.

---

## Fase 5 — Billing + entitlements

**Goal**: mesin credit/entitlement yang men-_gate_ agent: `BillingService` (getSnapshot, ensureCreditPeriod, requireEntitlement, consumeCredits, syncSubscriptionFromPolar) + Polar checkout/portal, plus layar settings usage/billing. Harus landing sebelum chat.

**Scope**:

- `packages/db`: `billing_subscriptions` (unique polar_subscription_id, plan/interval CHECK, raw_json jsonb), `billing_events` (idempotency, atau Redis), `admin_entitlements`, `billing_credit_periods` (unique owner+periodKey, counter mutable untuk increment atomik), `provider_usage_ledger` (feature CHECK, metadata jsonb, by_owner_feature_created), `usage_daily_rollup` (unique owner+date, featureCounts jsonb). `PLAN_CATALOG` SSOT (free 50cr/2dr/1ws/25lib, starter 500/3/5/250, plus 1500/12/20/1000, admin MAX) — ganti stub P2/P3.
- `packages/services` `BillingService`: getBillingSnapshot (admin override→live Polar→mirror fallback), ensureCreditPeriod (UTC bulanan, re-sync limit), getCurrentPeriod, usageActivity (seed tiap hari + overlay rollup), `consumeCredits` (estimasi, requireEntitlement return-union, atomik decrement+ledger+rollup satu transaksi), syncSubscriptionFromPolar (idempotent), checkout/portal/change/cancel via Polar SDK. Write-path terpenting — dipakai route sekarang; eve tool + worker di P6+.
- Route `billing.ts`: current/usage(current-period+activity)/products/checkout/portal/subscription(change+cancel) + `POST /webhooks/polar` (verify→syncSubscriptionFromPolar). Wire override admin-allowlist ke capacity check Workspace/Artifact (ganti stub 'free').
- web-v2: `/app/settings` overview (current + activity 365d + thread count), `/app/settings/usage-billing` (plan, products, usage toggle 30/90/365, checkout redirect, portal, change/cancel), shell+rail. `/app/settings/account` (display name; avatar+delete wired P9).

**Deliverable**: billing snapshot + Polar checkout/portal/change/cancel + dashboard usage, dengan `consumeCredits` transaksional siap untuk agent.

**uiVisible**: `/app/settings/usage-billing` → lihat plan (free default) + saldo kredit bulanan + timeseries usage, klik Upgrade → redirect Polar checkout, kembali upgraded (webhook), switch/cancel, buka portal. Overview: plan+usage+thread count. Terlihat: "lihat & ubah langganan".

**howToRun**: set `POLAR_*` (token+webhook secret+product IDs) + admin allowlist; `db:migrate`; start API; `dev:web-v2`; pakai Polar sandbox + tunnel untuk `/webhooks/polar`.

**testable**: unit rate estimasi per feature/agentKind, `consumeCredits` return-union (quota_exceeded/subscription_required/billing_inactive) tak throw, ensureCreditPeriod re-sync, admin override unlimited; integration `consumeCredits` atomik (3 write atau none on rollback), deep-research cap via by_owner_feature_created, `/webhooks/polar` idempotent, snapshot fallback mirror saat Polar down; e2e usage-billing checkout (redirect), simulasi webhook upgrade, switch+cancel; gate usage isi zero days.

**exitCriteria**: `consumeCredits` service transaksional tunggal (return-union, siap chat P6); checkout/portal/change/cancel + mirror jalan; override admin wired ke capacity lintas service; settings overview+usage-billing+account render data nyata; `PLAN_CATALOG` SSOT (stub P2/P3 diganti).

---

## Fase 6 — Astra chat via eve

> **STATUS: ✅ DONE (uncommitted→committed, 2026-06-22).** Diimplementasi mengikuti rencana eksekusi phase-6 (slices 6.0→6.9), yang **menggantikan arsitektur MCP di bawah ini**. Divergensi as-built (keputusan owner): **(1) BUKAN Aqsha MCP server / eve connections** — tool data in-process `defineTool` dgn `externalDependencies` `@aqsha/services`+`@aqsha/db` (build-step dist, node v25); **(2) HITL native eve** (`needsApproval` + `inputResponses`), `propose_artifact` `always()` meniadakan `execute_artifact` terpisah; **(3) timeline live-only** → **tanpa** tabel `agent_runs`/`agent_run_events`/`pending_interactions` (migrasi P6 = `0007` chat_threads/messages + `0008` research_sources saja); **(4) search Jina-only** (Exa di-drop); **(5) citation verify → ditunda P7**. Testing 6.9 = service-unit + DB-itest + manual checklist (owner scope: tanpa eve-harness/Playwright). Gate akhir hijau: typecheck 10 ws, full `test:v2`, web-v2 lint, `eve:build`. Bugfix dev-runtime: impor relatif `agent/**` wajib ber-ekstensi `.ts` (node v25 native TS) — lihat memory.

**Goal**: loop produk sentral & port terbesar: mount eve ke web-v2 (`withEve`), gerakkan chat normal lewat runtime durable eve, stream respons + aktivitas reasoning/tool/subagent, HITL (input request/approval), attachment, dan konteks @workspace/@artifact. eve mengakses data Aqsha sendiri lewat **Aqsha MCP server** (Streamable HTTP `POST /mcp` di api-v2) + **eve connections** (`agent/connections/aqsha*.ts`) — bukan tool service-layer in-process; hanya tool yang butuh `ctx.getSandbox()`/HITL-gate yang tetap authored in-process. `consumeCredits` gate tiap run. Catatan API eve: nama event stream diverifikasi terhadap bundled docs eve v0.11.6 di `~/.agents/skills/eve/docs`; **field key payload tepat di-verifikasi ulang terhadap `node_modules/eve` saat install** (eve belum terpasang di repo).

**Scope**:

- `packages/db`: `chat_threads` (thr*\* PK, status/agentKind/titleStatus CHECK, by_owner_activity), `chat_messages` (role/status CHECK, reasoning, by_thread_created), `agent_runs` (run*\* PK, status 7-literal/mode/agentKind CHECK, usage_json/verification_report_json jsonb, by_status_updated), `agent_run_events` (unique run+seq, index run+segment, payload jsonb), `pending_interactions` (type/status CHECK, payload/response jsonb), `research_sources`. (eve memiliki state durable session/turn/step di `.workflow-data`; tabel ini = proyeksi product yang di-query UI.)
- **Aqsha MCP server** (api-v2 `POST /mcp`, B1): adapter MCP **tipis** ke-4 di atas `packages/services` — sejajar route Elysia + worker BullMQ, logika tetap di `packages/services` (zero duplikasi). Tiap request di-auth dengan Clerk token per-user (`clerk.verifyToken` → `ownerUserId`, reuse `clerk.verifyToken()` dari `@clerk/backend` yang sama dengan authPlugin Elysia); ownership ditegakkan di service layer. Invariant bisnis (mis. `execute_artifact` butuh `propose_artifact` ter-approve) hidup di `execute()` MCP server (kode kita), **bukan** double-gate hook.
- eve agent dir di `apps/web-v2/agent/`: `instructions.md`, `agent.ts` (model static per-agent, gateway id mis. `anthropic/claude-opus-4.8`/`anthropic/claude-sonnet-4.6`; `agentKind` lite/pro adalah konsep produk/billing Aqsha → dipetakan ke (sub)agent dengan model fixed atau `LanguageModel` yang dipilih channel sebelum dispatch, **bukan** tier eve per-turn), `channels/eve.ts` (custom Clerk-JWT auth → ownerUserId), `skills/*.md` (10 slash-command jadi load_skill playbook), `hooks/` (observe-only mirror event ke PG, scrub secret dari `payloadJson` — hook **tak bisa** deny tool).
- **eve connections ke Aqsha MCP server** (B2, `agent/connections/aqsha.ts` + `agent/connections/aqsha_write.ts` via `defineMcpClientConnection({ url, description, auth, principalType:'user', tools, approval })`): `aqsha` (read/research/citation, **tanpa approval**) `tools.allow = [list_artifacts, get_artifact, get_render_payload, search_thread_documents (RAG pgvector), list_workspaces, paper/explore lookups, feed reads, search_web, search_arxiv, lookup_doi, verify_citations, verify_identifiers]`; `aqsha_write` (side-effecting, `approval: always()`/`once()`) `tools.allow = [save_url, propose_artifact, execute_artifact, create_workspace, rename_workspace, link_to_workspace, delete_artifact]`. `auth.getToken` mengembalikan Clerk bearer user; eve kirim `Authorization: Bearer`, model **tak pernah** melihat URL/token; model discover via `connection__search` dan memanggil nama berkualifikasi (`connection__aqsha__search_thread_documents`, `connection__aqsha_write__execute_artifact`). Provider riset (Exa/Jina/Crossref/arXiv/OpenAlex) di-wrap `ResearchService` dan diekspos **melalui** MCP server (pacer/TTL cache + `consumeCredits` server-side) — server kita yang memegang pacer/cache.
- **Tetap in-process di `agent/tools/`** (B4, tak bisa lewat MCP): hanya tool yang butuh `ctx.getSandbox()` (statistik, P7) + `proposeResearchPlan` (pure HITL gate `needsApproval`, P7) + built-in eve. SEMUA tool data-related pindah ke connection MCP.
- **Harness/built-in tools** (A6): eve menyalakan SEMUA built-in default (bash, read_file, write_file, glob, grep, web_fetch, web_search, todo, ask_question, agent, load_skill, connection_search). Agent chat ini wajib `disableTool()` bash/write_file/glob/grep di root, dan disable atau approval-gate web_search/web_fetch (akses web dipaksa lewat tool riset MCP server yang membawa pacer/cache; `web_search` tak punya executor lokal).
- **Client API eve** (A1): `useEveAgent()` mengekspos HANYA `data, status ("ready"|"submitted"|"streaming"|"error"), error, events, session (cursor {sessionId, continuationToken, streamIndex}), send(...), stop(), reset()` — **tak ada** `respond()/start()/continue()/cancel()`. Mulai/lanjut turn `await agent.send({ message })`; cancel `agent.stop()`; jawab HITL `agent.send({ inputResponses: [{ requestId, optionId? }] })` (pilih opsi) atau `agent.send({ message })` (free text) di session yang sama; request HITL terparkir dibaca dari `agent.data.messages.at(-1).parts.find(p => p.type==='dynamic-tool' && p.toolMetadata?.eve?.inputRequest)?.toolMetadata.eve.inputRequest` (fields `requestId`, `prompt`, `options`); persist seluruh objek cursor session via `onSessionChange`/`initialSession` (bukan satu field).
- `packages/services`: `SendQuotaService.check` (estimateTokens, feature normal_chat/pro_chat/deep_research, `consumeCredits` P5 + rate limit Redis sendMessage 1/5s cap2, globalSendMessage 1000/min, globalTokenUsage 100000/min — return union). `ThreadService`/`MessageService`/`RunService`/`HitlService`/`ContextService` (hydrate artifacts cap8/workspaces cap30, searchThreadDocuments). `resolveCommandDispatch` (/deep) pindah ke composer eve. Durabilitas run dimiliki eve (Workflow SDK) + recovery stalled-job bawaan BullMQ menggantikan `watchdogSweep` V1 — **tidak ada worker `agent-watchdog` khusus**. `TitleService` (job BullMQ `thread-title`, generateObject).
- **Session-ownership AuthFn** (A8): route-auth eve **tidak** menegakkan kepemilikan session. App wajib menegakkannya via `ownershipAuthFn` khusus (resolve owner session dari map thread↔session; throw `ForbiddenError` bila `principalId != owner`) pada `/session/:id` + `/session/:id/stream`, atau proxy api-v2 tipis di depan stream. Array auth produksi `[clerkAuthFn(), ownershipAuthFn]`; **drop `vercelOidc()`** (self-host VPS); `localDev()` di-gate non-prod saja.
- **Idempotency `consumeCredits`** (A9): step eve yang ter-interrupt **re-run saat resume** → tambahkan idempotency key per-turn/step pada ledger debit per-model-call, dicek di transaksi Drizzle yang sama, agar tak double-debit saat crash-resume.
- api-v2 endpoint tipis yang tersisa (threads/runs DIMILIKI eve via withEve): `GET /commands`, thread-list/rename/delete + message-history reads, `GET /send-status`. Drop `routes/threads.ts/runs.ts/agent-runner.ts` buatan tangan.
- web-v2: `/app` ThreadShell + `/app/threads/[id]` chat penuh via `useEveAgent({headers: Clerk Bearer})`; streaming live dari NDJSON eve → activity view-model (urutan reasoning/tool/subagent dari stream); composer attachment (presign+finalize headless P3), context pills @workspace/@artifact, agent selector gated billing, HITL question/answer + approval cards, cancel/retry, thread switch/delete, cooldown rate-limit. Chat artifact card link via `ArtifactService.linkToWorkspace`.

**Deliverable**: chat Astra: kirim pesan → respons streaming Claude live + reasoning/tool/subagent → jawab HITL/approval → attach file → pin konteks → cancel/retry, semua di runtime durable eve + Aqsha MCP server di atas service layer + proyeksi PG.

**uiVisible**: `/app` → ketik ke Astra → respons live-streaming (reasoning, tool MCP `connection__aqsha__search_web/search_arxiv/lookup_doi/search_thread_documents`, subagent); agent tanya HITL → jawab inline via `send({inputResponses})`/`send({message})` (lanjut, session sama); agent panggil `connection__aqsha_write__propose_artifact` → **connection-level approval** pause/resume session durable → approve (muncul chat artifact card, linkable ke workspace via `connection__aqsha_write__link_to_workspace`); attach PDF, pin @workspace, `stop()`/retry, switch/delete thread. Kredit turun per run; cooldown saat rate-limit. Loop sentral live.

**howToRun**: set `ANTHROPIC_API_KEY` (atau gateway), eve env, provider keys; `db:migrate`; `dev:web-v2` (host eve via withEve, `.workflow-data` volume); `dev:api` (commands/thread-index/send-status + **Aqsha MCP server `POST /mcp`**); sign in, `/app`, chat.

**testable**: unit `SendQuotaService.check` return-union (kredit + rate-limit retryAt), `ContextService` cap; MCP server `execute_artifact` invariant (error bila tak ada `propose_artifact` ter-approve), HITL input request pause durable, `ResearchService` (via MCP) persist sources + pacer/cache aktif; idempotency `consumeCredits` (re-run step pada resume tak double-debit, A9); integration turn normal persist threads/messages/runs/events (hook observe-only scrub secret) + finalize + `consumeCredits` sekali + `stop()` sticky + retry tanpa re-charge; HITL `send({inputResponses})` materialisasi user message + resume; attachment→finalize→link via `connection__aqsha_write__link_to_workspace`; @mention context hydrate; MCP request auth Clerk per-user (`clerk.verifyToken`→ownerUserId) + ownership di service; `aqsha_write` connection approval pause/resume session; ownership AuthFn tolak `principalId != owner` di `/session/:id(/stream)` (A8); e2e kirim→answer+activity, jawab HITL lanjut, approve artifact, attach PDF, `stop()`, rate-limit cooldown, delete thread; gate channel eve tolak non-Clerk + array `[clerkAuthFn(), ownershipAuthFn]` (tanpa vercelOidc); resume eve dari `.workflow-data` + recovery stalled-job BullMQ memulihkan run yang crash/stalled (tanpa watchdog khusus); eve build hijau.

**exitCriteria**: eve mounted via withEve + custom Clerk-JWT channel auth + `ownershipAuthFn` (array `[clerkAuthFn(), ownershipAuthFn]`, drop vercelOidc); runtime durable gerakkan chat normal (tanpa RPC Convex/bridge agents); `SendQuotaService.check`+`consumeCredits` gate tiap run (return-union, idempotent saat resume A9); **Aqsha MCP server** (`POST /mcp`) live sebagai caller ke-4 di atas `packages/services` yang **sama** dengan route/worker (zero duplikasi) — eve adalah _client_ MCP, bukan caller in-process; hanya tool sandbox/HITL-gate yang tetap authored in-process (B4); akses data lewat `connection__aqsha*` (read tanpa approval, `aqsha_write` connection-level approval); `execute_artifact` digate manusia oleh approval connection (bukan double-gate hook) + invariant bisnis di `execute()` server; client pakai `send()/stop()/reset()` + cursor session penuh (tanpa respond/start/continue/cancel); streaming+activity+HITL+attachment+context+stop/retry+thread CRUD visible; **eve NDJSON stream** (bukan SSE buatan tangan) + persistensi final-only menghindari read-amplification 250ms V1; slash-command jadi eve skills (Skills bukan domain); `GET /commands` serve palette.

---

## Fase 7 — Deep research (`/deep`)

**Goal**: perluas chat eve dengan flow `/deep` yang **murni model-driven**: sebuah SKILL playbook + subagents yang dideklarasi, di mana **model** memutuskan alur & kapan mendelegasi (eve dispatch tool call paralel concurrent). **Tidak ada** kode orkestrasi deterministik (drop `DEEP_PHASES`/`DEEP_PHASE_POLICIES`/`RunManager.executeDeepRun`/dynamic-workflow-tool sebagai _driver_). Plan-gate di awal, subagents literature/counter/citation/writer, sandbox verifikasi statistik (root in-process), dan verification report di web-v2. Invariant **dilonggarkan**: tanpa ceiling biaya per-run keras & tanpa budget per-fase.

**Scope**:

- **SKILL deep-research** (C2, `apps/web-v2/agent/skills/deep-research/SKILL.md`, load-on-demand): frontmatter `description` "Use when the user runs /deep or asks for a thorough, citation-verified research report". Body = metodologi: propose plan + plan-gate dulu; fan-out `literature-searcher` atas sub-pertanyaan; delegasi ke `counter-evidence`, lalu `citation-verifier`; tulis dengan `writer`; berhenti saat bukti cukup. **Model yang menentukan flow & kapan delegasi** (eve dispatch paralel concurrent). Bukan loop fase deterministik.
- **Plan-gate** (C3): `proposeResearchPlan` = in-process `defineTool` `needsApproval: once()` (pure HITL, tanpa side effect); SKILL menyuruh model memanggilnya **lebih dulu**; resolusi lewat jalur HITL eve `send({inputResponses})` (pengganti Branch B + resolvePlanDecision V1).
- **Subagents dideklarasi** (C4, `apps/web-v2/agent/subagents/{literature-searcher,counter-evidence,citation-verifier,writer}/agent.ts`): masing-masing `instructions.md` + `tools/` re-authored sendiri; **task mode dipicu `outputSchema`** (DROP flag `background:false`, A4); **inherit NOTHING** dari root (own tools/skills/connections/instructions) — share executor lewat `packages/services`; nama dir subagent tak boleh tabrakan dengan nama tool; subagent **tidak** mewarisi sandbox (A3/C7); kestabilan penomoran sitasi jadi tanggung jawab **writer** (prompt), bukan counter orkestrator (C5).
- **Stats verification ROOT in-process** (C7): `verifyStatistics`(auto,read-only) + `runComputation`(needsApproval) sebagai authored tool di **root** yang memiliki satu sandbox docker deny-all; model/subagent memanggilnya. Sandbox path `apps/web-v2/agent/sandbox/sandbox.ts` (layout folder, wajib bila seed `agent/sandbox/workspace/**`) atau `agent/sandbox.ts` shorthand — **JANGAN** `agent/sandbox/<name>.ts` (tepat satu sandbox per root). Network: biarkan factory `docker()` egress **terbuka** agar `bootstrap()` bisa install R+packages, lalu enforce `networkPolicy:'deny-all'` di `onSession({use}) => await use({networkPolicy:'deny-all'})` (Docker hanya honor allow-all/deny-all, tanpa allow-list domain; pakai `microsandbox()` bila butuh lebih halus). `sandbox.run` Rscript (statcheck/GRIM/power/metafor); ekstraksi klaim LLM di runtime tool (di luar sandbox deny-all).
- **Invariant LONGGAR** (C5): **DROP** ceiling keras `ASTRA_MAX_RUN_BUDGET_USD` per-run + budget per-fase. Kontrol biaya = `consumeCredits` per-call (tiap call model/provider men-debit) + cap **bulanan** deep dari billing P5 + panduan fokus di SKILL. Durabilitas step Workflow SDK (step selesai tak re-run) **dipertahankan**.
- **Workflow tool opt-in saja** (C6): `ExperimentalWorkflow` (`agent/tools/workflow.ts`) hanya escalation opt-in (JS model-authored atas subagents untuk fan-out runtime-computed); default tetap delegasi skill+subagent biasa; ia hanya menjangkau subagents (tanpa files/network/skills/connections) & tak bisa baca usage.
- `packages/services`: skillDelegation domain-pack scorer (research-medicine/cs-ml/education/general) lib code → pilih skill writer subagent; `CitationService.verify/verifyIdentifiers` (dari P6) reuse; `VerificationReportService` persist `verification_report_json`; `research_sources` (dari P6) diperluas. Deep credited via `consumeCredits(feature='deep_research')` + cap bulanan P5.
- **Activity by subagent** (C8): tanpa loop fase deterministik → turunkan progres subagent dari `subagent.called` `data.childSessionId` (attach ke child stream), di-mirror server-side oleh hook observe-only **per-subagent** ke `agent_run_events` keyed by `runId`; browser tetap **satu** `useEveAgent` di parent. Drop "phase_start/phase_done dari orkestrator"; group activity by **nama subagent** + tool calls.
- web-v2: entry `/deep` dari composer + 'Start research' feed/explore. Plan-gate card (editable, resolve via `send({inputResponses})`). Activity dikelompokkan per subagent (literature/counter/citation/writer); Sources panel (listSourcesByThread); render verification report; subagent panel.

**Deliverable**: run `/deep` di mana **model** (dipandu SKILL) propose rencana editable (gated), lalu mendelegasi ke subagent literature/counter/citation/writer + memanggil sandbox verifikasi statistik, lalu menulis jawaban tercitasi & terverifikasi — durably resumable via step durability eve, tanpa kode orkestrasi deterministik.

**uiVisible**: ketik `/deep <pertanyaan>` (atau 'Start research' di paper) → review+edit plan → approve (`send({inputResponses})`) → tonton aktivitas dikelompokkan **per subagent** (literature-searcher fan-out → counter-evidence → citation-verifier → verifikasi statistik → writer) dengan Sources panel live, subagent cards, verification report final. Kredit deep per-call + cap bulanan ditegakkan. Terlihat: "deep research terverifikasi sekali klik".

**howToRun**: set `ANTHROPIC_API_KEY` + env sandbox docker + provider keys; `db:migrate`; `dev:web-v2` (eve + sandbox docker); start API; `/app`, `/deep <q>`. (Tanpa `ASTRA_MAX_RUN_BUDGET_USD` — ceiling per-run di-drop.)

**testable**: unit `proposeResearchPlan` pause (`needsApproval: once()`); reject cancel, revise re-enter, approve tulis output; subagent task mode dipicu `outputSchema` (tanpa `background:false`); subagent tak mewarisi sandbox/connections; `verifyStatistics` Rscript di sandbox deny-all (egress dibuka hanya saat `bootstrap()`, lalu `use({networkPolicy:'deny-all'})`) + klaim-extract di luar sandbox; integration run persist `research_sources` + `verification_report_json`; activity dikelompokkan per subagent dari `subagent.called.childSessionId` (mirror hook per-subagent ke `agent_run_events` keyed runId); step durability re-run hanya non-done pasca crash (no double-charge, `consumeCredits` idempotent); e2e /deep→plan card→edit+approve→activity per-subagent→Sources→report + cap **bulanan** block; gate cap bulanan + `networkPolicy:'deny-all'` di `onSession` + eve build.

**exitCriteria**: `/deep` **pure model-driven** lewat SKILL playbook + subagents dideklarasi (DROP `DEEP_PHASES`/`DEEP_PHASE_POLICIES`/`RunManager`/dynamic-workflow-tool sebagai driver; Workflow tool **opt-in only**, C6); plan-gate via `needsApproval` (tanpa Branch B); subagents literature(fan-out)/counter/citation/writer, masing-masing inherit nothing + share executor via `packages/services`; sandbox docker `sandbox.ts` root deny-all (path benar A3, egress dibuka saat bootstrap lalu deny-all di onSession, subagent tak mewarisi sandbox); step durability (bukan `researchPhaseStates` replay); **ceiling per-run keras di-DROP** — biaya dikontrol per-call `consumeCredits` + cap bulanan + SKILL focus; penomoran sitasi tanggung jawab writer; activity by subagent (satu `useEveAgent` parent); Sources+subagent cards+report visible; deep credited+capped.

---

## Fase 8 — Discovery polish

**Goal**: lengkapi parity discovery: global search augmented dengan live external paper, consensus meter, 'kenapa relevan' LLM notes, idea generator — semua credited `consumeCredits`.

**Scope**:

- `packages/services` `FeedAiService` (semua `consumeCredits(normal_chat)` gated, return-union): explainRelevance, explainTerm, consensus.getConsensus (questionKey, cache 30 hari Redis, OpenAlex stance → Ya/Tidak/Mungkin), ideas.generateIdeas (RAG OpenAlex → FINER). `ExploreService.searchPapers` (waterfall OpenAlex→arXiv→Jina→Crossref DOI, cacheKey, upsertPaperCache). `FeedService.searchDiscovery` (tsvector) di-augment pass live external untuk paper uncached.
- Route `explore.ts` searchPapers; `feed.ts` searchDiscovery+consensus+explainRelevance+ideas (action V1 → POST yang internal consumeCredits).
- web-v2: global search (searchDiscovery + augmentasi live, dedupe vs saved/hidden), consensus meter di `/app/explore/f/[id]`, 'Kenapa relevan' di card, IdeaDialog, glossary explainTerm popover.

**Deliverable**: polish discovery: cross-content search + live external, consensus on-demand, relevance notes, idea generator — semua credit-gated.

**uiVisible**: search lintas konten (feed cached + live external bersama, saved ditandai), buka klaim viral → consensus meter (Ya/Tidak/Mungkin dari paper pendukung), baca 'kenapa relevan' di card, buka idea generator → pertanyaan riset → launch ke `/deep`. Terlihat: "cari semua, nilai klaim, hasilkan ide".

**testable**: unit waterfall stop di limit, consensus cached 30d, explainRelevance canned cold-start, ideas 1..3 FINER; integration tiap AI action consumeCredits return-union, search+live merge dedupe, consensus tie ke feed item; e2e search cached+live, compute consensus, relevance note, generate ideas→/deep; gate buckets external.

**exitCriteria**: searchDiscovery augmented live, dedupe saved/hidden; consensus/explainRelevance/explainTerm/ideas jalan & credit-gated return-union; loop idea→/deep tutup.

---

## Fase 9 — Account lifecycle + admin

**Goal**: tutup gap parity: cascade deletion owner-data lengkap (tabel yang V1 lewatkan) sebagai worker BullMQ (tanpa cap 500-row), profile (display name + R2 avatar), admin entitlement seeding, dan ops dashboard (bull-board, health).

**Scope**:

- `packages/services` `AccountDeletionService`: hard-delete footprint owner penuh via cascade FK / worker paginated (bukan cap 500), cakup tabel yang V1 lewatkan (userOnboarding/userFeedInterests/hiddenFeedItems/feedInteractions/usageDailyRollup/savedFeedItems/feedCollections) + agent/artifact/workspace/billing + object R2 + entry pgvector. deleteCurrentAccount: deletionStatus deleting→deleted tombstone→Clerk DELETE (404=ok)→failed on error. Reuse untuk webhook `user.deleted`. `UserService.updateDisplayName`+`setAvatar` (R2 key ganti sentinel). `AdminService` entitlement seeding.
- Route: `POST /auth/delete-account`, `PATCH /auth/display-name`, avatar presign+setAvatar, admin entitlements; `bull-board` di `/admin/bull` (admin); `GET /health/ready` (db+redis+R2); jalur webhook account-deletion.
- web-v2: `/app/settings/account` (display name, avatar upload+crop R2, delete-account→Clerk signOut), `/app/settings/security` (Clerk-managed), `/app/settings/appearance` (theme). Admin page minimal opsional + link bull-board.

**Deliverable**: account lifecycle lengkap & parity-correct (provision + profile + cascade deletion) + tooling admin/ops, tanpa gap deletion V1, tanpa row cap.

**uiVisible**: edit display name, upload/ganti avatar (R2), toggle appearance, delete account (cascade SEMUA data feed/agent/artifact/workspace/billing + R2 + RAG lalu sign out). Admin grant override entitlement + lihat bull-board. Terlihat: "kelola & hapus akun sepenuhnya".

**testable**: unit AccountDeletionService enumerasi SETIAP tabel owner (assert cakup tabel yang V1 lewatkan), tanpa cap 500, setAvatar ganti sentinel+delete lama; integration delete cascade hapus semua row+R2+RAG akun berat (>500 row) tanpa gagal, Clerk 404=sukses, webhook reuse cascade; admin override unlimited di snapshot; e2e edit name, upload avatar, delete→signed-out; gate bull-board admin, health/ready db+redis+R2.

**exitCriteria**: cascade cakup semua tabel owner (fix gap V1) + R2 + RAG, tanpa cap; profile (name+R2 avatar)+admin entitlement+appearance/security selesai; bull-board+health/ready live & admin-gated.

---

## Fase 10 — Aggressive cutover

**Goal**: capai parity penuh, flip produksi ke V2, decommission V1 Convex agresif dengan periode paralel minimal. Strategi data **fresh-start** (tanpa migrasi data Convex) — user onboard ulang.

**Scope**:

- **Verifikasi parity** terhadap ~67 surface `api.*` audit + `essentialFunctions` (dipetakan ke padanan service/route/eve V2) — tiap fungsi `consumedByWeb:true` punya counterpart V2 yang jalan, tiap surface UI render.
- **Deploy produksi**: compose (postgres+redis) di VPS via Tailscale; api-v2+workers (termasuk **Aqsha MCP server `POST /mcp`**) sebagai proses host/systemd di balik reverse proxy; jalankan **`eve build`** sebelum start web-v2; web-v2+eve di-deploy (D1 **single-node invariant**: `.workflow-data` file-backed di volume VPS persisten bersifat single-machine on-disk → proses eve/web-v2 **WAJIB satu replica** sampai Workflow world non-local GA; **tanpa autoscaling** untuk proses eve, front-of-house Next.js boleh tetap scale; tambah kebijakan backup manual `.workflow-data`). Stream-safe Nginx (D2: `proxy_buffering off`, `proxy_read_timeout 3600s`, `proxy_http_version 1.1`, `Connection ''`) diterapkan ke blok `aqshara.com` (stream NDJSON eve ada di sana, bukan hanya `api.aqsha.app`). Bucket R2 dibuat; webhook Clerk/Polar dipoint ke endpoint V2 (verifikasi signature constant-time; owner session eve diturunkan hanya dari Clerk AuthFn terverifikasi, tak pernah dari body client); cron BullMQ (feed-hydration 3h) terdaftar (durabilitas run dimiliki eve + stalled-job BullMQ — tak ada watchdog khusus).
- **Mekanik cutover**: DNS/reverse-proxy flip domain dari apps/web (V1) ke web-v2; URL webhook Clerk+Polar switch ke api-v2 (idempotency dedupe cegah double-process saat overlap singkat); smoke-test loop visible penuh (sign up→onboard→feed→workspace+upload→chat→/deep→billing) di produksi.
- **Decommission**: stop apps/web + apps/agents + convex dev/deploy; hapus deployment Convex; arsip packages/convex + apps/agents + apps/web di balik tag; hapus script/workspace V1 dari root package.json; cancel plan Convex.

**Deliverable**: V2 live di produksi pada domain utama dengan V1 Convex decommissioned, semua webhook dipoint ulang, checklist parity hijau.

**uiVisible**: user produksi mengakses domain nyata → app V2 penuh (loop yang sudah divalidasi fase-per-fase: onboarding, feed, workspaces+artifacts, chat Astra, deep research, billing, settings) dengan V1 hilang. Tak ada user yang melihat Convex.

**howToRun**: di VPS — `docker compose -f infra/compose.yaml up -d`; `db:migrate`; jalankan `eve build`; start api-v2+workers (+ Aqsha MCP `/mcp`) + web-v2(+eve, **single replica**) sebagai proses managed di balik reverse proxy (Nginx stream-safe pada blok `aqshara.com`); buat bucket R2; repoint webhook Clerk+Polar; daftarkan cron BullMQ; jalankan smoke-test produksi. Lalu stop V1 (kill convex deploy/dev, stop apps/web + apps/agents).

**testable**: parity checklist (tiap `essentialFunctions` punya padanan V2 yang return shape benar; Eden Treaty compile end-to-end); smoke produksi loop penuh; resilience kill proses web-v2/eve mid-run → run resume dari `.workflow-data` (no double-charge), cron BullMQ fire; webhook Clerk+Polar diproses sekali (idempotency holds across overlap); gate final typecheck+lint hijau semua workspace V2, tanpa sisa import V1.

**exitCriteria**: checklist parity hijau (semua `consumedByWeb` + ~67 surface UI punya padanan V2, minus Skills); V2 serve domain utama; webhook dipoint ulang; cron BullMQ live; bucket R2 dipakai; `eve build` jalan + Aqsha MCP server live di prod; **decision-record single-node** (D1): eve/web-v2 dijalankan single replica file-backed `.workflow-data` (bukan lagi "open decision"), dengan **trigger eksplisit switch ke Vercel/Workflow non-local**: butuh >1 replica, butuh managed run dashboard, atau crash-recovery berulang — sertakan kebijakan backup `.workflow-data`; Nginx stream-safe (D2) terpasang di `aqshara.com`; V1 decommissioned (apps/web+apps/agents stop, deployment Convex dihapus, arsip di tag, plan Convex dicancel); periode paralel minimal (hanya window cutover).

---

## Cutover — Detail

### Checklist Parity (dari audit, bukan tebakan)

Validasi tiap fungsi `consumedByWeb:true` (≈67 surface `api.*`) punya padanan V2 & tiap surface UI render. Per domain:

- **Auth/User**: syncCurrentUser→`UserService.ensureCurrentUser`, getCurrentUser, updateDisplayName, avatar→R2, deleteCurrentAccount→`AccountDeletionService` (cakup tabel yang V1 lewatkan + tanpa cap 500).
- **Onboarding**: getStatus/complete.
- **Workspaces**: list/get/create/rename/updateEmoji/archive + folders.
- **Artifacts**: get/getRenderPayload(R2)/list/listForContextPicker/createDocument/createUrl/updateDocument/rename/move/remove/generateUploadUrl(R2)/uploads.\*/linkArtifactToWorkspace/retryUrlExtraction.
- **Feed/Explore**: getFeed/getFeedPaginated/getFeedItem/searchDiscovery/related/saved+hidden refs/hide/recordInteraction/papersByKeys/consensus/explainRelevance/ideas/getOrFetchPaper/searchPapers.
- **Agent**: startThread/sendMessage/cancelRun/retryRun/removeThread/interactions.respond/getSendStatus/queries.\* → runtime eve (client API `send()/stop()/reset()`) + data Aqsha via Aqsha MCP server + read tipis api-v2.
- **Billing**: current/products/usage.activity/checkout/portal/subscription.change+cancel.
- **DROPPED (locked)**: domain Skills (tak pernah tabel Convex; slash-command → `agent/skills/*.md`).
- **Non-UI tapi load-bearing**: cron feed-hydration 3h, enrichment (resolver+LLM metadata), url-ingestion, webhook Polar+Clerk (durabilitas run eve + stalled-job BullMQ menggantikan watchdog V1).
- **Service layer multi-caller**: route Elysia + **Aqsha MCP server** + worker BullMQ meng-import **modul `packages/services` yang sama** (consumeCredits, WorkspaceService.create, ArtifactService.saveUrl/applyAction, SendQuotaService.check, FeedInteractionService), zero duplikasi. eve adalah **client** MCP server (lewat connection HTTP), bukan caller in-process — kecuali tool sandbox/HITL-gate yang tetap authored in-process. Trade-off diterima: MCP bridge memperkenalkan HTTP hop (web-v2/eve ↔ api-v2 `/mcp`) + surface auth ke-4 (demi boundary MCP bersih & reusable).

### Data: Fresh Start (default)

Tanpa migrasi data Convex→PG. Alasan: (1) `_id` implisit Convex tak memetakan ke skema PK PG → migrasi faithful butuh id-remapping penuh lintas FK; (2) kelas data terbesar regenerable (`feed_items`/`explore_papers` diisi cron hydration dalam jam; embeddings RAG harus re-index); (3) `ragEntryId` handle opaque `@convex-dev/rag` tanpa padanan PG. User onboard ulang (wizard sudah wajib). Bila kelak owner mau pertahankan artifact: hanya `workspaces`+`artifacts`(+contents/urls/paper_metadata)+blob R2 yang layak di-script via `packages/db/scripts/migrate-from-convex.ts` — **di luar** cutover default.

### Langkah Decommission (agresif)

1. **Pre-cutover**: deploy V2 ke VPS (compose pg+redis via Tailscale; api-v2+workers+Aqsha MCP server + web-v2/eve proses managed **single replica** di balik reverse proxy Nginx stream-safe; jalankan `eve build`; bucket R2; cron BullMQ terdaftar); smoke-test produksi loop penuh.
2. **Flip**: repoint domain (DNS/reverse-proxy) apps/web→web-v2; switch URL webhook Clerk+Polar dari endpoint Convex ke `api-v2 /webhooks/*` (idempotency dedupe → overlap aman).
3. **Seed**: trigger feed-hydration sekali agar `/app/explore` ada konten saat launch.
4. **Decommission V1**: stop apps/web + apps/agents; stop convex dev + hapus deployment Convex; cancel plan Convex (hentikan biaya DB-bandwidth yang memicu migrasi).
5. **Repo cleanup**: tag arsip V1; hapus apps/web, apps/agents, packages/convex, packages/agent-contracts dari root workspaces + script-nya; kode tetap di tag arsip.
6. **Post-cutover watch**: pantau bull-board + health/ready + delivery webhook untuk siklus billing pertama; simpan tag arsip Convex sampai satu siklus billing bersih lewat, lalu hapus. Periode paralel diminimalkan ke window cutover — **jangan** jalankan V1 & V2 di produksi bersamaan di luar smoke-test/flip.

---

## Ringkasan Fase

| Fase | Judul                     | Essential | uiVisible singkat                 | Depends |
| ---- | ------------------------- | --------- | --------------------------------- | ------- |
| 0    | Foundations runnable      | ✓         | serverTime live (rail)            | —       |
| 1    | Auth + onboarding         | ✓         | sign up → wizard → /app           | 0       |
| 2    | Workspaces CRUD           | ✓         | organize workspaces+folders       | 1       |
| 3    | Artifacts + R2            | ✓         | upload/URL/doc library + reader   | 2       |
| 4    | Discovery Feed            | —         | feed personal infinite + 3 reader | 3       |
| 5    | Billing + entitlements    | ✓         | plan/credit/checkout/usage        | 4       |
| 6    | Astra chat via eve ✅     | ✓         | chat streaming + tool + HITL      | 5       |
| 7    | Deep research /deep       | ✓         | plan-gate + subagents + report    | 6       |
| 8    | Discovery polish          | —         | global search + consensus + ideas | 7       |
| 9    | Account lifecycle + admin | —         | profile/avatar/delete + ops       | 8       |
| 10   | Aggressive cutover        | ✓         | V2 live, V1 decommissioned        | 9       |

> Essential = core cutover minimal. Fase 4/8/9 aditif dan boleh menyusul, tapi cutover (10) baru "lengkap" saat parity ~67 surface hijau.
