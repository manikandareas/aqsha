# Aqsha V2 — Phase 6 Plan: Astra chat via eve (detailed)

> Rencana implementasi rinci untuk **Fase 6** ([06-implementation-phases.md](06-implementation-phases.md) §Fase 6). Dokumen ini **menggantikan** keputusan MCP-bridge di `00-06` (lihat §9). Ditulis setelah audit first-hand terhadap **eve v0.11.6** (source di `~/.agents/skills/eve/packages/eve/src`) + audit codebase P0–P5 yang sudah dibangun. Tiap slice: **testable + runnable + uiVisible** (vertical tracer-bullet: drizzle → repo → service → eve/route → web-v2).

---

## 1. Keputusan owner (2026-06-21) — mengubah desain docs/v2

| #       | Keputusan                                                                                            | Implikasi                                                                                                                                                                                                                                         |
| ------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D-A** | **Data tools = `defineTool` in-process** (DROP Aqsha MCP server + connections `aqsha`/`aqsha_write`) | Agent eve import `@aqsha/services` langsung (server-side, sah). Tanpa HTTP hop, tanpa MCP Streamable-HTTP transport, tanpa surface auth ke-4. Ownership tetap di service layer. Approval pakai `needsApproval` per-tool (bukan connection-level). |
| **D-B** | **Lite dulu, Pro "segera"**                                                                          | P6 ship **satu** agent eve (model statis Sonnet 4.6 = Lite). Selector Lite/Pro tetap tampil (UI sama V1) dengan Pro locked. Plumbing billing (`agentKind`/`featureForUsage`) sudah ada → diaktifkan saat agent root Pro landing.                  |
| **D-C** | **Composer dipecah jadi slice**                                                                      | Inti chat dulu (composer textarea + send/stream/HITL/cancel/retry + thread CRUD), lalu slice rich token-editor / `/slash` / `@context` / attachment.                                                                                              |

> **Alasan D-A (bukti first-hand eve):** eve men-scope `connections` untuk "server yang **bukan** kamu tulis" (`docs/connections.mdx:6`); MCP client butuh server bicara **MCP Streamable HTTP/SSE** sungguhan (`mcp.ts:27`), `getToken` jalan **per tool-call** (`connections/types.ts`), dan `principalType:"user"` gagal `principal_required` bila session tak ber-principal. Sementara proses eve **toh** sudah jalan in-process dengan `@aqsha/services` (untuk gate billing + hook proyeksi PG), jadi authoring data tool sebagai `defineTool` jauh lebih simpel. Audit eve sendiri merekomendasikan in-process untuk tool yang kamu author. **Boundary "reusable MCP" dikorbankan demi kesederhanaan** — bisa ditambahkan belakangan bila benar perlu klien MCP eksternal.

---

## 2. Ground truth eve v0.11.6 (koreksi terhadap asumsi docs/v2)

Diverifikasi langsung terhadap `~/.agents/skills/eve/packages/eve/src`. **Wajib re-verify terhadap `node_modules/eve` saat install** (Slice 6.0).

### 2.1 Topologi runtime — eve = **proses terpisah**

- `withEve(nextConfig, opts?)` (`public/next/index.ts:251`) **bukan** mount in-process; ia menyuntik **Next rewrites** yang mem-proxy route protokol eve ke proses eve: dev → spawn `eve dev --no-ui --port 0`; prod → `eve start` di `EVE_NEXT_PRODUCTION_ORIGIN`/port `4274`.
- `eveRoot` = **direktori app yang memuat `agent/`**, default `process.cwd()`. **JANGAN** set `'agent/'` (→ `agent/agent/...`). Untuk kita: omit (agent/ di root web-v2).
- **Channel eve (`/eve/v1/session…`) di-host proses eve, BUKAN api-v2.** Stream chat **tidak** lewat api-v2. Client `useEveAgent` bicara ke origin web-v2 → di-proxy `withEve` → proses eve.
- **Konsekuensi:** proses eve adalah deployable Node baru (seperti `apps/agents` dulu) yang **depend `@aqsha/services` + `@aqsha/db`**. Single replica (durability `.workflow-data` file-backed).

### 2.2 Client hook `useEveAgent` (`eve/react`)

