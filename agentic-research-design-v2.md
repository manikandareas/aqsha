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
  -> query(researcher)
  -> query(critic)
  -> app decides: continue gap-filling or stop
  -> query(synthesizer)
  -> citationAudit() deterministic TypeScript function
  -> optional query(synthesizer revision)
  -> citationAudit() again
```

Ini lebih selaras dengan definisi resmi Claude Agent SDK agent loop:

```text
prompt -> Claude decides response/tool calls -> SDK executes tools
       -> tool results return to Claude -> repeat -> ResultMessage
```

Dengan desain ini, SDK agent loop terjadi **di dalam tiap fase**. Research loop
seperti `maxResearchIterations`, `maxRevisionCycles`, audit wajib, retry policy,
dan failure handling ditegakkan oleh aplikasi, bukan hanya prompt.

### Apa yang Tidak Dipakai

- Tidak ada satu Supervisor prompt panjang yang mengatur seluruh workflow.
- Tidak ada SDK `Agent` tool untuk fase utama.
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

Default depth modes:

```text
standard:
  maxResearchIterations = 3
  maxRevisionCycles = 1
  researcher maxTurns = 16
  WebSearch <= 3 / iteration
  WebFetch <= 8 / iteration
  Websets create_webset <= 1
  Websets create_search <= 2
  Websets items <= 20

deep:
  maxResearchIterations = 5
  maxRevisionCycles = 1
  researcher maxTurns = 32
  WebSearch <= 8 / iteration
  WebFetch <= 20 / iteration
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

Setiap fase memanggil Claude Agent SDK `query()` sampai menghasilkan
`ResultMessage`.

Only `ResultMessage.subtype === "success"` is a valid completed phase. Subtype
lain harus masuk retry policy eksplisit atau menghentikan workflow.

```text
success
  -> read ResultMessage.structured_output (SDK native)
  -> validate with Zod
  -> persist state
  -> continue

error_max_turns
  -> researcher can retry once with reduced scope
  -> planner/critic/synthesizer fail phase

error_max_budget_usd
  -> fail workflow as budget limit reached

error_max_structured_output_retries
  -> fail phase; do not add another app-level retry on top

error_during_execution
  -> retry once only when phase policy allows it

blocked_by_permissions / permission_denied
  -> fail workflow; allowedTools/tools should be fixed per phase

missing ResultMessage / unknown subtype
  -> fail workflow and keep raw events for debugging
```

Retry policy:

```text
planner:
  - retry 1x only for Zod validation failure on structured output
  - retry prompt includes parse error + "return only valid JSON per schema"
  - no retry for SDK non-success

researcher:
  - retry 1x for error_during_execution or Zod validation failure
  - retry prompt reduces scope / limits and includes parse error if any
  - no retry for budget limit or structured-output-retries

critic:
  - retry 1x only for Zod validation failure
  - no retry for SDK non-success

synthesizer:
  - retry 1x only for Zod validation failure
  - no retry for SDK non-success

synthesizer_revision:
  - one domain revision cycle only (controlled by maxRevisionCycles)
  - retry 1x only for Zod validation failure

citationAudit:
  - no LLM retry; deterministic function
```

`ResultMessage.structured_output` is the canonical extraction path when
`outputFormat: { type: "json_schema", schema }` is set in `Options`. Do not
parse from `finalText`. Zod validation always runs before persistence, even
though the SDK already constrains the shape.

---

## 4. Phase Tool Policy

Tool permissions are strict per phase. The main workflow does not use the SDK
`Agent` tool.

> **Important:** `Options.tools` and `Options.allowedTools` are two different
> concepts. `tools` is the _registration_ list for the base set of built-in
> tools (e.g. `WebSearch`, `WebFetch`, `AskUserQuestion`). Passing `tools: []`
> disables all built-in tools. `allowedTools` only auto-approves already-
> registered tool names. Therefore, **every built-in tool a phase needs must
> appear in both `tools` (registered) and `allowedTools` (auto-approved).**
> MCP tool names (`mcp__<server>__<tool>`) only need to appear in
> `allowedTools`.
>
> `Options.maxTurns` **must** be passed to `query()` per phase. It is not
> enough to record it in `agent_runs`; the SDK only enforces it when it is in
> `Options`.

```text
planner:
  tools:        ["AskUserQuestion"]
  allowedTools: ["AskUserQuestion"]
  maxTurns: 4

researcher:
  tools:        ["WebSearch", "WebFetch"]
  allowedTools:
    - WebSearch
    - WebFetch
    - mcp__qdrant-kb__check_coverage
    - mcp__qdrant-kb__vector_search
    - mcp__qdrant-kb__get_chunk
    - mcp__websets__create_webset
    - mcp__websets__get_webset
    - mcp__websets__list_webset_items
    - mcp__websets__get_item
    - mcp__websets__create_search
    - mcp__websets__get_search
    - mcp__websets__create_enrichment
    - mcp__websets__get_enrichment
  maxTurns: 16 standard, 32 deep

critic:
  tools:        []
  allowedTools: []
  maxTurns: 4

synthesizer:
  tools:        []
  allowedTools: []
  maxTurns: 4

synthesizer_revision:
  tools:        []
  allowedTools: []
  maxTurns: 3
```

