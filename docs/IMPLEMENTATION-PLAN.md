# Aqsha Implementation Plan

## Current Scope

Aqsha is a chat-first research product with durable runs and artifact output. The user-facing Sources feature has been removed from scope.

Keep this boundary:

- No `/sources` page.
- No `/settings/sources` page.
- No sidebar Sources/Sumber item.
- No right-panel Sources tab.
- No public `agent.sources` query API.
- No public `agent.corpus` ingestion/search API.
- Keep internal provenance persistence for sources used by agent tools.

## Phase 1 - Shell and Auth

Implemented surface:

- Authenticated Next.js app shell.
- Left sidebar with new chat, thread history, disabled future entries, upgrade card, and user menu.
- Thread routes and empty/new-thread states.
- Settings for account, appearance, usage/billing, and security.

## Phase 2 - Normal Chat and Artifacts

Implemented surface:

- Normal chat through Convex Agent.
- Prompt commands.
- Tool-enabled responses.
- Artifact create/update tools.
- Artifact cards in the message timeline.
- Artifact-only right panel.

Internal provenance rule:

- If external or academic tool results are cited by the final assistant answer, persist the cited results to `researchSources` via an internal mutation.
- Do not expose those records through a Source Library or public source API.

## Phase 3 - Deep Research

Implemented surface:

- Deep mode starts a durable Convex Workflow run.
- Inline progress blocks show planning, source discovery, reading, synthesis, citation checking, persistence, and finalization.
- Cancel and retry are available for eligible runs.
- Completed runs create an artifact and link it back to the assistant message.

Internal provenance rule:

- Deep Research may search external providers, read pages, rerank candidates, store extracts, and write citation checks.
- `researchSources`, `researchExtracts`, and `citationChecks` are retained as backend audit/provenance data.
- Users inspect the output through the artifact, not a Sources tab.

## Verification

Run from the repo root:

```bash
bun run --filter '@aqsha/convex' codegen
bun run typecheck
bun run lint
bun run --filter '@aqsha/app' test
bun run --filter '@aqsha/convex' test
```

## Regression Checks

- Search for `/sources`, `settings/sources`, `Source Library`, and public `api.agent.sources` / `api.agent.corpus` usage.
- Confirm normal/deep tool source persistence still writes internal provenance records.
- Confirm artifact cards still open the right panel.
