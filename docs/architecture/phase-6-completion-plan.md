# Aqsha V2 — Phase 6 Completion Plan (Slices 6.2 → 6.8 + 6.9 test)

> Lanjutan **eksekusi** dari [phase-6-plan.md](phase-6-plan.md). Slice **6.0** (install eve + spike) dan **6.1** (Clerk auth + ownership + persistensi thread) **SUDAH selesai + committed** di `development`. Dokumen ini merencanakan sisa fase: **6.2 → 6.8**, plus **6.9** (testing terpusat di akhir, sesuai keputusan owner).
>
> Ditulis setelah grounding first-hand (8 probe paralel) terhadap: eve@0.11.6 terinstal, agent/ hasil 6.1, services/db/api-v2/web-v2 V2 saat ini, dan source V1 yang akan di-port (`apps/agents`, `packages/agent-contracts`, `packages/convex`). **Plan ini mengoreksi premis arsitektural utama plan lama** (lihat §2).

---

## 0. Status & ruang lingkup

| Slice | Status | Isi |
|---|---|---|
| 6.0 | ✅ done+committed | eve install, withEve, agent.ts (model OpenAI), spike |
| 6.1 | ✅ done+committed | Clerk channel auth, onMessage ownership, `chat_threads`/`chat_messages` (mig 0007), projection hook, web threads CRUD |
| **6.2** | ⬜ plan | **bundle-enable services** + billing gate + send-status + rate-limit + debit per-step |
| **6.3** | ⬜ plan | activity timeline (reasoning + tool, **live-only**) |
| **6.4** | ⬜ plan | data tools READ (in-process) + RAG read path + research (Jina) |
| **6.5** | ⬜ plan | data tools WRITE + HITL approval + artifact cards |
| **6.6** | ⬜ plan | rich composer: token editor + `/slash` + `@context` |
| **6.7** | ✅ done | thread attachment headless (commit pending owner) |
| **6.8** | ✅ done (uncommitted) | title gen async + continue-thread live + recent switcher + cancel/retry + infinite-scroll (commands route SKIP) |
| **6.9** | ✅ done (uncommitted) | **testing terpusat** — service-unit + DB-itest + manual checklist (owner scope); gate akhir hijau |

**Testing:** per keputusan owner, **TIDAK** ada test per-slice. Gate tiap slice 6.2–6.8 = `eve build` hijau + `bun run typecheck` (semua workspace) + `bun run lint` (web-v2) + smoke manual opsional. Seluruh unit/integration/e2e dikerjakan di **Slice 6.9** setelah fitur lengkap.

---

## 1. Keputusan owner (2026-06-21, sesi completion)

| # | Keputusan | Implikasi |
|---|---|---|
| **D-E** | **Build-step only** untuk akses service dari eve (BUKAN raw-SQL, BUKAN HTTP hop). | `@aqsha/services` + `@aqsha/db` dapat **dist build** + di-`externalDependencies` → proses eve `import` kode service **asli in-process**. Satu SSOT, nol duplikasi. Risiko bundle dimitigasi dengan externalize (lihat §2). |
| **D-F** | **Timeline live-only** (6.3). | Turn berjalan tampil reasoning+tool dari stream eve; **reload history = teks+reasoning saja** (sudah dipersist 6.1). **TIDAK** ada tabel `agent_run_events`, **tidak** ada `agent_runs`. |
| **D-G** | **Search = Jina-only** (6.4). | `searchWeb` → Jina Search; drop Exa (konsisten dgn Explore revamp). Tanpa `EXA_API_KEY`. |
| **D-H** | **Citation verify ditunda ke P7** (bareng `/deep`). | 6.4 = read tools + `search_web`/`search_arxiv`/`lookup_doi` + RAG. `verifyCitations`/`verifyIdentifiers` + integrity engine = P7. |

Konsekuensi gabungan: **migrasi P6 cuma `0008` (`research_sources`)**. `agent_runs` / `agent_run_events` / `pending_interactions` semuanya **dibuang** dari P6 (HITL native eve + timeline live-only menghilangkan kebutuhannya).

---

## 2. Koreksi crux arsitektural (mengganti premis plan lama §3/§4)

**Plan lama salah:** menyebut "agent eve `import @aqsha/services` langsung" (D-A). Grounding membuktikan ini **mustahil sebagaimana adanya**:

- **Proses eve jalan di NODE v25** (`eve dev/start` spawn lewat `process.execPath`), **bukan** bun. (api-v2 jalan di bun → impor raw-TS lancar; eve tidak.)
- **Terbukti empiris:** node v25 **gagal** resolve impor relatif tanpa ekstensi (`./a` → `ERR_MODULE_NOT_FOUND`; perlu `./a.ts`). `@aqsha/services` & `@aqsha/db` pakai impor relatif **tanpa ekstensi** di mana-mana → tak bisa di-`import` meski di-externalize.
- Kalau **di-inline** Rolldown (default eve untuk workspace pkg yang symlink ke `packages/*`), seluruh dep transitif (`drizzle-orm`, `bullmq`, `ioredis`, `@aws-sdk/*`, `@polar-sh/sdk`, `unpdf`, `mammoth`, `ai`) ikut masuk **tiap** bundle tool/hook (per-modul, di-cache by sha) → bloat + rebuild lambat.

