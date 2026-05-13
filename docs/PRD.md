# Aqsha Product Requirements

## Product Shape

Aqsha is a personal research chatbot backed by Convex. The product surface is intentionally narrow:

- One authenticated user account.
- Research threads with Normal and Deep modes.
- Durable run status for long research work.
- Artifacts for reusable outputs such as reports, documents, code, and structured notes.
- Right-panel provenance inspection for source candidates produced by runs/messages.

Aqsha does not expose a Source Library page, a Sources sidebar item, a Sources settings page, `/sources`, `/settings/sources`, or public corpus ingestion UI. The only user-facing Sources surface is the right-panel tab for inspecting provenance candidates.

## Core Requirements

1. Authenticated users can create and continue research threads.
2. Normal mode streams a direct answer and may call external tools when evidence is needed.
3. Deep mode starts a durable workflow that can survive refresh, cancel, retry, and completion.
4. Agent/tool runs must persist all produced source candidates and mark whether each was cited, accepted, rejected, or remains a candidate.
5. Users inspect generated work through artifacts and inspect evidence provenance through the right-panel Sources tab.
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

The right panel supports `Artefak | Sources`. It opens when:

- An artifact exists for the current thread.
- A Deep run is active and may create an artifact.
- The user clicks an artifact card.
- The user clicks a compact source action under a message/run or selects the Sources tab.

Artifact creation still auto-opens the panel. Source candidates do not auto-open the panel by themselves. The Sources tab groups candidates by run/message and shows provenance metadata only. It does not include Source Library controls, corpus ingestion, or settings.

### Settings

Settings covers account, appearance, usage/billing, and security. It does not include source readiness, corpus ingestion, or Source Library configuration.

## Backend Requirements

### Agent Tools

Normal and Deep agents may call external tools such as web search, arXiv, DOI/Crossref lookup, page reading, reranking, and artifact creation/update.

When a tool returns evidence candidates, the backend persists those candidates to `researchSources`. Normal mode marks cited final-answer sources as `cited` and uncited rows as `candidate`. Deep mode records discovery candidates and upgrades them to `accepted` or `rejected` during validation/persistence.

### Public API

Public functions should expose:

- Auth/session state.
- Thread list/get/create/send.
- Run status/cancel/retry.
- Artifact list/get/version/message-link APIs.
- Thread-scoped source provenance list API.
- Billing and usage APIs.

Public functions should not expose:

- `corpus.addSource`
- `corpus.search`
- `corpus.list`
- Source Library mutations or general source-browsing APIs outside the active thread.

### Internal Provenance

Internal source storage remains required:

- Normal mode persists source records via internal mutations after tool results are known, with usage labels for cited and candidate rows.
- Deep mode persists source candidates, accepted/rejected validation outcomes, extracts, and citation checks as part of the workflow.
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

`researchSources`, `researchExtracts`, and `citationChecks` are backend provenance tables. Only thread-scoped `researchSources` rows are exposed to the right-panel Sources tab.

## Acceptance Criteria

1. The sidebar has no Sources/Sumber link.
2. `/sources` and `/settings/sources` are not valid product routes.
3. The settings menu has no Sources item.
4. The right panel renders `Artefak | Sources`.
5. App code may call only thread-scoped `api.agent.sources.listForThread`; it must not call corpus APIs.
6. Normal-mode external tool candidates are stored with `cited` or `candidate` usage.
7. Deep-mode source discovery, validation status, extracts, and citation checks still persist.
8. Documentation does not describe Source Library or public corpus APIs as product features.
