# Aqsha Convex Research Chatbot PRD

Status: Draft for implementation planning  
Last updated: 2026-05-10 (revision 2)  
Primary scope: `apps/app` and `packages/convex`  
Related: `apps/app/DESIGN.md`, `docs/aqsha-prototype.html`

## Problem Statement

Aqsha sedang dipivot dari AI writing and journaling workspace lama menjadi research chatbot personal berbasis Convex. Produk v1 harus membantu satu authenticated user melakukan chat riset, mengumpulkan sumber, menjalankan Deep Research yang tahan refresh atau proses panjang, dan membuka hasil riset sebagai artifact yang bisa diperiksa ulang.

Masalah utama yang harus diselesaikan:

- User butuh satu chat utama untuk bertanya, menelusuri sumber, dan menghasilkan dokumen riset tanpa konsep workspace, organization, member, atau role.
- Jawaban riset tidak boleh hanya berupa final answer. User harus bisa melihat sumber, evidence, citation trail, run status, dan artifact yang dihasilkan.
- Deep Research dapat berjalan lama, memanggil model dan API eksternal, mengambil sumber, membaca dokumen, memverifikasi citation, dan menghasilkan laporan. Runtime harus durable, observable, retryable, dan cancelable.
- Ownership harus sederhana dan aman: semua data dimiliki oleh authenticated user, dan client tidak pernah dipercaya untuk mengirim `userId`.

## Solution

Bangun Aqsha v1 sebagai personal research chatbot:

- `apps/app` menjadi Next.js app utama untuk authenticated chat UX.
- `packages/convex` menjadi backend utama untuk auth, chat, source storage, RAG, workflow state, artifacts, dan public Convex functions.
- `@convex-dev/agent` menjadi source of truth untuk threads, messages, generation, and streaming.
- `@convex-dev/workflow` menjadi primary durable execution layer untuk Deep Research.
- `@convex-dev/rag` menjadi retrieval layer untuk user/document research corpus.
- `@convex-dev/rate-limiter` menjadi quota guard untuk LLM/API usage.
- Better Auth berjalan melalui Convex integration untuk session, auth routes, and server-side trusted identity.

V1 product bukan multi-tenant workspace. Semua thread, artifacts, sources, RAG namespace, usage ledger, dan run history scoped ke satu authenticated user.

## Official Sources

Dokumen ini mengacu pada sumber resmi berikut:

- Convex Agent component: https://docs.convex.dev/agents and https://docs.convex.dev/agents/agent-usage
- Convex Agent streaming: https://docs.convex.dev/agents/streaming
- Convex Workflow component: https://github.com/get-convex/workflow
- Convex RAG component: https://docs.convex.dev/agents/rag and https://github.com/get-convex/rag
- Convex Rate Limiter component: https://docs.convex.dev/agents/rate-limiting and https://github.com/get-convex/rate-limiter
- Better Auth Convex integration: https://better-auth.com/docs/integrations/convex and https://labs.convex.dev/better-auth

## Design System Reference

The visual system for `apps/app` lives in `apps/app/DESIGN.md` and the working prototype at `docs/aqsha-prototype.html`. Key points relevant to this PRD:

- Warm paper palette for light mode; charcoal workspace (not blue-black dashboard) for dark mode.
- Single composer with a 2-position mode switch (Normal / Deep).
- Inline step indicators with a shimmer active state; no workflow status banners.
- One right panel with Sources and Artifacts tabs (conditional).
- Chip color roles: sky for Draft/Normal, mint for Linked/Source/Completed, lemon for Note/Partial, coral for Attention/Retry, lavender for Deep/Review.
- Dark mode is a first-class requirement, not a retrofit.

Product surfaces should not introduce tokens or components that contradict `apps/app/DESIGN.md`.



Current checkout sudah punya pivot scaffold:

- `apps/app` exists as a Next.js 16 app with Better Auth + Convex client provider and a simple Astra smoke path.
- `packages/convex` exists with `@convex-dev/agent`, `@convex-dev/better-auth`, Better Auth routes, and a minimal `astra.sendPrompt` action.
- `packages/convex/convex/schema.ts` is still empty.
- `packages/convex/convex/convex.config.ts` currently installs Better Auth and Agent components only.
- `@convex-dev/workflow`, `@convex-dev/rag`, and `@convex-dev/rate-limiter` are not yet part of the Convex package dependencies/config.