**Resolusi (D-E) — build-step + externalize:**

1. **Dist build** untuk `@aqsha/db` + `@aqsha/services` (tsup atau `tsc`): emit **ESM ber-ekstensi `.js`** + **subpath exports granular** (`./chat`, `./billing`, `./rag`, `./artifact`, `./research`, `./quota`, dst.) supaya hanya irisan yang dipakai yang ter-resolve.
2. **Exports conditions** dual: `bun`/`default` → `./src/...` (api-v2 tetap baca raw TS), `import`/`node` → `./dist/...` (eve baca dist). eve resolver menghormati `conditionNames ['eve-source','workflow','node','import','default']`.
3. **`externalDependencies`** pada tiap `defineTool`/`defineHook`/`eveChannel`: `['@aqsha/services', '@aqsha/db']`. Karena di-external, Rolldown **tak mengikuti** ke dalamnya → dep transitif **tak** ikut bundle (mitigasi risiko bloat). Node resolve `@aqsha/services` → `package.json` exports → kondisi `node`/`import` → `dist/*.js` saat runtime (symlink `node_modules/@aqsha/services` ada karena workspace dep web-v2).
4. **Tambah** `@aqsha/services` + `@aqsha/db` ke `apps/web-v2/package.json` deps.
5. **Dev orchestration:** dist harus eksis sebelum `eve dev` spawn. Tambah `tsup --watch` (atau `tsc -w`) untuk services+db ke `bun run dev` (atau `predev`). Prod: build dist sebelum `eve build`.

**Spike wajib (de-risk, gaya 6.0):** task pertama 6.2 = impor `BillingService` dari sebuah `defineTool`/`defineHook` percobaan, jalankan `eve build`, **ukur** ukuran bundle + waktu rebuild. Bila externalize bekerja (bundle tetap kecil, dist ke-load runtime) → lanjut. Bila ada blocker tak terduga → eskalasi ke owner (bukan diam-diam fallback ke raw-SQL; D-E eksplisit no-fallback).

**Catatan konsolidasi (opsional, non-blocking):** setelah dist eksis, `apps/web-v2/agent/lib/store.ts` (raw-SQL hasil 6.1) **bisa** dikonsolidasi memanggil `ThreadService`/`MessageService` write methods (hapus duplikasi). **Tidak wajib di P6** (jangan churn kode 6.1 yang sudah jalan); catat sebagai follow-up code-organization. Kode baru 6.2+ **wajib** lewat `@aqsha/services` dist (bukan raw-SQL baru).

---

## 3. Koreksi ground-truth eve (drift dari plan lama §2 yang diverifikasi ulang)

Bake ke implementasi:

- **`useEveAgent` (eve/react):** helper HANYA `send` / `stop` / `reset`. HITL dijawab HANYA `send({ inputResponses: [{ requestId, optionId?, text? }] })`. `send({ message })` setelah park = **turn baru** (tidak resolve). `send({ clientContext })` = konteks ephemeral (TIDAK dipersist). Snapshot `{ data, error, events, session, status }`, `status ∈ ready|submitted|streaming|error`. `send()` **reject** bila turn sedang in-flight (= guard `reply_in_progress` gratis).
- **Resume lintas reload** (bila perlu): `initialSession: SessionState{ continuationToken?, sessionId?, streamIndex }` + `initialEvents`. **`preserveCompletedSessions` BUKAN** opsi hook (ada di `ClientOptions` low-level).
- **`ToolContext`** (di `execute`): **TIDAK ada** `ctx.caller`/`ctx.db`. Caller = `ctx.session.auth.current?.principalId ?? ctx.session.auth.initiator?.principalId`. Session id = **`ctx.session.id`**. `ctx.getSandbox()` **throw** kalau tak ada sandbox (P7).
- **`defineHook`** observe-only, jalan **setelah** event durably-recorded; throw → `turn.failed`. `step.completed.data = { finishReason, sequence, stepIndex, turnId, usage? }`; `usage?` + tiap field token **opsional** → default 0. **Tak ada** event usage agregat per-turn.
- **`onMessage`** ctx = `{ eve: { caller, request, sessionId? } }`. Return `{ auth, context? }` = terima; return `null` = **terima-tanpa-dispatch** (drop senyap ~204); `throw` = **HTTP 500 generic** (tak bisa map ke 403/429). ⇒ gate ramah-UX wajib di composer pre-check; backstop di onMessage = `return null` saat blok.
- **`defineTool`** nama = slug file (`agent/tools/save_url.ts` → `save_url`). `needsApproval` pakai helper dari `eve/tools/approval`: `always()`/`never()`/`once()`. `execute` boleh async + throw (→ `action.result` status `failed`). `disableTool()` default-export dari `agent/tools/<slug>.ts` untuk mematikan built-in. `web_search` built-in = stub yang **melempar** (provider-injected) → override file sendiri / disable.
- **Parts (client reducer):** `EveDynamicToolPart.state ∈ input-streaming | input-available | approval-requested | approval-responded | output-available | output-error | output-denied`. HITL ter-park = `state === 'approval-requested'`, prompt di `part.toolMetadata.eve.inputRequest { prompt, display: confirmation|select|text, options[{id,label,style}], allowFreeform, requestId }`. **Klasifikasi HITL by `state`/`toolMetadata.eve.kind`, BUKAN by hardcoded tool-name set** (set V1 obsolete).
- **Billing API (sudah ada, P6 = caller pertama):** `BillingService.consumeCredits(db: Db, args)` — `provider` & `ownerUserId` **WAJIB** (contoh plan lama yang skip keduanya = salah). Tak ada field `estimateCredits` di args (auto bila `credits` diomit). `requireEntitlement(db, { ownerUserId, ownerEmail?, feature, credits, requiredPlan? })` non-consuming (preview perlu `credits` eksplisit; pakai `1` floor). `EntitlementResult` fail reason **persis 3**: `quota_exceeded | subscription_required | billing_inactive` (tak ada reason "quota" terpisah). `estimateCredits`: `normal_chat = ceil(totalTokens/1500) min 1`; `external_search = flat 2`. `featureForUsage({agentKind:'lite'}) → 'normal_chat'`. provider untuk chat = `'openai'` (agent pakai `@ai-sdk/openai`).

