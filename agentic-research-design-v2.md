# Agentic Research System - Design Draft v2

**Stack:** Claude Agent SDK (TypeScript) · Bun/Elysia · Drizzle/Postgres · Qdrant Cloud · Exa Websets MCP · text-embedding-3-small

---

## 1. Core Architecture Decision

Rancangan ini memakai **app-level orchestrator** sebagai pengendali domain loop.
Claude Agent SDK tetap dipakai, tetapi setiap fase dipanggil sebagai `query()`
terpisah:

```text
App Orchestrator
  -> query(planner)
     -> if needs_revision: transition to awaiting_user (app-level), return
  -> loop:
       query(researcher)   # SDK agent loop w/ tools + optional subagents
       query(critic)       # read-only; get_chunk allowed
       if evidenceSufficient or critic says "stop" or iteration cap: break
  -> query(synthesizer)
  -> citationAudit()         # deterministic TS: validate + hedge
  -> if audit.needsLlmRevision: query(synthesizer_revision) + citationAudit()
```

Ini lebih selaras dengan definisi resmi Claude Agent SDK agent loop:

```text
prompt -> Claude decides response/tool calls -> SDK executes tools
       -> tool results return to Claude -> repeat -> ResultMessage
```

Dengan desain ini, SDK agent loop terjadi **di dalam tiap fase**. Research loop
seperti `maxResearchIterations`, `maxRevisionCycles`, audit wajib, retry policy,
dan failure handling ditegakkan oleh aplikasi, bukan hanya prompt.

### Autonomy Boundaries

Agar workflow tetap auditable tanpa mengorbankan kemampuan agent, batas autonomy
dibagi secara eksplisit:

- **App owns:** urutan fase, iteration cap (`maxResearchIterations`,
  `maxRevisionCycles`), global budget (cost/turns), persistence ke Postgres,
  citation audit deterministik, phase transition & resume.
- **Agent owns (di dalam tiap fase):** pemilihan tool call, query formulation,
  urutan retrieval (Qdrant first vs web first), decide kapan berhenti dalam
  `maxTurns` yang diberikan, decide kapan candidate layak dipromosikan ke
  evidence.

App tidak boleh mengirim sinyal deterministik yang seharusnya bisa diturunkan
oleh agent dari input yang sudah diberikan (misal: label `BROAD` vs
`GAP_FILLING` redundant ketika `gaps` dan evidence pool sudah dikirim).

### Apa yang Tidak Dipakai

- Tidak ada satu Supervisor prompt panjang yang mengatur seluruh workflow.
- Tidak ada SDK `Agent`/`Task` tool di level orchestrator. `Task` hanya boleh
  diaktifkan **di dalam** fase researcher untuk subagent `source-vetter`
  (lihat §4). Fase lain tetap tidak boleh memakai `Task`.
- `planner`, `researcher`, `critic`, dan `synthesizer` bukan subagents yang
  dipanggil oleh Supervisor. Mereka adalah role/fase service-level dengan
  `query()` masing-masing.
- Citation audit bukan MCP tool. Audit adalah fungsi TypeScript deterministik.

### Apa yang Tetap Agentic

- Fase `researcher` tetap memakai agent loop SDK untuk memilih tool call
  Qdrant, WebSearch/WebFetch, dan Exa Websets secara adaptif.
- App orchestrator mengevaluasi output `critic` untuk memutuskan apakah perlu
  iterasi gap-filling berikutnya.
- Fase `synthesizer revision` hanya dipanggil jika deterministic citation audit
  mengembalikan `warned`.

---

## 2. Domain Loop

Draft v1 masih pipeline linear:

```text
planner -> researcher -> critic -> synthesizer -> audit
```

Draft v2 memakai app-enforced loop:

```text
planner
  |
  v [approved]
  +-----------------------------------------------------+
  | Research Deepening Loop                            |
  |                                                     |
  | researcher(query loop via SDK tools)                |
  |   -> persist candidate sources/evidence             |
  | critic(no tools)                                    |
  |   -> app checks evidenceSufficient + iteration cap  |
  |                                                     |
  | if insufficient and iteration < max: repeat         |
  +-----------------------------------------------------+
  |
  v
synthesizer(no tools)
  |
  v
citationAudit(deterministic TS)
  |
  +-- completed -> final answer
  |
  +-- warned -> synthesizer revision(no tools)
              -> citationAudit again
              -> final answer or failed response
  |
  +-- failed -> no answer shown
```

Default depth modes hanya mengunci **dua** angka keras per run:
`maxResearchIterations` dan `researcher maxTurns`. Sisa guidance (preferensi
jumlah search/fetch/webset call) tinggal di system prompt sebagai soft
guidance, dan global budget ditegakkan oleh `PreToolUse` hook (lihat §10).

```text
standard:
  maxResearchIterations = 3
  maxRevisionCycles = 1
  researcher maxTurns = 16
  globalToolBudget:
    webSearch = 10
    webFetch = 25
    websetsCreateWebset = 2
    websetsCreateSearch = 4
    websetsItems = 30
  soft guidance in prompt:
    - prefer <= 3 WebSearch per iteration
    - prefer <= 8 WebFetch per iteration

deep:
  maxResearchIterations = 5
  maxRevisionCycles = 1
  researcher maxTurns = 32
  globalToolBudget:
    webSearch = 30
    webFetch = 80
    websetsCreateWebset = 5
    websetsCreateSearch = 10
    websetsItems = 120
    websetsEnrichments = 6
  soft guidance in prompt:
    - prefer <= 8 WebSearch per iteration
    - prefer <= 20 WebFetch per iteration
  enable SDK compaction for long-running context
```

Perbedaan penting dari v1/draft awal:

- Batas per-tool **per-iterasi** tidak dienforce di prompt. Prompt hanya berisi
  soft preference.
- Global budget (`webSearch`, `webFetch`, `websets*`) dijaga oleh `PreToolUse`
  hook yang membaca counter per run dan mengembalikan `permissionDecision:
  "deny"` ketika budget habis. Ini membuat enforcement nyata, bukan
  prompt-aspirational.
- Researcher boleh adaptif: kalau research question memang butuh 10 fetch di
  iterasi 0, budget global masih mengizinkan.

`Deep` mode harus dipilih eksplisit oleh user dari UI. App boleh menyarankan
Deep untuk literature review besar, tetapi tidak auto-upgrade karena cost dan
durasi lebih tinggi.

---

## 3. SDK Agent Loop Boundary

Setiap fase memanggil Claude Agent SDK `query()` sampai menghasilkan
`ResultMessage`.

Only `ResultMessage.subtype === "success"` is a valid completed phase. Subtype
lain harus masuk retry policy eksplisit atau menghentikan workflow.

```text
success
  -> collect final assistant output
  -> parse/validate structured output
  -> persist state
  -> continue

error_max_turns
  -> researcher can retry once with reduced scope
  -> planner/critic/synthesizer fail phase

error_max_budget_usd
  -> fail workflow as budget limit reached

error_during_execution
  -> retry once only when phase policy allows it

blocked_by_permissions / permission_denied
  -> fail workflow; allowedTools should be fixed per phase

missing ResultMessage / unknown subtype
  -> fail workflow and keep raw events for debugging
```