This PRD defines the target product and implementation surface. It does not claim those missing components are already implemented.

## Goals

- Provide a Claude-like personal research chat experience.
- Support Normal and Deep modes from the same chat surface; Normal is tool-enabled and can answer research questions with citations without starting a durable run.
- Stream answers and keep messages visible through refresh/reconnect.
- Persist sources, citation records, and artifacts with user ownership.
- Make Deep Research durable with status, retry, cancellation, and artifact recovery — surfaced to the user as natural inline progress, not raw workflow states.
- Prefer academic/corpus sources when available, with Exa/web as discovery or freshness layer.
- Require important final claims to point to persisted source/citation records.
- Ship both light and dark themes from day one, following the visual language defined in `apps/app/DESIGN.md`.
- Keep v1 user-scoped only.

## Non-Goals

- No `workspaceId`.
- No `organizationId`.
- No teams, invites, member management, org roles, or org RBAC.
- No collaborative editing.
- No legacy journal editor work.
- No risk-stake editor work.
- No migration of historical journal data in this PRD.
- No Postgres/Drizzle feature expansion for the new chatbot runtime.

## User Stories

1. As a signed-out visitor, I want to sign in or sign up, so that my research data is private to my account.
2. As an authenticated user, I want to create a new research thread, so that I can start a focused line of inquiry.
3. As an authenticated user, I want to list my previous threads, so that I can resume past research.
4. As an authenticated user, I want to send a normal chat message, so that I can get quick help without starting a long research run.
5. As an authenticated user, I want streamed assistant output, so that I can see the answer forming without waiting for completion.
6. As an authenticated user, I want to refresh the browser during streaming, so that the thread and partial stream can continue or recover.
7. As an authenticated user, I want Normal mode to retrieve from my corpus or the web when useful, so that I can get cited research answers without explicitly switching modes.
8. As an authenticated user, I want to flip the Deep switch, so that Aqsha runs multi-step source gathering, extraction, synthesis, and verification as a durable job.
9. As an authenticated user, I want to see research progress in the chat itself, so that I know what Aqsha is currently doing (planning, reading sources, drafting, verifying) without having to think about queued/running/retrying states.
10. As an authenticated user, I want to cancel a Deep Research run, so that I can stop an expensive or incorrect request.
11. As an authenticated user, I want to retry a failed Deep Research run, so that transient external/API failures do not lose the whole task.
12. As an authenticated user, I want to inspect sources beside the chat, so that I can judge the answer quality.
13. As an authenticated user, I want to open citation/evidence details for an important claim, so that I can see which source supports it.
14. As an authenticated user, I want generated research documents as artifacts, so that I can read the output separately from the chat stream.
15. As an authenticated user, I want a markdown report artifact, so that I can reuse or export the research result.
16. As an authenticated user, I want my uploaded or saved sources to improve future answers, so that Aqsha remembers my personal research corpus.
17. As an authenticated user, I want source filters by thread or document, so that retrieval can stay focused when needed.
18. As an authenticated user, I want the app to tell me when a claim lacks enough evidence, so that unsupported claims do not look authoritative.
19. As an authenticated user, I want quota/rate-limit feedback, so that I understand when I need to wait before sending another expensive request.
20. As an authenticated user, I want another user to be unable to read my threads, artifacts, sources, or run status, so that privacy is enforced by the backend.

## Product UX

### Main Chat

The first screen after auth is the chat experience, not a dashboard or landing page. The chat layout has:

- Thread list or compact thread switcher.
- Main conversation timeline with streamed assistant responses.
- Prompt input with mode control.
- Run status row for active research jobs.
- Source/citation affordances on answers that used retrieval.

### Right Panel (Sources + Artifacts)

The chat has one right-side panel with two tabs: **Sources** and **Artifacts**. It is not two separate panels. The panel is conditional: it appears when the current thread has at least one source, at least one artifact, or an active Deep Research run that is likely to produce either. Empty/simple chats render full-width without the panel.

Each tab is defined below.

#### Artifacts tab

Shows artifacts scoped to the current thread/run. Supports:

- Generic chat artifact preview.
- Research report preview.
- Markdown, plain text, code, JSON, and sandboxed HTML reader formats.
- Artifact version history.
- Artifact status and generation timestamp.