---

## 4. Arsitektur final P6

```
        Browser (web-v2)
        ├─ useAstraAgent (useEveAgent) ──proxy withEve──▶  PROSES eve (node v25, single replica, .workflow-data)
        │   live turn: stream parts (text/reasoning/tool/HITL)   │  agent/agent.ts (model OpenAI Lite)
        │                                                        │  channels/eve.ts  (clerkAuth + onMessage: ownership + SendQuota backstop)
        │                                                        │  hooks/projection.ts (+ step.completed → consumeCredits)
        │                                                        │  tools/*.ts (defineTool; externalDeps @aqsha/services,@aqsha/db)
        └─ useApi (Eden) ───────▶ api-v2 (bun) ─────────────────┤
            history, CRUD, send-status,      ┌── import @aqsha/services (src, bun) ──┐
            attachments, commands, sources   ▼                                       ▼
                                    @aqsha/services ── @aqsha/db (Postgres+pgvector)
                                    (dist build: ./chat ./billing ./rag ./artifact   ◀── proses eve import dist (node)
                                     ./research ./quota) — SATU SSOT dua kondisi exports
```

**3 sumber state UI (join by `threadId`):** (1) live turn = `useAstraAgent` (stream, ephemeral); (2) history+metadata+send-status = Eden+TanStack `features/threads/api.ts`; (3) **seam:** `onFinish` → `qc.invalidateQueries(queryKeys.threads.messages(threadId))` **(BUG 6.1: saat ini cuma invalidate `threads.all`; 6.2 perbaiki)**.

**Gate billing 2-lapis:** pre-check ramah (`GET /send-status`, non-consuming `requireEntitlement` + cooldown) → composer blok tanpa send; backstop otoritatif (`SendQuotaService.check` di `onMessage` → `return null` drop); debit aktual (`hooks step.completed → consumeCredits`, idempotent).

---

## 5. Migrasi & repo/service baru (ringkas)

**Migrasi `0008`** (satu-satunya di P6): `research_sources` (id uuid, threadId FK→chat_threads, ownerUserId FK, turnId, citationNumber?, origin CHECK `web|arxiv|doi`, provider?, title, locator, url?, doi?, arxivId?, snippet, evidenceStrength CHECK `strong|medium|weak`, discoveryQuery?, createdAt bigint; idx `by_thread`). **Key by `threadId+turnId`** (V2 tak punya konsep `runId`). `artifacts.threadId` + 2 index **sudah ada** (no migration); FK `artifacts.threadId→chat_threads` opsional (tambah di 0008 bila mau).

**DB repos baru:** `researchSourceRepo` (insert idempotent, listByThread); `artifactEmbeddingRepo.searchSimilar` (ANN cosine `embedding <=> $vec` + HNSW yang sudah ada + ORDER BY/LIMIT, scope by ownerUserId + JOIN `artifacts.threadId`); `artifactRepo.listByThread` (index sudah ada).

**Services baru / extend:** `SendQuotaService` (baru, `@aqsha/services`); pindah registry rate-limit (`RATE_LIMIT_RULES`/`getRateLimiter`) dari `apps/api-v2/src/lib/rate-limits.ts` → `@aqsha/services` (rate-limiter-flexible+ioredis = npm compiled, bundle-safe) + rule `chat:send`; `RagService.searchThreadDocuments` (baru); `ResearchService` (baru, port Jina/arxiv/crossref/openalex dari `apps/agents`, reuse `papers/external-cache.ts` Redis + `papers/identifiers.ts` + `papers/http.ts`); `ArtifactService.applyAgentAction` (baru, born-headless `source:'agent'`, `workspaceId:null`, `threadId` set) + `ArtifactService.linkToWorkspace` (baru — **harus** method baru; `update()` tolak artifact `workspaceId=null` via `assertWorkspaceArtifact`; reuse `syncArtifactWorkspaceMove`) + thread-scoped presign/finalize.

**Pure pkg (bundle-safe, dipakai client + eve):** pindah `promptCommands` SSOT dari `packages/convex/convex/agent/prompt/promptCommands.ts` → `@aqsha/chat-core` (atau pkg pure baru). Adapter timeline V2 (`eveParts → presentation model`) juga taruh di sini / `features/threads/lib`.