Retry policy:

```text
planner:
  - retry 1x only for structured output validation failure
  - no retry for SDK non-success

researcher:
  - retry 1x for error_during_execution or output validation failure
  - retry prompt reduces scope / limits
  - no retry for budget limit

critic:
  - retry 1x only for validation failure
  - no retry for SDK non-success

synthesizer:
  - retry 1x only for validation failure
  - no retry for SDK non-success

synthesizer_revision:
  - one domain revision cycle only
  - retry 1x only for validation failure

citationAudit:
  - no LLM retry; deterministic function
```

### Context Compaction for Deep Mode

Deep mode mengizinkan `maxTurns = 32`, `WebFetch` global budget sampai 80, dan
Websets items sampai 120. Context window akan terisi dengan cepat karena
`WebFetch` dan `list_webset_items` mengembalikan payload besar.

Untuk fase researcher dalam Deep mode, aktifkan SDK auto-compaction. SDK akan
meringkas pesan lama saat mendekati context limit sehingga agent loop tidak
terhenti di tengah iterasi karena kehabisan konteks.

Standard mode tidak perlu compaction; `maxTurns = 16` cukup aman.

---

## 4. Phase Tool Policy

Tool permissions are strict per phase. The main workflow does not use the SDK
`Agent`/`Task` tool at the orchestrator level; `Task` hanya diaktifkan di
**dalam** fase researcher untuk parallel source-vetting.

```text
planner:
  allowedTools: []
  maxTurns: 4
  # Klarifikasi user ditangani oleh app-level awaiting_user_input
  # state, bukan via AskUserQuestion tool. Planner mengembalikan
  # status="needs_revision" plus clarifyingQuestions[] dan
  # orchestrator menyetel agent_sessions.status = "awaiting_user".

researcher:
  allowedTools:
    - WebSearch
    - WebFetch
    - Task                             # untuk spawn source-vetter subagent
    - mcp__qdrant-kb__check_coverage
    - mcp__qdrant-kb__hybrid_search
    - mcp__qdrant-kb__get_chunk
    - mcp__aqsha__persist_candidate_source
    - mcp__aqsha__promote_to_evidence
    - mcp__aqsha__websets_collect       # wrapper yang mencakup Websets flow
  agents:
    source-vetter:
      description: >
        Vets a single candidate URL. Fetches, reads, and returns a structured
        evidence draft or rejection reason. Does not write to DB.
      tools:
        - WebFetch
        - mcp__qdrant-kb__hybrid_search
        - mcp__qdrant-kb__get_chunk
  maxTurns: 16 standard, 32 deep

critic:
  allowedTools:
    - mcp__qdrant-kb__get_chunk        # read-only, untuk resolve ambiguity
  maxTurns: 4

synthesizer:
  allowedTools: []
  maxTurns: 4

synthesizer_revision:
  allowedTools: []
  maxTurns: 3
```

Catatan per fase:

- **Planner:** `AskUserQuestion` tidak lagi dipakai. Klarifikasi
  dikomunikasikan lewat structured output (`clarifyingQuestions[]`) dan
  app-level `awaiting_user_input` state. Ini membuat planner bekerja di
  background Elysia server tanpa bergantung pada transport TTY.
- **Researcher:** boleh memakai `Task` untuk men-spawn `source-vetter`
  subagent secara paralel saat punya banyak candidate URL. Subagent punya
  context window sendiri dan hanya mengembalikan ringkasan (evidence draft /
  rejection reason), tidak menulis ke DB. Keputusan untuk promote ke evidence
  tetap ada di researcher utama via `mcp__aqsha__promote_to_evidence`.
- **Researcher writes:** persistence candidate/evidence lewat in-process MCP
  tools `mcp__aqsha__persist_candidate_source` dan
  `mcp__aqsha__promote_to_evidence`. Researcher tidak lagi mengembalikan array
  `evidencePoolDelta` besar di structured output (lihat §7).
- **Websets:** researcher tidak memanggil raw `mcp__websets__*` tools sendiri.
  Pakai wrapper `mcp__aqsha__websets_collect` yang internally compose
  `create_webset`, `create_search`, `list_webset_items`, lalu normalisasi
  hasilnya ke `agent_research_candidate_sources`. LLM tidak perlu lagi memetakan
  JSON Websets mentah ke schema domain.
- **Critic:** boleh memanggil `get_chunk` (read-only) untuk meresolusi
  ambiguitas claim-evidence tanpa bisa menciptakan evidence baru.
- **Synthesizer / revision:** tetap `allowedTools: []`. Tugas mereka murni
  menulis dari claim yang sudah disediakan.

Not allowed in v2:

```text
Agent/Task at orchestrator level
Task di fase selain researcher
write/edit tools
shell tools
AskUserQuestion (diganti app-level awaiting_user_input)
mcp__websets__create_monitor
ongoing monitor/background Websets lifecycle tools
raw mcp__websets__* di researcher (gunakan websets_collect wrapper)
```

---

## 5. Current Qdrant Schema Contract

Desain aktif harus mengikuti Appendix A di `convex-to-postgres-migration.md`.
Qdrant saat ini memakai dense vector OpenAI, bukan schema BGE-M3.

### `academic-paper-v1`

Vector config:

- `size = 1536`
- `distance = Cosine`
- `embeddingModel = text-embedding-3-small`
- `embeddingVersion = v1`

Primary payload fields:

- `paperId`
- `title`
- `doi`
- `openAlexId`
- `semanticScholarId`
- `arxivId`
- `year`
- `language`
- `paperType`
- `contentTier`
- `sourcePriority`
- `citationCount`
- `referenceCount`
- `isOpenAccess`
- `indonesiaAffiliated`
- `authorAffiliationCountries`
- `institutionCountries`
- `openAlexTopicIds`
- `embeddingModel`
- `embeddingVersion`

Indexed payload fields:

- keyword: `paperId`, `contentTier`, `doi`, `openAlexId`, `semanticScholarId`, `arxivId`, `language`, `paperType`, `sourcePriority`, `authorAffiliationCountries`, `institutionCountries`, `openAlexTopicIds`, `embeddingModel`, `embeddingVersion`
- integer: `year`, `citationCount`, `referenceCount`
- bool: `isOpenAccess`, `indonesiaAffiliated`

### `academic-chunk-v1`

Vector config:

- `size = 1536`
- `distance = Cosine`
- `embeddingModel = text-embedding-3-small`
- `embeddingVersion = v1`

Primary payload fields:

- `chunkId`
- `chunkIndex`
- `paperId`
- `paperTitle`
- `paperType`
- `year`
- `contentTier`
- `section`
- `snippet`
- `sourceOrigin`
- `textType`
- `embeddingModel`
- `embeddingVersion`

Indexed payload fields:

