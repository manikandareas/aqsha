<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Detail / Panel Parity

Thread detail and workspace detail are two halves of the same product surface. Each has a **full-page main area** and a **right side panel** that embeds the other surface. They must stay in behavioral, UI/UX, and feature parity.

### Surfaces

| Surface | Route | Entry component | Main | Side panel |
|---|---|---|---|---|
| Thread detail | `/app/threads/[threadId]` | `features/thread-experience/components/thread-detail-shell.tsx` (`ThreadDetailShell`) | `ChatThreadState` via `thread-shell-layout.tsx` | `ThreadWorkspaceLibraryPanel` → `WorkspaceLibrarySurface`, or `ThreadGlobalContextPanel` |
| Workspace detail | `/app/workspaces/[workspaceId]` | `app/app/workspaces/[workspaceId]/workspace-detail-client.tsx` (`WorkspaceDetailClient`) | `WorkspaceLibrarySurface` | `features/workspaces/components/workspace-chat-side-panel.tsx` (`WorkspaceChatSidePanel`) |

Both shells use `components/layout/detail-split-layout.tsx` and `components/layout/responsive-side-panel.tsx`.

### Parity rules

1. **Thread detail page ↔ workspace chat side panel**
   Full-page thread chat (`ChatThreadState` in `thread-shell-layout.tsx`) and embedded thread chat (`WorkspaceChatSidePanel` → `ChatThreadState` with `compact`) must match: composer, context chips, run progress, thread switcher, delete, draft-context behavior, and rate-limit handling.
   Shared hooks/data: `use-thread-experience-data.ts`, `useDraftContextSelection` / `lib/thread-context-draft-store.ts`.

2. **Workspace detail page ↔ thread workspace-library side panel**
   Full-page workspace library (`WorkspaceLibrarySurface` in `workspace-detail-client.tsx`) and embedded library (`ThreadWorkspaceLibraryPanel` in `thread-detail-shell.tsx`) must match: folder navigation, artifact grid, context selection (single-click toggle), create/rename/archive actions, and toolbar behavior.
   `WorkspaceLibrarySurface` already branches toolbar via `chatPanelOpen` / `onToggleChatPanel` vs `onClosePanel` — preserve that split when adding controls.

3. **Any change to one surface must update the paired surface**
   - Thread chat change → update `thread-shell-layout.tsx` **and** `workspace-chat-side-panel.tsx` (or shared child components they both use).
   - Workspace library change → update `workspace-detail-client.tsx` **and** `ThreadWorkspaceLibraryPanel` in `thread-detail-shell.tsx` (prefer extending `WorkspaceLibrarySurface` or its children over duplicating logic).

### Checklist before shipping

- [ ] Feature works on thread detail **main** and workspace detail **chat panel**
- [ ] Feature works on workspace detail **main** and thread detail **library panel**
- [ ] Draft context scopes are correct: `threadContextScopeKey(threadId)` vs `workspaceContextScopeKey(workspaceId)` (`use-workspace-draft-context.ts`)
- [ ] Panel chrome uses `lib/panel-surface.ts` tokens; `compact` prop respected in `ChatThreadState`
- [ ] Mobile side-panel open/close still syncs via `DetailSplitLayout` / `useCloseRightPanel`

The removed `DESIGN.md` is no longer the UI source of truth for the Selia migration; keep the parity rules above as the behavioral contract.