---

## 6. Slices

> Pola tiap slice = vertical tracer-bullet: **db → service (dist) → eve(channel/hook/tool) / api-v2 route → web-v2**. Gate = build+typecheck+lint. Test → 6.9.

### Slice 6.2 — Bundle-enable services + billing gate + send-status + debit per-step
**Tujuan:** infrastruktur in-process service untuk eve + setiap turn di-gate kredit & cooldown + debit per-step idempotent.

1. **(Crux) Build-step + spike** — dist build `@aqsha/db` + `@aqsha/services` (tsup; ESM ber-ekstensi; subpath exports granular; conditions `bun/default`→src, `node/import`→dist). Tambah keduanya ke web-v2 deps. `externalDependencies:['@aqsha/services','@aqsha/db']` di channel/hook. **Spike:** impor `BillingService` dari hook percobaan → `eve build` → ukur bundle/rebuild. Tambah `tsup --watch` ke dev. **Gate keras**: bila spike gagal, STOP + eskalasi.
2. **Rate-limit pindah + rule** — relokasi `RATE_LIMIT_RULES`/`getRateLimiter` ke `@aqsha/services` (subpath `./quota`); update import api-v2; tambah rule `chat:send` (fixed-window points/duration).
3. **`SendQuotaService`** (`@aqsha/services`) — `check(db, {ownerUserId, ownerEmail?})` = `requireEntitlement(feature:'normal_chat', credits:1)` + `getRateLimiter('chat:send').get(ownerUserId)` cooldown → return-union `{ ok, reason?, retryAt? }`; `getSendStatus(...)` bentuk untuk UI.
4. **api-v2 `GET /threads/send-status`** — `authMacro` → `SendQuotaService.getSendStatus`. Mount di threads route.
5. **eve `onMessage` backstop** — panggil `SendQuotaService.check`; bila blok `return null` (drop; UX ramah sudah di pre-check). Tetap di belakang ownership check 6.1.
6. **eve hook `step.completed` → debit** — di `hooks/projection.ts` tambah handler: `BillingService.consumeCredits(getDb(), { ownerUserId: caller, feature:'normal_chat', provider:'openai', agentKind:'lite', threadId: ctx.session.id, inputTokens: usage?.inputTokens ?? 0, outputTokens: usage?.outputTokens ?? 0, idempotencyKey: \`${ctx.session.id}:${data.turnId}:${data.stepIndex}\` })`. Bungkus `swallow()` (jangan poison turn). Idempoten saat resume (A9).
7. **web-v2** — `useSendStatus()` + `queryKeys.threads.sendStatus()`; composer baca status (countdown `retryAt`, notice blok billing return-union 3 reason). **Fix seam:** `onFinish` invalidate `threads.messages(id)` (bukan cuma `threads.all`).

**Gate:** `eve build` hijau (dgn dist+externalize); typecheck semua ws; lint web-v2.
**uiVisible:** kredit turun per turn (Settings/usage), cooldown countdown, notice blok.

---

### Slice 6.3 — Activity timeline (reasoning + tool, live-only)
**Tujuan:** turn berjalan tampil parts terurut (reasoning + tool collapsible) seperti V1 — **live-only** (D-F).

1. **Adapter pure baru** `evePartsToTimeline(EveMessage[])` (di `@aqsha/chat-core`/`features/threads/lib`) → presentation model (`ToolRowModel`/`ReasoningBlockModel`/`OrderedPart`). **JANGAN** port `agent-contracts` `uiRunFromRow`/`activityEventsFromRun`/`orderedPartsFromRun` — itu Convex-event-shaped (mati di V2; eve `defaultMessageReducer` sudah menghasilkan `parts[]` ber-state). Map dari `EveDynamicToolPart` (toolName/state/input/output) + text/reasoning parts (`state: streaming|done`, `stepIndex`).
2. **Smooth-text in-house** — hook char-reveal kecil; **hapus** dependensi `@convex-dev/agent/react useSmoothText`.
3. **`useAstraAgent` expose `agent.events`/`agent.data.messages` parts** ke konsumen (saat ini drop semua kecuali text).
4. **web-v2** — ganti `message-list.tsx` flat `ChatBubble` (text-only) jadi renderer **per-part**; port shell UI V1 (`tool-row`, `reasoning-block`) + tambah primitive **ai-elements** (`Reasoning`/`Message`) ke web-v2/`@aqsha/ui`. **Tanpa** `RunHeader`/phase/subagent (deep/Pro-only → P7). Auto-open saat aktif, auto-collapse settle.
5. **History reload (ThreadView):** tetap teks+reasoning (sudah dipersist 6.1) — **tanpa** tool parts (live-only, D-F). Beri label/affordance bahwa detail tool live-only.

**Gate:** build+typecheck+lint. **uiVisible:** reasoning + tool call streaming di timeline collapsible terurut (live); reload = bubble+reasoning.

---

### Slice 6.4 — Data tools READ (in-process) + RAG read + research (Jina)
**Tujuan:** Astra menjawab pakai dokumen thread + riset web/arxiv/doi.

