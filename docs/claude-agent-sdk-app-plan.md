# Plan: `apps/agents` — AI Agent Standalone dengan Claude Agent SDK (TypeScript)

> Status: **v4 — sisi agent TERBANGUN (2026-06-12): `apps/agents` + `packages/agent-contracts` selesai dan teruji (100 unit test hijau). Sisi Convex (tabel first-party + endpoint service) dan integrasi `apps/web` BELUM. Lihat §9 untuk progres detail + roadmap penyelesaian sampai bisa dites via UI.**
> Tujuan: memisahkan AI agent (Astra) dari `packages/convex` ke app baru `apps/agents` yang dibangun di atas `@anthropic-ai/claude-agent-sdk`, mengikuti best practice resmi (subagents, custom tools, agent skills, slash commands, MCP, hooks, sessions).

## Log keputusan (2026-06-12)

| # | Keputusan | Hasil |
|---|---|---|
| D1 | Model | ✅ **Komit ke model Claude** (benchmark Phase 0 untuk pemilihan tier, bukan untuk go/no-go provider) |
| D2 | Storage percakapan | ✅ **Lepas total dari `@convex-dev/agent` component** — ganti dengan tabel Convex first-party milik sendiri (lihat §4.5) |
| D3 | Skills | ✅ Migrasi native via SKILL.md + progressive disclosure SDK |
| D4 | Commands & HITL | ✅ **Adopsi slash commands SDK** untuk global commands di composer (§5.4); **HITL di-redesign** agar native terhadap primitive SDK, bukan paritas 1:1 dengan FSM lama (§5.3) |
| D5 | Auth Anthropic | ✅ **API key langsung** (`ANTHROPIC_API_KEY`, billing API biasa — bukan credit pool Agent SDK) |
| D6 | Pemilihan model | ✅ Diserahkan ke engineering. Default: **Lite = `claude-haiku-4-5`, Pro = `claude-sonnet-4-6`**; deep research planner/writer Pro boleh naik kelas (opus) bila benchmark Phase 0 membenarkan. Semua via env, mudah diganti |
| D7 | Migrasi data | ✅ **Tidak ada** — tabel first-party mulai kosong (fresh start); data thread lama di tabel component tidak dibawa |
| D8 | Framework HTTP | ✅ **Hono** |

Konsekuensi penting D2: klaim "frontend tidak berubah sama sekali" pada draft v1 **tidak lagi berlaku** — frontend perlu pindah dari hooks `@convex-dev/agent` (`listUIMessages`/`syncStreams`) ke query Convex first-party. Perubahan terlokalisasi di data-hooks layer `features/thread-experience`, bukan redesign UI.

---

## 1. Ringkasan keputusan arsitektur

| Keputusan | Pilihan | Alasan |
|---|---|---|
| Bentuk service | Long-running Node.js service di `apps/agents` (**Hono**, Docker, sejajar `compose.web.yaml`) | Claude Agent SDK men-spawn proses Claude Code sebagai child process — tidak bisa berjalan di dalam Convex action/runtime |
| Peran Convex | Database + reactive layer dengan **tabel first-party** (threads, messages, runs, interactions) — **tanpa** `@convex-dev/agent` component. Tetap memegang: auth, artifacts, RAG, billing, rate limit | Decoupling penuh dari component runtime yang ditinggalkan; skema milik sendiri = bebas dibentuk untuk kebutuhan SDK (sessionId per thread, pending interactions, run events) |
| Memori percakapan model | **SDK session per thread** (resume per turn); Convex messages = source of truth UI + fallback rekonstruksi konteks | Session SDK murah & ter-cache; histori tidak perlu di-replay tiap turn. Bila session hilang → rebuild dari Convex |
| Jembatan streaming | Agent service menulis delta/events ke Convex via internal mutations (batched); web subscribe via query first-party | Mempertahankan tiga surface chat dengan perubahan terbatas di hooks layer |
| Model | Claude via `ANTHROPIC_API_KEY`: Lite = `claude-haiku-4-5`, Pro = `claude-sonnet-4-6` (env-configurable; validasi di Phase 0) | Keputusan D1 + D5 + D6 |
| Tools | In-process MCP server (`createSdkMcpServer` + `tool()` + zod) memanggil Convex via `ConvexHttpClient` dan provider eksternal langsung | Best practice SDK untuk domain logic |
| Skills & commands | `apps/agents/.claude/skills/<name>/SKILL.md` — satu format untuk **dua jalur pemicu**: otonom (progressive disclosure) dan eksplisit (`/name` dari composer) | Format `.claude/commands/` berstatus legacy; SKILL.md modern mendukung keduanya sekaligus |
| Subagents | Deep research (planner, literature, counter-evidence, citation, writer) programmatic via `agents` option | Delegasi native + parallelism, context terisolasi |
| HITL | Redesign native: `canUseTool` + hook `PreToolUse` + tabel `pendingInteractions` + interrupt/resume session | Keputusan D4; lihat §5.3 |

---

## 2. Inventaris kondisi saat ini (hasil deep dive)

Agent "Astra" hidup di `packages/convex/convex/agent/` di atas `@convex-dev/agent` + Vercel AI SDK (`ai@6`), model OpenAI-compatible.

### 2.1 Runtime & lifecycle
- Dua tier agent: `astraLite` (5 step) / `astraPro` (10 step) — `agent/runtime.ts`, `agent/models.ts`.
- Run lifecycle: `queued → running → (waiting | waiting_hitl) → completed | failed | canceled` (`agent/runLifecycle.ts`); satu run aktif per thread.
- Entry point utama: `agent/messages.ts` (validasi → resolve konteks → rate limit/billing gate → `generateText` → stream via `saveMessages` + `syncStreams`).
- Deep research (`/deep`) via `@convex-dev/workflow` (`agent/workflow.ts`), max parallelism 6.
- Routing command composer saat ini: `resolvePromptPayload()` dengan `commandId` (inline vs `/deep`).

### 2.2 Tools (kontrak yang harus direplikasi)
| Kategori | Tools | Lokasi |
|---|---|---|
| Research | `searchThreadDocuments` (RAG), `searchWeb` (Exa→Jina fallback), `searchArxiv`, `lookupDoi` (Crossref) — citation counter bersama per turn | `agent/research/researchTools.ts` |
| Citation integrity | `verifyCitations` (ekstrak bibliografi → verifikasi DOI/arXiv/OpenAlex) | `agent/research/citationTools.ts` |
| Statistical verification | `verifyStatistics` (statcheck/GRIM/power), `runComputation` (meta-analysis, approval-gated) — Daytona sandbox | `agent/sandbox/sandboxTools.ts` |
| HITL | `askUser` (no-execute), `proposeArtifact`/`executeArtifact` (double-gated), `deleteArtifact`, `createWorkspace`, `renameWorkspace`, `startDeepResearch` | `agent/hitl/hitlTools.ts` |
| Skills | `activate_skill`, `read_skill_resource` | `agent/skills/skillTools.ts` |

### 2.3 Skills (10 builtin, sudah format SKILL.md + triggerKeywords)
`research-general`, `research-medicine`, `research-cs-ml`, `research-education`, `verify-citations`, `verify-statistics`, `meta-analysis-synthesis`, `cite-apa7`, `write-academic-id`, `replication-readiness`. Catalog tier-1 (nama+deskripsi) + re-injeksi body skill aktif per turn; aktivasi dicatat di tabel `skillActivations`; user skills override builtin.

### 2.4 Subagents deep research (Phase 3)
Planner → literature rounds (max 4 Pro / 2 Lite, rehydrasi state dari DB per round) → counter-evidence pass → citation verification → writer (dengan pemilihan domain pack via `skillDelegation.ts`) → statistical verification opsional. State dipersist di `researchSourceState`, `researchExtractChunks`, `researchRoundStates`.

