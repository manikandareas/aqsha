# Aqsha Education Research Workspace Implementation Plan

## Scope

This plan implements the product direction in `docs/PRD.md`: Aqsha becomes a personal education research workspace with workspace-owned documents, URL artifacts, and thread-level artifact context.

Breaking Convex schema changes are allowed. No data migration or backfill is required. The current artifact versioning model should be replaced rather than preserved.

Do not restore:

- `/sources`
- Source Library
- Sources sidebar item
- Sources settings
- Sources tab or user-facing provenance panel
- Separate generated-artifact right panel
- User-facing artifact version history

## Current Codebase Findings

### Active packages

The active product surface is:

- `apps/app`: Next.js 16 App Router app.
- `packages/convex`: Convex backend, Agent, Workflow, Better Auth, billing, rate limits, research tools, and provenance.
- `packages/ui`: shared UI primitives and token CSS.
- `apps/www`: marketing site.

Use Bun workspace commands from the repo root. Do not use npm, pnpm, or yarn.

### Convex schema

`packages/convex/convex/schema.ts` currently has:

- `agentRuns`, `agentRunSteps`, `agentRunEvents`, and `researchRoundStates` for Deep Research execution.
- `artifacts` keyed by `ownerUserId`, `threadId`, and optional `runId`.
- `artifactVersions` as a separate user-facing version table.
- `messageArtifacts` linking messages to artifact versions.
- `citationChecks` linked to both artifact and artifact version.
- `researchSources` and `researchExtracts` as provenance records.

There are no first-class `workspaces`, `workspaceFolders`, `artifactDocuments`, `artifactUrls`, or `threadContextArtifacts` tables yet.

### Agent messages

`packages/convex/convex/agent/messages.ts` currently:

- Uses `@convex-dev/agent` helpers such as `createThread`, `listUIMessages`, and `syncStreams`.
- Uses `astra.streamText` for Normal mode streaming.
- Persists cited source candidates through `internal.agent.sources.persistCited`.
- Attaches tool-created artifacts to assistant messages through `internal.agent.artifacts.attachToMessage`.
- Keeps billing, usage tracking, rate limiting, prompt commands, thread title generation, and inline run state around the generation path.

Prompt injection for selected context artifacts should be added before `astra.streamText` receives the prompt. The client should only toggle selected artifacts through backend mutations; generation should resolve the actual artifact records server-side.

Generated outputs from Normal tools and Deep Research should be saved as workspace artifacts and opened through the main content surface. Do not keep generated artifacts as a separate right-panel surface.

### Agent artifacts

`packages/convex/convex/agent/artifacts.ts` currently:

- Lists artifacts by thread or run.
- Fetches the current or requested artifact version.
- Lists versions.
- Creates and updates artifact versions from agent tool calls.
- Links artifacts to messages with a required `versionId`.
- Stores large bodies in Convex storage when they exceed the inline limit.

This file should become the main migration point for the flattened artifact model. Remove public version APIs and update tool-facing mutations to write current artifact content directly.

### Agent sources

`packages/convex/convex/agent/sources.ts` currently:

- Lists provenance rows for a thread.
- Persists cited sources for assistant messages.
- Upserts candidate, accepted, and rejected sources for research runs.

Keep this as provenance infrastructure. Do not turn it into user-managed library CRUD.

### Thread experience UI

`apps/app/features/thread-experience` currently has the old chat-first panel shape:

- Loads threads, runs, artifacts, and sources through Convex queries.
- Renders the main chat surface with a right panel that mixes generated artifacts and provenance.
- Opens the right panel when artifact payloads exist.
- Includes provenance UI state that must be removed from the product surface.

This is the old UI shape that the new plan should replace. The right panel should become a context artifact picker only. Generated artifacts should open in the main workspace surface. Source/provenance records stay backend-only and should not render as a Sources tab or panel.

## External Library Notes

### Convex

Use indexed tables for workspace, folder, artifact, and thread-context reads. Avoid unbounded document arrays; child collections such as folders, artifacts, selected context rows, and provenance records should be separate tables. Use pagination or explicit limits for artifact lists. Derive ownership from authenticated user records server-side, not from client-provided user IDs.

Convex documents have size limits. Store large artifact bodies in Convex storage when they exceed the inline threshold, and keep searchable/context summaries as bounded fields on the artifact-specific tables.

Relevant local rule: `packages/convex/convex/_generated/ai/guidelines.md` requires schema definitions in `convex/schema.ts`, validators on all functions, server-derived auth identity, and no unbounded arrays.

