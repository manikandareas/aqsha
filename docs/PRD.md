# Aqsha Education Research Workspace PRD

## Summary

Aqsha is a personal education research workspace for students and research learners. It helps a user collect study materials, write and refine documents, save useful URLs, and use those materials as explicit context for chat.

The product should move away from making Deep Research the main interaction. Deep Research remains available as an advanced mode for expensive, long-running investigation, but the everyday loop is lighter:

1. Create or select a personal workspace.
2. Add documents and URLs as artifacts.
3. Select artifacts as context for a thread.
4. Chat with Astra against that context.
5. Continue writing, reading, and organizing artifacts from the workspace surface.

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

The core object is a user-owned workspace. A workspace contains optional one-level folders and artifacts. Artifacts can be user-authored documents or saved URLs in the MVP. Chat threads may be bound to a workspace when started from that workspace, or global when started outside a workspace. A thread can later select artifacts as explicit context; Astra uses the current content of those selected artifacts when generating a reply.

Deep Research stays in the product, but it should be presented as an advanced mode rather than the only selling point. Chat-generated artifacts from Normal or Deep Research are not part of the MVP. When this capability is added after MVP, generated outputs should become normal workspace artifacts shown in the main content surface, not a separate right-panel artifact tab.

Sources remain backend provenance records for generated research and citations. They should not become a public Source Library, a Sources tab, or a user-facing corpus management surface.

## Goals

- Support many personal workspaces per user.
- Support one-level optional folders inside each workspace.
- Allow artifacts to live directly under a workspace or inside one folder.
- Support document artifacts backed by BlockNote JSON blocks.
- Support URL artifacts with extracted readable text and fetch status.
- Let users select artifacts as thread-level context after the workspace artifact layer is stable.
- Show only artifact context selection in the right sidebar on chat pages when context selection is enabled.
- Let workspace pages show artifact management and workspace-bound thread selection.
- Support global chat threads that are not bound to any workspace.
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
- Chat-generated artifacts in the MVP.
- Artifact search in the MVP.
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

An artifact is reusable workspace material. The MVP supports:

- Document artifact: BlockNote document with JSON blocks, derived plain text, and derived Markdown.
- URL artifact: saved URL with title, description, readable extracted text, and fetch status.

User-facing version history should be removed. AI-generated outputs are deferred until after MVP; when they return, they should move into this same flattened artifact model and open in the main workspace surface. The right panel may list an artifact only when it is being selected as thread context.

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
- Workspace-bound threads where relevant, with global threads still available outside workspace-specific views.
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
- Start or select a thread bound to the workspace.
- Access global threads from the chat panel without forcing them into the workspace.

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

- Show the bound workspace when the thread has one, or make clear that the thread is global.
- Select or remove artifacts as thread context from the right panel.
- Send Normal mode messages using selected artifacts as bounded context.
- Start Deep Research as an advanced mode using the same thread and selected context.

Context selection is thread-level. It should not be sent as trusted ownership metadata from the client. The backend should resolve selected artifact records server-side for every generation.

Threads do not always require a workspace. A thread started from a workspace page should be bound to that workspace. A thread started from a global chat entry point should remain global. Bound threads give the UI a natural default artifact list and workspace history, while global threads keep Astra available without requiring a workspace choice.

## Functional Requirements

### Workspace Management

- Create a workspace.
- List current user's workspaces.
- Get a workspace by ID.
- Rename a workspace.
- Soft-delete or archive a workspace without hard-deleting its artifacts in the MVP.
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
- Retry URL extraction.
- Move artifact between folders or to no folder.
- Rename artifact.
- Soft-delete or delete artifact.
- List artifacts by workspace and optional folder with pagination.

### Thread Context

- Add artifact to a thread's selected context.
- Remove artifact from selected context.
- List selected context artifacts for a thread.
- Enforce that the thread and artifacts belong to the current user.
- If the thread is workspace-bound, default context selection to artifacts from that workspace.
- If the thread is global, require explicit artifact selection without assuming a workspace.
- Use the artifact's current content at generation time.

### Chat Generation

- `messages.startThread` and `messages.send` should fetch selected context artifacts server-side.
- Selected artifact context should be prepended to the prompt as a bounded context block.
- The context block should include stable metadata: title, artifact type, URL when relevant, and a clipped text body.
- The model should be told when selected artifacts are incomplete or failed URL extractions.
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
- Workspace-started threads are bound to that workspace.
- Globally-started threads can exist without a workspace.
- No `/sources`, Source Library, Sources tab, Sources panel, or Sources sidebar/settings surface is restored.

## Resolved Decisions

- Workspace deletion uses soft delete/archive behavior for the MVP.
- Threads use optional workspace binding: workspace-started threads are bound, globally-started threads remain global.
- Chat-generated artifacts are deferred until after MVP. When added later, bound threads can save generated artifacts into their workspace; global threads should require a destination workspace.
- Artifact search is deferred until after the workspace library MVP.