1. **RAG read** — `artifactEmbeddingRepo.searchSimilar(db, { ownerUserId, queryVector, threadId?|workspaceId?, limit })` (drizzle `sql` cosine `<=>`, HNSW sudah ada; scope thread via JOIN `artifacts.threadId` karena `artifact_embeddings` **tak** punya threadId). `RagService.searchThreadDocuments(db, { ownerUserId, threadId, query, limit })` = `embedTexts([query])[0]` → `searchSimilar`. Degrade graceful bila `!isEmbeddingEnabled()` (return empty).
2. **`ResearchService`** (`@aqsha/services/research`) — port dari `apps/agents/src/providers`: `searchWeb` **Jina-only** (D-G; `s.jina.ai` Bearer), `searchArxiv` (Atom; reuse parser ringan `papers/providers.ts` varian multi-entry), `lookupDoi` (Crossref), `searchOpenAlex`. **Reuse** `papers/external-cache.ts` (Redis TTL ready24h/empty1.5h/failed12m) **bukan** Map cache V1; reuse `papers/identifiers.ts` + `papers/http.ts`; tambah `similarity.ts` (belum ada di V2). Pacer arXiv per-proses (catat: multi-proses → pacing lebih lemah; akseptabel / Redis token-bucket = follow-up).
3. **migrasi 0008 `research_sources`** + `researchSourceRepo` (insert idempotent + listByThread).
4. **eve tools** (`agent/tools/`, READ, tanpa approval) — `search_thread_documents`, `search_web`, `search_arxiv`, `lookup_doi`, `list_artifacts`, `get_artifact`, `get_render_payload`, `list_workspaces`. Tiap tool `externalDependencies:['@aqsha/services','@aqsha/db']`, ambil caller dari `ctx.session.auth.current?.principalId`, db dari `@aqsha/db` `getDb()`. Search tools: persist `research_sources` (threadId+turnId) + `consumeCredits(feature:'external_search', provider:'jina_search'|'jina_read'|'crossref'|'openalex', credits auto=2, requiredPlan auto='free', idempotencyKey by callId)`. `disableTool('bash'|'write_file'|'glob'|'grep')`; override/disable `web_search`/`web_fetch`.
5. **api-v2 `GET /threads/:id/sources`** (panel Sources) + web hook + komponen panel.
6. **Citation tools = DITUNDA P7** (D-H).

**Gate:** build+typecheck+lint. **uiVisible:** Astra jawab pakai search + dokumen thread; panel Sources; kredit `external_search` turun.

---

### Slice 6.5 — Data tools WRITE + HITL approval + artifact cards
**Tujuan:** propose/execute artifact + askUser + approval + Save-to-workspace.

1. **`ArtifactService.applyAgentAction`** (baru) — born-headless insert (`source:'agent'`, `workspaceId:null`, `threadId` set; template = `createDocument` minus assert workspace; CHECK `source='agent'` sudah izinkan). **`ArtifactService.linkToWorkspace`** (baru, **wajib** method terpisah) — `assertWorkspaceOwner(requireActive)` + `assertLibraryCapacity` + patch parent `workspaceId/folderId` + `syncArtifactWorkspaceMove` (cascade 4 side-table; `setWorkspaceByArtifactIds` tanpa `now`).
2. **eve tools** (`agent/tools/`, WRITE, `needsApproval`) — `save_url`, `propose_artifact`, `execute_artifact` (**invariant** di `execute()`: butuh propose ter-approve), `create_workspace`, `rename_workspace`, `link_to_workspace`, `delete_artifact`. `needsApproval: once()`/`always()` dari `eve/tools/approval`. `ask_question` built-in untuk pertanyaan agen.
3. **HITL native eve** — client baca `part.state==='approval-requested'` + `toolMetadata.eve.inputRequest` → jawab `agent.send({ inputResponses:[{ requestId, optionId?, text? }] })`. **Jawaban = user bubble nyata**, composer tetap terbuka (memory [[hitl-conversational-redesign]]). **Tanpa** proyeksi `pending_interactions` (live-only; mid-park reload recovery = di luar P6).
4. **web-v2** — port HITL cards pure dari V1 (`hitl-question-card`/`hitl-plan-review-card`/`hitl-confirm-card`); **rewrite plumbing** (drop Convex `interactions.respond` + `HITL_CARD_TOOL_NAME_SET`; klasifikasi by `state`/`toolMetadata.eve.kind`; map ke `inputResponses`). `chat-artifact-card` re-plumb ke api-v2 (`features/artifacts`) + eve part metadata; FolderIcon Save-to-workspace via `link_to_workspace`/`linkToWorkspace`. Render card di loop parts (6.3).

**Gate:** build+typecheck+lint. **uiVisible:** Astra tanya→jawab inline; propose→approve→card→link workspace; delete-confirm.

---

### Slice 6.6 — Rich composer: token editor + `/slash` + `@context`
**Tujuan:** parity composer (D-C).

