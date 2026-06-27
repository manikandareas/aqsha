# Rencana Migrasi `apps/agent`: eve → Mastra

> Status: PLAN (2026-06-27). Brainstorm & riset selesai; semua keputusan arsitektur terkunci.
> Bahasa: Indonesia (istilah teknis Inggris). Companion: `docs/architecture/`, memory `eve-to-mastra-migration-brainstorm.md`.

## STATUS RINGKAS (dievaluasi 2026-06-27, branch `feat/mastra-agent`, BELUM commit)

| Fase | Status | Catatan |
|---|---|---|
| **Fase 0 — Spike** | ✅ **SELESAI & terverifikasi** | gate hijau di infra NYATA (DB VPS): scaffold + auth 401 + 35 tabel `mastra_*` + stream + persist. Lihat §5.1. |
| **Fase 1 — Chat parity** | ✅ **Kode SELESAI** (backend terverifikasi; FE core typecheck+lint hijau) | 17 tool + 11 skills + memory/recall + billing + FE (proxy/client/adapter/hook/surface/flag). Lihat §6.1. **Sisa = E2E visual + 3 gap (di bawah)**. |
| **Fase 2 — `/deep` Workflow** | ✅ **SELESAI & terverifikasi (backend)** | Workflow `deep-research` (6 step linear) + 3 subagent + `deep-writer` + gerbang billing. Smoke DB VPS HIJAU. Lihat §7.1. |
| **Fase 3 — Cutover & cleanup** | ✅ **SELESAI (kode)** | eve dihapus TOTAL (app+FE+proxy+deps), composer KAYA di Mastra, projection thread+title, tabel `chat_messages`/`chat_thread_events` DI-DROP (mig 0016, applied dev). Gate typecheck+lint hijau; test db/chat-core/services hijau + api fixed. Sisa = owner E2E + deploy + migrate prod. Lihat §8.1. |

**Gate terverifikasi sekarang:** `bun run typecheck` SEMUA workspace **HIJAU** · `bun run lint` **0 error** (warning lama saja) · eve tetap utuh (koeksistensi).