- Helpers HANYA: `send`, `stop`, `reset` (`use-eve-agent.ts:38-45`). **TIDAK ADA** `respond/start/continue/cancel`.
- Snapshot: `{ data, error, events, session, status }`; `status ∈ "ready"|"submitted"|"streaming"|"error"` (`eve-agent-store.ts:15,30-36`).
- New/continue turn: `send({ message })`. Cancel: `stop()`. Reset percakapan: `reset()`.
- **HITL dijawab HANYA** `send({ inputResponses: [{ requestId, optionId?, text? }] })` (`runtime/input/types.ts:70-76`). `send({message})` setelah park = **turn baru**, TIDAK resolve.
- Session cursor **flat** `SessionState { continuationToken?, sessionId?, streamIndex(required) }` (`client/types.ts:388-392`). Persist `snapshot.session` via `onSessionChange`/`initialSession`.
- Multi-turn durable + sandbox dipertahankan lintas `session.completed` butuh `new Client({ preserveCompletedSessions: true })` di-inject via opsi `session` (default `false`, dan **bukan** opsi hook).

### 2.3 Stream `HandleMessageStreamEvent` (bukan `EveStreamFrame`)

`protocol/message.ts:524-554`. Diskriminan `type`, payload di `event.data.*`. 27 varian; yang dipakai activity VM:
| `type` | payload kunci |
|---|---|
| `message.appended` | `data.messageDelta`, `data.messageSoFar` |
| `message.completed` | `data.message: string \| null` (null ⇒ tutup text part), `data.finishReason` |
| `reasoning.appended` / `reasoning.completed` | `data.reasoningDelta` / `data.reasoning` |
| `actions.requested` | `data.actions[]` (= tool call) |
| `action.result` | `data.result` (= tool result), `data.status`, `data.error?`; key by `result.callId` |
| `input.requested` | `data.requests: InputRequest[]` (**array**) |
| `subagent.called/started/event/completed` | `data.childSessionId`, `data.name`, nested `subagent.event.data.event` |
| `step.started/completed/failed` | `step.completed.data.usage {inputTokens,outputTokens,cacheRead/Write}` |
| `turn.started/completed/failed`, `session.started/waiting/failed/completed` | progres turn/session |
| `result.completed` | `data.result: JsonValue` (output task-mode/subagent) |

- Parked HITL: **scan semua message parts** untuk `state === "approval-requested"` (`message-reducer.ts:140-162`); request ada di `part.toolMetadata.eve.inputRequest { prompt, options[].id, requestId, display, allowFreeform }`. **Map `option.id → optionId`.**

### 2.4 Tools & approval (in-process)

- `defineTool` (`public/definitions/tool.ts:91-130`): `{ execute(input, ctx), inputSchema, outputSchema?, needsApproval?, ... }`. Nama tool = **path-derived** (`agent/tools/save_url.ts` ⇒ `save_url`). `ctx.getSandbox()` tersedia (`callback-context.ts:31`).
- Approval helpers: `always()`, `never()`, `once()` (`tools/approval/`). `needsApproval: once()` ⇒ pause durable session, resume via `inputResponses`.
- Built-in tools (10, disable-able): `ask_question, bash, glob, grep, read_file, write_file, todo, web_fetch, web_search, load_skill` (`framework-tools/index.ts:20-31`). `agent` (subagent) & `connection_search` **bukan** di registry (tak bisa di-`disableTool`). **`web_search.execute` default melempar** (provider-injected) → override `agent/tools/web_search.ts` atau disable & pakai tool riset authored.

### 2.5 Channel auth + ownership

- `eveChannel({ auth: AuthFn|AuthFn[], onMessage?, uploadPolicy?, events? })` (`channels/eve.ts:84-125`). `AuthFn(request) → SessionAuthContext|null` (`channels/auth.ts:485`).
- `SessionAuthContext { principalId, principalType, attributes, authenticator, issuer?, subject? }` (`channel/types.ts:61-67`). **TIDAK ADA** `clerkAuthFn`/`ownershipAuthFn` (0 hits). Faktori built-in: `localDev/vercelOidc/httpBasic/jwtHmac/jwtEcdsa/oidc/none/placeholderAuth`.
- **Route-auth TIDAK menegakkan ownership session** (`docs/guides/auth-and-route-protection.md:219-221`). Tegakkan di **`onMessage(ctx, message)`**: `ctx.eve = { caller: SessionAuthContext|null, request, sessionId? }` (`channels/eve.ts:47-53`) → cocokkan `ctx.eve.sessionId`↔thread↔owner di PG; reject bila `caller.principalId != owner`. **Drop `vercelOidc()`** (self-host); `localDev()` non-prod saja.