1. **Pindah SSOT** `promptCommands` → `@aqsha/chat-core` (pure). **Drop/disable `/deep`** (Lite-only; P7).
2. **Port pure** `TokenizedPromptInput` + `composer-inline-editor.ts` (DOM murni) + `SlashCommandPalette` + `ContextMentionPalette`. `resolveCommandDispatch` client-side → expand `buildPrompt()` jadi teks sebelum `agent.send({message})` (eve tak punya run-manager interception).
3. **`ContextService.hydrate`** (`@aqsha/services`, cap 8 artifacts / 30 ws) — `@mention` wire ke api-v2 Eden (`features/workspaces`/`features/artifacts`), **bukan** Convex. Pin konteks ride `send({ clientContext })` / `contextIds`; `search_thread_documents` filter `workspaceIds` pinned.
4. **`composer-agent-selector`** (Lite/Pro, Pro **locked** → `/app/settings/usage-billing`) baca billing V2 (`features/settings/api.ts`).
5. **Widen** `Composer.onSend` (string → `{ text, contextIds?, agentKind? }`).

**Gate:** build+typecheck+lint. **uiVisible:** chips/slash/mention palette + selector seperti V1.

---

### Slice 6.7 — Thread attachment headless ✅
**Tujuan:** attach file di chat. **DONE (uncommitted→committed), gates green, ZERO migration.**

1. **`ArtifactService.generateThreadUploadUrl`** (thin, reuse `StorageService.generateUploadTarget`) + **`finalizeThreadUpload`** (BORN-HEADLESS: `workspaceId:null`+`threadId`, `source:'upload'`, **NO** workspace assert, **NO** capacity gate; tetap `validateUpload` trust-boundary + `extractIndexAndPatch(workspaceId:null)` RAG index inline). Widen `extractIndexAndPatch` arg `workspaceId: string→string|null`. `listByThread`/`getForAgent` headless-tolerant **sudah ada** (6.4).
2. **api-v2** `POST /threads/:id/attachments/upload-url` (presign) + `POST /threads/:id/attachments` (finalize) + `GET /threads/:id/artifacts` (listByThread). Semua `auth:true` + `ThreadService.assertOwner` (gate THREAD ownership, bukan workspace).
3. **web-v2** — `useThreadAttachments` (presign→PUT→finalize) + `useThreadArtifacts`; `composer-attachments.tsx` (paperclip picker→progress→chip; promote per-chip via FolderIcon→`WorkspacePicker`→`useLinkArtifactToWorkspace` 6.5). Composer: synthetic prompt "Tolong baca berkas terlampir." bila teks kosong + catatan filename ephemeral `clientContext`. `threadId` prop dari `new-chat` (=sessionId).

**Agent baca attachment:** tool 6.4 `list_artifacts`/`search_thread_documents` filter `artifacts.threadId` via JOIN → headless (`workspaceId=null`) **tak** ter-exclude (gotcha [[chat-attachment-workspaceid-null]] dihindari).

**Constraint terpenuhi:** eve forbids client-mint session id (`ClientSession.send` tanpa sessionId→CREATE/server-mint; dgn sessionId→CONTINUE/harus eksis) → attach **disabled sampai thread eksis** (NewChat setelah turn pertama). Brand-new-first-msg attach = arsitektur-forced, tak didukung.

**Deviasi (owner sign-off pending sebelum commit):** (a) no first-msg attach (eve constraint); (b) **drop enqueue paper-enrichment** utk headless (worker mau `workspaceId:string`+scope ws; agen cuma butuh RAG text yg sudah ter-index; enrichment→promote-time); (c) **no attachmentIds di wire eve** (lampiran persist server-side dulu; agen nemu via thread-scope; cuma synthetic prompt+filename note); (d) **promote di chip composer** (clear saat send; re-promote dari panel thread-artifacts ditunda, `useThreadArtifacts` ready utk panel masa depan).

**Gate:** typecheck (10 ws) ✓; eve `eve:build` ✓; web-v2 lint ✓; react-doctor --staged 100/100 (8 file) ✓.

---

### Slice 6.8 — Title gen + continue-thread + switcher + cancel/retry + commands
**Tujuan:** lengkapi parity & polish.

1. **Title gen** — `clients/llm.ts` (provider OpenAI, konsisten dgn agent; `generateObject`) + `TitleService` (BullMQ queue `thread-title` via `clients/queue.ts`). Trigger: eve hook `turn.completed` (turn pertama) enqueue + claim `titleStatus='generating'`; worker (api-v2) generate → `ChatThreadRepo.update(title, titleStatus='ready')`. Hormati rename manual (sudah set `ready`).
2. **Continue-thread** (saat ini `ThreadView` stub "segera") — jadikan ThreadView surface live: `useAstraAgent({ initialSession:{ sessionId: threadId, streamIndex: 0 } })` → composer kirim follow-up (eve session durable). Cross-reload resume **in-flight** tetap deferred (known gap 6.1); ini hanya start turn baru di thread lama.
3. **Cancel** — `agent.stop()` ke tombol composer + Escape. **Retry** — restore draft saat `status==='error'`; resend = turn baru (turn gagal tanpa step.completed = tak ada debit → "no re-charge" terpenuhi natural).
4. **`ThreadRecentSwitcher`** (4 recent) + wire infinite-scroll sidebar (`fetchNextPage` belum tersambung).
5. **`routes/commands.ts` `GET /commands`** + palette.

**Gate:** build+typecheck+lint. **uiVisible:** judul async; lanjut thread lama; switcher; cancel/retry; palette commands.

