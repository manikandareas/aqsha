# Aqsha Education Research Workspace PRD

## Summary

Aqsha is a personal education research workspace for students and research learners. It helps a user collect study materials, write and refine documents, save useful URLs, and use those materials as explicit context for chat.

The product should move away from making Deep Research the main interaction. Deep Research remains available as an advanced mode for expensive, long-running investigation, but the everyday loop is lighter:

1. Create or select a personal workspace.
2. Add documents and URLs as artifacts.
3. Select artifacts as context for a thread.
4. Chat with Astra against that context.
5. Open generated outputs as workspace artifacts in the main content surface.

## Problem

The current experience is too chat-first and Deep Research-heavy. It is strong for generating research reports, but expensive long-running research is not the right default for students who usually need to collect notes, organize links, ask focused questions, and iterate on learning material over time.

Users need a persistent personal research workspace where their own materials are the center of the product. Chat should operate on selected workspace artifacts, not only on the transient context of a thread or generated run.

## Audience

Primary users:

- Students preparing assignments, papers, exams, or thesis drafts.
- Research learners collecting explanations, references, URLs, and notes across topics.
- Individual users managing their own education materials without team collaboration.

This PRD does not target organizations, classrooms, shared team workspaces, or institutional source management.

## Product Direction

Aqsha becomes a personal education research workspace.

The core object is a user-owned workspace. A workspace contains optional one-level folders and artifacts. Artifacts can be user-authored documents, saved URLs, or generated outputs. A thread can select artifacts from the current workspace as context. Astra uses the current content of those selected artifacts when generating a reply.

Deep Research stays in the product, but it should be presented as an advanced mode rather than the only selling point. When Deep Research creates a report, that report becomes a normal workspace artifact shown in the main content surface, not a separate right-panel artifact tab.

Sources remain backend provenance records for generated research and citations. They should not become a public Source Library, a Sources tab, or a user-facing corpus management surface.

## Goals

- Support many personal workspaces per user.
- Support one-level optional folders inside each workspace.
- Allow artifacts to live directly under a workspace or inside one folder.
- Support document artifacts backed by BlockNote JSON blocks.
- Support URL artifacts with extracted readable text and fetch status.
- Let users select artifacts as thread-level context.
- Show only artifact context selection in the right sidebar on chat pages.
- Let workspace pages show artifact management and thread selection.
- Let Deep Research outputs appear as main-surface workspace artifacts.
- Keep Normal and Deep mode chat behavior intact.
- Keep billing, rate limits, streaming, and provenance behavior intact.

## Non-Goals

- Organization workspaces.
- Team membership, sharing, or role-based collaboration.
- Nested folders.
- PDF ingestion.
- Public Source Library.
- Sources sidebar item, `/sources` route, or Sources settings page.
- Sources tab or user-facing source/provenance panel.
- A separate generated-artifact right panel.
- User-facing artifact version history.
- Data migration or backfill from the current prototype schema.

## Core Concepts

### Workspace

A workspace is a private user-owned research area. Examples:

- `Biology 101`
- `Thesis: AI in Education`
- `Machine Learning Notes`
- `IELTS Writing`

The user can create multiple workspaces and switch between them from the left sidebar.

### Folder

A folder is an optional one-level grouping inside a workspace. Folders are only for organization. They are not nested and they do not define permissions.

Artifacts may exist without a folder.

### Artifact

An artifact is reusable workspace material. The first implementation supports:

- Document artifact: BlockNote document with JSON blocks, derived plain text, and derived Markdown.
- URL artifact: saved URL with title, description, readable extracted text, and fetch status.

Existing AI-generated outputs should move into this same flattened artifact model. User-facing version history should be removed. Deep Research reports and other generated outputs are opened and managed as artifacts in the main workspace surface. The right panel may list an artifact only when it is being selected as thread context.

### Source

A source is provenance produced by research tools and citation workflows. Sources are not a user-managed library and should not have a user-facing panel. They remain backend records attached to messages, runs, artifacts, and citation checks where needed.

## UX Requirements

### App Layout

The app keeps a three-panel workspace shape:

- Left sidebar: workspace switcher, primary navigation, thread list, and account controls.
- Main content: current workspace page, artifact editor, URL detail, or chat thread.
- Right contextual panel: thread context artifact picker and selected-context summary.

### Left Sidebar

The sidebar should prioritize:

- Workspace switcher.
- New workspace action.
- New chat action.
- Workspace-local threads.
- Recent or pinned artifacts if useful.

The sidebar must not restore a Sources or Source Library navigation item.

### Workspace Page

A workspace page should let the user:

- Rename or delete the workspace.
- Create a document artifact.
- Save a URL artifact.
- Create, rename, and delete one-level folders.
- Move artifacts into a folder or back to the workspace root.
- Open an artifact.
- Start or select a thread scoped to the workspace.

### Document Artifact Page

A document artifact page should use BlockNote for editing. The editor must run client-only in Next.js. Save behavior should persist:

- BlockNote JSON blocks.
- Derived plain text for AI context.
- Derived Markdown for export, preview, and prompt context.

### URL Artifact Page

A URL artifact page should show:

- Original URL.
- Title and description when available.
- Extraction status: pending, ready, failed.
- Extracted readable text when ready.
- A clear retry action when extraction fails.

PDF ingestion is intentionally later.

### Chat Page

A chat page should let the user:

- See the current workspace.
- Select or remove artifacts as thread context from the right panel.
- Send Normal mode messages using selected artifacts as bounded context.
- Start Deep Research as an advanced mode using the same thread and selected context.
- Open generated Deep Research output as an artifact in the main content surface.

Context selection is thread-level. It should not be sent as trusted ownership metadata from the client. The backend should resolve selected artifact records server-side for every generation.

## Functional Requirements

### Workspace Management

- Create a workspace.
- List current user's workspaces.
- Get a workspace by ID.
- Rename a workspace.
- Delete a workspace and its owned folders/context rows.
- Prevent access to another user's workspace.

### Folder Management

- Create a folder inside a workspace.
- Rename a folder.
- Delete a folder.
- Move artifacts out of a folder before or during folder deletion.
- Prevent nested folders.

### Artifact Management

- Create document artifact.
- Update document artifact content and derived text fields.
- Create URL artifact.
- Create generated artifact from Normal or Deep Research output.
- Retry URL extraction.
- Move artifact between folders or to no folder.
- Rename artifact.
- Soft-delete or delete artifact.
- List artifacts by workspace and optional folder with pagination.

### Thread Context

- Add artifact to a thread's selected context.
- Remove artifact from selected context.
- List selected context artifacts for a thread.
- Enforce that the thread, workspace, and artifacts all belong to the current user.
- Use the artifact's current content at generation time.

### Chat Generation

- `messages.startThread` and `messages.send` should fetch selected context artifacts server-side.
- Selected artifact context should be prepended to the prompt as a bounded context block.
- The context block should include stable metadata: title, artifact type, URL when relevant, and a clipped text body.
- The model should be told when selected artifacts are incomplete or failed URL extractions.
- Generated Normal or Deep Research outputs should be saved as workspace artifacts, then opened in the main content surface.
- Normal and Deep mode streaming should remain intact.

## Acceptance Criteria

- A user can create multiple personal workspaces.
- A user can create an artifact directly under a workspace.
- A user can create a one-level folder and move an artifact into it.
- A user can move an artifact back out of a folder.
- A user cannot create nested folders.
- A document artifact saves BlockNote JSON blocks and derived text fields.
- A URL artifact stores metadata, readable extracted text, and failure status.
- A thread can add and remove selected context artifacts.
- A chat response receives the selected artifact context server-side.
- Deep Research still works as advanced mode and creates a workspace artifact in the main surface.
- No `/sources`, Source Library, Sources tab, Sources panel, or Sources sidebar/settings surface is restored.

## Open Decisions

- Whether workspace deletion should hard-delete artifacts immediately or use a soft-delete recovery window.
- Whether generated artifacts should automatically open after creation or require user confirmation.
- Whether thread creation should always require a workspace or allow a default personal workspace to be auto-created.
- Whether artifact search should ship in the first implementation or wait until the workspace library becomes large.