### 2.6 Durability & hooks

- Workflow SDK; state `.workflow-data` file-backed ⇒ **single replica**. **Completed steps tak re-run; step yang ter-interrupt RE-RUN** → side-effect (`consumeCredits`) **WAJIB idempotent** (key `sessionId:turnId:stepIndex`).
- Hooks `defineHook` **observe-only**, jalan **setelah** event durably-recorded (`hook.ts:29,50-52`) — **tak bisa deny tool**. Gate biaya/irreversible lewat `needsApproval`, bukan hook.

### 2.7 Model statis (alasan D-B)

- `agent.ts` export `model?: LanguageModel` **statis** (`shared/agent-definition.ts:48,85`); `SendTurnPayload` tanpa field model. **Tidak ada tier per-turn.** Lite/Pro = agent root berbeda (Pro = slice/phase lanjutan).

---

## 3. Arsitektur Phase 6 (pasca keputusan)

```
        Browser (web-v2)
        ├─ useEveAgent()  ──proxy withEve──▶  PROSES eve  (eve start, single replica, .workflow-data)
        │   (live turn: stream NDJSON)            │  agent/ dir: agent.ts · instructions.md
        │                                         │  channels/eve.ts (Clerk AuthFn + onMessage gate+ownership)
        │                                         │  tools/* (defineTool, import @aqsha/services)
        │                                         │  hooks/* (observe-only → proyeksi PG + consumeCredits)
        └─ useApi() (Eden) ─────▶ api-v2          ▼
            (history, thread CRUD,        @aqsha/services  ──▶  @aqsha/db (Postgres+pgvector)  ◀── proses eve juga
             send-status, commands)       (ThreadService, SendQuotaService, BillingService,
                                            ArtifactService, RagService, ResearchService, CitationService …)
```

**Tiga sumber state di UI** (di-join hanya oleh `threadId`):

1. **Live turn** → `useEveAgent` (stream eve, ephemeral, BUKAN TanStack).
2. **History persisted + thread metadata + send-status** → Eden+TanStack (`features/threads/api.ts`).
3. **Seam:** saat turn selesai → `qc.invalidateQueries(queryKeys.threads.messages(threadId))` agar turn yang baru ter-proyeksi masuk ke history TanStack, buffer live di-clear.

**Gate billing (rekonsiliasi penting):** karena `send` langsung ke channel eve (bukan api-v2), gate berlapis:

- **Pre-check (UX ramah):** composer panggil Eden `GET /send-status` (rate-limit + entitlement preview non-consuming via `BillingService.requireEntitlement`). Blok → tampil notice (return-union), **tak** `send`.
- **Backstop (otoritatif):** `onMessage` panggil `SendQuotaService.check` → reject turn bila blok.
- **Debit aktual:** hook `step.completed` → `BillingService.consumeCredits({ feature:"normal_chat", agentKind:"lite", idempotencyKey:`${sessionId}:${turnId}:${stepIndex}`, inputTokens, outputTokens, threadId })`. Idempoten saat crash-resume (A9 sudah ada di `ConsumeCreditsArgs`).

---

## 4. Gap list (yang HARUS dibangun P6 — diverifikasi belum ada)

**DB (migration mulai `0007`; PK = bare `crypto.randomUUID()`, bigint epoch-ms, text+CHECK, owner FK):**

- `chat_threads` (id, ownerUserId FK, `eve_session_id` text unique nullable, status/agentKind/titleStatus CHECK, title, lastActivityAt, created/updated; idx `by_owner_activity`).
- `chat_messages` (id, threadId FK, ownerUserId, role/status CHECK, text, reasoning, seq, created; idx `by_thread_created`).
- `agent_runs` (id, threadId FK, ownerUserId, status CHECK, mode/agentKind, eveTurnId, usage_json/verification_report_json jsonb, created/updated; idx `by_status_updated`).
- `agent_run_events` (id, runId FK, seq unique(run,seq), segment, type, payload_json jsonb; idx by run+segment).
- `pending_interactions` (id, threadId/runId FK, ownerUserId, type/status CHECK, `eve_request_id` text, payload/response jsonb, created).
- `research_sources` (id, threadId/runId FK, ownerUserId, url, title, provider, discoveryQuery, metadata jsonb).
- Pertimbangkan FK `artifacts.threadId → chat_threads` di 0007 (kolom + idx sudah ada, masih bare text).