### BlockNote

Use:

- `@blocknote/core`
- `@blocknote/react`
- `@blocknote/shadcn`

BlockNote documents can be saved as JSON by serializing `editor.document`. Use the JSON block structure as the canonical editable body. Derive Markdown and plain text from the editor for AI context and export.

In Next.js, load the editor through a Client Component with `dynamic(() => import(...), { ssr: false })` because the editor depends on browser APIs.

### AI SDK and Convex Agent

Keep the existing Convex Agent streaming path. The implementation should add selected artifact context as prompt input before generation, not replace `astra.streamText`, `syncStreams`, or existing message persistence.

The prompt context should be bounded and deterministic. It should be assembled from server-owned artifact rows, clipped to a maximum character budget, and inserted before the user's prompt with clear separators.

### Next.js 16

Keep routes and layouts App Router-native. Interactive editors, pickers, and right-panel controls should be Client Components. Server Components can own route-level loading and shell composition where practical, but browser-only editor code must stay behind a client-only dynamic import.

## Target Data Model

### `workspaces`

Fields:

- `ownerUserId: string`
- `name: string`
- `description?: string`
- `createdAt: number`
- `updatedAt: number`
- `archivedAt?: number`

Indexes:

- `by_owner_updated`: `["ownerUserId", "updatedAt"]`

### `workspaceFolders`

Fields:

- `ownerUserId: string`
- `workspaceId: Id<"workspaces">`
- `name: string`
- `createdAt: number`
- `updatedAt: number`

Indexes:

- `by_owner_workspace_name`: `["ownerUserId", "workspaceId", "name"]`
- `by_owner_workspace_updated`: `["ownerUserId", "workspaceId", "updatedAt"]`

No `parentFolderId`. Folder nesting is not supported.

### `artifacts`

Replace the thread/run-generated-only shape with a generalized current-state artifact table.

Fields:

- `ownerUserId: string`
- `workspaceId: Id<"workspaces">`
- `folderId?: Id<"workspaceFolders">`
- `threadId?: string`
- `runId?: Id<"agentRuns">`
- `kind: "document" | "url" | "generated"`
- `type: "document" | "url" | "research_report" | "markdown_report" | "research_document" | "code" | "html" | "json" | "plain_text"`
- `title: string`
- `contentFormat?: "blocknote" | "markdown" | "html" | "plain" | "code" | "json"`
- `body?: string`
- `storageId?: Id<"_storage">`
- `plainTextPreview?: string`
- `contextText?: string`
- `createdByMessageId?: string`
- `createdAt: number`
- `updatedAt: number`
- `deletedAt?: number`

Indexes:

- `by_owner_workspace_updated`: `["ownerUserId", "workspaceId", "updatedAt"]`
- `by_owner_workspace_folder_updated`: `["ownerUserId", "workspaceId", "folderId", "updatedAt"]`
- `by_owner_thread_created`: `["ownerUserId", "threadId", "createdAt"]`
- `by_owner_run`: `["ownerUserId", "runId"]`

Remove `currentVersionId`.

### `artifactDocuments`

Fields:

- `ownerUserId: string`
- `artifactId: Id<"artifacts">`
- `workspaceId: Id<"workspaces">`
- `blocksJson?: string`
- `blocksStorageId?: Id<"_storage">`
- `markdown?: string`
- `markdownStorageId?: Id<"_storage">`
- `plainText: string`
- `createdAt: number`
- `updatedAt: number`

Indexes:

- `by_owner_artifact`: `["ownerUserId", "artifactId"]`
- `by_owner_workspace_updated`: `["ownerUserId", "workspaceId", "updatedAt"]`

### `artifactUrls`

Fields:

- `ownerUserId: string`
- `artifactId: Id<"artifacts">`
- `workspaceId: Id<"workspaces">`
- `url: string`
- `normalizedUrl: string`
- `title?: string`
- `description?: string`
- `siteName?: string`
- `status: "pending" | "ready" | "failed"`
- `readableText?: string`
- `readableTextStorageId?: Id<"_storage">`
- `failureReason?: string`
- `fetchedAt?: number`
- `createdAt: number`
- `updatedAt: number`

Indexes:

- `by_owner_artifact`: `["ownerUserId", "artifactId"]`
- `by_owner_workspace_status`: `["ownerUserId", "workspaceId", "status"]`
- `by_owner_workspace_normalized_url`: `["ownerUserId", "workspaceId", "normalizedUrl"]`

