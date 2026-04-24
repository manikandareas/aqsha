# Agentic Research System - Design Draft v2

**Stack:** OpenAI Agents SDK (TypeScript) · Bun/Elysia · Drizzle/Postgres · Qdrant Cloud · Exa Websets MCP · text-embedding-3-small

**Models:** `gpt-5` for heavy reasoning (researcher, synthesizer, synthesizer_revision); `gpt-5-mini` for light reasoning (planner, critic). All model names are configurable via `AGENT_*_MODEL` env vars (see §17).

---

## 1. Core Architecture Decision

Rancangan ini memakai **app-level orchestrator** sebagai pengendali domain loop.
OpenAI Agents SDK dipakai untuk setiap fase: tiap fase membangun satu `Agent`
baru dan memanggil `run(agent, input, options)` secara terpisah:

```text
App Orchestrator
  -> run(plannerAgent)
  -> run(researcherAgent)
  -> run(criticAgent)
  -> app decides: continue gap-filling or stop
  -> run(synthesizerAgent)
  -> citationAudit() deterministic TypeScript function
  -> optional run(synthesizerRevisionAgent)
  -> citationAudit() again
```

Ini selaras dengan agent loop resmi OpenAI Agents SDK:

```text
input -> model produces text / tool calls / handoffs -> SDK executes tools
      -> tool results fed back to model -> repeat -> final output matching
         Agent.outputType (Zod schema) -> RunResult
```

Dengan desain ini, SDK agent loop terjadi **di dalam tiap fase**. Research loop
seperti `maxResearchIterations`, `maxRevisionCycles`, audit wajib, retry policy,
dan failure handling ditegakkan oleh aplikasi, bukan hanya prompt.

### Apa yang Tidak Dipakai

- Tidak ada satu Supervisor prompt panjang yang mengatur seluruh workflow.
- Tidak dipakai SDK `handoff()` / agent-as-tool untuk fase utama.
- `planner`, `researcher`, `critic`, dan `synthesizer` bukan subagents yang
  dipanggil oleh Supervisor. Mereka adalah role/fase service-level dengan
  `Agent` + `run()` masing-masing.
- Citation audit bukan tool / subagent. Audit adalah fungsi TypeScript
  deterministik.

### Apa yang Tetap Agentic

- Fase `researcher` tetap memakai agent loop SDK untuk memilih tool call
  Qdrant, hosted `webSearchTool()`, dan Exa Websets (MCP) secara adaptif.
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

Default depth modes:

```text
standard:
  maxResearchIterations = 3
  maxRevisionCycles = 1
  researcher maxTurns = 16
  web_search <= 3 / iteration
  Websets create_webset <= 1
  Websets create_search <= 2
  Websets items <= 20

deep:
  maxResearchIterations = 5
  maxRevisionCycles = 1
  researcher maxTurns = 32
  web_search <= 8 / iteration
  Websets create_webset <= 2
  Websets create_search <= 5
  Websets items <= 100
  Websets enrichments <= 5
```

`Deep` mode harus dipilih eksplisit oleh user dari UI. App boleh menyarankan
Deep untuk literature review besar, tetapi tidak auto-upgrade karena cost dan
durasi lebih tinggi.

### Maximum Revision Cycles

`maxRevisionCycles = 1` means the orchestrator runs the synthesizer, audits,
and — only if audit is `warned` — runs one revision pass followed by a final
audit. If a future mode needs more, thread `maxRevisionCycles` through
`model-manager.ts` like `maxResearchIterations`. Today: always 1.

---

## 3. SDK Agent Loop Boundary

Setiap fase memanggil `run(agent, input, options)` dari OpenAI Agents SDK
sampai menghasilkan `RunResult` dengan `finalOutput` yang cocok dengan
`Agent.outputType` (Zod schema).

Normal termination: `result.finalOutput` is present and parses against the
phase's Zod schema. Any other outcome must map to a retry policy entry or
fail the workflow.