- keyword: `paperId`, `chunkId`, `embeddingModel`, `embeddingVersion`, `section`, `sourceOrigin`, `textType`, `contentTier`, `paperType`
- integer: `year`, `chunkIndex`

### Relation to Postgres

- `academic-paper-v1` merepresentasikan paper dari tabel `papers`.
- `academic-chunk-v1` merepresentasikan chunk dari tabel `chunks`.
- `chunks.qdrant_point_id` menjadi bridge utama dari Postgres ke Qdrant indexing state.

### Retrieval Behavior

Istilah "hybrid search" di desain ini berarti orchestration pada application
layer: vector retrieval dari Qdrant, payload filtering, query expansion, dan
reranking di service. Desain ini tidak mengasumsikan named sparse vector atau
multi-vector schema di Qdrant sampai ada migration baru.

### Deferred Embedding Migration

BGE-M3 hanya opsi migrasi tertunda. Jika dipakai nanti, ia membutuhkan collection
atau version baru dan full reindex karena dense dimension berubah dari `1536` ke
`1024`. Migration tersebut juga harus mendefinisikan apakah sparse atau
multi-vector disimpan di Qdrant, bukan hanya di layer aplikasi.

---

## 6. Exa Websets Policy

Exa Websets MCP tersedia untuk fase `researcher`, tetapi **researcher tidak
memanggil raw `mcp__websets__*` tools**. Pakai wrapper in-process
`mcp__aqsha__websets_collect` yang membungkus flow `create_webset` /
`create_search` / `list_webset_items` / `create_enrichment` / `get_enrichment`,
menormalisasi item ke `agent_research_candidate_sources` (`status=candidate`),
dan mengembalikan daftar compact candidate ref ke LLM.

Alasan: raw Websets JSON opaque dan memetakan field `websetId`, `websetItemId`,
`reasonFound`, `metadata` ke `candidateSourceSchema` lewat LLM rentan salah.
Wrapper memindahkan mapping deterministik ke TypeScript.

Penggunaan Websets tetap opsional. Researcher diarahkan untuk memakai Websets
hanya ketika research butuh external entity collection/enrichment, bukan untuk
setiap pertanyaan.

Use Websets for:

- landscape scan dengan banyak candidate sources
- collection paper eksternal berdasarkan kriteria eksplisit
- enrichment author, institution, company, paper, atau dataset
- research yang butuh daftar kandidat sebelum fetch/verifikasi

Do not use Websets for:

- pertanyaan singkat
- Qdrant coverage sudah sufficient
- hanya perlu 1-3 halaman web biasa
- critic/synthesizer/planner
- ongoing monitoring

Websets output is **candidate source**, not evidence. Evidence baru boleh dibuat
setelah researcher punya content/verbatim/metadata yang cukup melalui fetch,
Qdrant payload, atau enrichment yang jelas.

```text
Websets item
  -> agent_research_candidate_sources(status=candidate)

candidate source + fetched/extracted content
  -> candidate_sources(status=fetched)

useful fetched source
  -> agent_research_evidence_items
  -> candidate_sources(status=promoted)

duplicate/weak source
  -> candidate_sources(status=rejected)
```

---

## 7. Structured Output Contracts

Contracts dibuat di TypeScript dengan Zod. Claude Agent SDK TypeScript
mendukung structured output langsung via
`options.outputFormat = { type: "json_schema", schema }` dan mengembalikan
hasilnya sebagai `message.structured_output` pada `ResultMessage`.

**Setiap fase wajib memakai `outputFormat: json_schema`** dengan schema yang
diturunkan dari Zod lewat `zod-to-json-schema`. Zod `safeParse` tetap dipakai
sebagai defense-in-depth setelah menerima `structured_output` (SDK belum
menjamin runtime coercion seketat Zod), dan retry 1x untuk validation failure
mengikuti phase retry policy.

Ekstraksi "final assistant text" lalu `JSON.parse` lalu Zod **tidak lagi
dipakai sebagai jalur utama**. Pendekatan tersebut rentan (mixing thinking
blocks, tool-use blocks) dan sudah ada primitive SDK yang lebih tepat.

Suggested location:

```text
apps/api/src/modules/agents/workflows/research/schemas.ts
```

```ts
import { z } from "zod";

export const plannerOutputSchema = z.object({
  status: z.enum(["approved", "needs_revision", "cancelled"]),
  researchQuestion: z.string().default(""),
  scope: z.string().default(""),
  expectedOutput: z.string().default(""),
  revisionNotes: z.string().default(""),
  // Saat status === "needs_revision", planner mengembalikan pertanyaan
  // klarifikasi di sini. Orchestrator memindahkan agent_sessions.status
  // ke "awaiting_user" dan menampilkan pertanyaan di UI. Tidak ada
  // AskUserQuestion tool.
  clarifyingQuestions: z.array(z.string()).default([]),
});

export const candidateSourceSchema = z.object({
  candidateId: z.string(),
  origin: z.enum(["web_search", "websets", "manual", "qdrant_related"]),
  status: z.enum(["candidate", "fetched", "promoted", "rejected", "failed"]),
  title: z.string().optional(),
  url: z.string().optional(),
  doi: z.string().optional(),
  externalId: z.string().optional(),
  websetId: z.string().optional(),
  websetItemId: z.string().optional(),
  searchId: z.string().optional(),
  reasonFound: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const evidenceItemSchema = z.object({
  evidenceId: z.string(),
  sourceType: z.enum(["internal", "web", "websets"]),
  provenance: z.enum([
    "qdrant",
    "web_search",
    "web_fetch",
    "websets_item",
    "websets_enrichment",
  ]),
  candidateId: z.string().optional(),
  qdrantPointId: z.string().optional(),
  chunkId: z.string().optional(),
  title: z.string(),
  source: z.string(),
  authors: z.array(z.string()).default([]),
  publishedAt: z.string().optional(),
  text: z.string(),
  relevance: z.enum(["high", "medium"]),
  payload: z.record(z.string(), z.unknown()).default({}),
});

export const researcherOutputSchema = z.object({
  coverageAssessment: z.enum(["sufficient", "partial", "insufficient"]),
  coverageNotes: z.string(),
  queriesUsed: z.array(z.string()),
  evidenceAddedIds: z.array(z.string()).default([]),
  candidateAddedIds: z.array(z.string()).default([]),
});

// NOTE: researcher tidak lagi mengembalikan payload candidate/evidence full.
// Persistence dilakukan incrementally via in-process MCP tools:
//   mcp__aqsha__persist_candidate_source(payload) -> { candidateId }
//   mcp__aqsha__promote_to_evidence({ candidateId, ... }) -> { evidenceId }
// Output di atas hanya daftar id untuk audit + sanity check orchestrator.

export const claimSchema = z.object({
  claimId: z.string(),
  statement: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
  evidenceIds: z.array(z.string()),
  supported: z.boolean(),
});

export const criticOutputSchema = z.object({
  claims: z.array(claimSchema),
  gaps: z.array(z.string()),
  evidenceSufficient: z.boolean(),
  // iterationRecommendation dibaca oleh orchestrator dan diteruskan ke
  // researcher berikutnya sebagai input bebas-bentuk. Orchestrator tetap
  // memegang hard decision (stop / continue) lewat evidenceSufficient +
  // maxResearchIterations.
  iterationRecommendation: z.enum(["stop", "narrow_gap", "broaden", "continue"]),
  iterationRecommendationNotes: z.string().default(""),
});

export const synthesizerOutputSchema = z.object({
  answer: z.string(),
  claimIdsUsed: z.array(z.string()),
  hasLimitations: z.boolean(),
  limitationsText: z.string().default(""),
});

export const citationAuditOutputSchema = z.object({
  status: z.enum(["completed", "warned", "failed"]),
  cleanAnswer: z.string(),
  citations: z.array(z.record(z.string(), z.unknown())),
  warnings: z.array(z.string()),
  failures: z.array(z.string()),
  // Diisi oleh citationAudit() untuk memberi sinyal ke orchestrator:
  // - false: hedging deterministik sudah cukup, tidak perlu LLM revision
  // - true: hedging deterministik tidak cukup, orchestrator boleh panggil
  //   synthesizer_revision phase (sekali)
  needsLlmRevision: z.boolean().default(false),
});
```