Not allowed in v2:

```text
Agent
write/edit tools
shell tools
mcp__websets__create_monitor
ongoing monitor/background Websets lifecycle tools
```

`AskUserQuestion` is allowed only in planning for the current version. Longer
term, this can move to an app-level `awaiting_user_input` state.

---

## 5. Current Qdrant Schema Contract

Desain aktif harus mengikuti `qdrant-turso-current-state.md`.
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
Websets item / WebSearch hit
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

Contracts dibuat di TypeScript dengan Zod. Jika Claude Agent SDK TypeScript
mendukung structured output schema langsung di `query()`, gunakan itu. Jika
belum tersedia atau tidak cukup stabil, fallback ke prompt JSON-only plus Zod
validation dan retry satu kali sesuai phase policy.

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
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
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

export const agentResearchCandidateSources = pgTable(
  "agent_research_candidate_sources",
  {
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
  },
);

export const agentResearchEvidenceItems = pgTable(
  "agent_research_evidence_items",
  {
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
  },
);

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

    await researchRepository.persistCandidates(
      session.id,
      iteration,
      research.candidateSources,
    );
    await researchRepository.persistEvidence(
      session.id,
      iteration,
      research.evidencePoolDelta,
    );
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

    await researchRepository.persistClaims(
      session.id,
      iteration,
      latestCritic.claims,
    );
    await researchRepository.setLatestGaps(session.id, latestCritic.gaps);

    if (latestCritic.evidenceSufficient) {
      break;
    }

    iteration += 1;
  }

  const supportedClaims = await researchRepository.listSupportedClaims(
    session.id,
  );

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
import { type Options, query } from "@anthropic-ai/claude-agent-sdk";