**Repos (`packages/db/src/repositories/`, daftar di index):** `chatThreadRepo`, `chatMessageRepo`, `agentRunRepo`, `agentRunEventRepo`, `pendingInteractionRepo`, `researchSourceRepo`, **+ `artifactEmbeddingRepo.searchSimilar`** (ANN HNSW cosine — belum ada) **+ `artifactRepo.listByThread`**.

**Services (`packages/services/src/`):** `ThreadService`, `MessageService`, `RunService`, `HitlService`, `ContextService` (hidrasi @mention cap 8/30 + filter RAG), `SendQuotaService`, `ResearchService`, `CitationService` (port best-practice dari V1 `apps/agents`). **+ RAG read path** `RagService.searchThreadDocuments` (belum ada) **+ `ArtifactService.applyAgentAction`/`linkToWorkspace`/thread-attachment presign+finalize** (belum ada — hanya disebut di komentar).

> Nama asli yang sudah ada: `WorkspaceService.ensureDefaultWorkspaceForOwner`, `assertWorkspaceOwner` (BUKAN `ensureDefaultWorkspace`/`assertOwner`). `BillingService.consumeCredits(db, args)` & `requireEntitlement` sudah siap (return-union + `idempotencyKey`).

**Clients:** `llm.ts` (Claude chat untuk TitleService — **belum ada**, cuma `embeddings.ts`). Queue di `packages/services/src/clients/queue.ts` (`enqueue`/`registerRepeatable`) — tambah queue `thread-title`.

**api-v2 routes:** `routes/threads.ts` (list/get/history/create/rename/delete + `/threads/:id/artifacts` + `/threads/:id/sources` + `/threads/:id/pending-interactions`), `routes/commands.ts` (`GET /commands`), `GET /send-status`. Rate rule baru `"chat:send"` di `lib/rate-limits.ts`. Mount di `src/index.ts`. **Tidak ada `routes/mcp.ts`** (D-A).

**web-v2:** `features/threads/` (api.ts Eden + lib/use-eve-agent.ts + components port dari V1). Tambah primitive **ai-elements** (`Conversation/Message/PromptInput/Reasoning`) + `Textarea`/`ScrollArea` + ikon chat (`SendIcon/StopCircleIcon/SparklesIcon`) ke `@aqsha/ui`. Port view-model adapters pure dari V1 `@aqsha/agent-contracts` ke lokasi V2 (jangan import paket V1).

**Agent dir (`apps/web-v2/agent/`):** `agent.ts`, `instructions.md`, `channels/eve.ts`, `tools/*`, `hooks/*`. (Tanpa `connections/` per D-A; tanpa `subagents/`/`skills/`/`sandbox/` — itu P7.)

---

## 5. Slices (urut dependensi; tiap slice shippable)

### Slice 6.0 — Install eve + verifikasi API + spike "hello Astra" 🔬

**Tujuan:** de-risk seluruh fase (risiko terbesar = realitas API eve).

- Tambah `eve` ke `apps/web-v2/package.json`; `withEve` di `next.config.ts` (omit `eveRoot`). Script `eve dev`/`eve build`.
- `agent/agent.ts` (model `anthropic/claude-sonnet-4.6`), `agent/instructions.md`, `agent/channels/eve.ts` (auth sementara `[localDev(), none()]`).
- Halaman buang `/app/threads/_spike` pakai `useEveAgent` → kirim "hello" → render `message.appended` delta.
- **Re-verify** API terinstal vs `node_modules/eve` (cocokkan 0.11.6 + ground truth §2). Catat drift apa pun.
- **testable:** `eve build` hijau; satu turn streaming delta; `.workflow-data` terbentuk; typecheck.
- **uiVisible:** ketik → Astra streaming balasan (belum persist).

### Slice 6.1 — Clerk channel auth + ownership + persistensi thread

**Tujuan:** turn ter-persist + aman per-user.