Do not persist phase outputs as source of truth until they pass Zod validation.
Raw SDK messages can still be stored in `agent_events` for debugging.

---

## 8. Postgres Source of Truth

Postgres is the source of truth. SDK `resume` is not the main control mechanism
for this workflow because each phase is a separate `query()` call.

SDK session ids are stored per run for observability/debugging.

Use generic tables for reusable agent platform state, and research-specific
tables for domain state.

```text
agent_sessions
agent_runs
agent_events
agent_research_sessions
agent_research_candidate_sources
agent_research_evidence_items
agent_research_claims
```

### Generic Tables

```ts
export const agentSessions = pgTable("agent_sessions", {
  id: idColumn("id"),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  workflowType: text("workflow_type").notNull(), // research | future workflows
  status: text("status").notNull(), // active | awaiting_user | completed | failed
  currentPhase: text("current_phase"),
  depthMode: text("depth_mode").notNull().default("standard"),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
});

export const agentRuns = pgTable("agent_runs", {
  id: idColumn("id"),
  agentSessionId: uuid("agent_session_id")
    .notNull()
    .references(() => agentSessions.id, { onDelete: "cascade" }),
  phase: text("phase").notNull(),
  iteration: integer("iteration").default(0).notNull(),
  sdkSessionId: text("sdk_session_id"),
  resultSubtype: text("result_subtype"),
  model: text("model"),
  usageJson: jsonb("usage_json").$type<JsonValue>(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: createdAtColumn(),
});

export const agentEvents = pgTable("agent_events", {
  id: idColumn("id"),
  agentRunId: uuid("agent_run_id")
    .notNull()
    .references(() => agentRuns.id, { onDelete: "cascade" }),
  eventIndex: integer("event_index").notNull(),
  eventType: text("event_type").notNull(),
  rawEventJson: jsonb("raw_event_json").$type<JsonValue>().notNull(),
  createdAt: createdAtColumn(),
});
```

### Research Tables

```ts
export const agentResearchSessions = pgTable("agent_research_sessions", {
  agentSessionId: uuid("agent_session_id")
    .primaryKey()
    .references(() => agentSessions.id, { onDelete: "cascade" }),
  researchQuestion: text("research_question"),
  plannerOutputJson: jsonb("planner_output_json").$type<JsonValue>(),
  latestGapsJson: jsonb("latest_gaps_json").$type<JsonValue>(),
  finalAnswerJson: jsonb("final_answer_json").$type<JsonValue>(),
  auditResultJson: jsonb("audit_result_json").$type<JsonValue>(),
  iteration: integer("iteration").default(0).notNull(),
  maxIterations: integer("max_iterations").default(3).notNull(),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
});

export const agentResearchCandidateSources = pgTable("agent_research_candidate_sources", {
  id: idColumn("id"),
  agentSessionId: uuid("agent_session_id")
    .notNull()
    .references(() => agentSessions.id, { onDelete: "cascade" }),
  iteration: integer("iteration").default(0).notNull(),
  origin: text("origin").notNull(),
  status: text("status").notNull(),
  title: text("title"),
  url: text("url"),
  doi: text("doi"),
  externalId: text("external_id"),
  websetId: text("webset_id"),
  websetItemId: text("webset_item_id"),
  searchId: text("search_id"),
  reasonFound: text("reason_found"),
  rejectionReason: text("rejection_reason"),
  metadataJson: jsonb("metadata_json").$type<JsonValue>(),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
});

export const agentResearchEvidenceItems = pgTable("agent_research_evidence_items", {
  id: idColumn("id"),
  agentSessionId: uuid("agent_session_id")
    .notNull()
    .references(() => agentSessions.id, { onDelete: "cascade" }),
  iteration: integer("iteration").default(0).notNull(),
  evidenceId: text("evidence_id").notNull(),
  sourceType: text("source_type").notNull(),
  provenance: text("provenance").notNull(),
  candidateSourceId: uuid("candidate_source_id").references(
    () => agentResearchCandidateSources.id,
  ),
  qdrantPointId: text("qdrant_point_id"),
  chunkId: text("chunk_id"),
  title: text("title").notNull(),
  source: text("source").notNull(),
  authorsJson: jsonb("authors_json").$type<JsonValue>(),
  publishedAt: text("published_at"),
  text: text("text").notNull(),
  relevance: text("relevance").notNull(),
  payloadJson: jsonb("payload_json").$type<JsonValue>(),
  createdAt: createdAtColumn(),
});

export const agentResearchClaims = pgTable("agent_research_claims", {
  id: idColumn("id"),
  agentSessionId: uuid("agent_session_id")
    .notNull()
    .references(() => agentSessions.id, { onDelete: "cascade" }),
  iteration: integer("iteration").default(0).notNull(),
  claimId: text("claim_id").notNull(),
  statement: text("statement").notNull(),
  confidence: text("confidence").notNull(),
  supported: boolean("supported").notNull(),
  evidenceIdsJson: jsonb("evidence_ids_json").$type<JsonValue>().notNull(),
  payloadJson: jsonb("payload_json").$type<JsonValue>(),
  createdAt: createdAtColumn(),
});
```

Add indexes for `agentSessionId`, `phase`, `iteration`, `status`, and external
ids like `qdrantPointId`, `url`, `doi`, `websetId`, and `websetItemId`.

---

## 9. Orchestrator Sketch

Suggested location:

```text
apps/api/src/modules/agents/workflows/research/orchestrator.ts
```