### 2.5 Konteks per turn
System prompt + skill catalog + body skill aktif + workspace manifest (pinned) + RAG block (artifacts terpilih + dokumen thread, embedding `text-embedding-3-small`) + riwayat thread. Budget: ~4K token/artifact, ~16K total (`context/contextBudget.ts`). Re-injeksi RAG saat resume HITL (`context/resumeContext.ts`).

### 2.6 Infra & provider eksternal
- LLM: OpenAI-compatible via env (`AQSHA_CHAT_LITE_MODEL`, `AQSHA_CHAT_PRO_MODEL`, deep variants) → **digantikan model Claude (D1)**.
- Search/akademik: Exa (`EXA_API_KEY`), Jina (`JINA_API_KEY`), arXiv, OpenAlex, Crossref (tanpa key).
- Sandbox: Daytona (`DAYTONA_API_KEY`, `DAYTONA_STATVERIFY_SNAPSHOT`), skrip R bundled, timeout 90s.
- Rate limit: `@convex-dev/rate-limiter` per user; billing/credits per fitur dan per agent kind.

### 2.7 Kontrak frontend
- `api.agent.messages.startThread` → `{ok, threadId, messageId, runId}` | `{ok:false, reason: rate_limited|quota_exceeded|...}` — bentuk union ini dipertahankan.
- HITL resume: `answerAskUser` / `approveTool` / `denyTool` → **di-redesign** menjadi satu endpoint `respondInteraction` (§5.3).
- Observability UI: `agentRuns` (status, mode, draftMarkdown, verificationReportJson), `threadMetadata`, `agentRunEvents` — dipertahankan/diadaptasi ke tabel baru.
- Tiga surface chat memakai komponen bersama (`ChatThreadState`, composer @mention, HITL cards, run-progress) — UI dipertahankan, data-hooks diganti (§4.5).

---

## 3. Pemetaan kapabilitas → primitive Claude Agent SDK

| Kapabilitas saat ini | Primitive SDK | Catatan |
|---|---|---|
| `astraLite`/`astraPro` step budget | `query()` + `maxTurns` (5/10) + `model` per tier + `maxBudgetUsd` | Tier → kelas model Claude (final di Phase 0) |
| System prompt + intro per tier | `systemPrompt` custom (bukan preset Claude Code) | Pertahankan citation discipline, RAG-first, artifact flow |
| Histori thread (replay tiap turn via component) | **SDK session per thread** (`resume: sessionId` per turn) | Histori hidup di session; Convex messages = record UI + fallback rebuild |
| Tools (research/citation/sandbox/HITL) | `createSdkMcpServer` in-process + `tool()` + zod; nama jadi `mcp__aqsha__<tool>` | `annotations.readOnlyHint: true` pada tools search agar bisa paralel |
| Intent-routed `activeTools` allow-list per turn | `allowedTools`/`disallowedTools` per `query()` call | Dihitung di service sebelum memanggil SDK |
| `executeArtifact` double-gate | `canUseTool` + hook `PreToolUse` (cek approved `proposeArtifact` di Convex) | Hook bisa `deny` dengan reason yang dilihat model |
| `askUser` / `needsApproval` (FSM lama) | **Redesign**: `pendingInteractions` + `canUseTool` hold-window + interrupt → `resume` | Lihat §5.3 |
| Command routing composer (`commandId`, `/deep`) | **Slash commands SDK**: prompt string `/name args` diteruskan verbatim; commands = SKILL.md | Lihat §5.4. `/deep` tetap di-route di service (mode switch multi-fase) |
| Skills catalog + aktivasi + re-injeksi | Native: `settingSources` + `skills`, progressive disclosure otomatis | Menghapus `activate_skill`, catalog block, re-injeksi manual. `read_skill_resource` → file bundled di folder skill |
| Domain pack delegation (writer) | `skills: [...]` per subagent definition | Skor triggerKeywords tetap di logic service |
| Deep research workflow + subagents | `agents` option: planner, literature-searcher, counter-evidence, citation-verifier, writer | Paralel dalam satu turn; hasil kembali sebagai final text subagent |
| Rehydrasi state antar round | Tetap di Convex (tabel research*) via tools | Session SDK bukan pengganti durable state |
| RAG / `searchThreadDocuments` | Tetap di Convex (`@convex-dev/rag`); diekspos sebagai tool MCP | Embedding pipeline tidak pindah |
| Run progress / events | Hooks `PreToolUse`/`PostToolUse`/`SubagentStart`/`SubagentStop` → tulis ke Convex | Lebih kaya dari instrumentasi manual sekarang |
| Streaming ke frontend | Async generator `query()` → stream bridge → mutations batched ke tabel first-party | §4.3 |
| Context compaction | Otomatis SDK + `/compact` programatik; `PreCompact` hook untuk arsip | Mengganti budget manual untuk history (budget RAG tetap milik kita) |
| Observability | OTEL native + `total_cost_usd` per result | Baru — sekarang belum ada tracing |

**Yang TIDAK pindah ke `apps/agents`** (tetap di Convex): auth & ownership, persistence (tabel first-party baru), artifacts + versions, RAG index, rate limiting, billing/credits/quota, skills CRUD user-owned, tabel research state, frontend API surface.

**Yang DIHAPUS dari `packages/convex` setelah cutover**: `@convex-dev/agent` component + seluruh runtime agent, `@convex-dev/workflow` (jika tak dipakai fitur lain), skills runtime custom, FSM HITL lama.

---

## 4. Arsitektur target

```
apps/
  web/        Next.js — UI dipertahankan; data-hooks chat pindah ke query first-party
  agents/     BARU — Node.js service, Claude Agent SDK
packages/
  convex/     Data layer first-party (tanpa @convex-dev/agent), gating, trigger ke apps/agents
  agent-contracts/  BARU: tipe & zod schema bersama (RunRequest, RunEvent, Interaction,
                    CommandDescriptor, tool I/O) dipakai convex + agents + web
  ui/         Tetap
```

### 4.1 Alur pesan (normal chat)
1. `apps/web` → `api.agent.messages.startThread` (Convex mutation): validasi, rate limit, billing gate, tulis user message ke `chatMessages`, buat `agentRuns` row status `queued`.
2. Convex men-trigger `apps/agents` via HTTP (`POST /runs`) dengan `{runId, threadId, ownerUserId, agentKind, prompt, contextRefs}`. Prompt yang diawali `/` (selain `/deep`) diteruskan verbatim ke SDK sebagai slash command.
3. `apps/agents`: lookup `sessionId` thread → ada: `query({resume})`; tidak ada/invalid: rebuild konteks dari Convex → `query()` baru, simpan `sessionId` baru ke thread.
4. Selama berjalan: stream bridge menulis delta + tool events + status ke Convex (internal mutations, service identity).
5. Frontend menerima update real-time via subscription Convex first-party.