**Yang BELUM terverifikasi di Fase 0–1 (butuh owner / sesi browser Clerk) — JANGAN dianggap selesai:**
1. **E2E visual chat** (kirim→stream→render→tool→HITL→reload history) via `NEXT_PUBLIC_AGENT_RUNTIME=mastra` + `mastra dev` (:4111) + web. Lapisan storage/stream/billing-debit sudah dibuktikan via smoke skrip; render UI belum.
2. **Billing BLOCK** (precheck `abort()` saat kuota habis): smoke memakai email admin (unlimited) → jalur blok **belum dieksekusi**. Hanya jalur DEBIT yang terbukti (`provider_usage_ledger`).
3. **Ownership thread** (user A tak bisa baca thread user B): **AUTH** (401 tanpa token) terbukti; tapi enforcement thread↔resource pada read (`getMemoryThread().listMessages` / stream dgn threadId milik orang lain) **belum diuji** — andalkan `mapUserToResourceId` Mastra; verifikasi di Fase 1 E2E.
4. **Resume saat refresh** (Fase 0 gate #5): persist+`observe(runId)` tersedia, tapi reconnect lintas-refresh belum diuji di browser.
5. **`mastra build` (produksi)**: hanya `mastra dev` yang dibuktikan; build + externalize `@aqsha/services`/`@aqsha/db` + bundling skill files (path cwd-relative) diverifikasi saat Fase 3 deploy.

**3 GAP integrasi terbuka (perlu keputusan owner, lintas api+web):**
- **Sumber daftar thread + judul:** eve mengisi `chat_threads` via projection hook; Mastra TIDAK punya projection → daftar thread sidebar & judul auto untuk thread Mastra perlu sumber baru (baca `mastra_threads` ATAU tulis tipis `chat_threads`). **Belum diputuskan/diimplement.**
- **Composer Mastra masih MINIMAL** (textarea) — composer kaya (tokenized /slash @context, attachments) belum diport ke jalur Mastra.
- **Title-gen async** (eve `TitleService` via worker BullMQ) belum disambung ke turn Mastra.

## 0. Prinsip rencana ini

1. **Setiap keputusan dirujuk ke dokumentasi resmi Mastra** (lihat `[doc:...]` inline + §10). Tidak ada API yang dikarang.
2. **Pakai yang sudah disediakan Mastra — jangan bikin manual.** Eksplisit:
   - Auth Clerk → `@mastra/auth-clerk` (bukan verifikasi token tangan).
   - Resume/reconnect stream → `subscribeToThread({ reconnect:true })` (bukan proxy `node:http setTimeout(0)` + `maxReconnectAttempts`).
   - Persist pesan/history → Mastra Memory auto-save (bukan projection hook + `chat_thread_events` + B-strip).
   - Context window → `TokenLimiter` processor (bukan compaction tangan).
   - HITL → Agent Approval + Workflow `suspend/resume` (bukan continuationToken namespacing).
   - Multi-agent /deep → Workflow + agents-as-steps (bukan orkestrasi model-driven rapuh).
3. **Cutover paralel + flag.** Kembangkan di branch `feat/mastra-agent`; runtime eve tetap utuh sampai Fase 3. FE memilih runtime via env `NEXT_PUBLIC_AGENT_RUNTIME = eve | mastra`.
4. **Keputusan owner (terkunci, AskUserQuestion 2026-06-27):** app Mastra terpisah · `/deep` = Workflow + agents-as-steps · Mastra Memory = SoT pesan · **AgentController (Harness) sebagai shell** · skills tetap `SKILL.md`.

## 1. Versi & dependency (Fase 0 mengunci ini)

| Paket | Sekarang (eve) | Target (Mastra) | Catatan |
|---|---|---|---|
| `ai` | `7.0.0-beta.178` | `^5` (stabil) | Mastra menargetkan AI SDK v5 `[doc:guides/concepts/streaming, migrations/ai-sdk-v4-to-v5]` |
| `@ai-sdk/openai` | `4.0.0-beta.74` | `^2` (selaras `ai@5`) | provider OpenAI/gateway tetap dipakai |
| runtime | `eve` 0.11.6 | `@mastra/core` + paket di bawah | — |
| baru | — | `@mastra/pg` (PostgresStore + PgVector) `[doc:reference/storage/postgresql, reference/vectors/pg]` | storage + vector |
| baru | — | `@mastra/memory` `[doc:memory/overview]` | history + semantic recall |
| baru | — | `@mastra/auth-clerk` `[doc:server/auth/clerk]` | auth |
| baru | — | `@mastra/ai-sdk` `[doc:reference/ai-sdk/to-ai-sdk-stream]` | interop AI SDK / FE |
| baru (FE) | `eve/react` | `@mastra/client-js` (+ opsi `@ai-sdk/react`) `[doc:server/mastra-client, reference/client-js/agents]` | klien |
| dibuang | `eve`, `just-bash`, `@aqsha/chat-core`(sebagian) | — | di Fase 3 |

> **Catatan ai@5:** ini satu-satunya downgrade berisiko. Fase 0 wajib `bun run typecheck` seluruh workspace setelah pin, karena BlockNote/komponen lain di `apps/web` ikut menyentuh `ai`.
>
> **REVISI Fase 0 (terverifikasi 2026-06-27):** asumsi "downgrade ke ai@5" **SUDAH USANG → DIBATALKAN**. `@mastra/core@1.47.0` membundel `@ai-sdk/provider-v5/v6/v7` sekaligus (provider@2/3/4) → Mastra menerima model AI SDK v5, v6, **dan v7** secara native. Kita **tetap di `ai@7` + `@ai-sdk/openai@4`** (versi yang sudah ada untuk eve), TANPA mengubah `apps/web`. `MastraModelConfig` menerima `LanguageModelV4` (= `openai.chat()` v7). **Risiko R1 LENYAP** — `bun run typecheck` seluruh workspace HIJAU tanpa sentuhan apa pun ke web/api. Versi terpasang: `@mastra/core@^1.47`, `@mastra/pg@^1.14`, `@mastra/memory@^1.21`, `@mastra/auth-clerk@^1.2`, `@mastra/ai-sdk@^1.6`, CLI `mastra@^1.16`.

## 2. Arsitektur target

### 2.1 Topologi
```
apps/web (Next 16)  ──HTTP/SSE──▶  apps/agent (server Mastra, Hono)
   useChat / MastraClient            new Mastra({ agents, workflows, storage, server })
        │                                   │
        └── @mastra/client-js               ├─ Harness (shell: modes chat|deep, tool-approval, subscribe)
                                            ├─ Agent "astra-lite" (chat)
                                            ├─ Workflow "deep-research" (/deep)
                                            ├─ Memory(PostgresStore + PgVector)
                                            └─ server.auth = MastraAuthClerk + middleware (resourceId)
apps/api (Elysia)  ── REST non-agent (workspace, feed, billing webhook, explore) — TIDAK berubah
packages/services + packages/db  ── dipanggil LANGSUNG dari tool/step Mastra (Node build → bisa konsumsi TS workspace)
```
`mastra build` menghasilkan server Hono di `.mastra/output` `[doc:server/mastra-server]`; dibungkus Dockerfile per-app (Dokploy).

### 2.2 Instance Mastra (`apps/agent/src/mastra/index.ts`)
```ts
export const mastra = new Mastra({
  agents: { astraLite },
  workflows: { deepResearch },
  storage: new PostgresStore({ id: 'aqsha', connectionString: process.env.DATABASE_URL! }),
  vectors: { pg: new PgVector({ id: 'aqsha', connectionString: process.env.DATABASE_URL! }) },
  server: {
    auth: new MastraAuthClerk({ publishableKey, secretKey, jwksUri }),   // [doc:server/auth/clerk]
    middleware: [ resourceIdMiddleware, billingPrecheckMiddleware ],     // [doc:server/middleware]
  },
  observability: { /* Pino + OTel */ },                                  // [doc:observability/overview]
})
```
- **Storage & vector** satu Postgres (tabel `mastra_*` koeksistensi dengan tabel app) `[doc:reference/storage/postgresql]`.
- **Auth Clerk native**: `MastraAuthClerk` memverifikasi JWT Clerk; default mengizinkan semua user terautentikasi, override `authorizeUser` bila perlu `[doc:reference/auth/clerk]`.
- **resourceId**: middleware set `MASTRA_RESOURCE_ID_KEY = clerkUserId` (atau `mapUserToResourceId`) → dipakai Memory sebagai `resource` `[doc:server/middleware]`.

### 2.3 Agent Astra-Lite (`apps/agent/src/mastra/agents/astra-lite.ts`)
```ts
export const astraLite = new Agent({
  id: 'astra-lite',
  name: 'Astra',
  instructions: <isi instructions.md>,
  model: openai.chat(process.env.AQSHA_LITE_MODEL ?? 'gpt-4o'),   // gateway baseURL tetap didukung
  tools: { ...readTools, ...writeTools, ...researchTools },        // createTool [doc:reference/tools/createTool]
  skills: ['./src/mastra/skills/cite-apa7', /* ... */],            // SKILL.md [doc:agents/skills]
  memory,                                                          // §2.4
  inputProcessors:  [ new TokenLimiter(N), billingPrecheckProcessor ], // [doc:agents/processors]
  outputProcessors: [ /* opsional: Moderation/PII */ ],
  defaultStreamOptions: { onFinish: debitCredits },               // billing [doc:reference/streaming/agents/stream]
})
```

### 2.4 Memory (`apps/agent/src/mastra/memory.ts`)
```ts
export const memory = new Memory({
  storage: new PostgresStore({ id: 'aqsha-mem', connectionString: DATABASE_URL }),
  vector:  new PgVector({ id: 'aqsha-mem', connectionString: DATABASE_URL }),
  embedder: 'openai/text-embedding-3-small',
  options: { lastMessages: 10, semanticRecall: { topK: 3, messageRange: 2 }, workingMemory: { enabled: false } },
})  // [doc:reference/storage/postgresql, memory/semantic-recall, memory/working-memory]
```
- Pesan **otomatis tersimpan** saat `agent.stream(msg, { memory: { thread, resource } })` `[doc:memory/message-history]`.
- **PENTING (FE):** klien hanya mengirim **pesan baru**, bukan seluruh history — Mastra memuat dari storage `[doc:memory/message-history]`.

### 2.5 Shell = AgentController / Harness
- Harness = host multi-user; satu Harness mem-backing banyak Session; `modes: [{id:'chat', default}, {id:'deep'}]`, `subscribe(event)`, tool-approval bawaan, persist selamat-restart `[doc:harness/overview, agent-controller/overview]`.
- **Surface HTTP** (server routes Mastra) `[doc:reference/server/routes]`:
  - `POST /api/agents/:id/send-message` (kirim ke turn aktif / bangunkan thread idle)
  - `POST /api/agents/:id/threads/subscribe` (SSE stream)
  - `POST /api/agents/:id/send-tool-approval` (approve/decline + resume via subscription)
  - `POST /api/agents/:id/resume-stream`, `/queue-message`, `/signals`
- **Klien** `@mastra/client-js`: `subscribeToThread({ reconnect:true })`, `sendMessage`, `sendToolApproval`, `approveToolCall` `[doc:reference/client-js/agents]`.

> **OPEN-Q-1 (spike Fase 0) — RESOLVED:** route agent STANDAR Mastra cukup; **TIDAK** membungkus Harness. Bukti kode: `mastra dev` mengekspos `/api/agents/:id/stream*` + memory thread/resource + tool-approval, dan `server.auth` menjaga SEMUA route. `chat` = `agent.stream`; `deep` = Workflow (Fase 2). Harness/AgentController tetap tersedia bila kelak butuh orkestrasi multi-mode dalam satu sesi, tapi tak diperlukan untuk paritas. Lihat catatan di `src/mastra/index.ts`.
>
> **resourceId — RESOLVED (lebih sederhana dari plan):** middleware resourceId manual TAK diperlukan. `MastraAuthProvider.mapUserToResourceId(user)` (opsi `MastraAuthClerk`) men-set `MASTRA_RESOURCE_ID_KEY` di RequestContext otomatis, dan ia **MENIMPA** `resource` dari klien demi keamanan. Kita set `mapUserToResourceId: (u) => u.sub` (Clerk userId = `owner_user_id` app). Tool baca owner via `callerId(ctx)` = `requestContext.get(MASTRA_RESOURCE_ID_KEY)`.

### 2.6 HITL — pakai mekanisme resmi
| Kasus HITL Astra | Mekanisme Mastra | Rujukan |
|---|---|---|
| Mutasi artifact/workspace (create/rename/delete) | tool `requireApproval:true` → chunk `tool-call-approval` → `approveToolCall()/declineToolCall()` (atau `sendToolApproval` via subscription) | `[doc:agents/agent-approval]` |
| Rencana `/deep` (plan-gate) | Workflow step `suspend()` → `run.resume({ step, resumeData })` | `[doc:workflows/human-in-the-loop]` |
| Konfirmasi percakapan (tanya-jawab biasa) | tool `suspend()` + `autoResumeSuspendedTools:true` (lanjut dari pesan user berikutnya) | `[doc:agents/agent-approval, reference/streaming/agents/stream]` |

## 3. Pemetaan eve → Mastra (ringkas)

| eve | Mastra | File target |
|---|---|---|
| `defineAgent` | `new Agent` | `agents/astra-lite.ts` |
| `defineTool` ×~20 | `createTool` | `tools/*.ts` |
| `eveChannel`(auth/onMessage/quota) | `server.auth` + middleware + inputProcessor | `mastra/index.ts`, `mastra/middleware/*` |
| subagents (3) | Agent + `createStep(agent)` | `agents/{lit-searcher,counter-evidence,citation-verifier}.ts` |
| skills (`SKILL.md` + `load_skill`+sandbox) | `skills:[...]` (auto `skill`/`skill_read`/`skill_search`, no sandbox) | `skills/*/SKILL.md` |
| `defineSandbox(justbash)` | **dihapus** | — |
| hook `projection.ts` | Memory auto-save + `onFinish` billing | — |
| `.workflow-data` + `chat_thread_events` + B-strip | `mastra_*` snapshot/messages | migrasi DB |
| `useEveAgent` + `eve-timeline` + `use-thread-resume` + proxy-tee | `MastraClient`/`useChat` | `apps/web/features/threads/*` |

## 4. Data & storage

- **Mastra membuat tabelnya sendiri** (`mastra_threads`, `mastra_messages`, `mastra_workflow_snapshot`, dll.) di Postgres yang sama via `PostgresStore` `[doc:reference/storage/postgresql]`. Koeksistensi aman (nama tabel ter-prefix). Auto-migrate saat init; verifikasi di Fase 0.
- **`chat_threads` app DISUSUTKAN** → hanya metadata yang dibutuhkan api/web (owner, status, title, last_preview, agent_kind) untuk list/billing. **`chat_messages` & `chat_thread_events` DI-DEPRECATE** (Mastra jadi SoT isi pesan).
- **Migrasi DB (Drizzle, `bun run db:generate`):**
  - `00XX_mastra_runtime`: izinkan Mastra membuat tabel `mastra_*` (atau jalankan store-migrate Mastra sekali; dokumentasikan).
  - `00XX_slim_chat`: pertahankan `chat_threads`; tandai `chat_messages`/`chat_thread_events` deprecated (drop di Fase 3 setelah cutover). **Tidak migrasi data** (sejalan keputusan cutover paralel).
- **`research_sources`** (panel Sources) tetap milik app via `@aqsha/services` (ditulis dari tool, sama seperti sekarang).

## 5. FASE 0 — Spike (gate: stream+persist+auth+resume E2E)

**Tujuan:** buktikan fondasi sebelum porting massal. Branch `feat/mastra-agent`.

Tugas:
1. Scaffold `apps/agent` Mastra (`create-mastra` atau manual): `mastra/index.ts`, 1 agent `astra-lite` (instructions minimal), `PostgresStore`+`PgVector`, `package.json` (`mastra dev/build/start`). `[doc:getting-started]`
2. Pin `ai@^5` + `@ai-sdk/openai@^2`; `bun run typecheck` SEMUA workspace hijau.
3. `server.auth = MastraAuthClerk` + middleware `resourceId` (Clerk userId). Uji `curl` ber-bearer Clerk. `[doc:server/auth/clerk]`
4. FE: route/komponen kecil pakai `MastraClient` (`baseUrl` = proxy same-origin, `Authorization: Bearer <clerk>`), `sendMessage` + `subscribeToThread({reconnect:true})`. `[doc:reference/client-js/agents]`
5. Validasi **resume saat refresh**: mulai turn, refresh → stream lanjut via `subscribeToThread` reconnect (tanpa kode resume tangan).
6. **Resolusi OPEN-Q-1**: tentukan apakah Harness dibungkus `registerApiRoute` atau server routes standar cukup. Catat di doc ini.
7. 1 tool `createTool` memanggil `@aqsha/services` (buktikan Node build bisa konsumsi paket workspace — masalah `externalDependencies` eve hilang).

Exit gate: kirim pesan → stream token → pesan tersimpan (`mastra_messages`) → refresh lanjut → auth tertegak. Plus 1 tool jalan.

### 5.1 HASIL Fase 0 (2026-06-27) — GATE HIJAU ✅

Branch `feat/mastra-agent`. Struktur baru `apps/agent/src/mastra/` KOEKSISTENSI dengan `apps/agent/agent/` (eve) — kedua tetap utuh.

| Item | Status | Bukti |
|---|---|---|
| Scaffold (`index.ts`, agent `astra-lite`, `storage.ts`, `memory.ts`, `model.ts`, `auth.ts`, 1 tool) | ✅ | files di `src/mastra/` |
| Pin versi + `bun run typecheck` SEMUA workspace | ✅ HIJAU | tanpa downgrade `ai`; web/api tak tersentuh (R1 lenyap) |
| `PostgresStore.init()` → tabel `mastra_*` | ✅ | 35 tabel `mastra_*` auto-migrate di Postgres VPS, koeksistensi dgn `chat_*`/`artifacts` (R3) |
| Stream token dari gateway model | ✅ | smoke: "Halo! Saya Astra…", usage 522/71 (deepseek via `OPENAI_BASE_URL`) |
| Persist pesan (Memory auto-save) | ✅ | `mastra_threads`+`mastra_messages`: thread→(user,assistant), `resourceId` benar |
| Auth tertegak (`MastraAuthClerk`) di SEMUA route agent | ✅ | `POST /api/agents/astra-lite/stream` tanpa/za-bogus-token → **401**; `GET /api/agents` → 401 (tutup celah eve stream-GET) |
| Node build konsumsi `@aqsha/services`/`@aqsha/db` in-process | ✅ | tool `list_workspaces` import + bundle `mastra dev` sukses (masalah `externalDependencies` eve hilang) |
| Bundler `mastra dev` menangani workspace TS + import tanpa-ekstensi | ✅ | "Initial bundle complete", ready 1.2s |

**Catatan implementasi (deviasi sah dari plan):**
- **Embedder/semantic recall DITUNDA ke Fase 1.** `@mastra/memory@1.21.2` belum menerima `EmbeddingModelV4` (era v7 dari `@ai-sdk/openai@4`) — hanya V2/V3/string. Memory Fase 0 = `lastMessages` (history persist, cukup untuk gate). Fase 1: pakai `@mastra/fastembed` (embedder lokal, tanpa API key, lepas isu versi) ATAU model embedding v6 kompatibel. Index recall ini TERPISAH dari RAG dokumen app.
- **Env baru:** `CLERK_PUBLISHABLE_KEY` WAJIB (MastraAuthClerk verifikasi via JWKS; jwksUri diturunkan dari publishableKey). Owner sync ke `.env` VPS. Lihat `.env.example`.
- **Belum diuji di sesi ini (owner E2E, butuh sesi browser Clerk hidup):** stream ber-auth penuh lewat HTTP + resume saat refresh via `@mastra/client-js` `subscribeToThread({reconnect:true})` (mekanisme persist + reconnect sudah terbukti di lapisan storage; tinggal wiring FE Fase 1).
- **OPEN-Q (#2 billing, #3 migrasi tabel):** tabel `mastra_*` dibuat via auto-init `PostgresStore` (terbukti). Billing per-turn vs per-step diputus di Fase 1.

## 6. FASE 1 — Chat parity (Astra Lite)

**Backend**
- **Tools** (`apps/agent/src/mastra/tools/`): port 1:1 `defineTool`→`createTool` (Zod sama) `[doc:reference/tools/createTool]`:
  - READ: `get_artifact`, `list_artifacts`, `list_workspaces`, `search_thread_documents`, `get_render_payload`.
  - WRITE (**`requireApproval:true`**): `propose_artifact`, `create_workspace`, `rename_workspace`, `delete_artifact`, `link_to_workspace`, `save_url` `[doc:agents/agent-approval]`.
  - RESEARCH (debit `external_search`): `search_papers`, `search_arxiv`, `lookup_doi`, `search_web`, `web_search`.
  - Helper `callerId/threadScopeId/chargeToolUsage/persistResearch` → ambil dari `runtimeContext`/`requestContext` (resourceId) + `@aqsha/services`.
- **Skills**: pindah 11 `SKILL.md` ke `src/mastra/skills/`, daftarkan `skills:[...]`; domain-pack via **dynamic resolver** `[doc:agents/skills]`. **Tanpa sandbox.**
- **Memory**: aktif (`thread`/`resource`); hapus path projection.
- **Processors**: `TokenLimiter` (context window) `[doc:reference/processors/token-limiter-processor]`; `billingPrecheckProcessor` (inputProcessor) panggil `SendQuotaService` → `abort()` (tripwire) bila kuota habis `[doc:agents/processors]`.
- **Billing**: `defaultStreamOptions.onFinish` → `BillingService.consumeCredits({ feature:'normal_chat', tokens, idempotencyKey: thread:turn })` `[doc:reference/streaming/agents/stream]`. (Per-turn, bukan per-step — lebih sederhana; per-step `onStepFinish` tersedia bila perlu.) Tool-debit tetap di `execute`.
- **Auth/ownership**: middleware tegakkan ownership thread di SEMUA route termasuk `threads/subscribe` (tutup celah eve stream-GET).
- **Harness modes**: konfigurasi mode `chat`.

**Frontend (`apps/web`)**
- `features/threads/lib/use-astra-agent.ts` → **ganti** dengan hook tipis di atas `MastraClient` (`sendMessage` + `subscribeToThread`).
- Adapter timeline: petakan **chunk Mastra** (`text`/`reasoning`/`tool-call`/`tool-result`/`source`/`finish`) `[doc:streaming/ChunkType]` → komponen existing (`message-list`, `tool-row`, `sources-panel`, kartu artifact). Ganti `eve-timeline.ts`.
- HITL artifact/workspace: `input-request-prompt`/kartu → `sendToolApproval()` saat user setuju.
- Hapus pemakaian `use-thread-resume`, `use-smooth-text` (pakai smoothing AI SDK / bawaan).
- Flag `NEXT_PUBLIC_AGENT_RUNTIME` memilih eve vs mastra.

Gate Fase 1: paritas chat Lite vs eve (kirim, stream, tool, HITL artifact, history reload, billing turun, kuota mem-block).

### 6.1 HASIL Fase 1 — BACKEND ✅ terverifikasi · FE CORE ✅ typecheck+lint

| Item backend | Status | Bukti |
|---|---|---|
| 17 tool `createTool` (5 read / 6 write / 6 research+verify) | ✅ | `src/mastra/tools/*` (17 entri di `astraTools`); smoke: model panggil `list_workspaces` → data NYATA ("Research" workspace) |
| owner/email/thread via RequestContext | ✅ | `callerId`=`MASTRA_RESOURCE_ID_KEY`; `callerEmail`=`userContextMiddleware` (verifikasi Clerk → `AQSHA_EMAIL_KEY`); `threadScopeId`=`ctx.agent.threadId` |
| 11 skills `SKILL.md` (+`name` frontmatter) | ✅ | `resolveAgentSkills` → 11/11; auto-tool `skill`/`skill_read`/`skill_search`, NO sandbox |
| Memory + semantic recall | ✅ | `@mastra/fastembed` (BGE 384-dim lokal, no key) → index `memory_messages_384_vector_idx` |
| Processors: TokenLimiter + billing precheck | ✅ | `TokenLimiterProcessor(ctxWindow*0.75)` + `billingPrecheckProcessor` (`SendQuotaService.check`→`abort()` tripwire) |
| Billing debit PER-TURN (`processOutputResult`) | ✅ | `provider_usage_ledger`: row `normal_chat`/`openai` total_tokens cocok; ganti hook `step.completed` |
| HITL: hanya `delete_artifact` `requireApproval:true`; write lain konfirmasi percakapan | ✅ | parity eve (`needsApproval` cuma delete); selaras memory owner "HITL percakapan murni" |
| typecheck SEMUA workspace | ✅ HIJAU | — |

**Deviasi sah:** (1) web_search built-in eve = `disableTool` → TAK diport (search_web Firecrawl cukup); filesystem builtins/sandbox eve TAK diport (Mastra tanpa sandbox). (2) Billing idempotencyKey TAK dipakai (resume Mastra = replay buffer, bukan re-generate → tak ada double-debit, beda dari durable-step eve). (3) `ask_question`/`load_skill` eve → konvensi Mastra (tanya teks; skill auto-tools). instructions diadaptasi.

**FE Fase 1 — CORE SELESAI ✅ (typecheck+lint hijau; E2E visual = owner):**

| FE item | Status | File |
|---|---|---|
| Proxy `/mastra-api/*` → server Mastra (node:http, no idle-timeout) | ✅ | `app/mastra-api/[...path]/route.ts` + `proxy.ts` exclude + Clerk bearer passthrough |
| Klien `@mastra/client-js` (same-origin, bearer Clerk segar via custom fetch, signal stop) | ✅ | `features/threads/lib/mastra-client.ts` |
| Adapter chunk→`TimelineMessage` (text/reasoning/tool/artifact) + HITL approval | ✅ | `features/threads/lib/mastra-timeline.ts` (reuse type eve, helper self-contained) |
| Adapter history (`MastraDBMessage[]`→timeline) | ✅ | `mastraMessagesToTimeline` |
| Hook `useMastraAgent` (send/stop/approve/decline, status, invalidate) | ✅ | `features/threads/lib/use-mastra-agent.ts` |
| Surface Mastra (load history via `getMemoryThread().listMessages()`, MessageList reuse) | ✅ | `features/thread-experience/components/mastra-chat-thread-surface.tsx` |
| Flag `NEXT_PUBLIC_AGENT_RUNTIME` + factory pemilih | ✅ | `lib/agent-runtime.ts` + `chat-thread-surface.tsx` (parent panel/shell pakai factory) |

**FE follow-up (owner-gated):** (1) E2E visual butuh sesi Clerk browser (set `NEXT_PUBLIC_AGENT_RUNTIME=mastra`, jalankan `mastra dev` + web). (2) Composer Mastra masih MINIMAL (textarea) — port composer kaya (tokenized /slash @context) menyusul. (3) **Sumber daftar thread + judul**: eve mengandalkan projection ke `chat_threads`; Mastra tak punya projection → daftar thread/judul baru perlu keputusan (baca `mastra_threads` vs tulis tipis `chat_threads`), lintas api+web. (4) panel Sources tetap via API `research_sources` (tool mem-persist) — tak berubah.

## 7. FASE 2 — `/deep` sebagai Workflow

**Workflow `deep-research` (`apps/agent/src/mastra/workflows/deep-research.ts`)** `[doc:workflows/overview, workflows/suspend-and-resume, workflows/human-in-the-loop]`:
```ts
const planStep = createStep({
  id: 'plan', inputSchema, outputSchema: PlanSchema,
  resumeSchema: z.object({ approved: z.boolean(), edits: z.string().optional() }),
  suspendSchema: z.object({ plan: PlanSchema }),
  execute: async ({ inputData, resumeData, suspend }) => {
    if (!resumeData) { const plan = await draftPlan(inputData); return await suspend({ plan }) } // HITL
    if (!resumeData.approved) throw new Error('cancelled')
    await beginDeepResearchBilling(...)   // requireEntitlement + consumeCredits (idempotencyKey: runId)
    return finalizePlan(resumeData)
  },
})
// subagents sebagai step (Step menerima agent) [doc:reference/workflows/step]
const searchStep = createStep(literatureSearcher)
const workflow = createWorkflow({ id:'deep-research', inputSchema, outputSchema })
  .then(planStep)
  .foreach(subQuestionsMap, searchStep)        // paralel per sub-pertanyaan [doc:reference/workflows/run-methods/resume#foreach]
  .then(counterEvidenceStep)
  .then(citationVerifyStep)
  .then(synthesizeStep)                          // writer = root agent
  .commit()
```
- **Subagents** (`literature-searcher`, `counter-evidence`, `citation-verifier`) = `new Agent` + `createStep(agent)`; tool per-subagent (search/doi/verify) di-port ke `createTool`.
- **HITL plan-gate**: `suspend()`/`run.resume({ step:'plan', resumeData })`; snapshot persist selamat-restart `[doc:workflows/suspend-and-resume]`. Kartu rencana di FE memanggil `resume`. `forEachIndex` untuk resume per-iterasi bila perlu.
- **Streaming progress**: `run.stream()` / `run.resumeStream()` → event per step (anti dead-air) `[doc:reference/workflows/run, streaming Workflows .observeStream/.resumeStream]`.
- **Billing**: di `planStep` (commit point), idempoten via `runId`.
- **Scorers (opsional, nilai kualitas riset)**: Faithfulness/Hallucination/ContextPrecision di output verifikasi sitasi `[doc:evals/built-in-scorers]`.
- **Harness mode `deep`** memicu workflow ini.

**Frontend**: `research-plan-review-card` → `run.resume`; `run-progress`/`subagent-detail-panel` baca event step workflow; `elapsed-label` tetap.

Gate Fase 2: `/deep` deterministik, observable per step, plan-gate suspend/resume jalan lintas-refresh, tak ada beku.

### 7.1 HASIL Fase 2 (2026-06-27) — backend SELESAI & terverifikasi ✅

Branch `feat/mastra-agent` (koeksist eve). API Workflow diverifikasi dari `@mastra/core@1.47.0` (node_modules, otoritatif).

| Item | Status | Bukti / catatan |
|---|---|---|
| Workflow `deep-research` registered di `Mastra({ workflows })` | ✅ | `src/mastra/workflows/deep-research.ts` + `index.ts`; route standar `/api/workflows/deep-research/*` dijaga `server.auth` |
| 6 step linear `.then` (draftPlan → approvePlan → search → counter → verify → synthesize) | ✅ | observable per fase; resume-safe; konteks mengalir lewat output tiap step |
| 3 subagent + `deep-writer` (planner/penulis "root") | ✅ | `agents/{literature-searcher,counter-evidence,citation-verifier,deep-writer}.ts`; **REUSE** tool root (search/doi/verify); TANPA memory/billing-processor |
| HITL plan-gate `suspend()`/`run.resume({step,resumeData})` | ✅ | smoke: `start`→**suspended** di `approve-plan`; `resume({approved:false})`→**cancelled**; `resume({approved:true})`→**completed** |
| Gerbang billing di `approvePlan` (commit point) | ✅ | port `begin_deep_research.ts`: `requireEntitlement` + `consumeCredits(feature:'deep_research', idempotencyKey:`​`${runId}:deep`​`)` + precheck `SendQuotaService` di `draftPlan` |
| Snapshot persist (`mastra_workflow_snapshot`) | ✅ | smoke DB VPS: row status `suspended` lalu `success` |
| Ledger debit (`provider_usage_ledger`) | ✅ | smoke DB VPS: row `feature=deep_research, provider=openai, idempotency_key=runId:deep` |
| `research_sources` ter-scope thread chat dari subagent | ✅ | threadId dialirkan via `RequestContext` (`MASTRA_THREAD_ID_KEY`); `threadScopeId` fallback ke RequestContext (chat tetap pakai `ctx.agent.threadId`) |
| Skill `deep-research/SKILL.md` selaras Workflow | ✅ | hapus referensi `ask_question`/`begin_deep_research`; jadi panduan mutu rencana + sintesis |
| typecheck SEMUA workspace + lint 0-error | ✅ | — |

**Deviasi sah (dicatat):**
- **Fan-out di dalam `searchStep`** (`Promise.all` per sub-pertanyaan) alih-alih builder `.foreach`/`.map` — rantai linear menjaga konteks (question/plan) utuh tanpa `getStepResult`, hindari hazard generik foreach, tetap observable per fase.
- **Plan parsing manual** (`parsePlan`, ekstrak blok ```json) ganti `structuredOutput` native — model gateway (deepseek/OpenRouter) tak mengisi `object` lewat response_format; manual andal (smoke: 6 sub-pertanyaan bersih).
- **Sintesis `toolChoice:"none"`** — paksa penulis menghasilkan TEKS (bukan berhenti di tool-call kosong); jaminan `report` terisi (smoke: laporan tercitasi `finishReason:stop`).
- **Billing deep di-bill SEKALI** di plan-gate (bukan per-turn); tool `search_*` tetap debit `external_search` per pemanggilan (parity eve).

## 8. FASE 3 — Cutover & cleanup

1. Flip `NEXT_PUBLIC_AGENT_RUNTIME=mastra` (atau hapus flag), arahkan deploy ke server Mastra.
2. **Hapus**: app eve (`apps/agent/agent/*` lama), `.workflow-data/`, `apps/web/app/eve/v1/[...path]/route.ts`, exclude `eve/v1` di `proxy.ts`, `use-astra-agent.ts`/`eve-timeline.ts`(+test)/`use-thread-resume.ts`/`use-smooth-text.tsx`, endpoint `/threads/:id/session-token`, kolom/tabel `chat_messages`+`chat_thread_events` (migrasi drop), B-strip.
3. **Drop deps**: `eve`, `just-bash`; rapikan `@aqsha/chat-core` (sisakan command/mention murni bila masih dipakai FE).
4. **Update dokumen**: `AGENTS.md`, `docs/architecture/01-tech-stack.md` & `03-architecture.md`, `CLAUDE.md` (companion docs: ganti referensi skill `eve`), `.mcp.json` (docs-server Mastra sudah ada).
5. Gate: `bun run typecheck` + `bun run test` + `bun run lint` hijau; E2E chat + `/deep`; eve hilang total.

### 8.1 HASIL Fase 3 (2026-06-27) — CUTOVER SELESAI (kode) ✅ · eve HILANG TOTAL

**SELESAI & ter-gate (typecheck SEMUA workspace + lint 0-error HIJAU; test db/chat-core/services 0-fail + api threads fixed):**
- **Composer KAYA di Mastra.** `MastraChatThreadSurface` ditulis ulang memakai `<Composer>` (tokenized /slash @context) + landing hero (`ComposerHeroState` + `HomeExploreBento`) + transkrip (`Conversation`/`MessageList`) — sama V1, wired ke `useMastraAgent`. `useMastraAgent.send(text, clientContext?)` mengalirkan konteks ephemeral via `context` (tak dipersist). URL bump (`history.replaceState`) saat kirim pertama (thread id klien-side). Factory `chat-thread-surface.tsx` → render Mastra langsung (flag dibuang).
- **Modul FE bersama diekstrak.** Tipe `TimelineMessage`/`TimelinePart`/`ToolRowModel`/dll. → `lib/timeline-types.ts` (netral); `use-smooth-text.tsx` (no-eve) tetap util. `mastra-timeline`/`message-list`/`tool-row`/`chat-artifact-card` impor dari modul netral.
- **eve dihapus TOTAL.** Dihapus: `apps/agent/agent/**` + `.workflow-data`/`.eve`, `apps/web/app/eve/v1/*`, `eve-chat-thread-surface.tsx`/`chat-surface.tsx`/`new-chat.tsx`(dead)/`use-astra-agent.ts`/`use-thread-resume.ts`/`eve-timeline.ts`(+test)/`input-request-prompt.tsx`/`agent-runtime.ts`, deps `eve`+`just-bash` (agent+web package.json + bun.lock), `eve/v1` di `proxy.ts`. **`grep eve/react` = 0 di source.** Dockerfile + compose + .gitignore + .env.example → Mastra (CMD `node .mastra/output/index.mjs`, `MASTRA_AGENT_ORIGIN`, CLERK_PUBLISHABLE_KEY). Scripts agent → `mastra dev/build/start`.
- **GAP daftar-thread (a) + title async (c) RESOLVED.** `ThreadService.ensureProjected` (upsert tipis `chat_threads`) + `threadProjectionProcessor` astraLite + `TitleService.requestTitle(threadId, titleSeed)` (seed pesan user dibawa di payload job — Mastra Memory = SoT pesan). Smoke DB VPS: turn → row `chat_threads` (preview + `title_status=generating`).
- **Tabel `chat_messages` + `chat_thread_events` DI-DROP** (mig `0016`, **applied dev :5432**). Dihapus: `MessageService`/`EventService` + repo + schema, `reconcileStaleStreaming` + worker `reconcile-stale`, endpoint api `/:id/messages`+`/:id/events`, hook web `useThreadMessages`/`useThreadEvents`. `ThreadService.remove` tak lagi hapus chat_messages; `TitleService.generate` baca seed (bukan chat_messages). Tests diperbaiki (FK-floor 21→20).
- **Sisa eve di `chat_threads` DIBERSIHKAN TUNTAS** (mig `0017`, applied dev): drop kolom `continuation_token`/`pending_user_message`/`pending_user_message_created_at`; hapus endpoint dead `recent-active`/`pending`×2/`session-token` + method `ThreadService.{recentActive,markPending,clearPending,upsertContinuationToken}` + `ChatThreadRepo.{findRecentActiveByOwner,upsertContinuationToken,findStaleStreaming}` + web type `ChatMessage`/`ChatThreadEvent`. **`grep eve/react` = 0; 0 dep eve/just-bash; `apps/agent/agent` GONE.** `chat_threads` = 10 kolom bersih.

**Sisa owner-gated (BUKAN kode — aksi owner):**
1. **E2E visual** chat + `/deep` (`mastra dev` :4111 + web + sesi Clerk) — verifikasi render/stream/HITL.
2. **Migrate prod** (`db:migrate` 0016+0017 di Postgres prod :5435) + `bun run build` web/agent (`mastra build` butuh `CLERK_PUBLISHABLE_KEY`) + redeploy agent/api/web (Dokploy).

## 9. Risiko & open questions

| # | Risiko | Mitigasi |
|---|---|---|
| R1 | Downgrade `ai@5` memecah `apps/web` (BlockNote dll.) | kunci + typecheck penuh di Fase 0; isolasi versi bila perlu |
| R2 | Harness API termuda; wiring HTTP belum pasti (OPEN-Q-1) | **spike Fase 0 membuktikan**, bukan asumsi; fallback `registerApiRoute` bungkus Harness |
| R3 | Koeksistensi tabel `mastra_*` ↔ tabel app di satu Postgres | verifikasi prefix/skema di Fase 0; backup sebelum init |
| R4 | `CostGuardProcessor` ≠ sistem kredit Mayar (ia cost-$ via observability) | billing tetap `@aqsha/services` via `onFinish`/inputProcessor; CostGuard opsional |
| R5 | Kualitas metodologi `/deep` tanpa skill-driven gating | metodologi jadi langkah Workflow eksplisit (lebih deterministik) + skills tetap tersedia |
| R6 | Gateway model kustom (`AQSHA_LITE_*`) | pakai AI SDK model instance (`createOpenAI({baseURL}).chat(id)`); verifikasi token-counting Mastra/`TokenLimiter` |

OPEN-Q (diselesaikan Fase 0): (1) Harness via server routes vs custom route; (2) per-turn vs per-step billing; (3) cara resmi menjalankan migrasi tabel `mastra_*` di prod (store-migrate vs auto).

## 10. Indeks rujukan dokumentasi (Mastra)

- Agents: `/docs/agents/overview`, `/agents/skills`, `/agents/processors`, `/agents/agent-approval`, `/agents/supervisor-agents`
- AgentController/Harness: `/docs/harness/overview`, `/docs/agent-controller/{overview,session,modes,subagents,tool-approvals}`
- Workflows: `/docs/workflows/{overview,suspend-and-resume,human-in-the-loop}`, `/reference/workflows/{run,step,run-methods/resume}`
- Memory & Storage: `/docs/memory/{overview,message-history,semantic-recall,working-memory}`, `/reference/storage/postgresql`, `/reference/vectors/pg`
- Server & Auth: `/docs/server/{mastra-server,middleware,custom-api-routes,mastra-client}`, `/docs/server/auth/clerk`, `/reference/server/routes`, `/reference/auth/clerk`
- Streaming & AI SDK: `/docs/streaming/*`, `/reference/streaming/agents/stream`, `/reference/ai-sdk/to-ai-sdk-stream`, `/guides/build-your-ui/ai-sdk-ui`
- Processors: `/reference/processors/{token-limiter-processor,cost-guard-processor}`
- Tools/MCP, Evals, Deployment, Observability: `/reference/tools/createTool`, `/docs/evals/*`, `/docs/deployment/*`, `/docs/observability/*`

> Verifikasi API spesifik saat implementasi via MCP `@mastra/mcp-docs-server` (`.mcp.json`) atau context7 `/mastra-ai/mastra`.