```ts
export async function* runResearchWorkflow(input: ResearchWorkflowInput) {
  const session = await agentRepository.createSession({
    workspaceId: input.workspaceId,
    userId: input.userId,
    workflowType: "research",
    depthMode: input.depthMode,
  });

  yield progress("phase_started", { phase: "planner" });
  const plan = await runPlannerPhase(input.prompt, session.id);
  yield progress("phase_completed", { phase: "planner" });

  if (plan.status === "cancelled") {
    await agentRepository.failSession(session.id, "planner_cancelled");
    yield progress("failed", { reason: "planner_cancelled" });
    return;
  }

  if (plan.status === "needs_revision") {
    // Human-in-the-loop gate. Tidak ada AskUserQuestion tool.
    await agentRepository.setAwaitingUser(session.id, {
      phase: "planner",
      clarifyingQuestions: plan.clarifyingQuestions,
      revisionNotes: plan.revisionNotes,
    });
    yield progress("awaiting_user", {
      phase: "planner",
      questions: plan.clarifyingQuestions,
    });
    return; // orchestrator akan dipanggil ulang setelah user menjawab
  }

  let iteration = 0;
  let evidence = await researchRepository.listEvidence(session.id);
  let latestCritic: CriticOutput | null = null;

  while (iteration < limits.maxResearchIterations) {
    yield progress("phase_started", { phase: "researcher", iteration });

    // Tidak ada deterministic mode label. Researcher menerima gaps +
    // previousQueries + iterationRecommendation dari critic sebelumnya
    // dan memilih strategi retrieval sendiri.
    await runResearcherPhase({
      sessionId: session.id,
      researchQuestion: plan.researchQuestion,
      iteration,
      gaps: latestCritic?.gaps ?? [],
      previousQueries: await researchRepository.listQueries(session.id),
      criticRecommendation: latestCritic?.iterationRecommendation ?? null,
      criticRecommendationNotes: latestCritic?.iterationRecommendationNotes ?? "",
      limits,
    });

    // Persistence terjadi incremental di dalam fase, lewat MCP tools
    // mcp__aqsha__persist_candidate_source dan
    // mcp__aqsha__promote_to_evidence. Orchestrator cukup membaca ulang
    // state dari Postgres.
    evidence = await researchRepository.listEvidence(session.id);

    yield progress("phase_started", { phase: "critic", iteration });
    latestCritic = await runCriticPhase({
      sessionId: session.id,
      researchQuestion: plan.researchQuestion,
      evidence,
    });

    await researchRepository.persistClaims(session.id, iteration, latestCritic.claims);
    await researchRepository.setLatestGaps(session.id, latestCritic.gaps);

    // Hard stop: evidenceSufficient boolean tetap authoritative.
    // Soft signal: iterationRecommendation === "stop" juga menghentikan loop
    // lebih awal jika critic yakin cukup, bahkan saat evidenceSufficient
    // ragu-ragu (misal cukup tapi dengan hedged limitations).
    if (latestCritic.evidenceSufficient || latestCritic.iterationRecommendation === "stop") {
      break;
    }

    iteration += 1;
  }

  const supportedClaims = await researchRepository.listSupportedClaims(session.id);

  if (supportedClaims.length === 0) {
    await agentRepository.failSession(session.id, "insufficient_evidence");
    yield progress("failed", { reason: "insufficient_evidence" });
    return;
  }

  const synthesis = await runSynthesizerPhase({
    researchQuestion: plan.researchQuestion,
    claims: supportedClaims,
    gaps: latestCritic?.gaps ?? [],
  });

  let audit = citationAudit({
    answer: synthesis.answer,
    claims: supportedClaims,
    claimIdsUsed: synthesis.claimIdsUsed,
  });

  // Coba deterministic hedging dulu sebelum memanggil LLM revision.
  // citationAudit() versi baru (lihat §12) akan men-hedge kalimat yang
  // mengandung marker claim low-confidence secara template-based. Jika
  // hedging deterministik tidak cukup (masih "warned" atau butuh rewrite
  // struktural), baru panggil LLM revision.
  if (audit.status === "warned" && audit.needsLlmRevision) {
    const revision = await runSynthesizerRevisionPhase({
      original: synthesis,
      warnings: audit.warnings,
      claims: supportedClaims,
    });

    audit = citationAudit({
      answer: revision.answer,
      claims: supportedClaims,
      claimIdsUsed: revision.claimIdsUsed,
    });
  }

  if (audit.status === "failed") {
    await agentRepository.failSession(session.id, "citation_audit_failed");
    yield progress("failed", { reason: "citation_audit_failed" });
    return;
  }

  await researchRepository.setFinal(session.id, audit);
  yield progress("completed", { sessionId: session.id });
}
```

---

## 10. SDK Phase Runner

Suggested location:

```text
apps/api/src/modules/agents/sdk-runner.ts
```

```ts
import { type Options, query, type HookCallback } from "@anthropic-ai/claude-agent-sdk";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ZodSchema } from "zod";

export async function runSdkPhase<T>(input: {
  sessionId: string;
  phase: AgentPhase;
  prompt: string;
  systemPrompt: string;
  allowedTools: string[];
  agents?: Options["agents"];
  maxTurns: number;
  schema: ZodSchema<T>;
  retryPolicy: PhaseRetryPolicy;
}): Promise<T> {
  const run = await agentRepository.startRun(input.sessionId, input.phase);

  // Observability + budget enforcement via SDK hooks.
  // Tidak ada manual appendEvent loop di dalam for-await.
  const preToolUse: HookCallback = async (hookInput) => {
    await agentRepository.appendEvent(run.id, hookInput, "pre_tool_use");
    return enforceBudget(input.sessionId, hookInput);
  };
  const postToolUse: HookCallback = async (hookInput) => {
    await agentRepository.appendEvent(run.id, hookInput, "post_tool_use");
    return {};
  };
  const sessionEnd: HookCallback = async (hookInput) => {
    await agentRepository.appendEvent(run.id, hookInput, "session_end");
    return {};
  };

  let structured: unknown = undefined;
  let resultSubtype: string | undefined;

  for await (const message of query({
    prompt: input.prompt,
    options: {
      systemPrompt: input.systemPrompt,
      allowedTools: input.allowedTools,
      agents: input.agents,
      maxTurns: input.maxTurns,
      outputFormat: {
        type: "json_schema",
        schema: zodToJsonSchema(input.schema, { $refStrategy: "root" }),
      },
      // Lihat §10.1 untuk detail.
      settingSources: [],
      permissionMode: "bypassPermissions",
      hooks: {
        PreToolUse: [{ hooks: [preToolUse] }],
        PostToolUse: [{ hooks: [postToolUse] }],
        SessionEnd: [{ hooks: [sessionEnd] }],
      },
    },
  })) {
    if (message.type === "system" && message.subtype === "init") {
      await agentRepository.setSdkSessionId(run.id, message.sessionId);
    }
    if (message.type === "result") {
      resultSubtype = message.subtype;
      structured = (message as { structured_output?: unknown }).structured_output;
      await agentRepository.completeRun(run.id, message);
    }
  }

  if (resultSubtype !== "success") {
    throw new AgentPhaseError(input.phase, resultSubtype ?? "missing_result");
  }

  // Defense-in-depth: meskipun structured_output sudah di-coerce SDK,
  // jalankan Zod safeParse + retry 1x sesuai phase retry policy.
  return validateStructuredOutput({
    phase: input.phase,
    structured,
    schema: input.schema,
    retryPolicy: input.retryPolicy,
  });
}
```