### 4.2 Struktur `apps/agents`
```
apps/agents/
  src/
    server.ts              # Hono — /runs, /runs/:id/resume, /runs/:id/cancel, /healthz
    runs/
      runManager.ts        # registry run aktif, concurrency cap, cancel (AbortController)
      sessionStore.ts      # mapping threadId ↔ sessionId (persist di Convex) + validasi file session
    agent/
      astra.ts             # konfigurasi query(): systemPrompt per tier, options
      contextAssembly.ts   # RAG/manifest dari Convex → prompt blocks; full rebuild saat session hilang
      streamBridge.ts      # async generator → batched Convex mutations
      interactions.ts      # canUseTool, pendingInteractions, hold-window, interrupt/resume
      hooks.ts             # PreToolUse (gates), PostToolUse (events), SubagentStart/Stop, PreCompact
    tools/
      index.ts             # createSdkMcpServer("aqsha", ...)
      research.ts          # searchWeb, searchArxiv, lookupDoi, searchThreadDocuments
      citations.ts         # verifyCitations
      sandbox.ts           # verifyStatistics, runComputation (Daytona)
      artifacts.ts         # proposeArtifact, executeArtifact, deleteArtifact
      workspace.ts         # createWorkspace, renameWorkspace
      askUser.ts           # askUser → pendingInteraction + interrupt
    subagents/
      index.ts             # AgentDefinition map: planner, literature, counter-evidence, citation, writer
    commands/
      registry.ts          # CommandDescriptor list (sinkron ke Convex untuk composer palette)
    convexClient.ts        # ConvexHttpClient + service auth
    config.ts              # env (ANTHROPIC_API_KEY, model per tier, budgets)
  .claude/
    skills/                # dipindah dari packages/convex/skills/ — juga berfungsi sebagai /commands
  Dockerfile
  package.json
```

### 4.3 Stream bridge
- Iterasi `for await (const message of query(...))`: assistant text delta → buffer → flush ke `chatMessages` (update in-place field `text`) tiap ~250ms / N karakter; `tool_use`/`tool_result` → `agentRunEvents`; `result` → finalisasi run (status, `total_cost_usd`, usage).
- Crash/restart service: watchdog Convex (heartbeat timeout) menandai run `failed`; user bisa retry; session tetap resumable.

### 4.4 Identitas & keamanan
- Service token untuk internal mutations Convex (HTTP actions + shared secret / signed JWT).
- `permissionMode` ketat + `allowedTools` eksplisit; **tidak pernah** `bypassPermissions` (gotcha: mode itu mengabaikan `allowedTools`).
- Filesystem tools builtin (`Write`, `Edit`, `Bash`) di-disallow kecuali dibutuhkan subagent tertentu; container read-only sebisanya; `cwd` konsisten (syarat session resume).

### 4.5 Storage first-party — lepas dari `@convex-dev/agent` (D2)

**Mengapa bukan tetap pakai component sebagai storage?** Component dirancang berpasangan dengan runtime-nya (`generateText`, `saveMessages`, `syncStreams`). Memakai tabel component dari service eksternal berarti tunduk pada skema & API internal component yang bisa berubah, tanpa lagi memakai nilai utamanya. Tiga opsi dipertimbangkan:
- **A. Component sebagai storage saja** — ditolak: coupling tetap, API canggung dari luar.
- **B. Tabel Convex first-party milik sendiri** — ✅ **dipilih**: skema bebas dibentuk (sessionId, interactions, events), reactivity Convex tetap didapat, sejalan preferensi code-organization.
- **C. State pindah ke service (Postgres/session files saja)** — ditolak: kehilangan reactivity Convex, butuh realtime channel baru, dua source of truth.

**Skema baru (garis besar):**
```
chatThreads          { ownerUserId, title, workspaceId?, status: idle|streaming|failed,
                       sdkSessionId?, agentKind, lastActivityAt, messageCount, lastMessagePreview }
chatMessages         { threadId, role: user|assistant|system, text, parts?: json (tool views),
                       runId?, status: streaming|complete|error, createdAt }
agentRuns            { threadId, promptMessageId, status, mode, agentKind, sdkSessionId?,
                       costUsd?, usageJson?, verificationReportJson?, ... }
agentRunEvents       { runId, seq, type: tool_start|tool_end|subagent_start|..., payloadJson }
pendingInteractions  { threadId, runId, type: ask_user|tool_approval, toolUseId, payloadJson,
                       status: pending|responded|expired|superseded, responseJson?, respondedAt? }
```
- **Streaming delta**: update in-place `chatMessages.text` (bukan tabel delta terpisah) — subscription Convex sudah efisien untuk dokumen yang berubah; evaluasi ulang bila ukuran pesan jadi masalah.
- **Tanpa migrasi data (D7)**: tabel first-party mulai kosong; thread lama di tabel component tidak dibawa. Selama dual-run (flag `AGENT_BACKEND`), user di backend baru hanya melihat thread baru. Setelah cutover, component di-unmount dan data lamanya ikut terhapus — tidak perlu tooling migrasi.
- **Frontend**: ganti pemakaian `listUIMessages`/`syncStreams`/hooks component → `useConvexQueryData` atas query first-party. Terlokalisasi di data-hooks `features/thread-experience`; komponen UI (message list, cards, run progress) menerima bentuk data yang di-adapt via `packages/agent-contracts`.

---

## 5. Desain area kritis

### 5.1 Tools sebagai in-process MCP
- Satu server `aqsha` via `createSdkMcpServer`; zod schema per tool (port dari schema `ai@6` — hampir 1:1).
- Handler memanggil provider eksternal langsung (Exa/Jina/arXiv/Crossref/OpenAlex — port modul `providers/`) atau Convex HTTP untuk data (RAG, artifacts).
- Citation counter per-run sebagai closure per `query()` call.
- `allowedTools` per run: normal chat = research + `searchThreadDocuments` (+ citation/sandbox sesuai intent routing); `executeArtifact` tidak pernah di allow-list turn pertama.

### 5.2 Skills: simplifikasi besar
Runtime skills custom (catalog block, `activate_skill`, re-injeksi body, `read_skill_resource`) digantikan progressive disclosure native SDK.
- Pindahkan + sesuaikan frontmatter 10 SKILL.md; pastikan `description` memuat trigger phrases (SDK memicu dari description).
- **Gotcha**: `allowed-tools` di frontmatter di-ignore oleh SDK — kontrol tool tetap di `allowedTools` option.
- User-owned skills: fase awal builtin-only (regression sementara, dikomunikasikan); fase lanjut materialisasi skill user ke direktori per-run.
- Analytics aktivasi: ganti `skillActivations` dengan deteksi pemakaian via `PostToolUse` pada tool `Skill` → `agentRunEvents`.

### 5.3 HITL — redesign native SDK (D4)

Bukan paritas FSM lama; model interaksi baru berpusat pada `pendingInteractions` + session interrupt/resume.

**Dua kelas interaksi:**
1. **`ask_user`** — model butuh jawaban. Tool `askUser` handler: tulis `pendingInteractions` row → kembalikan sinyal interrupt ke runManager → abort `query()`, simpan `sdkSessionId`. Kartu pertanyaan dirender dari row (UI existing diadaptasi).
2. **`tool_approval`** — tool destruktif/biaya (`proposeArtifact`→`executeArtifact`, `deleteArtifact`, `createWorkspace`, `renameWorkspace`, `runComputation`). Dijalankan via `canUseTool` callback dengan **pola hybrid hold-window**:
   - `canUseTool` menulis `pendingInteractions` row, lalu menunggu respons (subscribe/poll Convex) **maks ~45 detik**;
   - user merespons cepat → resolve in-place `{behavior: "allow" | "deny"}` — run lanjut tanpa interrupt (UX mulus);
   - window habis → interrupt run, simpan session; respons user kapan pun → `POST /runs/:id/resume` → `query({resume: sessionId})` dengan hasil approval sebagai konteks lanjutan.

**Endpoint frontend disatukan**: `api.agent.interactions.respond(interactionId, response)` menggantikan `answerAskUser`/`approveTool`/`denyTool`. Convex memvalidasi ownership → tandai row `responded` → bila run sudah ter-interrupt, panggil service resume.

**Gate keamanan dipertahankan**: hook `PreToolUse` pada `executeArtifact` memverifikasi ada `proposeArtifact` approved (cek `pendingInteractions` responded-approve di thread) → `deny` jika tidak. Plus `executeArtifact` tak pernah di allow-list turn pertama.