- DB 0007: `chat_threads` + `chat_messages` (+ repos). Services `ThreadService` (create/get/list/rename/delete/`assertOwner`/`bindEveSession`), `MessageService`.
- `agent/channels/eve.ts`: **Clerk AuthFn** custom (verify JWT via `@clerk/backend` `verifyToken`, reuse `clients/clerkToken` pattern) → `SessionAuthContext{ principalId: clerkUserId, principalType:"user" }`. `onMessage`: resolve/buat thread terikat `caller` + `sessionId`, enforce ownership (reject mismatch).
- `agent/hooks/projection.ts` (observe-only): `message.received`→user msg, `message.completed`→assistant msg, `turn.*`→lastActivity.
- api-v2 `routes/threads.ts` (reads + non-stream writes). web-v2 `features/threads/api.ts` (Eden list/detail/history/create/rename/delete), `lib/use-eve-agent.ts` (inject Clerk token), `thread-shell.tsx` minimal (history TanStack + live eve; invalidate on finish), route `/app/threads/[id]` + `/app`.
- **testable:** turn persist thread+msg; ownership tolak cross-user (`principalId != owner`); reload tampil history; channel tolak non-Clerk.
- **uiVisible:** kirim → streaming + persist; reload → history; switch/delete thread.

### Slice 6.2 — Gate billing + send-status + rate-limit + debit per-step

**Tujuan:** tiap run di-gate kredit + cooldown (parity send-quota V1).

- `lib/rate-limits.ts` + rule `"chat:send"`. `SendQuotaService.check` (preview `requireEntitlement` + rate-limit Redis) + `getSendStatus`. api-v2 `GET /send-status`.
- `agent/channels/eve.ts onMessage`: backstop `SendQuotaService.check` (reject bila blok). `agent/hooks/`: `step.completed`→`consumeCredits` (idempotencyKey `sessionId:turnId:stepIndex`, `feature normal_chat`, usage dari `data.usage`); proyeksi `agent_runs`+`agent_run_events`.
- web-v2 composer: baca send-status (countdown cooldown), notice blok billing (return-union).
- **testable:** `consumeCredits` sekali/step + idempoten saat resume (no double-debit); 429 cooldown; blok return-union ter-surface.
- **uiVisible:** kredit turun per turn (Settings); cooldown; notice blok.

### Slice 6.3 — Activity timeline: reasoning + tool + ordered parts (parity UI)

**Tujuan:** tampilan streaming identik V1 (timeline collapsible reasoning/tool).

- Port adapter pure (`ActivityEvent`/`OrderedPart`/`uiRunFromRow`/`buildTurnParts`) dari V1 `@aqsha/agent-contracts` → lokasi V2 (mis. `apps/web-v2/features/threads/lib/` atau paket baru `@aqsha/agent-ui`). **Re-feed input dari `HandleMessageStreamEvent`** (map frame → ActivityEvent/OrderedPart; impose per-`callId` barrier untuk urutan, lihat memory [[sdk-stream-eager-ordering]]).
- Hook: `agent_run_events` (tiap event → seq/segment) agar activity bisa direkonstruksi saat reload.
- web-v2: port `AssistantTurn`, `run-progress`, `tool-row`, `reasoning-block`, `RunHeader` (auto-open saat aktif, auto-collapse settle). **Smooth-text in-house** (ganti `@convex-dev/agent/react useSmoothText`). Tambah primitive **ai-elements** ke web-v2/`@aqsha/ui`.
- **testable:** urutan dari frame eve; collapsible; reload rekonstruksi dari `agent_run_events`.
- **uiVisible:** reasoning + tool call streaming di timeline collapsible terurut seperti V1.

### Slice 6.4 — Data tools READ (in-process) + RAG read path

**Tujuan:** Astra menjawab dengan riset + dokumen thread.