### `threadContextArtifacts`

Fields:

- `ownerUserId: string`
- `threadId: string`
- `workspaceId: Id<"workspaces">`
- `artifactId: Id<"artifacts">`
- `createdAt: number`

Indexes:

- `by_owner_thread_created`: `["ownerUserId", "threadId", "createdAt"]`
- `by_owner_thread_artifact`: `["ownerUserId", "threadId", "artifactId"]`
- `by_owner_workspace_artifact`: `["ownerUserId", "workspaceId", "artifactId"]`

Use a row per selected artifact. Do not store selected artifact IDs as an array on the thread.

## Function Plan

### Workspaces

Add `packages/convex/convex/workspaces.ts`.

Public functions:

- `list`
- `get`
- `create`
- `rename`
- `archive` or `remove`

Rules:

- Resolve current user server-side through existing auth helpers.
- Enforce owner checks on every read/write.
- Use pagination or a bounded `take` for lists.
- Optionally create a default workspace on first authenticated use.

### Folders

Add `packages/convex/convex/workspaceFolders.ts`.

Public functions:

- `list`
- `create`
- `rename`
- `remove`

Rules:

- Require a valid owned `workspaceId`.
- Do not accept or store a parent folder.
- On folder deletion, patch child artifacts to clear `folderId` or require the caller to move/delete children first. Prefer clearing `folderId` for the first implementation.

### Artifacts

Refactor `packages/convex/convex/agent/artifacts.ts` or split workspace artifact CRUD into `packages/convex/convex/artifacts.ts` and keep agent-specific helpers under `agent/artifacts.ts`.

Public functions:

- `listByWorkspace`
- `get`
- `createDocument`
- `updateDocument`
- `createUrl`
- `retryUrlExtraction`
- `rename`
- `move`
- `remove`

Internal functions:

- `createGeneratedFromAgent`
- `updateGeneratedFromAgent`
- `attachToMessage`
- `getContextForThread`

Rules:

- Remove `listVersions`.
- Remove public `versionId` arguments.
- Make `messageArtifacts` point to current `artifactId` without `versionId`.
- Keep large body storage behavior.
- Update `citationChecks` to reference `artifactId` without `artifactVersionId`.

### URL extraction

Use existing Exa/Jina reader helpers from the research stack where possible. Keep URL artifact ingestion focused:

- Normalize the URL.
- Insert the artifact and `artifactUrls` row with `pending`.
- Run an action to fetch readable content.
- Patch status to `ready` with extracted text or `failed` with a reason.

Do not introduce PDF extraction in this phase.

### Thread context

Add `packages/convex/convex/agent/threadContext.ts` or a top-level `threadContextArtifacts.ts`.

Public functions:

- `listForThread`
- `toggle`
- `add`
- `remove`

Internal function:

- `buildPromptContextForThread`

Rules:

- Assert thread ownership through existing thread helpers.
- Assert workspace ownership.
- Assert every selected artifact belongs to the workspace and owner.
- Do not trust client-sent title, body, URL, or ownership metadata.

## Prompt Context Design

Before `messages.startThread` or `messages.send` schedules generation, fetch selected artifacts server-side and build a bounded prompt block.

Suggested shape:

```text
<selected_workspace_context>
The user selected these workspace artifacts as context. Use them when relevant. If they conflict with the user's message, explain the conflict.

[Artifact 1]
Title: ...
Type: document
Content:
...

[Artifact 2]
Title: ...
Type: url
URL: ...
Status: ready
Content:
...
</selected_workspace_context>

User message:
...
```

Budget rules:

- Cap total context text, for example 12,000 to 20,000 characters.
- Cap each artifact, for example 4,000 characters.
- Prefer `contextText`, then `plainText`, then Markdown, then URL readable text.
- Include failed URL artifacts only as metadata, not empty content.
- Preserve original user-visible message separately from the expanded prompt for display.

## UI Plan

### Phase 1: Schema and Backend Functions

Tasks:

- Update `schema.ts` with `workspaces`, `workspaceFolders`, flattened `artifacts`, `artifactDocuments`, `artifactUrls`, and `threadContextArtifacts`.
- Remove `artifactVersions`.
- Update `messageArtifacts` and `citationChecks`.
- Add workspace CRUD functions.
- Add folder CRUD functions.
- Add artifact document and URL CRUD functions.
- Add thread context toggle/list functions.
- Update generated artifact helpers and message attachment helpers.
- Ensure generated outputs resolve to workspace artifact routes in the main content surface.