```text
finalOutput present and Zod-valid
  -> persist state
  -> continue

MaxTurnsExceededError
  -> researcher can retry once with reduced scope
  -> planner/critic/synthesizer fail phase

ModelBehaviorError (bad JSON / tool misuse)
  -> retry once only when phase policy allows it

GuardrailTripwireTriggered / Tool*GuardrailTripwireTriggered
  -> fail workflow; tool surface / guardrails need human review

ToolCallError / ToolTimeoutError
  -> retry once when phase policy allows it; else fail phase

UserError / SystemError
  -> fail workflow; configuration issue
```

Retry policy:

```text
planner:
  - retry 1x only for ModelBehaviorError (Zod / JSON failure on final output)
  - retry prompt includes parse error + "return only valid JSON per schema"
  - no retry for MaxTurnsExceeded / GuardrailTripwire

researcher:
  - retry 1x for ModelBehaviorError or transient ToolCallError/ToolTimeoutError
  - retry prompt reduces scope / limits and includes parse error if any
  - no retry for MaxTurnsExceeded if already at researcher maxTurns ceiling

critic:
  - retry 1x only for ModelBehaviorError
  - no retry for MaxTurnsExceeded or guardrail tripwires

synthesizer:
  - retry 1x only for ModelBehaviorError
  - no retry for MaxTurnsExceeded or guardrail tripwires

synthesizer_revision:
  - one domain revision cycle only (controlled by maxRevisionCycles)
  - retry 1x only for ModelBehaviorError

citationAudit:
  - no LLM retry; deterministic function
```

`RunResult.finalOutput` is the canonical extraction path when
`Agent.outputType` is a Zod schema (or JSON schema definition). Do not
parse from text message items. The runner always runs Zod validation before
persistence as a defensive check even though the SDK constrains the shape.

Budgets (`maxBudgetUsd`, `taskBudgetTokens`) are recorded on `agent_runs` for
audit but are **not** enforced by the OpenAI Agents SDK at runtime. `maxTurns`
is the only hard cap the SDK enforces per run; budgets are advisory and
reported via `RunResult.state._context.usage`.

---

## 4. Phase Tool Policy

Tool permissions are strict per phase. The main workflow does not use SDK
handoffs or agent-as-tool.

> **Important:** In the OpenAI Agents SDK, the tool surface for a phase is the
> union of `Agent.tools[]` (function tools built with `tool({ ... })` or hosted
> tools like `webSearchTool()`) and tools exposed by `Agent.mcpServers[]`.
> There is no separate `allowedTools` concept — any tool listed is allowed.
> Phases that should not call tools pass `tools: []` and `mcpServers: []`.
>
> `run(agent, input, { maxTurns })` **must** pass `maxTurns` per phase. It is
> not enough to record it in `agent_runs`; the SDK only enforces the cap when
> it is in the run options.

```text
planner:
  tools:       []
  mcpServers:  []
  maxTurns: 6
  (AskUserQuestion equivalent not wired yet; future work moves this to an
   app-level `awaiting_user_input` state.)

researcher:
  tools:
    - webSearchTool()           # hosted: web search + citations in one call
    - qdrant_check_coverage     # function tool (local)
    - qdrant_vector_search      # function tool (local)
    - qdrant_get_chunk          # function tool (local)
  mcpServers:
    - aqsha-websets (MCPServerStreamableHttp to Exa Websets MCP)
      exposes: create_webset, get_webset, list_webset_items, get_item,
               create_search, get_search, cancel_search,
               create_enrichment, get_enrichment,
               delete_enrichment, cancel_enrichment
  maxTurns: 16 standard, 32 deep

critic:
  tools:       []
  mcpServers:  []
  maxTurns: 8

synthesizer:
  tools:       []
  mcpServers:  []
  maxTurns: 10

synthesizer_revision:
  tools:       []
  mcpServers:  []
  maxTurns: 8
```

Not allowed in v2:

```text
handoff() to subagents for main phases
agent-as-tool for main phases
code interpreter / image generation / file search hosted tools
local filesystem / shell tools (shellTool, applyPatchTool)
mcp__websets__create_monitor
ongoing monitor/background Websets lifecycle tools
```

`webSearchTool()` replaces Claude's separate `WebSearch` and `WebFetch`
built-ins: it returns a model-provided web answer with citations in a single
tool call. The researcher prompt instructs the agent to include the returned
URLs in `candidateSources` and quote exact passages in `evidenceItems`.

An `AskUserQuestion`-style capability is not yet wired. Longer term this can
move to an app-level `awaiting_user_input` state (the OpenAI Agents SDK
supports human-in-the-loop via `needsApproval` on function tools, but that
interrupts the run rather than asking the user).

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

### Retrieval Semantics

Qdrant retrieval is exposed via a single tool named `vector_search` (renamed
from `hybrid_search` to avoid misleading naming until a named-sparse migration
lands). The tool implementation MUST:

1. Embed the query text with `text-embedding-3-small` (1536-dim, cosine) via
   the same OpenAI provider used by ingestion (`embeddingModel = text-embedding-3-small`,
   `embeddingVersion = v1`). The `OPENAI_API_KEY` env var must be available to
   the API runtime.
2. Call `qdrantClient.query(chunkCollection, { query: <vector>, limit, filter,
   with_payload: true })` or equivalent `queryPoints` — never `scroll` with a
   payload text match for retrieval.
3. Accept optional payload filters from the planner/researcher: `indonesiaAffiliated`,
   `contentTier`, `paperType`, `language`, `year` range.
4. Return `{ points: [{ id, score, payload }], usedEmbedding: { model, version } }`.
5. Enforce `limit <= 20`.

App-layer rerank, query expansion, and cross-encoder reranking remain in the
service (not in the MCP tool). Named sparse / multi-vector retrieval is
deferred until a collection migration occurs.

`check_coverage` is a lightweight tool that additionally checks whether a
given query returns any results above a configurable score threshold, so the
researcher can decide whether to fall back to web.

### Deferred Embedding Migration

BGE-M3 hanya opsi migrasi tertunda. Jika dipakai nanti, ia membutuhkan collection
atau version baru dan full reindex karena dense dimension berubah dari `1536` ke
`1024`. Migration tersebut juga harus mendefinisikan apakah sparse atau
multi-vector disimpan di Qdrant, bukan hanya di layer aplikasi.

---

## 6. Exa Websets Policy

Exa Websets MCP tersedia untuk fase `researcher`, tetapi penggunaannya opsional.
Researcher diarahkan untuk memakai Websets hanya ketika research butuh external
entity collection/enrichment, bukan untuk setiap pertanyaan.

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
Websets item / web_search result
  -> agent_research_candidate_sources(status=candidate)

candidate source + fetched/extracted content
  -> candidate_sources(status=fetched)

useful fetched source with ≥ 1 verbatim quote + attributable metadata
  -> agent_research_evidence_items(provenance in [web_fetch, websets_item, websets_enrichment])
  -> candidate_sources(status=promoted)

duplicate (same URL / DOI already promoted), empty fetch, or content too thin
  -> candidate_sources(status=rejected)
```

### Promote / Reject Thresholds

A candidate may be promoted to `agent_research_evidence_items` only if ALL of:

- At least one verbatim quote ≥ 40 chars OR at least one chunk from Qdrant
  with non-empty `snippet`.
- A resolvable `title` AND (`url` OR `doi` OR `chunkId`).
- Not a duplicate of an already `promoted` candidate within the same session
  (dedupe by URL, DOI, or `qdrantPointId`).

Candidates failing these checks are marked `rejected` with `rejectionReason`.
The researcher must not emit evidence items that bypass this pipeline.

---

## 7. Structured Output Contracts

Contracts dibuat di TypeScript dengan Zod. OpenAI Agents SDK menerima Zod
`ZodObject` langsung sebagai `Agent.outputType`, dan SDK memaksa model untuk
menghasilkan output yang cocok; Zod `parse()` tetap dijalankan oleh runner
sebagai defensive check sebelum persistence.

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
  candidateSources: z.array(candidateSourceSchema).default([]),
  evidencePoolDelta: z.array(evidenceItemSchema),
  coverageAssessment: z.enum(["sufficient", "partial", "insufficient"]),
  coverageNotes: z.string(),
  queriesUsed: z.array(z.string()),
});

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
  iterationRecommendation: z.string(),
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
});
```