- RAG read: `artifactEmbeddingRepo.searchSimilar` (ANN HNSW cosine) + `RagService.searchThreadDocuments` (embed query → repo).
- `agent/tools/` (read, tanpa approval): `list_artifacts`, `get_artifact`, `get_render_payload`, `search_thread_documents`, `list_workspaces`, paper/explore lookup, feed reads, `search_web`/`search_arxiv`/`lookup_doi` (`ResearchService` + pacer/TTL cache + `consumeCredits external_search`), `verify_citations`/`verify_identifiers` (`CitationService`). `disableTool('bash'|'write_file'|'glob'|'grep')`; override/disable `web_search`/`web_fetch`.
- Services `ResearchService`+`CitationService` (port best-practice dari V1 `apps/agents`, persist `research_sources`).
- **testable:** tool callable; ownership di service; riset persist `research_sources` + pacer/cache; `consumeCredits external_search`.
- **uiVisible:** Astra jawab pakai search web/arxiv/doi + dokumen thread; panel Sources.

### Slice 6.5 — Data tools WRITE + HITL approval (in-process) + artifact cards

**Tujuan:** propose/execute artifact + askUser + approval + Save-to-workspace.

- `agent/tools/` (write, `needsApproval`): `save_url`, `propose_artifact`, `execute_artifact` (**invariant** execute butuh propose ter-approve, di kode `execute()`), `create_workspace`, `rename_workspace`, `link_to_workspace`, `delete_artifact`. Services `ArtifactService.applyAgentAction` (born-headless) + `linkToWorkspace`.
- HITL: `ask_question` (built-in) + `needsApproval` → client baca `input.requested`/parts `approval-requested` → jawab `send({inputResponses})`. Proyeksi `pending_interactions` (+ simpan `eve_request_id`). `HitlService` mapping.
- web-v2: port HITL cards (`HitlQuestionCard`/`HitlPlanReviewCard`/`HitlConfirmCard`/`AskUserCard`), `chat-artifact-card` (+ FolderIcon Save-to-workspace via `linkToWorkspace`), `use-hitl-resume` → `inputResponses`. Jawaban = **user bubble nyata** (conversational, composer tetap terbuka).
- **testable:** approval pause durable + resume; invariant execute; jawab HITL materialisasi user msg + resume; idempoten.
- **uiVisible:** Astra tanya → jawab inline; propose artifact → approve → card muncul → link ke workspace; delete-confirm.

### Slice 6.6 — Rich composer: token editor + `/slash` + `@context`

**Tujuan:** parity composer penuh (D-C).

- Pindahkan SSOT `promptCommands` keluar `packages/convex` (pure TS) → lokasi V2 shared (dipakai client + agent).
- Port `TokenizedPromptInput`, `SlashCommandPalette`, `ContextMentionPalette`, `ComposerMentionsProvider`. `resolveCommandDispatch` client-side.
- `ContextService.hydrate` (cap 8 artifacts / 30 ws) + pin konteks ride `send({clientContext})`/`contextIds`; `search_thread_documents` filter `workspaceIds` pinned.
- `composer-agent-selector` (Lite/Pro, Pro **locked** → `/app/settings/usage-billing`) baca billing V2.
- **testable:** slash expand; mention pin + caps; konteks hidrasi; selector gating.
- **uiVisible:** composer identik V1 (chips/palettes/selector).

### Slice 6.7 — Attachment headless + thread artifacts

**Tujuan:** attach file di chat.

- `ArtifactService`: thread-scoped presign + finalize (`workspaceId=null`, `threadId`), `artifactRepo.listByThread`. api-v2 `POST /threads/:id/attachments/upload-url` + finalize, `GET /threads/:id/artifacts`.
- web-v2 composer: chip attachment (presign→PUT→finalize), prompt sintetik bila kosong.
- **testable:** upload headless; `workspaceId=null` (gotcha [[chat-attachment-workspaceid-null]]); promote `linkToWorkspace`.
- **uiVisible:** attach PDF di chat → Astra pakai.

### Slice 6.8 — Title gen + thread switcher + cancel/retry + commands + polish

**Tujuan:** lengkapi parity & polish.

- `clients/llm.ts` (Claude) + `TitleService` (BullMQ `thread-title`, `generateObject`). Cancel (`stop`, Escape) + retry (no re-charge). `ThreadRecentSwitcher` (4 recent). Guard `reply_in_progress`. Draft restore on failure. `routes/commands.ts` `GET /commands`.
- **testable:** title async; cancel sticky; retry tanpa re-charge; commands palette.
- **uiVisible:** judul muncul; switcher; cancel/retry; palette.