Perbedaan utama dari draft awal:

- **Observability via hooks, bukan message iterator.** `PreToolUse` /
  `PostToolUse` / `SessionEnd` hooks menulis ke `agent_events`. Iterator hanya
  dipakai untuk menangkap `ResultMessage`. Ini memisahkan "persist trace" dari
  "bubble progress ke UI".
- **Budget enforcement di hook, bukan di prompt.** `enforceBudget` membaca
  counter tool call per run dari Postgres dan mengembalikan
  `{ permissionDecision: "deny", permissionDecisionReason: "..." }` ketika
  global budget (lihat §2) habis.
- **Structured output dari SDK.** `outputFormat: json_schema` +
  `message.structured_output` menghilangkan jalur "extract final text →
  JSON.parse → Zod". Zod validation tetap jalan sebagai pengaman.
- **Separation of retry concerns.** `runSdkPhase` hanya melempar
  `AgentPhaseError` untuk transport/subtype non-success. Schema validation
  retry ditangani di layer phase caller (`runResearcherPhase`, dst.) sesuai
  retry policy per fase (§3).

---

## 10.1. SDK Runtime Options

Untuk workflow server-side di Elysia (bukan Claude Code TTY), option berikut
harus disetel eksplisit:

- **`settingSources: []`** — SDK tidak akan memuat `CLAUDE.md`, slash-command
  config, atau settings lain dari filesystem host. Penting karena API process
  di-deploy ke lingkungan yang kadang-kadang kebetulan memiliki file konfigurasi
  Claude Code yang tidak relevan.
- **`permissionMode: "bypassPermissions"`** — `allowedTools` per fase + MCP
  tool surface + `canUseTool` guard sudah memberi constraint yang cukup. Tidak
  ada interactive permission prompt yang bisa dijawab dari Elysia request.
- **`canUseTool` (opsional, optional fail-closed guard)** — dipakai untuk
  invariant yang HARUS gagal tertutup walaupun prompt leak (contoh: tolak
  semua `mcp__websets__create_monitor` apapun konteksnya, tolak tool write
  apapun kecuali `mcp__aqsha__*`). Jalankan di samping `allowedTools`, bukan
  menggantikannya.
- **`model`** — set eksplisit per fase. Default `claude-sonnet-4-5` untuk
  researcher/critic/synthesizer. Planner bisa pakai model yang lebih kecil
  (haiku) karena tugasnya ringkas.
- **`maxTurns`** — per fase sesuai §4. Deep mode researcher aktifkan
  compaction.
- **`hooks`** — registrasi `PreToolUse` / `PostToolUse` / `SessionEnd` seperti
  di `runSdkPhase`. `matcher` bisa dipersempit (mis. matcher `"mcp__aqsha__*"`
  untuk budget enforcement yang hanya peduli pada tool yang menghabiskan kuota).
- **`outputFormat`** — `{ type: "json_schema", schema: zodToJsonSchema(...) }`
  untuk setiap fase.
- **`agents`** — hanya untuk fase researcher: satu definisi `source-vetter`.
  Fase lain tidak menyetel `agents` sama sekali (sehingga `Task` yang
  kebetulan lolos akan no-op).

---

## 11. Prompts

Suggested location:

```text
apps/api/src/modules/agents/workflows/research/prompts.ts
```

### Planner Prompt

```ts
export const plannerSystemPrompt = `
You are the planning phase for Aqsha research.

Clarify the user's research request and decide whether it is approved,
needs revision, or cancelled.

Return PlannerOutput only. You have no tools.

If the request is ambiguous or underspecified, set status="needs_revision"
and list concrete clarifying questions in clarifyingQuestions[].
Do not ask the user via a tool. The orchestrator will surface your
questions via an app-level awaiting_user_input state and re-invoke you
with the user's answers.

Do not perform research.
`;
```

### Researcher Prompt

```ts
export const researcherSystemPrompt = `
You are the researcher phase.

Use internal Qdrant first (check_coverage, hybrid_search, get_chunk). Use
WebSearch/WebFetch when internal coverage is partial or insufficient. Use
mcp__aqsha__websets_collect only when the task benefits from external candidate
collection or enrichment. Do NOT call raw mcp__websets__* tools.

Persist candidates and evidence incrementally as you work:
- call mcp__aqsha__persist_candidate_source(...) when you discover a source
  worth tracking, even if you haven't vetted it yet
- call mcp__aqsha__promote_to_evidence(...) only when you have content +
  provenance strong enough for citation-quality evidence

When you have many candidate URLs to vet in parallel, use the Task tool to
spawn source-vetter subagents. Each subagent returns a vetted draft or a
rejection reason; you remain responsible for deciding what becomes evidence.

Inputs you will receive from the orchestrator:
- researchQuestion, scope, expectedOutput (from planner)
- gaps[] (from the previous critic, if any)
- previousQueries[] (queries you have already run)
- criticRecommendation: one of "stop" | "narrow_gap" | "broaden" | "continue"
- criticRecommendationNotes
- iteration (integer, 0-based)

You decide retrieval strategy yourself from these inputs. Do not expect a
mode label.

Soft budget guidance (enforcement is done by the app, not by you):
- standard mode: prefer <= 3 WebSearch and <= 8 WebFetch per iteration
- deep mode: prefer <= 8 WebSearch and <= 20 WebFetch per iteration
The orchestrator enforces hard global budgets via PreToolUse; if a tool
call is denied for budget reasons, stop that branch and summarize.

Return ResearcherOutput only:
- coverageAssessment
- coverageNotes
- queriesUsed
- evidenceAddedIds (ids you persisted this iteration via promote_to_evidence)
- candidateAddedIds (ids you persisted this iteration via persist_candidate_source)

Do not include full candidate or evidence payloads in the output. Those live
in Postgres via the MCP write tools.

Do not synthesize the final answer.
`;
```

### Critic Prompt

```ts
export const criticSystemPrompt = `
You are the critic phase.

Read the full accumulated evidence set. Extract atomic claims, confidence,
support status, evidence ids, gaps, and whether evidence is sufficient for the
research question.

You may call mcp__qdrant-kb__get_chunk to read the full text of a chunk
referenced by an evidence item if a snippet is ambiguous. You must not call
any retrieval tool (hybrid_search, WebSearch, WebFetch, websets) — you cannot
create new evidence, only judge what exists.

In iterationRecommendation, choose one of:
- "stop": evidence is sufficient; orchestrator should stop looping
- "narrow_gap": loop once more to close a specific listed gap
- "broaden": loop once more to find additional angles
- "continue": keep iterating on whatever the researcher was doing

Return CriticOutput only.
`;
```

### Synthesizer Prompt

```ts
export const synthesizerSystemPrompt = `
You are the synthesis phase.

