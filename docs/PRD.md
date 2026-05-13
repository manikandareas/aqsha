# Aqsha Product Requirements

## Product Shape

Aqsha is a personal research chatbot backed by Convex. The product surface is intentionally narrow:

- One authenticated user account.
- Research threads with Normal and Deep modes.
- Durable run status for long research work.
- Artifacts for reusable outputs such as reports, documents, code, and structured notes.
- Internal provenance storage for sources used by agent tools.

There is no user-facing Sources feature in this scope. Aqsha does not expose a Source Library page, a Sources sidebar item, a Sources settings page, or a Sources tab in the right panel.

## Core Requirements

1. Authenticated users can create and continue research threads.
2. Normal mode streams a direct answer and may call external tools when evidence is needed.
3. Deep mode starts a durable workflow that can survive refresh, cancel, retry, and completion.
4. Agent/tool runs must persist the sources they actually use or cite as internal provenance records.
5. Users inspect generated work through artifacts, not through a separate sources surface.
6. Cross-user reads and mutations are denied for threads, runs, artifacts, messages, usage, and internal provenance records.

## User-Facing Surfaces

### Chat

The chat is the primary product. It supports:

- New-thread and existing-thread flows.
- Normal and Deep mode selection.
- Prompt commands.
- Inline run progress for long work.
- Artifact cards when a response creates or updates an artifact.

### Artifact Panel

The right panel is artifact-only. It opens when:

- An artifact exists for the current thread.
- A Deep run is active and may create an artifact.
- The user clicks an artifact card.

The panel does not include Sources tabs, source cards, citation-detail views, or Source Library controls.

### Settings

Settings covers account, appearance, usage/billing, and security. It does not include source readiness, corpus ingestion, or Source Library configuration.

## Backend Requirements

### Agent Tools

Normal and Deep agents may call external tools such as web search, arXiv, DOI/Crossref lookup, page reading, reranking, and artifact creation/update.

When a tool returns evidence candidates and the final answer cites them, the backend persists those used sources to `researchSources`. This is an internal audit/provenance table, not a public feature.

### Public API

Public functions should expose:

- Auth/session state.
- Thread list/get/create/send.
- Run status/cancel/retry.
- Artifact list/get/version/message-link APIs.
- Billing and usage APIs.

Public functions should not expose:

- `corpus.addSource`
- `corpus.search`
- `corpus.list`
- `sources.list`
- `sources.get`
- Source Library mutations or queries.

### Internal Provenance

Internal source storage remains required:

- Normal mode persists source records via internal mutations after cited tool results are known.
- Deep mode persists source records, extracts, and citation checks as part of the workflow.
- Provenance records are scoped by `ownerUserId`, `threadId`, and when applicable `messageId`, `runId`, `artifactId`, and `artifactVersionId`.

## Data Model

Required product tables include:

- `threadMetadata`
- `usageLedger`
- billing tables
- `messageCommands`
- `agentRuns`
- `agentRunSteps`
- `agentRunEvents`
- `artifacts`
- `artifactVersions`
- `messageArtifacts`
- `researchSources`
- `researchExtracts`
- `citationChecks`
- `externalLookupCache`

`researchSources`, `researchExtracts`, and `citationChecks` are backend provenance tables. They do not imply a user-facing Sources feature.

## Acceptance Criteria

1. The sidebar has no Sources/Sumber link.
2. `/sources` and `/settings/sources` are not valid product routes.
3. The settings menu has no Sources item.
4. The right panel renders artifacts only.
5. No app code calls `api.agent.sources.*` or `api.agent.corpus.*`.
6. Normal-mode cited external tool results are still stored through internal provenance persistence.
7. Deep-mode source discovery and citation checks still persist internally.
8. Documentation does not describe Source Library, Sources tab, or public sources/corpus APIs as product features.