> **Catatan scope:** `/deep` + subagents + sandbox verifikasi statistik = **Fase 7** (di luar P6). Tapi `agent/` blueprint (agent.ts/channels/tools/hooks) P6 sudah jadi fondasi tempat P7 menambah `subagents/`+`skills/`+`sandbox/`.

---

## 6. Deployment & dev shape (untuk P6 dev; full prod di P10)

- **Dev:** `bun run dev:web-v2` (Next + `withEve` spawn `eve dev`), `bun run dev:api`, workers. `.workflow-data` lokal gitignored. `DATABASE_URL`/`REDIS_URL` → Tailscale VPS.
- **Env baru:** `ANTHROPIC_API_KEY` (atau gateway `ANTHROPIC_BASE_URL`+`ANTHROPIC_AUTH_TOKEN`), `EVE_*` (data dir), provider riset (Exa/Jina/Crossref opsional). Clerk JWT verify reuse `CLERK_SECRET_KEY`.
- **Prod (P10):** `eve build` lalu `eve start` sebagai proses managed **single replica** (volume `.workflow-data` + backup); web-v2 proxy via `withEve` (`EVE_NEXT_PRODUCTION_ORIGIN`). Nginx stream-safe di `aqshara.com` (`proxy_buffering off`, `read_timeout 3600s`, `http_version 1.1`, `Connection ''`).

## 7. Test strategy

- **Service** (unit, repo fake): `SendQuotaService.check` return-union; `ContextService` cap; `RagService.searchThreadDocuments`; invariant `execute_artifact`; idempotency `consumeCredits` (resume tak double-debit).
- **eve integration:** turn normal persist threads/messages/runs/events (hook scrub secret) + finalize + `consumeCredits` sekali + `stop()` sticky + retry tanpa re-charge; HITL `inputResponses` resume; approval pause/resume; ownership `onMessage` tolak mismatch; channel tolak non-Clerk.
- **e2e:** kirim→answer+activity; jawab HITL lanjut; approve artifact; attach PDF; `stop()`; rate-limit cooldown; delete thread.
- **gate:** `eve build` hijau; typecheck semua workspace; resume dari `.workflow-data` pasca-crash (BullMQ stalled-job untuk job non-agent).

## 8. Risiko & open items

- **eve beta** — re-verify API saat install (Slice 6.0); pin versi.
- **Single-node durability** — `.workflow-data` file-backed; tanpa autoscaling proses eve; backup terjadwal.
- **Port view-model adapters & ai-elements** dari V1 — pastikan tetap pure; jangan import paket V1.
- **Smooth-text** in-house (ganti `@convex-dev/agent`).
- **`estimateProviderCostCents`** masih pricing OpenAI/`gpt-5.5` — retune ke Claude (observability-only, non-blocking; P6/P9).
- **Subagent `agent_id`** — saat P7, konfirmasi eve emit id subagent stabil (`subagent.called.data.childSessionId`) untuk one-card summary + detail panel.

## 9. Rekonsiliasi dokumen (yang berubah dari 00–06 karena D-A)

Plan ini **menggantikan** bagian MCP-bridge:

- **DROP**: Aqsha MCP server (`POST /mcp`), `routes/mcp.ts`, connections `agent/connections/aqsha*.ts`, `defineMcpClientConnection`, connection-level approval, "caller ke-4", "auth surface ke-4", trade-off HTTP hop (B1/B2/B6/B7 di `00`/`02`/`04`).
- **GANTI**: data tools = `defineTool` in-process (import `@aqsha/services`); approval = `needsApproval` per-tool; provider riset = `ResearchService` in-process (pacer/cache tetap server-side, dipanggil tool). `connection__aqsha__*` / `connection__search` → nama tool path-derived langsung.
- **TETAP**: split persistence (Elysia proyeksi + eve runtime), eve sebagai **proses terpisah** (koreksi: bukan "mounted in-process"), gate `consumeCredits` per-step idempoten, hooks observe-only, `/deep` model-driven (P7) — tapi research/citation jadi tool in-process, bukan MCP.
- **Action:** update `00-overview.md` §3/§11, `02-api-domains.md` Domain 7, `03-architecture.md` (eve = proses terpisah + drop connections), `04-service-layer.md` (drop "caller ke-4 MCP"; agent = in-process service caller untuk tools authored), `06-implementation-phases.md` Fase 6 (+koreksi API eve §2).