Opening an artifact shows the reader in the right panel while the chat stays visible. On mobile, the panel becomes a full-screen sheet reader.

#### Sources tab

Shows sources linked to the current thread, the selected answer, a citation marker, an artifact, or a run. Supports:

- Source title, URL/DOI, author/year if available.
- Origin: user corpus, uploaded document, academic search, Exa/web, or manual URL.
- Extract/snippet used by the model.
- Evidence quality or verification status.
- Linked claims that depend on the source.

### Research progress in the chat

Deep Research progress is surfaced inline inside the assistant message as a sequence of short step indicators (for example: "Merencanakan riset", "Mencari sumber", "Membaca dan mengutip", "Menyusun laporan", "Memeriksa kutipan"). At most one step is active at a time with a shimmer/spinner; completed steps show a checkmark; errors show a soft coral marker with a retry affordance in the same spot.

The UI does **not** show raw lifecycle labels like `queued`, `running`, `waiting`, `retrying`, `canceled`. Those statuses are internal execution primitives; the user sees natural progress language and a Stop/Retry affordance. See [Durable Run Lifecycle](#durable-run-lifecycle) for how internal statuses map to UI surfaces.

## Chat Modes

V1 exposes exactly two composer modes: **Normal** and **Deep**. "Research Answer" is not a separate mode; it is an emergent behavior of Normal mode when retrieval tools are useful.

### Normal (default)

Use for conversational work, quick questions, and research answers that do not need a long multi-step run. Normal mode is tool-enabled: the agent may call RAG search over the user corpus, Exa/web discovery, or academic fetch when the question benefits from it, and may return an answer with inline citations. Normal mode does not start a Workflow by default.

Expected behavior:

- Use `@convex-dev/agent` thread/message storage and streaming.
- Save user and assistant messages.
- May call retrieval tools (user RAG namespace, academic fetch, Exa/web) when relevant.
- Persist source records for any source actually cited in the answer.
- Stream an answer with inline citation markers when sources are used.
- No required artifact. A lightweight evidence view may appear when sources exist.
- No claim should imply source verification unless source records exist.

### Deep

Use when the user asks for complex, multi-step, citation-heavy, or report-shaped work. Deep is an explicit switch on the composer; turning it on starts a durable research run for the next message.

Expected behavior:

- Start a Convex Workflow run.
- Persist run record and internal status before expensive work begins.
- Execute internal steps for planning, retrieval, extraction, synthesis, citation verification, and artifact persistence.
- Keep the run observable after refresh.
- Support cancel and retry.
- Produce one primary research report artifact when completed. Sources and citation checks are evidence metadata linked to that artifact version.

## Artifact V1

V1 artifact types:

- `research_report`: Primary Deep Research report.
- `markdown_report` / `document`: Reusable markdown or prose artifacts created in Normal mode.
- `code`, `json`, `plain_text`, `html`: Non-React executable artifact formats for reusable outputs.

Artifact records must include:

- `ownerUserId`
- `threadId`
- optional `runId` when created by workflow
- `type`
- `title`
- current version pointer

Artifact versions are immutable and include:

- `versionNumber`
- `contentFormat`
- `title`
- `body` or storage pointer
- optional `createdByMessageId`
- optional `runId`
- `changeSummary`

Assistant messages may link to artifacts through a message-artifact relation: `created`, `updated`, or `referenced`.
- `createdAt`
- `updatedAt`

## Ownership Model

Ownership is user-scoped only.

Rules:

- Client never sends trusted `userId`.
- Every public Convex function derives the current user from Better Auth/Convex auth server-side.
- Any function that accepts `threadId`, `artifactId`, `sourceId`, or `runId` must verify that the record belongs to the authenticated user before reading or mutating it.
- RAG namespace defaults to one namespace per user.
- Optional RAG filters may narrow by document, source type, or thread, but must not become workspace filters.
- If using raw Convex identity directly, use the stable auth identity recommended by Convex guidelines for auth-linked lookup. If using the Better Auth component user record, use the server-derived user record from `authComponent.getAuthUser(ctx)`.

Disallowed fields in v1 product schema and API contracts:

- `workspaceId`
- `organizationId`
- `teamId`
- `memberId`
- `role`
- `inviteId`
- org RBAC fields

## RAG Namespace Policy

Default namespace:

- `user:{ownerUserId}`

Optional filters:

- `documentId` for a specific uploaded or saved document.
- `threadId` for thread-local retrieval.
- `sourceType` for academic, web, uploaded, manual, or generated.
- `corpusTag` for user-controlled grouping.

Rules:

- Namespace is never based on workspace or organization.
- Source ownership and RAG namespace ownership must be checked before search results are passed to the model.
- Search results must carry enough metadata to create source/citation records.
- Important claims in final answers should reference source records, not raw transient search result objects.

## Durable Run Lifecycle

Internal (workflow) run statuses — used for execution, persistence, retry, and cancellation — are:

- `queued`: request accepted, run record created, waiting to start.
- `running`: workflow has started and at least one step is active.
- `waiting`: workflow is waiting on rate limit, scheduled retry/backoff, external delay, or user clarification.
- `retrying`: retry has been requested or an automatic retry is active after a transient failure.
- `completed`: workflow finished and required outputs were persisted.
- `failed`: workflow ended without required outputs.
- `canceled`: user canceled the run and no further workflow steps should proceed.

Convex Workflow status is the execution primitive. The `researchRuns.status` product column mirrors it so the app can query current state, but the **UI never renders these labels verbatim**. The mapping to user-facing surfaces is:

- `queued` / `running` / `waiting` / `retrying` → inline step indicators in the assistant message; composer shows a **Stop** button instead of Send.
- `completed` → final assistant summary + Artifacts tab reveals the new artifact; step indicators collapse into a short "selesai" trail.
- `failed` → inline retry bubble inside the thread at the point of failure, with a short human reason; composer returns to Send.
- `canceled` → step indicators collapse and a soft "dihentikan" marker is shown inline; no artifact is marked completed.

Minimum run record fields:

- `ownerUserId`
- `threadId`
- `workflowId`
- `mode`
- `status`
- `currentStep`
- `startedAt`
- `updatedAt`
- `completedAt`
- `canceledAt`
- `errorCode`
- `errorMessage`
- `artifactIds`
- `sourceIds`

## Source and Citation Policy

Source priority:

1. User corpus and uploaded/saved documents.
2. Academic sources from configured academic fetch/search providers.
3. Exa/web discovery for breadth, freshness, or missing context.
4. Model prior knowledge only for low-risk background context, never as the only support for important final claims.

Citation rules:

- Every important final claim should map to at least one persisted `source` or `citation` record.
- If no adequate source exists, the answer must say that evidence is insufficient instead of fabricating certainty.
- Source records must persist title, origin, locator, extract/snippet, retrieved time, and enough metadata to inspect the evidence later.
- Generated reports must include source references that can be resolved in the source/citation panel.
- Citation verification is a required Deep Research step before artifact completion.

## Architecture

### `apps/app`

Responsibilities:

- Auth screens and session-aware app shell.
- Convex provider with Better Auth token bridging.
- Thread list, chat timeline, prompt input, mode controls.
- Streamed message rendering from Convex Agent.
- Run status display from workflow/run functions.
- Artifact panel and source/citation panel.

### `packages/convex`

Responsibilities:

- Better Auth routes and server-side auth helpers.
- Agent component configuration for Astra.
- Workflow component configuration for Deep Research.
- RAG component configuration for user corpus retrieval.
- Rate Limiter component configuration for message, LLM request, token, and external API quotas.
- Public functions for app UI.
- Internal functions for workflow steps.
- Product tables for runs, sources, artifacts, citation checks, and usage ledger.

### Components

Use Convex components:

- Agent: threads, messages, generation, and streaming.
- Workflow: durable Deep Research orchestration, cancellation, retry/restart, and status observation.
- RAG: add/search user research corpus with namespaces and filters.
- Rate Limiter: per-user and global quota guard for chat messages, token usage, and external API calls.
- Better Auth: session, auth routes, and trusted user identity.

Consider Workpool only if Deep Research needs explicit parallelism control for Exa fetches, academic fetches, OCR, extraction, or sub-agent steps. It is not a v1 default dependency.

## Public Convex Functions

Function names are conceptual and may be adjusted to match final module naming.

### Threads

- `threads.create({ title?, initialMessage?, mode? })`
  - Creates an Agent thread for the authenticated user.
  - Returns `{ threadId }`.

- `threads.list({ paginationOpts })`
  - Lists only the authenticated user's threads.
  - Returns paginated thread summaries.

- `threads.get({ threadId })`
  - Returns one thread if owned by the authenticated user.

### Messages

- `messages.send({ threadId, content, mode, attachmentIds? })`
  - `mode` is `"normal"` or `"deep"` (v1 contract).
  - Verifies thread ownership.
  - Stores the user message.
  - For `normal`, starts Agent generation/streaming. The agent may call retrieval tools (user RAG, Exa/web, academic fetch) as part of its tool loop when relevant.
  - For `deep`, creates a run and starts the Deep Research workflow; streaming surfaces step progress instead of a single long answer.
  - Returns `{ messageId, runId?, workflowId? }`.

- `messages.list({ threadId, paginationOpts, streamArgs })`
  - Verifies thread ownership.
  - Returns paginated UI messages plus active stream deltas.

### Artifacts

- `artifacts.list({ threadId })`
  - Lists artifacts for an owned thread.

- `artifacts.get({ artifactId, versionId? })`
  - Returns one artifact with its selected/current version if owned by the authenticated user.

- `artifacts.listVersions({ artifactId })`
  - Lists immutable versions for an owned artifact.

- `artifacts.listForMessage({ messageId })`
  - Lists artifact cards linked to an assistant message.

### Sources

- `sources.list({ threadId?, runId?, artifactId? })`
  - Lists source records in the authenticated user's scope.

- `sources.get({ sourceId })`
  - Returns source detail and citation/evidence metadata if owned.

### Runs

- `runs.getStatus({ runId })`
  - Returns product run status and mapped workflow status.

- `runs.cancel({ runId })`
  - Verifies ownership and cancels the underlying workflow when possible.

- `runs.retry({ runId })`
  - Verifies ownership and restarts/retries a failed or retryable run.

### Corpus

- `corpus.addSource({ input })`
  - Adds a user-owned source to the default user namespace.

- `corpus.search({ query, filters? })`
  - Searches only the authenticated user's namespace and allowed filters.

## Internal Workflow Steps

Deep Research workflow steps:

1. `planResearch`
   - Parse user request, define research questions, expected artifact type, and source strategy.

2. `retrieveSources`
   - Search user RAG namespace first.
   - Use academic or web discovery when needed.
   - Persist candidate source records.

3. `readExtract`
   - Fetch, read, OCR/extract, and normalize source content.
   - Store excerpts and metadata needed for citation inspection.

4. `synthesize`
   - Generate structured answer/report sections from extracted evidence.

5. `verifyCitations`
   - Check important claims against source records.
   - Mark unsupported, weakly supported, or supported claims.

6. `persistArtifact`
   - Save research document, source bundle, citation/evidence view, and/or markdown report.
   - Link artifact ids to the run and thread.

7. `finalizeThread`
   - Write assistant summary message that links to artifacts and sources.
   - Mark run `completed`.

8. `recordFailure`
   - Persist failure state and partial source/artifact context if the workflow cannot complete.

## Rate Limits and Quotas

V1 rate limits should include:

- Per-user message send frequency.
- Per-user LLM request frequency.
- Per-user token budget window.
- Global LLM request budget.
- External search/API budget for Exa, academic fetch, OCR, or document extraction.

Rate limit behavior:

- Use `@convex-dev/rate-limiter` in Convex functions before expensive work.
- Return retry timing to the client when a request is blocked.
- Deep Research may move to `waiting` when capacity is reserved or a retry is scheduled.
- Token usage should be recorded after model calls when usage data is available.

## Data Model Direction

Agent component owns thread/message internals. Product tables should store only Aqsha-specific metadata and durable product records:

- `researchRuns`
- `artifacts`
- `artifactVersions`
- `messageArtifacts`
- `researchSources`
- `citationChecks`
- `corpusSources`
- `usageLedger`
- optional `threadMetadata` if Agent component metadata is insufficient for product UI.

Data model rules:

- Every product table has `ownerUserId`.
- Every lookup that starts from an id validates ownership.
- Use indexes that start with ownership fields for user-scoped lists.
- Do not store unbounded arrays for sources, citations, or events inside a single document.
- Store child records separately and page them.

## Acceptance Scenarios

1. Sign in
   - Given a user is signed out, when they sign in through Better Auth, then `apps/app` receives a Convex auth token and public Convex functions can derive the authenticated user server-side.

2. Create thread
   - Given a signed-in user, when they create a thread, then the thread is owned by that user and appears in their thread list.

3. Stream answer
   - Given a signed-in user and an owned thread, when they send a normal chat message, then the assistant response streams into the message list and persists after completion.

4. Refresh while running
   - Given a response or Deep Research run is active, when the browser refreshes, then the user can reopen the thread and see persisted messages, active stream deltas when available, and current run status.

5. Inspect sources
   - Given a research answer used retrieval, when the user opens the source panel, then they see persisted source records with excerpts and metadata.

6. Open artifact
   - Given a Deep Research run completed, when the user opens the artifact panel, then they can view the generated research document or markdown report and its linked sources.

7. Cancel Deep Research
   - Given a Deep Research run is in progress, when the user presses Stop, then the run becomes `canceled`, the workflow is canceled when possible, no new final artifact is marked completed, and the chat shows a soft "dihentikan" marker in place of the active step indicators.

8. Retry Deep Research
   - Given a Deep Research run failed from a retryable error, when the user presses Retry on the inline failure bubble, then a workflow restart/retry occurs and the inline step indicators resume from the appropriate step without exposing `retrying`/`running` labels to the user.

9. Ownership protection
   - Given user A has a `threadId`, `sourceId`, `artifactId`, or `runId`, when user B tries to read or mutate it, then the function denies access.

10. Rate limit feedback
   - Given a user exceeds message or token quota, when they send another expensive request, then the client receives a retry time and the request does not consume model/API work.

## Testing and Verification Decisions

Good tests should assert external behavior and ownership guarantees rather than implementation details.

Minimum verification:

- Typecheck `@aqsha/convex` after adding components and functions.
- Typecheck `@aqsha/app` after wiring UI functions.
- Verify Better Auth sign-in produces an authenticated Convex session.
- Verify thread creation/listing is user-scoped.
- Verify message send streams and persists.
- Verify refresh/reconnect can recover thread state.
- Verify source/artifact functions reject cross-user ids.
- Verify Deep Research status transitions through at least queued, running, completed, failed, and canceled paths.
- Verify retry only works for owned retryable runs.
- Verify RAG search uses per-user namespace and optional filters only.
- Verify rate limits block expensive operations and return retry timing.

Manual acceptance testing should cover all scenarios in the Acceptance Scenarios section before v1 is considered ready for direct user testing.

## Implementation Notes

Recommended implementation order:

1. Install and configure Convex Workflow, RAG, and Rate Limiter components in `packages/convex`.
2. Define product schema for runs, artifacts, sources, citation checks, corpus sources, and usage ledger.
3. Add auth helper that returns the server-derived current user and centralizes ownership assertions.
4. Build public thread/message functions around Agent.
5. Build streamed message listing with active stream deltas.
6. Build source and artifact tables/functions.
7. Add RAG ingestion and user namespace search.
8. Add Deep Research workflow with stubbed internal steps and full status lifecycle.
9. Replace stubs with real retrieval, extraction, synthesis, and citation verification.
10. Build `apps/app` chat, run status, source panel, and artifact panel.
11. Add rate limits around message sending, LLM calls, and external APIs.
12. Run acceptance scenarios and fix gaps before expanding scope.

## Legacy and Out of Scope

The following are explicitly eliminated or out of scope for this PRD:

- **Journal feature (eliminated)**: The old journal editor, "Add to Journal" action, Saved-to-Journal states, Shared Journal, and any journal-shaped surface are removed from the v1 product. They will not be reintroduced in this PRD's scope. Any design or product language inherited from the previous writing-workspace pivot must be adapted to the research-chatbot model (Research Thread, Source Library, Artifact, Sources tab) before it ships.
- Plate editor integration.
- Risk-stake editor.
- Workspace switching.
- Organization membership and permissions.
- Retired PostgreSQL agent runtime.
- Marketing site changes.
- Historical data migration from old threads/journals into Convex.

These may be revisited in separate PRDs only after the personal Convex research chatbot v1 is working end to end.