**IMPLEMENTASI (done, uncommitted):**
- **Migration: ZERO.** `chat_threads.title_status` text + CHECK(`null|generating|ready`) sudah ada sejak mig 0007. Worker klaim by PK `id` → tak butuh index baru.
- **Title gen async** — `clients/llm.ts` (`generateThreadTitle` via **`generateText`**, BUKAN `generateObject`: output 1 string, zod bukan dep langsung services; env `AQSHA_TITLE_MODEL` default `gpt-4o-mini`, provider sama agent). `ChatThreadRepo.claimTitleGeneration` (UPDATE…WHERE title_status IS NULL RETURNING = guard turn-pertama + rename) + `finalizeTitle` (WHERE status='generating' = guard rename antara claim↔generate). `TitleService` (`@aqsha/services/chat`, re-export root). Queue `CHAT_QUEUES.threadTitle`. Hook proyeksi `turn.completed` → `requestTitle` (claim+enqueue, swallow). Worker `thread-title.worker.ts` + daftar `workers/index.ts`.
- **Continue-thread LIVE** — `useAstraAgent(initialSession?)` (boundRef awal true → skip URL-bump). Ekstrak `ChatSurface` (NewChat+ThreadView dedup). `ThreadView` = history snapshot **freeze** (setState saat render, guarded — bukan effect/useMemo, hindari refetch `onFinish` tarik turn baru → duplikat) + `[...history,...live]` + `ChatSurface initialSession={{sessionId:threadId,streamIndex:0}}`. Attach 6.7 aktif langsung di thread lama.
- **Cancel/Retry** — tombol stop sudah ada (6.1); +Escape→onStop di wrapper composer (palette stopPropagation Escape → tak bentrok). Retry: `errorDraft` prop composer (restore saat `agent.error`, derivasi render-time + `seenDraft` reset-on-recovery). Resend=turn baru, tak ada debit natural.
- **Switcher + infinite-scroll** — `ThreadRecentSwitcher` (4 recent, header ThreadView). Sidebar `fetchNextPage` di-wire via IntersectionObserver native (sentinel).
- **Item 5 commands route — SKIP (ponytail):** `promptCommands` = const statik `@aqsha/chat-core`, sudah client-side, palette offline. GET /commands = re-serialize array sama + round-trip, nol konsumen. YAGNI.
- **Gates:** eve:build ✓, typecheck (10 ws) ✓, lint web-v2 ✓. react-hooks lint (refs/set-state-in-effect) bersih.

---

### Slice 6.9 — Testing terpusat + harden (akhir fase)
**Tujuan:** seluruh test sekaligus (keputusan owner).

- **Service unit (repo fake):** `SendQuotaService.check` return-union; `RagService.searchThreadDocuments`; `ArtifactService.linkToWorkspace`/`applyAgentAction` (born-headless, promote); invariant `execute_artifact`; `ResearchService` (cache hit/miss + provider failure sentinel); idempotency `consumeCredits` (resume tak double-debit); `researchSourceRepo`/`searchSimilar`.
- **eve integration:** turn normal persist thread/msg + `consumeCredits` **sekali**/step + idempoten resume; `onMessage` tolak cross-user + backstop blok; `stop()` sticky; HITL `inputResponses` resume + approval pause/resume + invariant execute; tools ownership di service.
- **e2e:** kirim→answer+timeline; jawab HITL lanjut; approve artifact→card→link ws; attach PDF; cooldown 429; delete thread; continue thread lama.
- **Test-isolation:** prefix user test baru (FK-child tabel baru `research_sources`) di luar `user_itest_%` broad cleanup (lihat [[v2-phase5-implementation]] gotcha).
- **Gate akhir:** `eve build` hijau; `bun run typecheck` (9 ws); `bun run lint`; full `bun run test:v2` (`--timeout 30000`); resume `.workflow-data` pasca-crash.

**IMPLEMENTASI (done, uncommitted) — SCOPE: owner pilih "service-unit + manual checklist" (2026-06-22):**

> Grounding: TIDAK ada harness eve test (eve = proses node v25 terpisah, nol test util) + TIDAK ada Playwright/infra e2e di repo. Membangun harness eve-process / Playwright dari nol = infra besar + rapuh; substansi service-side tiap item eve-integration sudah ter-cover service-unit. Owner memilih: tulis SEMUA service-unit (repo-fake / DB-itest) + e2e & eve-runtime → **checklist manual** (di bawah). Dua koreksi temuan: (1) **`execute_artifact` tak ada** — di-collapse jadi `propose_artifact` `needsApproval: always()`; invariant "butuh propose approved" sekarang DIJAMIN eve native, bukan kode service → tak ada yang di-unit-test. (2) **`consumeCredits` A9 idempotency SUDAH** ter-test di `billing.test.ts:198` → tak diulang.