Write only from supported claims. Use [CLAIM:id] markers for every claim-backed
statement. Include limitations when gaps remain. Do not add outside knowledge.

Return SynthesizerOutput only.
Do not use tools.
`;
```

---

## 12. Deterministic Citation Audit

Suggested location:

```text
apps/api/src/modules/agents/workflows/research/citation-audit.ts
```

```ts
const HEDGE_PREFIX = "Some evidence suggests that ";
const LOW_CONF_SENTENCE_RATIO_LIMIT = 0.25;

export function citationAudit(input: {
  answer: string;
  claims: Claim[];
  claimIdsUsed: string[];
}): CitationAuditOutput {
  const claimById = new Map(input.claims.map((claim) => [claim.claimId, claim]));
  const warnings: string[] = [];
  const failures: string[] = [];
  const lowConfidenceClaimIds = new Set<string>();

  for (const claimId of input.claimIdsUsed) {
    const claim = claimById.get(claimId);

    if (!claim) {
      failures.push(`Unknown claim id: ${claimId}`);
      continue;
    }

    if (!claim.supported) {
      failures.push(`Unsupported claim used: ${claimId}`);
    }

    if (claim.supported && claim.confidence === "low") {
      warnings.push(`Low-confidence claim used: ${claimId}`);
      lowConfidenceClaimIds.add(claimId);
    }
  }

  // Deterministic hedging: hedge kalimat yang hanya mengandung marker
  // claim low-confidence dan hitung berapa besar bagian jawaban yang
  // ter-hedge. Kalau masih di bawah batas, kita kirim jawaban yang sudah
  // di-hedge kembali ke user tanpa perlu LLM revision.
  const { hedgedAnswer, hedgedRatio } = applyDeterministicHedging(
    input.answer,
    lowConfidenceClaimIds,
  );

  const status: CitationAuditOutput["status"] =
    failures.length > 0
      ? "failed"
      : warnings.length > 0
        ? "warned"
        : "completed";

  // LLM revision hanya diperlukan jika hedging saja tidak cukup, misal:
  // - terlalu banyak kalimat harus di-hedge (hedgedRatio > limit)
  // - audit "warned" tapi marker claim tidak rapi di batas kalimat sehingga
  //   template hedging tidak aman untuk diterapkan
  const needsLlmRevision =
    status === "warned" && hedgedRatio > LOW_CONF_SENTENCE_RATIO_LIMIT;

  return {
    status,
    cleanAnswer: hedgedAnswer.replace(/\s*\[CLAIM:[^\]]+\]/g, ""),
    citations: input.claimIdsUsed.map((claimId) => ({ claimId })),
    warnings,
    failures,
    needsLlmRevision,
  };
}

function applyDeterministicHedging(
  answer: string,
  lowConfidenceClaimIds: Set<string>,
): { hedgedAnswer: string; hedgedRatio: number } {
  // Pecah jawaban berbasis batas kalimat. Kalimat yang HANYA mengandung
  // marker claim low-confidence dan tidak mengandung marker high/medium
  // boleh di-hedge dengan prefix template. Kalimat yang mencampur tingkat
  // confidence dilewati (akan memicu needsLlmRevision jika ratio tinggi).
  // Detail implementasi: gunakan split sederhana by sentence terminator.
  // Lihat unit test di citation-audit.test.ts untuk kontrak kasus.
  // ... implementasi dihilangkan untuk keringkasan desain ...
  return { hedgedAnswer: answer, hedgedRatio: 0 };
}
```

Catatan:

- `citationAudit` kini mencoba **deterministic hedging** dulu. LLM revision
  (fase `synthesizer_revision`) hanya dipanggil jika hedging template tidak
  cukup, ditandai oleh `needsLlmRevision=true`. Ini mengikuti prinsip
  "rules-based verification > LLM-based verification" dari Anthropic:
  _Building agents with the Claude Agent SDK_.
- Status `failed` tetap berarti orchestrator tidak menampilkan jawaban.
- Status `warned` dengan `needsLlmRevision=false` langsung keluar dengan
  `cleanAnswer` yang sudah di-hedge dan label "warned" di UI.
- Audit `failed` is a valid domain result, not a tool execution failure.

---

## 13. MCP Servers

Suggested location:

```text
apps/api/src/modules/agents/workflows/research/qdrant-tools.ts
apps/api/src/modules/agents/workflows/research/aqsha-tools.ts
apps/api/src/modules/agents/workflows/research/websets-tools.ts
```

### `qdrant-kb` (in-process MCP, read-only retrieval)

Exposed via `createSdkMcpServer(...)`. Researcher memakai tiga tool, critic
hanya memakai `get_chunk`:

```text
mcp__qdrant-kb__check_coverage   (researcher)
mcp__qdrant-kb__hybrid_search    (researcher)
mcp__qdrant-kb__get_chunk        (researcher, critic)
```

### `aqsha` (in-process MCP, domain write tools)

In-process MCP yang menulis langsung ke Postgres. Eksklusif untuk fase
researcher. Ini adalah lapisan yang memungkinkan persistence incremental
tanpa payload besar di structured output.

```text
mcp__aqsha__persist_candidate_source(payload) -> { candidateId }
  # Insert/upsert row ke agent_research_candidate_sources dengan
  # status="candidate". Idempotent by (sessionId, url|doi|externalId).

mcp__aqsha__promote_to_evidence({ candidateId, text, relevance, ... })
  -> { evidenceId }
  # Insert row ke agent_research_evidence_items dan update status
  # candidate_source ke "promoted". Gagal jika candidateId tidak ada
  # atau bukan milik sessionId aktif.

mcp__aqsha__websets_collect({ query, filters, limit })
  -> [{ candidateId, title, url, doi, externalId, websetId,
        websetItemId, reasonFound }]
  # Wrapper deterministik yang memanggil Websets MCP internally
  # (create_webset + create_search + list_webset_items + optional
  # enrichments), menormalisasi item, dan meng-insert sebagai
  # candidate_source. Mengembalikan ringkasan compact ke LLM.
  # LLM tidak pernah melihat raw Websets JSON.
```

Semua `mcp__aqsha__*` tools memeriksa `sessionId` dari context hook
(diset oleh orchestrator sebelum `query()`) untuk memastikan write hanya
bisa ke session yang aktif. Tidak ada cross-session write.

### `websets` (remote MCP)

Websets MCP **tidak di-expose langsung** ke researcher di v2 (lihat §4).
`mcp__aqsha__websets_collect` memakai Websets MCP internally dari sisi
server. Ini membatasi tool surface LLM sekaligus menjaga normalisasi
tetap di TypeScript.

### Event persistence

Semua tool call di-log ke `agent_events` via `PostToolUse` hook, bukan
via handler MCP tool sendiri. Ini menjaga shape event konsisten untuk
semua tool (WebSearch, WebFetch, qdrant-kb, aqsha, subagents).

---

## 14. API Streaming

The API should stream curated progress events to the client while also
persisting source-of-truth state and raw SDK events.