export async function runSdkPhase<T>(input: {
  sessionId: string;
  phase: AgentPhase;
  prompt: string;
  systemPrompt: string; // REQUIRED - never inherit the SDK default
  options: Options; // must include maxTurns, tools, allowedTools,
  // mcpServers, outputFormat, maxBudgetUsd, taskBudget
  schema: ZodSchema<T>;
  retryPolicy: PhaseRetryPolicy;
}): Promise<T> {
  const run = await agentRepository.startRun(input.sessionId, input.phase);
  let resultMessage: SDKResultMessage | undefined;

  for await (const message of query({
    prompt: input.prompt,
    options: {
      ...input.options,
      systemPrompt: input.systemPrompt,
    },
  })) {
    await agentRepository.appendEvent(run.id, message);
    if (message.type === "result") resultMessage = message;
  }

  if (!resultMessage) {
    throw new AgentPhaseError(input.phase, "missing_result");
  }
  if (resultMessage.subtype !== "success") {
    throw new AgentPhaseError(input.phase, resultMessage.subtype);
  }

  // SDK-native: structured_output is the canonical extraction path.
  // Do not parse from finalText.
  return input.schema.parse(resultMessage.structured_output);
}
```

`systemPrompt` is **mandatory** per phase. Leaving it unset makes the SDK fall
back to the Claude Code coding-agent preset, which is the wrong framing for
research roles and pollutes prompt caches.

Structured output extraction **must** use `ResultMessage.structured_output`
(available when `outputFormat: { type: "json_schema", schema }` is set).
Extracting from assembled `finalText` is no longer a sanctioned path.

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

Return PlannerOutput only.
If the request is ambiguous, use AskUserQuestion when needed.
Do not perform research.
`;
```

### Researcher Prompt

```ts
export const researcherSystemPrompt = `
You are the researcher phase.

Use internal Qdrant first. Use WebSearch/WebFetch when internal coverage is
partial or insufficient. Use Exa Websets only when the task benefits from
external candidate collection or enrichment.

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

| Input          | Source                                                           | Notes                                                                            |
| -------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `answer`       | synthesizer output                                               | The prose draft.                                                                 |
| `claimIdsUsed` | synthesizer output                                               | The IDs the synthesizer says it cited.                                           |
| `claims`       | **`agent_research_claims`** (critic-persisted, latest iteration) | **Not the synthesizer's self-reported `claims`.**                                |
| `evidenceIds`  | **`agent_research_evidence_items`** (researcher-persisted)       | Used to cross-check that each `supported` claim's `evidenceIds[]` still resolve. |

The grounding chain `researcher evidence → critic supports → synthesizer cites`
is enforced by `citationAudit`. The synthesizer cannot supply its own
`evidenceItems` inline for audit purposes; it only picks from an ID pool.

```ts
export function citationAudit(input: {
  answer: string;
  claims: Claim[]; // MUST come from agent_research_claims (critic)
  evidenceIds: Set<string>; // MUST come from agent_research_evidence_items (researcher)
  claimIdsUsed: string[];
}): CitationAuditOutput {
  const claimById = new Map(
    input.claims.map((claim) => [claim.claimId, claim]),
  );
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
    status:
      failures.length > 0
        ? "failed"
        : warnings.length > 0
          ? "warned"
          : "completed",
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

Qdrant is exposed as an in-process MCP server with `createSdkMcpServer(...)`.
The researcher phase can call:

```text
mcp__qdrant-kb__check_coverage
mcp__qdrant-kb__vector_search
mcp__qdrant-kb__get_chunk
```

See §5 "Retrieval Semantics" for the mandatory implementation contract for
`vector_search` (query embedding with `text-embedding-3-small`, `qdrantClient.query(...)`
against the chunk collection, optional payload filters, `limit <= 20`).

The Websets MCP server can be configured as a remote/external MCP server. The
researcher phase can call:

```text
mcp__websets__create_webset
mcp__websets__get_webset
mcp__websets__list_webset_items
mcp__websets__get_item
mcp__websets__create_search
mcp__websets__get_search
mcp__websets__create_enrichment
mcp__websets__get_enrichment
```

Tool results should be persisted in `agent_events`. Candidate sources extracted
from Websets/WebSearch should be normalized into
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
bun add @anthropic-ai/claude-agent-sdk zod @qdrant/js-client-rest
```

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
  -> approved

iteration 0: BROAD
  researcher query()
    -> Qdrant coverage partial
    -> Qdrant searches
    -> WebSearch/WebFetch
    -> optional Websets candidate source collection
    -> candidateSources persisted
    -> evidencePoolDelta persisted

  critic query()
    -> claims extracted
    -> evidenceSufficient=false
    -> gaps:
       - negative impact/regression evidence still thin
       - senior vs junior effect unclear

iteration 1: GAP_FILLING
  researcher query()
    -> targeted Qdrant/WebSearch/Websets enrichment
    -> more evidence persisted

  critic query()
    -> evidenceSufficient=true
    -> remaining gap: limited longitudinal data

synthesizer query()
  -> answer with [CLAIM:id] markers and limitations

citationAudit()
  -> warned because 2 low-confidence claims are used

synthesizer revision query()
  -> hedges or removes low-confidence claims

citationAudit()
  -> completed

final answer delivered
```

---

## 19. SDK Feature Checklist

Per-phase `query()` calls MUST use these SDK `Options` fields.

### Mandatory (every phase)

| Option                            | Required value                                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `model`                           | Phase-specific model id from `model-manager` (default `claude-sonnet-4-6`).                            |
| `systemPrompt`                    | Phase-specific string (see §11). Never left unset.                                                     |
| `outputFormat`                    | `{ type: "json_schema", schema: <Zod → JSON Schema> }`.                                                |
| `tools`                           | Built-in registration list for this phase (see §4). `[]` for phases with no built-ins.                 |
| `allowedTools`                    | Union of registered built-ins this phase uses + MCP tool names (`mcp__<server>__<tool>`).              |
| `mcpServers`                      | Map of MCP servers this phase uses (Qdrant + optionally Websets for the researcher only).              |
| `maxTurns`                        | Phase-specific cap from §2 (e.g. 16 for researcher standard). MUST be passed; not enough to record it. |
| `maxBudgetUsd`                    | Phase-specific budget cap.                                                                             |
| `taskBudget`                      | `{ total: <tokens> }` per phase.                                                                       |
| `permissionMode`                  | `"dontAsk"`.                                                                                           |
| `env.CLAUDE_AGENT_SDK_CLIENT_APP` | `"@aqsha/api"`.                                                                                        |

### Optional (may be added later)

| Option                   | Purpose                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `hooks.PreToolUse`       | Enforce per-iteration `WebSearch`/`WebFetch`/`Websets` caps from §2.                                                      |
| `canUseTool`             | Dynamic authorisation (alternative to `hooks`).                                                                           |
| `effort`                 | `"low"` for planner/critic, `"high"` for researcher, etc. Not required in v2.                                             |
| `agentProgressSummaries` | Progress events for long-running subagents. Not used — v2 doesn't use subagents.                                          |
| `promptSuggestions`      | Must be `false` or unset; not part of the research workflow.                                                              |
| `sessionId` / `resume`   | Not used for phase orchestration in v2. May be used for follow-up turns if and only if §15 follow-up strategy is revised. |

### Explicitly NOT used in v2

- `agents` / the `Agent` tool — v2 uses per-phase `query()`, not subagents. This
  is deliberate (budget containment + per-iteration persistence + deterministic
  audit).
- `Options.tools: { type: "preset", preset: "claude_code" }` — would pull in
  `Read`/`Write`/`Edit`/`Bash`, inappropriate for a research chatbot.
- `permissionMode: "bypassPermissions"` — never.

---

The research loop stops because the app sees `evidenceSufficient=true`, not
because the SDK agent loop ended. The SDK agent loop only governs each individual
`query()` phase.