Do not persist phase outputs as source of truth until they pass Zod validation.
Raw SDK messages can still be stored in `agent_events` for debugging.

### Required per-iteration persistence (MUST)

The researcher phase MUST persist `candidate_sources` and `evidence_items`
before yielding control to the critic. The critic phase MUST persist `claims`
(with `evidenceIds` and `supported`) before the orchestrator decides whether
to continue the loop. Failure to persist fails the phase.

This is load-bearing because:

- The critic in iteration N reads evidence from the repository, not from an
  in-memory variable. Without durable persistence, the "deepening" loop has
  no cross-iteration memory if the server restarts.
- `citationAudit` runs against the critic's persisted supported claims, not
  against synthesizer-declared lists (see §12).
- User-facing failure modes like "zero supported claims" (§15) require the
  claim pool to be queryable.

---

## 8. Postgres Source of Truth

Postgres is the source of truth. Conversation state is not carried across
phases via the SDK; each phase is a fresh `run(agent, input)` call and the
orchestrator passes curated state from Postgres into the next phase's prompt.

`RunResult.lastResponseId` is stored per run on `agent_runs.sdk_session_id` for
observability/debugging (OpenAI Responses API id).

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

  let iteration = 0;
  let evidence = await researchRepository.listEvidence(session.id);
  let latestCritic: CriticOutput | null = null;

  while (iteration < limits.maxResearchIterations) {
    yield progress("phase_started", { phase: "researcher", iteration });

    // The critic's output MUST feed the next researcher iteration.
    // Iteration 0 is BROAD; iteration > 0 receives gaps + nextQueries from
    // the critic and `previousQueries` from the repository so that the
    // researcher can actually deepen instead of re-running the same search.
    const research = await runResearcherPhase({
      sessionId: session.id,
      mode: iteration === 0 ? "BROAD" : "GAP_FILLING",
      researchQuestion: plan.researchQuestion,
      gaps: latestCritic?.gaps ?? [],
      nextQueries: latestCritic?.nextQueries ?? [],
      previousQueries: await researchRepository.listQueries(session.id),
      limits,
    });

    await researchRepository.persistCandidates(session.id, iteration, research.candidateSources);
    await researchRepository.persistEvidence(session.id, iteration, research.evidencePoolDelta);
    yield progress("evidence_added", {
      count: research.evidencePoolDelta.length,
      iteration,
    });

    evidence = await researchRepository.listEvidence(session.id);

    yield progress("phase_started", { phase: "critic", iteration });
    latestCritic = await runCriticPhase({
      sessionId: session.id,
      researchQuestion: plan.researchQuestion,
      evidence,
    });

    await researchRepository.persistClaims(session.id, iteration, latestCritic.claims);
    await researchRepository.setLatestGaps(session.id, latestCritic.gaps);

    if (latestCritic.evidenceSufficient) {
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

  if (audit.status === "warned") {
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
import { Agent, run, type MCPServer, type Tool } from "@openai/agents";
import type { z } from "zod";

export async function runSdkPhase<T>(input: {
  sessionId: string;
  phase: AgentPhase;
  prompt: string;
  systemPrompt: string;              // REQUIRED - assigned to Agent.instructions
  model: string;                     // e.g. "gpt-5", "gpt-5-mini"
  maxTurns: number;                  // REQUIRED - passed to run() options
  schema: z.ZodObject<z.ZodRawShape> & z.ZodType<T>;
  tools?: Tool<unknown>[];           // function tools + hosted tools
  mcpServers?: MCPServer[];          // connected by caller
  retryPolicy: PhaseRetryPolicy;
}): Promise<T> {
  const runRecord = await agentRepository.startRun(input.sessionId, input.phase);

  const agent = new Agent({
    name: `aqsha-${input.phase}`,
    model: input.model,
    instructions: input.systemPrompt,
    tools: input.tools ?? [],
    mcpServers: input.mcpServers ?? [],
    // SDK-native: constrains final output to the Zod schema.
    outputType: input.schema,
  });

  const result = await run(agent, input.prompt, {
    maxTurns: input.maxTurns,
    stream: false,
  });

  if (!result.finalOutput) {
    throw new AgentPhaseError(input.phase, "missing_final_output");
  }

  // Defensive Zod validation even though the SDK constrains the shape.
  return input.schema.parse(result.finalOutput);
}
```

`Agent.instructions` (system prompt) is **mandatory** per phase. Leaving it
unset makes the model run with no role framing at all.

Structured output extraction **must** use `RunResult.finalOutput` with
`Agent.outputType` set to a Zod schema (or `JsonSchemaDefinition`). Extracting
from text items in `result.newItems` is not a sanctioned path.

Usage and trace metadata are available on `result.state._context.usage`
(`inputTokens`, `outputTokens`, `totalTokens`, `requests`,
`requestUsageEntries[]`) and `result.lastResponseId`. The SDK runner persists
these to `agent_runs.usage` / `agent_runs.modelUsage` / `agent_runs.sdkSessionId`.

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

Return PlannerOutput only. Do not perform research. You have no tools in this
phase; if the request is ambiguous, set status="needs_revision" with a concrete
clarification question in the revisionReason field instead of asking the user.
`;
```

### Researcher Prompt

```ts
export const researcherSystemPrompt = `
You are the researcher phase.

Tools available:
- qdrant_check_coverage / qdrant_vector_search / qdrant_get_chunk: local
  academic index. Try these first.
- web_search (hosted): returns web answers with URL citations when internal
  coverage is partial or insufficient.
- Websets MCP tools (create_webset, get_webset, list_webset_items, ...):
  Exa-backed landscape scans for structured entity collection and enrichment.
  Use only when the task benefits from external candidate collection.

Websets outputs are candidate sources. Do not promote them to evidence until
there is enough content and provenance to support citation-quality evidence.

Return ResearcherOutput only:
- candidateSources
- evidencePoolDelta
- coverageAssessment
- coverageNotes
- queriesUsed

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

Return CriticOutput only.
Do not use tools.
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

### Audit inputs

| Input | Source | Notes |
|---|---|---|
| `answer` | synthesizer output | The prose draft. |
| `claimIdsUsed` | synthesizer output | The IDs the synthesizer says it cited. |
| `claims` | **`agent_research_claims`** (critic-persisted, latest iteration) | **Not the synthesizer's self-reported `claims`.** |
| `evidenceIds` | **`agent_research_evidence_items`** (researcher-persisted) | Used to cross-check that each `supported` claim's `evidenceIds[]` still resolve. |

The grounding chain `researcher evidence → critic supports → synthesizer cites`
is enforced by `citationAudit`. The synthesizer cannot supply its own
`evidenceItems` inline for audit purposes; it only picks from an ID pool.

```ts
export function citationAudit(input: {
  answer: string;
  claims: Claim[];              // MUST come from agent_research_claims (critic)
  evidenceIds: Set<string>;     // MUST come from agent_research_evidence_items (researcher)
  claimIdsUsed: string[];
}): CitationAuditOutput {
  const claimById = new Map(input.claims.map((claim) => [claim.claimId, claim]));
  const warnings: string[] = [];
  const failures: string[] = [];

  for (const claimId of input.claimIdsUsed) {
    const claim = claimById.get(claimId);

    if (!claim) {
      failures.push(`Unknown claim id: ${claimId}`);
      continue;
    }

    if (!claim.supported) {
      failures.push(`Unsupported claim used: ${claimId}`);
      continue;
    }

    for (const evidenceId of claim.evidenceIds) {
      if (!input.evidenceIds.has(evidenceId)) {
        failures.push(
          `Claim ${claimId} references missing evidence: ${evidenceId}`,
        );
      }
    }

    if (claim.confidence === "low") {
      warnings.push(`Low-confidence claim used: ${claimId}`);
    }
  }

  return {
    status: failures.length > 0 ? "failed" : warnings.length > 0 ? "warned" : "completed",
    cleanAnswer: input.answer.replace(/\s*\[CLAIM:[^\]]+\]/g, ""),
    citations: input.claimIdsUsed.map((claimId) => ({ claimId })),
    warnings,
    failures,
  };
}
```

Audit `failed` is a valid domain result, not a tool execution failure. The app
must not display the answer when audit fails.

---

## 13. MCP Servers

Suggested location:

```text
apps/api/src/modules/agents/workflows/research/qdrant-tools.ts
apps/api/src/modules/agents/workflows/research/websets-tools.ts
```

Qdrant is exposed as **in-process function tools** built with the OpenAI
Agents SDK `tool({ ... })` helper (not as an MCP server — the SDK's preferred
integration for in-process tools is plain function tools). The researcher
phase gets:

```text
qdrant_check_coverage
qdrant_vector_search
qdrant_get_chunk
```

See §5 "Retrieval Semantics" for the mandatory implementation contract for
`qdrant_vector_search` (query embedding via the official `openai` SDK
`client.embeddings.create(...)` with `text-embedding-3-small`,
`qdrantClient.query(...)` against the chunk collection, optional payload
filters, `limit <= 20`).

The Websets MCP server is configured as a **streamable-HTTP MCP server**
(`MCPServerStreamableHttp`) pointing at `https://websetsmcp.exa.ai/mcp`. The
researcher's `Agent.mcpServers[]` includes it; the SDK auto-discovers the
exposed tool names at connect time. Expected tools:

```text
create_webset, get_webset, update_webset, list_websets, list_webset_items,
get_item, create_search, get_search, cancel_search,
create_enrichment, get_enrichment, delete_enrichment, cancel_enrichment
```

Lifecycle: the orchestrator calls `server.connect()` before `run(agent, ...)`
and `server.close()` when the researcher phase finishes (or errors). Do not
instantiate one MCP server per iteration — reuse the same connection across
all research iterations of a session.

Tool results are persisted in `agent_events`. Candidate sources extracted
from Websets and `webSearchTool()` results are normalized into
`agent_research_candidate_sources`.

---

## 14. API Streaming

The API should stream curated progress events to the client while also
persisting source-of-truth state and raw SDK events.

```ts
type AgentProgressEvent =
  | { type: "phase_started"; phase: AgentPhase; iteration?: number }
  | { type: "phase_completed"; phase: AgentPhase; iteration?: number }
  | { type: "tool_started"; phase: AgentPhase; toolName: string }
  | { type: "tool_completed"; phase: AgentPhase; toolName: string }
  | { type: "candidate_source_found"; count: number; iteration: number }
  | { type: "evidence_added"; count: number; iteration: number }
  | { type: "critic_gaps_found"; count: number; iteration: number }
  | { type: "completed"; sessionId: string }
  | { type: "failed"; reason: string };
```

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

### Follow-up turns (v2)

Follow-up turns on the same `agent_session_id` are **independent research
runs**. They do NOT rely on SDK `resume`/`sessionId` to carry agent state
between runs. The follow-up prompt receives a **compact summary** of the
prior run (the final answer, the claim pool IDs, the evidence pool IDs, and
the most recent user messages) rather than a full JSON dump of everything.

Specifically, the follow-up prompt MUST include:

- The user's new message, verbatim.
- A terse recap of the prior final answer (~300 tokens max).
- The list of prior `evidenceItemIds` and `supportedClaimIds` (IDs only), so
  the researcher can reuse them via the repository instead of re-fetching.
- The last 3 user messages (if any), verbatim.

The follow-up prompt MUST NOT re-serialise the entire prior research context,
plan, or audit as one giant JSON blob. If the researcher needs older
evidence, it queries Postgres / Qdrant via tools.

---

## 16. Aqsha Workspace Structure

`modules/agents` is the platform module for all future agent workflows.
Research is the first workflow.

```text
apps/api/src/modules/agents/
├── index.ts
├── model.ts
├── repository.ts
├── sdk-runner.ts
├── service.ts
├── types.ts
└── workflows/
    └── research/
        ├── citation-audit.ts
        ├── orchestrator.ts
        ├── prompts.ts
        ├── qdrant-tools.ts
        ├── schemas.ts
        └── websets-tools.ts

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
bun add @openai/agents openai zod @qdrant/js-client-rest
```

- `@openai/agents` — OpenAI Agents SDK (includes `Agent`, `run`, `tool`,
  `webSearchTool`, `MCPServerStreamableHttp`, `MCPServerStdio`).
- `openai` — official OpenAI client, used by the Qdrant vector_search tool to
  embed queries with `text-embedding-3-small` via `client.embeddings.create()`.

Required environment variables (`apps/api/.env`):

| Var | Default | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | *required* | Used by both the Agents SDK (LLM calls) and the official `openai` client (embeddings). |
| `QDRANT_URL` / `QDRANT_API_KEY` | *required* | Qdrant Cloud access. |
| `EXA_API_KEY` | optional | Enables Websets MCP server. If unset, researcher runs without Websets. |
| `AGENT_EMBEDDING_MODEL` | `text-embedding-3-small` | Must match ingestion provider. |
| `AGENT_DEFAULT_MODEL` | `gpt-5` | Fallback for phases without explicit model. |
| `AGENT_PLANNER_MODEL` | `gpt-5-mini` | Planner phase. |
| `AGENT_RESEARCHER_MODEL` | `gpt-5` | Researcher phase. |
| `AGENT_CRITIC_MODEL` | `gpt-5-mini` | Critic phase. |
| `AGENT_SYNTHESIZER_MODEL` | `gpt-5` | Synthesizer phase. |
| `AGENT_SYNTHESIZER_REVISION_MODEL` | `gpt-5` | Synthesizer revision phase. |
| `AGENT_STANDARD_MAX_BUDGET_USD` / `AGENT_DEEP_MAX_BUDGET_USD` | `2` / `8` | Advisory only — not enforced by the SDK. |
| `AGENT_STANDARD_TASK_BUDGET_TOKENS` / `AGENT_DEEP_TASK_BUDGET_TOKENS` | `60000` / `140000` | Advisory only. |

Exa Websets MCP requires `EXA_API_KEY`. Do not put long-running Websets
monitor tools in the researcher's tool surface.

Potential existing dependencies:

- Drizzle and Postgres client should follow the current `@aqsha/api` database setup.
- OpenAI embeddings reuse the same `AGENT_EMBEDDING_MODEL` that the ingestion
  pipeline already writes into Qdrant payload (`embeddingModel = text-embedding-3-small`,
  `embeddingVersion = v1`).

---

## 18. Example Flow

Query: "Apa dampak penggunaan LLM terhadap produktivitas software engineer?"

```text
user selects: Deep

run(plannerAgent) [gpt-5-mini]
  -> approved

iteration 0: BROAD
  run(researcherAgent) [gpt-5]
    -> qdrant_check_coverage → partial
    -> qdrant_vector_search → evidence items
    -> webSearchTool() → candidate sources + citations
    -> optional Websets MCP calls for landscape scan
    -> candidateSources persisted
    -> evidencePoolDelta persisted

  run(criticAgent) [gpt-5-mini]
    -> claims extracted
    -> evidenceSufficient=false
    -> gaps:
       - negative impact/regression evidence still thin
       - senior vs junior effect unclear

iteration 1: GAP_FILLING
  run(researcherAgent) [gpt-5]
    -> targeted Qdrant/web/Websets enrichment using critic.nextQueries
    -> more evidence persisted

  run(criticAgent) [gpt-5-mini]
    -> evidenceSufficient=true
    -> remaining gap: limited longitudinal data

run(synthesizerAgent) [gpt-5]
  -> answer with [CLAIM:id] markers and limitations

citationAudit()
  -> warned because 2 low-confidence claims are used

run(synthesizerRevisionAgent) [gpt-5]
  -> hedges or removes low-confidence claims

citationAudit()
  -> passed

final answer delivered
```

---

## 19. SDK Feature Checklist

Per-phase `Agent` construction and `run()` call MUST use these fields.

### Mandatory (every phase)

| Field | Applied to | Required value |
|---|---|---|
| `name` | `new Agent({ ... })` | `aqsha-<phase>` for traceability. |
| `model` | `new Agent({ ... })` | Phase-specific model id from `model-manager` (defaults: `gpt-5-mini` for planner/critic, `gpt-5` for researcher/synthesizer/synthesizer_revision). |
| `instructions` | `new Agent({ ... })` | Phase-specific system prompt string (see §11). Never left unset. |
| `outputType` | `new Agent({ ... })` | Phase's Zod schema (a `ZodObject`). Enforced by the SDK as `RunResult.finalOutput`. |
| `tools` | `new Agent({ ... })` | Function tools and hosted tools for this phase (see §4). `[]` for phases with no tools. |
| `mcpServers` | `new Agent({ ... })` | Array of connected MCP servers for this phase (Websets for researcher only; planner/critic/synthesizer: `[]`). |
| `maxTurns` | `run(agent, input, { maxTurns })` | Phase-specific cap from §2 (e.g. 16 for researcher standard). MUST be passed; not enough to record it. |
| `stream: false` | `run(...)` options | v2 consumes `RunResult` non-streaming. |

### Recorded for audit (not enforced by SDK)

| Field | Stored on | Purpose |
|---|---|---|
| `maxBudgetUsd` | `agent_runs.max_budget_usd` | Per-phase advisory budget. |
| `taskBudgetTokens` | `agent_runs.task_budget_tokens` | Per-phase advisory token budget. |
| `RunResult.state._context.usage` | `agent_runs.usage` + `agent_runs.modelUsage` | Input/output/total tokens, request count, per-request usage entries. |
| `RunResult.lastResponseId` | `agent_runs.sdk_session_id` | OpenAI Responses API id for debugging. |

### Optional (may be added later)

| Feature | Purpose |
|---|---|
| `inputGuardrails` / `outputGuardrails` on `Agent` | Enforce per-iteration Websets / web-search caps, PII redaction, etc. |
| `toolUseBehavior: "stop_on_first_tool"` or `stopAtToolNames` | Cheaply short-circuit a phase when a specific tool yields the final answer. |
| `needsApproval` on function tools | Human-in-the-loop for sensitive tool calls. |
| `session` / `conversationId` on `run()` | Share conversation state across turns. v2 uses compact prompts instead (see §15). |
| `Runner` instance with `RunConfig` | Shared config across multiple runs (e.g. tracing, global model provider). Not required for v2. |

### Explicitly NOT used in v2

- `handoff()` or agent-as-tool between main phases — v2 uses per-phase
  `run()`, not subagents. This is deliberate (budget containment +
  per-iteration persistence + deterministic audit).
- `shellTool` / `applyPatchTool` / `codeInterpreterTool` / `imageGenerationTool` /
  `fileSearchTool` — inappropriate for a research chatbot.
- `needsApproval` gating the main research loop — would break autonomous
  operation. Reserved for future sensitive operations only.

---

The research loop stops because the app sees `evidenceSufficient=true`, not
because the SDK agent loop ended. The SDK agent loop only governs each
individual phase's `run()` call.
