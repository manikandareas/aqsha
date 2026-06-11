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
| Explore (index + paper/news/fact detail) | `/app/explore`, `/app/explore/[paperRef]`, `/app/explore/n/[id]`, `/app/explore/f/[id]` | `features/explore/pages/explore-chat-shell.tsx` (`ExploreChatShell`) | Discovery feed / reader body via `ExploreSurfaceHeader` | `features/explore/components/explore-chat-side-panel.tsx` (`ExploreChatSidePanel`) |

All three shells use `components/layout/detail-split-layout.tsx` and `components/layout/responsive-side-panel.tsx`.

### Parity rules

1. **Thread detail page ↔ workspace chat side panel**
   Full-page thread chat (`ChatThreadState` in `thread-shell-layout.tsx`) and embedded thread chat (`WorkspaceChatSidePanel` → `ChatThreadState` with `compact`) must match: composer, inline context pills (`@mention`), run progress, thread switcher, delete, and rate-limit handling.
   Shared hooks/data: `use-thread-experience-data.ts`, and the `@mention` context state in `composer-context-mentions.tsx` (`ComposerMentionsProvider` / `useComposerMentions` / `usePanelContextSelection`). Each chat surface root must be wrapped in `ComposerMentionsProvider` so the composer and the workspace-library panel share the same pinned context pills.

2. **Workspace detail page ↔ thread workspace-library side panel**
   Full-page workspace library (`WorkspaceLibrarySurface` in `workspace-detail-client.tsx`) and embedded library (`ThreadWorkspaceLibraryPanel` in `thread-detail-shell.tsx`) must match: folder navigation, artifact grid, context selection (single-click toggle inserts an `@workspace:paper` pill via `usePanelContextSelection`), create/rename/archive actions, and toolbar behavior.
   `WorkspaceLibrarySurface` already branches toolbar via `chatPanelOpen` / `onToggleChatPanel` vs `onClosePanel` — preserve that split when adding controls.

3. **Explore chat side panel ↔ thread detail chat**
   Full-page thread chat (`ChatThreadState` in `thread-shell-layout.tsx`) and the embedded global chat (`ExploreChatSidePanel` → `ChatThreadState` with `compact`) must match: composer, run progress, thread switcher, delete, and rate-limit handling. `ExploreChatSidePanel` is workspace-less (`ambientWorkspaceId={null}`) — it drives the global thread experience with no ambient workspace pre-seeded, but the composer's `@mention` picker still lists all workspaces; the only Explore-specific addition is `seed` (pre-fills the new-chat composer with the detail item being read). Keep it in lockstep with `WorkspaceChatSidePanel` (chrome) and `ChatThreadState` (chat body).

4. **Any change to one surface must update the paired surface(s)**
   - Thread chat change → update `thread-shell-layout.tsx`, `workspace-chat-side-panel.tsx`, **and** `explore-chat-side-panel.tsx` (or shared child components they all use, e.g. `ChatThreadState` / `ThreadRecentSwitcher`).
   - Workspace library change → update `workspace-detail-client.tsx` **and** `ThreadWorkspaceLibraryPanel` in `thread-detail-shell.tsx` (prefer extending `WorkspaceLibrarySurface` or its children over duplicating logic).

### Checklist before shipping

- [ ] Feature works on thread detail **main**, workspace detail **chat panel**, and Explore **chat panel**
- [ ] Feature works on workspace detail **main** and thread detail **library panel**
- [ ] Each chat surface root is wrapped in `ComposerMentionsProvider` with the right `threadId` + `ambientWorkspaceId`; pinned context pills (`@workspace` / `@workspace:paper`) persist across turns and reload from the server
- [ ] Panel chrome uses `lib/panel-surface.ts` tokens; `compact` prop respected in `ChatThreadState`
- [ ] Mobile side-panel open/close still syncs via `DetailSplitLayout` / `useCloseRightPanel`