```ts
type AgentProgressEvent =
  | { type: "phase_started"; phase: AgentPhase; iteration?: number }
  | { type: "phase_completed"; phase: AgentPhase; iteration?: number }
  | { type: "awaiting_user"; phase: AgentPhase; questions: string[] }
  | { type: "tool_started"; phase: AgentPhase; toolName: string }
  | { type: "tool_completed"; phase: AgentPhase; toolName: string }
  | { type: "tool_result"; phase: AgentPhase; toolName: string;
      summary: string; iteration?: number }
  | { type: "tool_denied"; phase: AgentPhase; toolName: string;
      reason: string }
  | { type: "subagent_spawned"; phase: AgentPhase;
      subagent: string; taskBrief: string }
  | { type: "subagent_completed"; phase: AgentPhase;
      subagent: string; result: "draft" | "rejected" | "error" }
  | { type: "candidate_source_found"; count: number; iteration: number }
  | { type: "evidence_added"; count: number; iteration: number }
  | { type: "critic_gaps_found"; count: number; iteration: number }
  | { type: "completed"; sessionId: string }
  | { type: "failed"; reason: string };
```

Event wiring:

- `tool_started` / `tool_completed` / `tool_result` / `tool_denied` di-emit
  oleh `PreToolUse` / `PostToolUse` hooks (via budget enforcement).
- `subagent_spawned` / `subagent_completed` di-emit saat researcher memanggil
  `Task` tool dan saat subagent `ResultMessage` datang.
- `candidate_source_found` / `evidence_added` di-emit oleh `PostToolUse`
  ketika `mcp__aqsha__persist_candidate_source` atau
  `mcp__aqsha__promote_to_evidence` sukses.
- `awaiting_user` di-emit ketika planner mengembalikan
  `status="needs_revision"` dan orchestrator transisi ke state
  `awaiting_user`.

Client receives progress events, not raw SDK messages. Raw SDK messages stay in
`agent_events` for internal debugging.

---

## 15. User-Facing Failure Surface

User-facing failures should be concise. Detailed causes remain in `agent_runs`
and `agent_events`.

```text
planner cancelled
  -> "Research dibatalkan karena scope belum valid atau tidak sesuai."

researcher insufficient after max iterations but supported claims exist
  -> continue to synthesis with limitations

researcher insufficient with zero supported claims
  -> no synthesis; show insufficient evidence message

SDK non-success in a phase
  -> "Riset berhenti karena sistem tidak bisa menyelesaikan fase {phase}."

budget exceeded
  -> "Riset mencapai batas penggunaan untuk mode ini."

citation audit failed
  -> no answer shown
  -> show concise conflict/failure summary
```

Insufficient evidence is not automatically a failure. It becomes a failure only
when no supported claims exist.

---

## 16. Aqsha Workspace Structure

`modules/agents` is the platform module for all future agent workflows.
Research is the first workflow.

```text
apps/api/src/modules/agents/
├── index.ts
├── model.ts
├── repository.ts
├── sdk-runner.ts             # query() wrapper + hooks + budget enforce
├── hooks.ts                  # PreToolUse / PostToolUse / SessionEnd
├── service.ts
├── types.ts
└── workflows/
    └── research/
        ├── citation-audit.ts     # deterministic hedging + audit
        ├── orchestrator.ts
        ├── prompts.ts
        ├── qdrant-tools.ts       # in-process MCP: qdrant-kb
        ├── aqsha-tools.ts        # in-process MCP: aqsha (write + websets_collect)
        ├── subagents.ts          # source-vetter definition
        ├── schemas.ts
        └── websets-client.ts     # internal Websets MCP client used by websets_collect

packages/db/src/schema.ts
packages/shared/src/agents.ts
```

Keep SDK runtime code inside `apps/api`. Put shared API/client-facing types in
`packages/shared` only when the web app needs them.

---

## 17. Dependencies

Use Bun because Aqsha pins Bun in `packageManager`.

From the relevant workspace:

```bash
bun add @anthropic-ai/claude-agent-sdk zod zod-to-json-schema @qdrant/js-client-rest
```

- `@anthropic-ai/claude-agent-sdk`: SDK TypeScript.
- `zod`: runtime validation.
- `zod-to-json-schema`: konversi Zod schema ke JSON Schema untuk
  `options.outputFormat = { type: "json_schema", schema: zodToJsonSchema(...) }`.
- `@qdrant/js-client-rest`: Qdrant client untuk in-process MCP
  `mcp__qdrant-kb__*` tools.

Exa Websets MCP requires Exa credentials and MCP configuration in the API
runtime environment. Do not put long-running Websets monitor tools in the v2
allowed tool list.

Potential existing dependencies:

- Drizzle and Postgres client should follow the current `@aqsha/api` database setup.
- OpenAI embeddings should reuse the ingestion embedding provider that already
  writes `embeddingModel = text-embedding-3-small` and `embeddingVersion = v1`.

---

## 18. Example Flow

Query: "Apa dampak penggunaan LLM terhadap produktivitas software engineer?"

```text
user selects: Deep

planner query()
  -> outputFormat json_schema -> structured_output.status = "approved"

iteration 0:
  researcher query() (with gaps=[], criticRecommendation=null, iteration=0)
    -> Qdrant check_coverage: partial
    -> hybrid_search -> get_chunk (a few)
    -> WebSearch -> WebFetch
    -> mcp__aqsha__websets_collect for landscape scan (Deep)
    -> Task spawn source-vetter x 5 in parallel on top web candidates
    -> PostToolUse hook writes events; mcp__aqsha__promote_to_evidence
       writes evidence incrementally (evidence_added events stream to UI)
    -> returns compact ResearcherOutput (evidenceAddedIds, coverageAssessment)

  critic query() (allowedTools: [get_chunk])
    -> calls get_chunk on 2 ambiguous evidence items
    -> claims extracted
    -> evidenceSufficient=false
    -> iterationRecommendation="narrow_gap"
    -> gaps:
       - negative impact/regression evidence still thin
       - senior vs junior effect unclear

iteration 1:
  researcher query() (with gaps, criticRecommendation="narrow_gap", iteration=1)
    -> researcher itself decides to focus Qdrant + WebSearch on the listed
       gaps (no BROAD/GAP_FILLING label from app)
    -> PreToolUse budget hook denies a redundant 9th WebFetch call
       -> tool_denied event emitted to UI
    -> more evidence persisted via promote_to_evidence

  critic query()
    -> evidenceSufficient=true
    -> iterationRecommendation="stop"
    -> remaining gap: limited longitudinal data

synthesizer query()
  -> structured_output: answer with [CLAIM:id] markers + limitations

citationAudit()
  -> 2 low-confidence claims used
  -> deterministic hedging applied to 1 sentence (hedgedRatio=0.1)
  -> status="warned", needsLlmRevision=false
  -> app skips revision phase entirely

final answer delivered (warned)
```

The research loop stops because the app sees `evidenceSufficient=true` or
`iterationRecommendation === "stop"`, not because the SDK agent loop ended.
The SDK agent loop only governs each individual `query()` phase.