- **Service unit BARU:**
  - `packages/services/test/astra-chat-services.test.ts` — `SendQuotaService.check` (4: ok / quota_exceeded propagate tanpa bakar cooldown / cooldown reason / store-error fail-open); `TitleService` (4: claim menang→enqueue jobId=threadId / claim kalah→no enqueue / generate ber-guard collapse+unquote / tanpa user-msg→no finalize); `ResearchService.searchWeb` Jina (4: cache HIT no-fetch / MISS→parse+cache 'ready' / provider !ok→sentinel `[]`+cache 'failed' / query kosong). **Leaf deps di-`spyOn` namespace (file-local), BUKAN `mock.module`** — `mock.module` global meng-clobber sibling (queue→artifact-service, external-cache/http→feed/paper tests); itu sebab collision pertama.
  - `packages/services/test/rag-extract.test.ts` (extend) — `RagService.searchThreadDocuments` (3: embedding disabled→`[]` no-repo / query kosong→`[]` / match→skor `1-dist/2` clamp≥0 + limit clamp 20 + threadId scope). Ditaruh di sini karena embeddings sudah di-`mock.module` + RagService sudah di-import.
  - `packages/services/test/artifact-service.test.ts` (extend) — `applyAgentAction` (born-headless: workspaceId null + source agent + threadId set + TANPA gate kapasitas) + `linkToWorkspace` (3: headless→patch+cascade 4 side-table / sudah ter-file→`artifact_already_linked` no-patch / cross-owner→`artifact_not_found`).
  - `packages/db/test/chat-retrieval-repos.test.ts` (BARU, DB-itest, skip tanpa `DATABASE_URL`) — `ResearchSourceRepo.insertMany` idempoten (re-run thread+turn+locator sama→1 baris; locator beda→tambah) + `ArtifactEmbeddingRepo.searchSimilar` (scope threadId via JOIN→hanya thread itu; tanpa threadId→scope owner, urut distance). Vektor 1536-dim one-hot.
- **Test-isolation:** file DB-itest pakai prefix `itchat_<suffix>` (DI LUAR broad cleanup `user_itest_%` per gotcha [[v2-phase5-implementation]]); cleanup hapus FK-child (research_sources, artifact_embeddings, artifacts, chat_threads) SEBELUM users.
- **Checklist manual (eve-integration + e2e — owner jalankan saat smoke):**
  1. Kirim pesan baru → balasan stream + timeline reasoning/tool muncul (live); reload → bubble+reasoning saja (D-F live-only).
  2. Kredit turun 1×/turn di Settings/usage (debit `step.completed` idempoten — resume `.workflow-data` tak double-debit).
  3. `onMessage`: thread milik user lain → drop (tak bisa lanjut); user di-blok billing/cooldown → composer notice + send ter-backstop (return null).
  4. Cooldown: kirim cepat berturut → notice countdown (pre-check) + 429 backstop.
  5. HITL `ask_question` → kartu inline → jawab (`inputResponses`) → turn lanjut; jawaban jadi bubble user nyata.
  6. `propose_artifact` → kartu approval → approve → artifact card → FolderIcon Save-to-workspace (`link_to_workspace`) muncul di library; deny → tak materialize.
  7. Attach PDF (thread eksis) → Astra baca via `search_thread_documents`/`list_artifacts`; promote chip → workspace.
  8. `stop()` (tombol + Escape) saat streaming → turn berhenti sticky; retry → draft kembali, resend = turn baru tanpa re-charge.
  9. Delete thread → hilang dari sidebar + pesan ikut terhapus (cascade). Continue thread lama → follow-up live di ThreadView (tanpa duplikat history).
  10. Title async: turn pertama → judul muncul beberapa detik kemudian; rename manual tak ketimpa.
- **Gate akhir (semua HIJAU):** `bun run typecheck` (10 ws) ✓; full `bun run test:v2` (db incl. 2 itest baru + chat-core + services 185 + api-v2 74, 0 fail) ✓; `bun run --filter @aqsha/web-v2 lint` ✓; `eve:build` ✓. Lint root 1 error PRE-EXISTING di `@aqsha/app` (V1) — diabaikan. NOL migrasi (test-only). Services src tak disentuh → dist tak perlu rebuild.

---

## 7. Risiko & open items
- **Build-step bundle** — di-mitigasi externalize; spike 6.2 wajib konfirmasi (no raw-SQL fallback per D-E → kegagalan spike = eskalasi owner).
- **Dev ordering** — dist services/db harus eksis sebelum `eve dev`; pastikan `tsup --watch` + urutan `bun run dev`.
- **Single-node durability** — `.workflow-data` file-backed (single replica); backup terjadwal = P10.
- **Stream GET tak ownership-gated** (known gap 6.1, owner-accepted) — tetap terbuka.
- **`estimateProviderCostCents`** masih heuristik OpenAI/gpt — provider `'openai'` cocok; cents observability-only (non-blocking).
- **arXiv pacer per-proses** — multi-proses melemahkan pacing global; Redis token-bucket = follow-up.
- **Konsolidasi `store.ts` raw-SQL → @aqsha/services** (setelah dist) — follow-up code-organization, non-blocking P6.
- **P7 dibangun di atas blueprint ini:** `/deep` + subagents + sandbox + citation verify + timeline history (`agent_run_events`) + cross-reload resume.

## 8. Rekonsiliasi vs plan lama
- **GANTI** premis "import @aqsha/services langsung" → **build-step dist + externalize** (§2, D-E).
- **DROP** dari P6: `agent_runs`, `agent_run_events` (D-F live-only), `pending_interactions` (HITL native live), citation tools (D-H), Exa (D-G).
- **TETAP:** split persistence, eve = proses terpisah, gate `consumeCredits` per-step idempoten, hooks observe-only, HITL via `inputResponses`, `/deep` → P7.
- Migrasi P6 = **`0008 research_sources` saja**.