Verification:

- `bun run --filter '@aqsha/convex' codegen`
- `bun run --filter '@aqsha/convex' test`
- `bun run --filter '@aqsha/convex' typecheck`

### Phase 2: Workspace Library UI

Tasks:

- Add workspace switcher to the left sidebar.
- Add workspace list and detail routes under `apps/app`.
- Add workspace artifact list with root and one-level folder grouping.
- Add create, rename, move, and delete controls for folders and artifacts.
- Keep sources out of navigation.

Verification:

- User can create multiple workspaces.
- User can create and rename a one-level folder.
- User can move an artifact into and out of a folder.
- Folder nesting is unavailable in the UI and rejected by the backend.

### Phase 3: Document Editor and URL Artifacts

Tasks:

- Install BlockNote packages in `apps/app`:
  - `@blocknote/core`
  - `@blocknote/react`
  - `@blocknote/shadcn`
- Create a client-only BlockNote editor entry with `dynamic(..., { ssr: false })`.
- Persist BlockNote JSON blocks.
- Derive and save plain text and Markdown for AI context.
- Add URL artifact create flow.
- Reuse Exa/Jina reader helpers for readable URL extraction.
- Show pending, ready, and failed URL states.

Verification:

- Document artifact saves and reloads JSON blocks.
- Derived plain text is stored and changes after edits.
- URL artifact stores title/readable text when extraction succeeds.
- URL artifact stores failure status and retry path when extraction fails.

### Phase 4: Thread Context Picker and Prompt Injection

Tasks:

- Add a right-panel context picker on chat pages.
- List workspace artifacts with selected/unselected state.
- Toggle selected artifacts through Convex mutations.
- Add selected context summary near the composer or thread header.
- Update `messages.startThread` and `messages.send` to prepend selected artifact context server-side.
- Preserve Normal/Deep mode streaming behavior.

Verification:

- A thread can add and remove selected artifacts.
- The client cannot inject context from another workspace or user.
- Normal chat receives selected artifact text.
- Deep Research can still start and observe the selected context.
- Existing billing and rate limit behavior still applies.

### Phase 5: Route Generated Outputs to Main Artifact Surface

Tasks:

- Remove generated-artifact right-panel types and routes.
- Remove version selector/copy that implies version history.
- Update artifact create/update tools to write current artifact state.
- Update `messageArtifacts` usage to link only `artifactId`.
- Update citation checks to link to `artifactId`.
- Route newly generated Normal/Deep artifacts to the workspace artifact detail page in the main surface.
- Keep provenance persistence intact through `researchSources`, but do not render it as a Sources tab.

Verification:

- Generated artifacts appear as main-surface workspace artifacts.
- Updating an artifact replaces current content without exposing version history.
- Message artifact badges still open the correct artifact.
- Citation/provenance rows still persist for audit and citation checks.
- No Sources tab or user-facing provenance panel is present.

## Test Plan

Run from the repo root:

```bash
bun run --filter '@aqsha/convex' codegen
bun run --filter '@aqsha/convex' test
bun run --filter '@aqsha/convex' typecheck
bun run --filter '@aqsha/app' typecheck
bun run --filter '@aqsha/app' lint
```

Scenario checks:

- User can create multiple personal workspaces.
- Artifact can be created without folder, moved into folder, and moved back out.
- Folder cannot be nested.
- Document artifact saves BlockNote JSON and derived text.
- URL artifact stores URL metadata and readable extracted text or failure status.
- Thread context can add and remove artifacts.
- Chat response receives selected artifact context.
- Deep Research still runs as advanced mode and creates a workspace artifact in the main surface.
- No `/sources`, Source Library, Sources tab, Sources panel, or Sources sidebar/settings surface is restored.

## Risks

- The artifact flattening touches Deep Research, Normal mode tools, message attachment, citation checks, and UI routing. Treat it as a coordinated schema refactor, not a small table addition.
- BlockNote adds a browser-heavy editor dependency. Keep it client-only and isolate it from route-level Server Components.
- URL extraction may be slow or fail frequently. Persist explicit status and retry state instead of blocking artifact creation.
- Prompt context can become too large. Enforce server-side character budgets from the first implementation.
- If default workspace creation is implicit, thread creation and workspace routing must agree on one canonical default behavior.
