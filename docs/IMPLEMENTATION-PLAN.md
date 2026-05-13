# Aqsha Implementation Plan

## Current Scope

Aqsha is a chat-first research product with durable runs, artifact output, and right-panel source provenance inspection.

Keep this boundary:

- No `/sources` page.
- No `/settings/sources` page.
- No sidebar Sources/Sumber item.
- Right-panel Sources is allowed only as thread-scoped provenance/candidate inspection.
- No Source Library or general public source browsing API.
- No public `agent.corpus` ingestion/search API.
- Keep provenance persistence for all source candidates produced by agent tools.

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
- Right panel with `Artefak | Sources`.

Provenance rule:

- Persist external or academic tool candidates to `researchSources` via internal mutation.
- Mark final-answer citations as `cited`; uncited rows stay `candidate`.
- Expose only the active thread's rows through `api.agent.sources.listForThread`.
- Do not expose those records through a Source Library or corpus API.

## Phase 3 - Deep Research

Implemented surface:

- Deep mode starts a durable Convex Workflow run.
- Inline progress blocks show planning, source discovery, reading, synthesis, citation checking, persistence, and finalization.
- Cancel and retry are available for eligible runs.
- Completed runs create an artifact and link it back to the assistant message.
- Compact source actions under runs open the right panel on the focused Sources group.

Provenance rule:

- Deep Research may search external providers, read pages, rerank candidates, store extracts, and write citation checks.
- `researchSources`, `researchExtracts`, and `citationChecks` are retained as backend audit/provenance data.
- Discovery candidates are stored as `candidate`, then upgraded to `accepted` or `rejected`.
- Users inspect generated output through the artifact and candidate provenance through the right-panel Sources tab.

## Verification

Run from the repo root:

```bash
bun run --filter '@aqsha/convex' codegen
bun run --filter '@aqsha/convex' test
bun run --filter '@aqsha/convex' typecheck
bun run --filter '@aqsha/app' typecheck
bun run --filter '@aqsha/app' lint
bun run typecheck
```

## Regression Checks

- Search for `/sources`, `settings/sources`, `Source Library`, and public `api.agent.corpus` usage.
- Confirm app code only calls `api.agent.sources.listForThread`.
- Confirm normal/deep tool source persistence writes candidate/cited/accepted/rejected records.
- Confirm artifact cards still open the right panel.
- Confirm sources alone do not auto-open the right panel.