**Properti penting**: semua state interaksi di Convex (tahan restart service); session file hanya optimisasi resume — bila hilang, rebuild konteks dari `chatMessages` + interaction log.

### 5.4 Slash commands untuk composer (D4)

Adopsi [slash commands SDK](https://code.claude.com/docs/en/agent-sdk/slash-commands) sebagai mekanisme global commands di composer input.

- **Format**: `.claude/skills/<name>/SKILL.md` (format yang direkomendasikan; `.claude/commands/*.md` legacy). Satu file = dua jalur pemicu: dipanggil eksplisit `/name args` ATAU otonom oleh model. Skills existing otomatis jadi commands: `/verify-citations`, `/verify-statistics`, `/meta-analysis-synthesis`, `/cite-apa7`, dst.
- **Commands produk tambahan** (contoh): `/cite <gaya>`, `/verify`, `/summarize` — markdown dengan `argument-hint`, placeholder `$ARGUMENTS`/`$0..$n`, dan `@file` references bila perlu.
- **Alur**: composer mengirim prompt apa adanya; service meneruskan string `/name args` verbatim ke `query()` — SDK menangani ekspansi command.
- **Routing khusus `/deep`**: tetap dicegat di layer service (bukan slash command SDK) karena memicu orkestrasi multi-fase oleh runManager, bukan satu `query()` call.
- **Command palette di composer**: sumber daftar = `commands/registry.ts` (CommandDescriptor: name, description, argumentHint, scope) disinkronkan ke Convex saat deploy service; opsi validasi: cocokkan dengan `slash_commands` dari `system/init` message saat startup service. Frontend membaca daftar dari Convex query → palette muncul saat user mengetik `/` (pola yang sama dengan @mention pills).
- **Catatan**: jangan ekspos built-in commands SDK (`/compact`, `/clear`, dll.) ke user; `/compact` boleh dipakai internal oleh service untuk manajemen konteks session panjang.

### 5.5 Deep research dengan subagents native
- Orkestrator = main agent + subagents via `agents` option:
  - `planner` (model pro, tools research read-only) — plan ditulis ke Convex.
  - `literature-searcher` (paralel per round/sub-question; search + tulis extract ke Convex).
  - `counter-evidence` (search, prompt adversarial).
  - `citation-verifier` (`verifyCitations` + lookup).
  - `writer` (skills: domain pack pre-loaded via `skills` field; baca extract dari Convex, `proposeArtifact`).
- Durable state tetap di tabel `research*` — subagent stateless, menulis hasil via tools; rehydrasi round = baca dari Convex (pola `loopState.ts` dipertahankan).
- Durability tanpa `@convex-dev/workflow`: deep research dipecah jadi beberapa `query()` call per fase (planner → rounds → write) di-orchestrate `runManager` — tiap fase idempotent dan resumable dari state Convex.

### 5.6 Verifikasi (citation + statistik)
- Engine port hampir langsung: `citationIntegrity.ts`, `sandbox/*` (claim extraction, classifier, report builder) — TypeScript murni + HTTP; persistence via internal mutation.
- Daytona tetap provider sandbox; env pindah ke `apps/agents`. Split-timing verification dipertahankan.

### 5.7 Observability & cost
- OTEL: `CLAUDE_CODE_ENABLE_TELEMETRY=1` + OTLP collector; traces beta per tool/LLM call.
- Per run: `total_cost_usd` + token usage dari `result` → `agentRuns` → billing berbasis biaya aktual.
- `maxBudgetUsd` per run sebagai guard di atas quota Convex.

---

## 6. Fase implementasi

### Phase 0 — Spike & validasi
Prototipe minimal di `apps/agents` (belum terhubung produk):
1. `query()` + in-process MCP (2 tool) + streaming ke stdout; validasi default model (Lite = haiku-4-5, Pro = sonnet-4-6) — benchmark kualitas/biaya/latency pada sample prompt nyata; uji apakah writer deep research Pro perlu naik ke opus.
2. **Session resume**: interrupt → simpan sessionId → `resume`; uji reliabilitas session file di container (volume, `cwd` konsisten); uji fallback rebuild konteks.
3. **HITL hold-window**: buktikan `canUseTool` menahan promise + resolve dari sinyal eksternal; ukur batas aman durasi hold.
4. Skills + slash command: pindahkan 2 SKILL.md, verifikasi pemicu otonom DAN invocation `/name` via prompt string; baca `slash_commands` dari `system/init`.
5. Subagent paralel: 2 `literature-searcher` dalam satu turn.
- **Exit criteria**: session resume & hold-window andal; default model terkonfirmasi (atau disesuaikan); biaya/latency acceptable.

### Phase 1 — Fondasi: storage first-party + service + paritas normal chat
1. Skema tabel first-party (§4.5) di `packages/convex` + query/mutation publik untuk frontend + internal mutations untuk service; **tanpa menyentuh tabel component lama** (dual-stack sementara).
2. `packages/agent-contracts`: RunRequest/RunEvent/Interaction/CommandDescriptor (zod).
3. Scaffold `apps/agents` (struktur §4.2, Hono), Dockerfile, masuk pipeline bun (`dev`/`typecheck`/`lint`).
4. Trigger transport (`POST /runs`) + service auth + stream bridge + run lifecycle + cancel + watchdog.
5. Port tools research + citation; konteks assembly (RAG block, manifest) via Convex HTTP; skills builtin via `.claude/skills/`.
6. Frontend: data-hooks layer baru di `features/thread-experience` membaca tabel first-party, di belakang feature flag `AGENT_BACKEND=legacy|sdk` per user.
- **Exit criteria**: normal chat end-to-end di backend baru (internal dogfood) pada tiga surface UI; thread baru tercipta di tabel first-party.

### Phase 2 — HITL redesign + artifacts + slash commands
1. `pendingInteractions` + `canUseTool` hold-window + interrupt/resume end-to-end; endpoint `interactions.respond`; adaptasi kartu UI.
2. Artifact flow: `proposeArtifact`/`executeArtifact` (gate via hook), `deleteArtifact`, workspace tools.
3. Slash commands: registry + sinkronisasi ke Convex + composer palette `/`; commands produk awal dari skills existing.
- **Exit criteria**: seluruh flow artifact & HITL bekerja dengan model interaksi baru; gate `executeArtifact` teruji; command palette berfungsi di composer.

### Phase 3 — Deep research (subagents)
1. Subagents + orkestrasi multi-fase resumable (§5.5); `/deep` routing di service.
2. Counter-evidence + citation verification + writer dengan domain pack.
3. Run-progress events via `SubagentStart/Stop` hooks → UI run-progress.
- **Exit criteria**: `/deep` paritas kualitas (N run berdampingan vs implementasi lama); resumable setelah restart service.

### Phase 4 — Verifikasi statistik, observability, cutover
1. Port sandbox Daytona tools + verification report.
2. OTEL + cost tracking aktual → `agentRuns`; rekonsiliasi billing.
3. Dual-run period (flag per user) → cutover penuh (tanpa migrasi data, D7 — thread lama tidak dibawa) → hapus: runtime agent lama, `@convex-dev/agent` + `@convex-dev/workflow` dari `convex.config.ts`, skills runtime custom, FSM HITL lama.
- **Exit criteria**: semua user di stack baru; component di-unmount; dokumentasi (`AGENTS.md`, `CLAUDE.md`, `apps/agents/AGENTS.md`) diperbarui.

---

## 7. Risiko utama & mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Perilaku/kualitas berubah karena pindah ke Claude | Sedang (keputusan sudah final; risikonya tuning) | Benchmark Phase 0 untuk pilih tier; prompt tuning; eval berdampingan di Phase 3 |
| Session file lokal hilang saat redeploy/scale-out | Tinggi | Volume persisten + sticky routing per run; **fallback wajib**: rebuild konteks dari `chatMessages` (didesain sejak awal, bukan afterthought); uji di Phase 0 |
| Thread lama hilang saat cutover (D7: tanpa migrasi) | Rendah (diterima owner) | Komunikasikan ke user sebelum cutover; tabel component tetap utuh sampai unmount, jadi keputusan masih bisa dibalik selama dual-run |
| Scope frontend lebih besar dari v1 (hooks layer diganti) | Sedang | Perubahan dikurung di data-hooks `features/thread-experience` + adapter di `agent-contracts`; UI komponen tidak ditulis ulang |
| Durability deep research tanpa `@convex-dev/workflow` | Sedang | Multi-fase `query()` idempotent + state di Convex (§5.5) |
| Hold-window `canUseTool` menahan run hidup (biaya idle, fragile saat deploy) | Sedang | Window pendek (~45s) + jalur interrupt sebagai perilaku utama yang teruji; semua state di Convex |
| Latensi hop Convex↔service↔Convex | Sedang | Batched stream bridge; region sama; ukur di Phase 0 |
| Biaya loop SDK (subagents, tool search) lebih boros | Sedang | `maxTurns`/`maxBudgetUsd` per tier; billing berbasis `total_cost_usd` aktual |
| User-owned skills regression sementara | Rendah | Komunikasikan; materialisasi per-run di fase lanjut |
| `bypassPermissions` mengabaikan `allowedTools` (footgun) | Rendah | Larang via review + test; selalu allow-list eksplisit |

---

## 8. Status keputusan

**Tidak ada keputusan terbuka tersisa.** Semua tercatat di log keputusan (D1–D8) di bagian atas dokumen:
- ✅ D1 Model Claude; ✅ D2 storage first-party tanpa `@convex-dev/agent`; ✅ D3 skills native SDK; ✅ D4 slash commands + HITL redesign; ✅ D5 auth via `ANTHROPIC_API_KEY`; ✅ D6 default Lite=haiku-4-5 / Pro=sonnet-4-6 (env-configurable, validasi Phase 0); ✅ D7 tanpa migrasi data (fresh start); ✅ D8 Hono.

Plan siap dieksekusi mulai **Phase 0 — Spike & validasi**.

---

## 9. Progres implementasi & roadmap penyelesaian (2026-06-12)

> Section ini mencatat apa yang SUDAH dibangun, deviasi dari desain di atas, apa yang BELUM,
> dan urutan langkah sampai **selesai penuh: agent + web terintegrasi dan bisa dites melalui UI**.
> Scope build pertama (sesuai arahan owner): fokus agent dulu, tanpa menyentuh `apps/web`.

### 9.1 Yang sudah dibangun (semua test hijau, belum di-commit)

**`packages/agent-contracts`** — kontrak zod bersama (plan §4, Phase 1.2): ✅ selesai.
- `run.ts`: `agentKind`, `runMode`, `runStatus` (lifecycle sama dengan runtime lama), `runRequestSchema` (payload `POST /runs`), `runEventSchema` + 10 event type, `runResultSummarySchema` (cost/usage/sessionId dari result message).
- `interaction.ts`: model HITL baru §5.3 — `pendingInteractionSchema`, `interactionResponseSchema` (discriminated union `answers` | `approval`, menggantikan answerAskUser/approveTool/denyTool), `askUserQuestionSchema` (2–8 opsi), helper `isApproved()`.
- `command.ts`: `commandDescriptorSchema` (§5.4) dengan `scope: skill|product|service` + flag `interceptedByService`.
- `source.ts`: `sourceCandidateSchema` + `integrityStatusSchema` (port dari `sourceCandidates.ts`).
- 9 unit test. Terdaftar di workspaces root + `bun run typecheck`.

**`apps/agents`** — service Hono + Claude Agent SDK (struktur §4.2 diikuti): ✅ inti selesai.

| Area plan | Status | Implementasi |
|---|---|---|
| §4.2 server.ts | ✅ | `POST /runs` (validasi zod + idempotent retry), `POST /runs/:id/resume`, `POST /runs/:id/cancel`, `POST /interactions/:id/respond` (endpoint HITL terpadu), `GET /commands`, `GET /healthz`; bearer auth `AGENTS_SERVICE_TOKEN` (§4.4) |
| §4.2 runManager | ✅ | Registry run aktif, concurrency cap (default 4), cancel durable, loop execute→interrupt→resume, intersepsi `/deep` (slash lain diteruskan verbatim ke SDK), satu titik sentuh SDK di `runs/sdkRunner.ts` (QueryRunner injectable → semua test pakai fake stream) |
| §4.3 stream bridge | ✅ | `agent/streamBridge.ts`: partial delta + assistant message → flush batched (~250ms / N chars) in-place ke pesan streaming; `result` → `costUsd`/`usage`/`numTurns`/`sessionId`; pesan subagent (parent_tool_use_id) di-skip dari teks chat |
| §5.1 tools MCP | ✅ | Server in-process `aqsha` per run (closure: identity, store, providers, broker, citation counter bersama per turn): `searchWeb` (Exa→Jina fallback), `searchArxiv`, `lookupDoi`, `searchThreadDocuments`, `verifyCitations`, `proposeArtifact`, `executeArtifact`, `deleteArtifact`, `createWorkspace`, `renameWorkspace`, `askUser`, `verifyStatistics`, `runComputation`; `readOnlyHint` di tools search |
| §5.3 HITL | ✅ | `agent/interactions.ts` (InteractionBroker): hold-window `canUseTool` 45s — respons cepat resolve in-place, timeout → `query.interrupt()` → run `waiting_hitl`; `askUser` selalu interrupt; resume menyuntik jawaban/approval sebagai prompt lanjutan + `resume: sessionId`. Gate ganda `executeArtifact` utuh: exclude allow-list turn 1 (`toolPolicy.ts`) + hook `PreToolUse` cek `proposeArtifact` approved (`hooks.ts`) |
| §5.2/§5.4 skills & commands | ✅ | 10 SKILL.md disalin ke `.claude/skills/` (`settingSources:["project"]`, `cwd` stabil = `appRoot`); `commands/registry.ts` membaca frontmatter → `CommandDescriptor[]` + `/deep`; `GET /commands` = sumber sinkronisasi palette |
| §5.5 deep research | ◐ first cut | 5 AgentDefinition (planner, literature-searcher paralel/background, counter-evidence, citation-verifier, writer + domain pack via port `skillTriggerSurrogate` yang identik dengan legacy) dalam SATU `query()`. Orkestrasi multi-fase resumable BELUM (lihat 9.3) |
| §5.6 verifikasi sitasi | ✅ | Engine 4-langkah diport utuh (`citations/integrity.ts`, pure + providers injectable) — termasuk **bugfix nyata**: sentinel kegagalan OpenAlex tidak lagi terbaca `not_found` (provider outage ≠ bukti fabrikasi). Ekstraksi bibliografi: parser deterministik (`citations/bibliography.ts`) menggantikan LLM pass — kontrak tool sama, bisa di-upgrade belakangan |
| §2.6 providers | ✅ | Exa/Jina/Crossref/arXiv/OpenAlex murni fetch + cache TTL in-process (ready 24h / empty 90m / failed 12m, semantik sama) + pacer global arXiv 1req/3s. Billing & rate-limit per-user TETAP di Convex (§3) — gate terjadi sebelum `POST /runs` |
| §4.5 storage | ◐ abstraksi | Interface `AgentStore` memodelkan tabel first-party; `MemoryStore` (dev/test) + `ConvexStore` yang peta `SERVICE_FUNCTIONS`-nya (25 endpoint `agent/service:*`, semua call membawa `serviceToken`) = **kontrak Phase 1 sisi Convex**. Endpoint Convex-nya sendiri BELUM ada |
| Konteks (§2.5) | ✅ | `contextAssembly.ts`: blok artifacts (clip 4K/artifact, total 16K), manifest workspace, RAG block 6K, dan **fallback rebuild histori** dari `chatMessages` saat session hilang (§4.1.3) |
| Infra | ✅ | Dockerfile (volume `/data` untuk session files), `bun run dev:agents` / `test:agents` di root, `apps/agents/AGENTS.md` (invariants + env), config env-driven D6 (`ASTRA_LITE_MODEL=claude-haiku-4-5`, `ASTRA_PRO_MODEL=claude-sonnet-4-6`, deep variants) |

**Verifikasi**: 91 unit test `apps/agents` + 9 `agent-contracts` (integrity matrix, hold-window allow/deny/timeout, gate executeArtifact, stream bridge, runManager completed/failed/cancel/askUser-resume//deep, server auth/endpoint, provider parsing+cache, registry, config); `bun run typecheck` hijau 5 workspace; `bun run lint` bersih; smoke-boot nyata: `/healthz` OK, 401 tanpa token, `/commands` = `/deep` + 10 skills.

### 9.2 Deviasi & temuan teknis vs desain di atas

0. **Spike live Step 0 (2026-06-12) — temuan SDK nyata:**
   - **Gateway OpenRouter menggantikan API key Anthropic langsung** (deviasi D5, keputusan owner): `ANTHROPIC_BASE_URL=https://openrouter.ai/api` + `ANTHROPIC_AUTH_TOKEN=sk-or-…` + `ANTHROPIC_API_KEY` kosong; model memakai slug OpenRouter (`anthropic/claude-haiku-4.5`, `anthropic/claude-sonnet-4.6`) via `ASTRA_*_MODEL`. Billing lewat kredit OpenRouter; `total_cost_usd` tetap terisi di result.
   - **KRITIS — `allowedTools` MEM-BYPASS `canUseTool`**: tool yang ada di allow-list di-auto-allow tanpa konsultasi `canUseTool`. Hold-window §5.3 hanya bekerja bila tool gated TIDAK ada di `allowedTools` (tetap terlihat oleh model via MCP server; permission jatuh ke `canUseTool`). `toolPolicy.ts` diperbaiki + unit test penjaga.
   - **Approval timeout→resume butuh "primed approval"**: saat resume, model mengulang panggilan tool gated → broker semula membuka window baru dan timeout berulang (deadlock). Fix: respons interaction yang sudah tercatat di-prime one-shot ke turn resume (`InteractionBroker.primeResolvedApproval`), dikonsumsi oleh retry pertama tool yang sama.
   - **`slash_commands` di `system/init` bocor command host** (plugin/user-level) meskipun `settingSources:["project"]` — di laptop dev terlihat ~35 command, bukan hanya 10 skill + builtin. Tidak memblokir (registry palette kita dari `GET /commands`, bukan dari init), tapi di container produksi harus diverifikasi bersih.
   - Skenario tervalidasi end-to-end: session resume antar turn (sessionId stabil, konteks diingat, cache read ~32K, turn-2 $0.02/3.9s), hold-window approve/deny in-place (tanpa interrupt), timeout→interrupt→respond→resume→tool jalan, askUser kartu terstruktur→interrupt→jawab→resume, pemicu skill otonom (verify-citations terpicu dari deskripsi, engine 4-langkah jalan dengan provider nyata), `/verify-citations` eksplisit (5 turns, $0.10), `/deep` lite penuh (planner → 2 literature paralel → counter-evidence → citation-verify → writer → proposeArtifact, ~203s, berakhir `waiting_hitl` menunggu approval artifact — sesuai desain).
   - **Benchmark D6**: chat haiku-4.5 $0.058/7.9s vs sonnet-4.6 $0.126/9.4s (kualitas keduanya layak; sonnet lebih tajam strukturnya).
   - **REVISI D6 (keputusan owner, 2026-06-12)**: tier diganti ke model non-Anthropic via gateway OpenRouter — Lite=`deepseek/deepseek-v4-flash`, Pro=`deepseek/deepseek-v4-pro` dengan max reasoning effort (env baru `ASTRA_PRO_MAX_THINKING_TOKENS=32000` → SDK `maxThinkingTokens` → dipetakan gateway ke reasoning budget), deep-writer Pro=`minimax/minimax-m3` (`ASTRA_DEEP_PRO_MODEL`). Ketiganya tervalidasi live (tools + streaming + session resume jalan): flash $0.145/6.6s, pro $0.152/24.7s, m3 $0.142/11.2s.
   - **Catatan biaya penting**: pada model Claude, prompt caching memangkas turn lanjutan ke ~$0.02 (cache read 32K); pada deepseek/minimax via jalur ini TIDAK ada diskon cache — system prompt ~32K dibilling penuh tiap turn (~$0.14/turn flat). Bila biaya jadi masalah, pertimbangkan kembali model ber-cache atau pemangkasan system prompt.

0b. **Temuan Step 1 (2026-06-12):**
   - **Cacat kontrak nyata di `ConvexStore.createInteraction`** (sesuai mandat "catat bila ada"): spread `...input` ikut mengirim field `payload` (objek) di samping `payloadJson`, padahal endpoint Convex memvalidasi args secara eksak → `ArgumentValidationError` dan gate approval gagal senyap (model melihat error, bukan kartu approval). Diperbaiki di sisi service (strip `payload`) + unit test penjaga; args endpoint TIDAK berubah.
   - **Arah trigger Convex→service butuh URL publik**: deployment Convex cloud tidak bisa menjangkau `localhost:8787`, jadi `AGENTS_SERVICE_URL` untuk dev lokal harus tunnel (cloudflared/ngrok) — disiapkan saat Step 2 (UI milestone). Arah service→Convex sudah teruji penuh.
   - `getPolarSubscriptionOrNull` kini menelan error "Component polar is not registered" (hanya terjadi di convex-test) → fallback ke mirror `billingSubscriptions`; perilaku produksi tidak berubah.
   - Mutation publik v2 memakai id string buatan service (`thr_*`/`run_*`) — `crypto.randomUUID()` tersedia di runtime Convex.

1. **`maxBudgetUsd` TIDAK ADA di SDK** (§3 & §5.7 menyebutnya) — verifikasi API `@anthropic-ai/claude-agent-sdk@0.3.x`: hanya `maxTurns` + `total_cost_usd` di result. Guard biaya per run harus diimplementasikan sendiri (cek kumulatif `total_cost_usd` antar fase + `maxTurns` per tier). Risiko §7 baris "Biaya loop SDK" perlu mitigasi versi ini.
2. **Deep research first-cut = satu `query()`** dengan `agents` option (kalimat pertama §5.5), bukan multi-fase durable. Cukup untuk validasi kualitas; durability §5.5 menyusul (Step 4 di 9.4).
3. **Ekstraksi bibliografi heuristik** (regex DOI/arXiv/tahun/judul, heading References/Daftar Pustaka) menggantikan LLM extraction — deterministik & teruji; engine konservatif sehingga parse buruk berdegradasi ke `unverifiable`, bukan false flag.
4. **Sandbox = interface dulu** (`tools/sandboxService.ts`): tool `verifyStatistics`/`runComputation` sudah ada dengan kontrak final tapi mengembalikan `not_configured` sampai engine Daytona diport (Phase 4) — model mengomunikasikannya dengan jujur.
5. **Hold-window di ConvexStore = polling 1.5s** (bukan subscribe) — bounded oleh window 45s (~30 query terburuk); reactivity penuh tetap di sisi web.
6. **Skill user-owned**: builtin-only dulu, sesuai §5.2 (regression sementara yang diterima).

### 9.3 Yang belum terimplementasi (gap → referensi plan)

| Gap | Referensi | Catatan |
|---|---|---|
| Tabel first-party + endpoint `agent/service:*` di `packages/convex` | §4.5, Phase 1.1 | Kontrak persis sudah terkunci di `apps/agents/src/store/convexStore.ts` (`SERVICE_FUNCTIONS`, 25 endpoint) |
| Mutation trigger `startThread` → `POST /runs` + gate billing/rate-limit | §4.1.1–2, Phase 1.4 | Bentuk return union lama (`{ok:false, reason}`) dipertahankan (§2.7) |
| Watchdog heartbeat (run yatim → `failed`) | §4.3, Phase 1.4 | Cron Convex |
| Sinkronisasi command registry → Convex (palette composer) | §5.4, Phase 2.3 | Sumber: `GET /commands` service |
| Data-hooks `apps/web` + flag `AGENT_BACKEND` + adaptasi kartu HITL + palette `/` + run-progress | §4.5, Phase 1.6 & 2 | Satu-satunya pekerjaan frontend; dikurung di `features/thread-experience` |
| Validasi live Phase 0 (benchmark D6, reliabilitas session resume di container, durasi hold-window nyata) | Phase 0 | Belum pernah run dengan `ANTHROPIC_API_KEY` asli |
| Orkestrasi deep research multi-fase resumable + tabel `research*` + eval paritas | §5.5, Phase 3 | Sekarang single-query first cut |
| Engine Daytona (statcheck/GRIM/GRIMMER/power + claim extraction + report) | §5.6, Phase 4.1 | Tool surface sudah final |
| OTEL + billing dari `total_cost_usd` + guard biaya custom (pengganti `maxBudgetUsd`) | §5.7, Phase 4.2 | Lihat deviasi #1 |
| Dual-run → cutover → hapus runtime lama (`@convex-dev/agent`, workflow, FSM HITL, skills runtime) | Phase 4.3 | Setelah paritas terbukti |
| Minor: LLM bibliography pass, materialisasi skill user per-run, `jinaRerank`/`readWithJinaReader` sebagai tool MCP, entry compose Docker + volume session | §5.2, §5.6 | Utang kecil, tidak memblokir |

### 9.4 Roadmap penyelesaian — sampai agent + web terintegrasi dan bisa dites via UI

Urutan disusun supaya tiap step punya hasil yang bisa diverifikasi, dan step UI tidak dimulai sebelum data layer-nya nyata.

**Step 0 — Commit & spike live (≤½ hari)** ✅ **SELESAI (2026-06-12)**
- ✅ Commit build (`fd5e5af`) di branch `development`.
- ✅ Live via gateway OpenRouter (deviasi D5 — lihat 9.2 #0) + memory store, harness `apps/agents/scripts/spike.ts`: session resume, hold-window 3 jalur, askUser, skill otonom, `/verify-citations`, `/deep` subagent paralel, `slash_commands` dari `system/init` — semua tervalidasi.
- ✅ Dua bug nyata ditemukan & diperbaiki dari spike: allowedTools-bypass-canUseTool (gate approval tidak pernah terpicu) + primed approval untuk resume pasca-timeout (deadlock window berulang). Keduanya kini ber-unit-test.
- ✅ Benchmark D6 tercatat (9.2 #0): default Lite=haiku-4.5 / Pro=sonnet-4.6 dikunci. ⏳ Keputusan owner terbuka: upgrade writer deep ke opus (opsional, tinggal env `ASTRA_DEEP_PRO_MODEL`).
- *Exit*: checklist Phase 0 asli (§6) tercentang dengan SDK sungguhan; anomali tercatat di 9.2 #0.

**Step 1 — Convex Phase 1: tabel first-party + endpoint service (1–2 hari)** ✅ **SELESAI (2026-06-12)**
- ✅ Skema: `chatThreads`, `chatMessages`, `agentRuns2`/`agentRunEvents2` (suffix v2 karena bentrok nama legacy), `pendingInteractions` + index per pola baca (`by_thread_id`, `by_owner_activity`, `by_thread_created`, `by_run_id`, `by_status_updated`, `by_run_seq`, `by_run_status`).
- ✅ `convex/agent/service.ts` (+ helpers `agent/service/model.ts`): 25 endpoint `SERVICE_FUNCTIONS` persis kontrak, semua divalidasi `requireServiceToken` (env `AGENTS_SERVICE_TOKEN`); `applyArtifactAction`/`applyWorkspaceAction` reuse internal mutations existing; `searchThreadDocuments` delegasi ke `internal.agent.context.ragContext.searchThreadDocuments`.
- ✅ `convex/agent/v2.ts`: `startThread`/`sendMessage` publik (return union lama dipertahankan; gating reuse `checkAndConsumeSendQuota` dari messages.ts — semantik identik dual-run), `cancelRun`, dispatch `POST /runs` via scheduler action (retry 3×, gagal → run failed retry-able), watchdog `watchdogSweep` (cron 5 menit: queued >5m / running,waiting >10m → failed; `waiting_hitl` tidak pernah disapu; heartbeat = `appendRunEvent` bump `updatedAt`).
- ✅ `convex/agent/v2/interactions.ts`: `respond` publik (ownership + validasi tipe respons; tulis ke Convex DULU, forward resume HANYA bila run sudah interrupted) + race guard di `runManager` (self-resume bila interaction sudah responded saat finalisasi waiting_hitl).
- ✅ 16 convex-test baru (`tests/agentServiceV2.test.ts`); total convex 348 hijau; `convex dev --once` bersih.
- ✅ E2E live `AGENTS_STORE=convex` (tanpa UI): chat run penuh (stream → `chatMessages`, finalisasi cost/usage/session → `agentRuns2`) DAN alur HITL approve (interaction pending di Convex → respond → resolve in-place → workspace nyata dibuat → completed).
- Temuan: cacat kontrak `ConvexStore.createInteraction` (mengirim `payload` + `payloadJson` sekaligus → ArgumentValidationError) diperbaiki + unit test; lihat 9.2 #7.
- `packages/convex/convex/schema.ts`: tambah `chatThreads`, `chatMessages`, `agentRuns2` *(atau nama baru bila bentrok dengan tabel lama)*, `agentRunEvents2`, `pendingInteractions` persis §4.5 + index per pola baca (by_thread, by_owner_activity, by_run_seq, by_thread_status).
- `convex/agent/service.ts` (facade `internal`/HTTP): implementasikan **25 endpoint `SERVICE_FUNCTIONS`** dengan args persis seperti di `ConvexStore` (setiap call validasi `serviceToken` dari env Convex; gunakan `throwAppError` untuk kegagalan).
- `searchThreadDocuments` → action yang delegasi ke `@convex-dev/rag` existing; `applyArtifactAction`/`applyWorkspaceAction` → reuse helper artifacts/workspaces existing (ownership check `ownerUserId`).
- Mutation publik `agent.v2.startThread` / `sendMessage`: validasi + rate limit + billing gate (return union lama §2.7) → tulis user message + run `queued` → `ctx.scheduler` action `POST /runs` ke service (URL + token dari env).
- Endpoint publik `agent.v2.interactions.respond(interactionId, response)`: validasi ownership → forward ke service `/interactions/:id/respond`.
- Cron watchdog: run `running`/`queued` tanpa update > N menit → `failed` (pesan retry-able).
- Set `AGENTS_STORE=convex`, `CONVEX_URL`, `AGENTS_SERVICE_TOKEN` di service → **normal chat end-to-end tanpa UI** (curl → data muncul reaktif di dashboard Convex).
- *Exit*: Phase 1.1 + 1.4 selesai; vitest convex-test untuk endpoint service; `convex dev --once` bersih.

**Step 2 — Integrasi `apps/web` (data-hooks + flag) (2–3 hari) — *milestone "bisa dites via UI"*** ✅ **SELESAI (2026-06-12) — dikonfirmasi owner via dogfood UI**
- ✅ Flag `NEXT_PUBLIC_AGENT_BACKEND=legacy|sdk` (`apps/web/lib/agent-backend.ts`); kedua varian hook selalu dipanggil (rules of hooks), yang nonaktif full-"skip".
- ✅ Query publik v2 (`convex/agent/v2/queries.ts`): listThreads/getThread/listMessages/listRuns/listPendingInteractions — auth `requireCurrentUser` + ownership; plus `removeThread` dan proxy `listCommands` (GET /commands service).
- ✅ Adapter `packages/agent-contracts/src/uiAdapters.ts` (+5 unit test): pesan v2 → `ChatMessage`, run+events v2 → `ResearchRun`, dan **interaction pending → pesan sintetis ber-part HITL** (`tool-askUser` state `input-available`; approval state `approval-requested` + `approval.id`) — kontrak persis `utils/hitl-parts.ts`, kartu HITL existing dirender tanpa perubahan komponen.
- ✅ Data-hooks: `use-thread-experience-data-v2.ts` (bentuk return identik); `use-hitl-resume.ts` jalur sdk → satu mutation `agent.v2.interactions.respond`; `chat-thread-state.tsx` hanya berganti sumber data (useUIMessages di-skip pada sdk).
- ✅ Composer: prompt verbatim; commandId legacy dipetakan `promptForSdkBackend` (slug inline; `/deep-research`→`/deep`).
- ✅ E2E pipeline penuh tervalidasi live: `startThread` (mutation ber-auth) → scheduler → **tunnel ngrok** → service → SDK → stream balik ke Convex → terbaca via query publik. Bug nyata diperbaiki: dedupe `POST /runs` salah menganggap row `queued` pre-created Convex sebagai "sudah diterima" → run tak pernah dieksekusi (+ regression test).
- ⏳ Exit final menunggu dogfood owner di tiga surface UI (butuh sesi login Clerk).
- Perbaikan dari dogfood pertama: **streaming lag** — `bridge.handle()` meng-`await` mutation Convex per flush (~300ms RTT) sehingga konsumsi token SDK ter-throttle serial. Fix: write pipeline non-blocking (maks 1 mutation in-flight, trailing flush coalesced, drain saat final) + regression test; cadence UI kini ≈ 1 update per RTT dengan teks penuh terbaru.
- Perbaikan dari dogfood kedua: **streaming terasa "melompat"** — jalur sdk me-render potongan ~RTT mentah; legacy terasa alami karena `useUIMessages` punya smoothing adaptif bawaan. Fix: `useSmoothText` (hook yang sama) diterapkan pada pesan asisten yang sedang streaming di layer data sdk. Dikonfirmasi owner: "much better", Step 2 done.
- Gap interim (dicatat): palette `/` masih registry statis (proxy `listCommands` sudah ada, penggantian palette = perubahan komponen UI → Step 3); panel artifacts/sources per-thread kosong di sdk (service belum menautkan artifact↔thread); `retryRun` no-op; workspace pick saat approve dikirim sebagai note.
- Flag `AGENT_BACKEND=legacy|sdk` per user (env/user setting) di data-hooks layer `features/thread-experience` — komponen UI TIDAK ditulis ulang (§4.5).
- Hooks baru via `useConvexQueryData`: daftar thread + pesan (subscribe `chatThreads`/`chatMessages`), status run + events (`agentRuns`/`agentRunEvents` → run-progress), interaksi pending (`pendingInteractions` → kartu HITL).
- Adapter bentuk data di `packages/agent-contracts` → bentuk yang dimakan `ChatThreadState`/HITL cards/run-progress existing.
- Kartu HITL: render dari row `pendingInteractions` (ask_user → kartu pertanyaan; tool_approval → kartu Review Plan) → satu mutation `interactions.respond`.
- Composer: kirim prompt apa adanya (termasuk `/name args`); palette `/` membaca registry dari Convex (sinkron dari `GET /commands` service saat deploy, atau query proxy sementara).
- *Exit (kriteria "selesai" versi owner)*: **dengan flag `sdk`, ketiga surface chat bisa dipakai dari UI**: kirim pesan → streaming balasan; askUser → kartu → jawab → lanjut; proposeArtifact → approve → artifact tertulis ke workspace; `/deep` jalan dengan run-progress; `/verify-citations` jalan. Dogfood internal dimulai di sini.

**Step 3 — Pengerasan HITL & artifacts di UI (1 hari)**
- Uji ketiga jalur hold-window dari UI (approve cepat / deny / biarkan timeout → resume), cancel run dari UI, perilaku saat service restart di tengah `waiting_hitl` (state recover dari Convex).
- *Exit*: Phase 2 exit criteria asli (§6) terpenuhi end-to-end.

**Step 4 — Deep research durable (2–3 hari)**
- Pecah `/deep` jadi fase `query()` terpisah yang diorkestrasi `runManager` (§5.5): planner → literature rounds (state `research*` di Convex, rehydrasi ala `loopState.ts`) → counter-evidence → citation-verify → writer; tiap fase idempotent + resumable setelah restart service.
- Eval berdampingan vs implementasi lama (N run, golden set existing di `agent/evals/`).
- *Exit*: Phase 3 exit criteria asli.

**Step 5 — Phase 4: sandbox, observability, billing (2–3 hari)**
- Port engine Daytona ke `SandboxService` (skrip R + claim extraction + report builder; split-timing dipertahankan §5.6).
- OTEL (`CLAUDE_CODE_ENABLE_TELEMETRY=1` + collector) + tulis `total_cost_usd`/usage ke `agentRuns` → rekonsiliasi billing; **guard biaya custom** per run (deviasi #1).
- *Exit*: `verifyStatistics` nyata dari UI; biaya run tercatat akurat.

**Step 6 — Dual-run → cutover → bersih-bersih**
- Periode dual-run dengan flag per user → migrasikan semua user ke `sdk`.
- Hapus: runtime agent lama di `packages/convex/convex/agent/` (kecuali yang dipakai endpoint service), `@convex-dev/agent` + `@convex-dev/workflow` dari `convex.config.ts`, FSM HITL lama, skills runtime custom; perbarui `AGENTS.md`/`CLAUDE.md`.
- *Exit*: Phase 4.3 — definisi **SELESAI PENUH** untuk inisiatif ini.

**Estimasi total sisa pekerjaan: ~8–12 hari kerja**, dengan milestone "agent + web terintegrasi, bisa dites via UI" tercapai di akhir **Step 2**.

---

## 10. Referensi

- Agent SDK overview: https://code.claude.com/docs/en/agent-sdk/overview
- TypeScript reference: https://code.claude.com/docs/en/agent-sdk/typescript
- Custom tools: https://code.claude.com/docs/en/agent-sdk/custom-tools
- Subagents: https://code.claude.com/docs/en/agent-sdk/subagents
- Skills: https://code.claude.com/docs/en/agent-sdk/skills
- **Slash commands: https://code.claude.com/docs/en/agent-sdk/slash-commands**
- MCP: https://code.claude.com/docs/en/agent-sdk/mcp
- Permissions: https://code.claude.com/docs/en/agent-sdk/permissions
- Hooks: https://code.claude.com/docs/en/agent-sdk/hooks
- Sessions: https://code.claude.com/docs/en/agent-sdk/sessions
- Observability (OTEL): https://code.claude.com/docs/en/agent-sdk/observability
- Inventaris kode sumber: `packages/convex/convex/agent/` (runtime, research, sandbox, hitl, skills, context, providers)
