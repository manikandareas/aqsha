# Aqsha App Design

This document is the visual and interaction source of truth for `apps/app`, the authenticated Convex-backed education research workspace.

## Product Surface

Aqsha is a personal education research workspace with workspace-owned documents, saved URLs, optional one-level folders, chat threads, and Deep Research as an advanced mode.

- No Sources/Sumber item in the sidebar.
- No Source Library page.
- No Sources settings page.
- No user-facing Sources tab or provenance panel.
- No separate generated-artifact right panel in the workspace-library MVP.
- Workspace artifacts are managed from the main content surface.
- The chat right panel is reserved for thread-level artifact context selection when that phase ships.

Do not restore a Source Library, public corpus UI, `/sources`, `/settings/sources`, or any source-management navigation.

## Visual Direction

The app should feel calm, focused, and work-oriented:

- Warm paper light mode.
- Charcoal dark mode.
- Restrained borders and compact controls.
- Dense but readable chat layout.
- Artifact reading should feel like opening a serious working document, not a marketing page.

## Layout

### Left Sidebar

The left sidebar contains:

- Sidebar close/search controls.
- Workspace switcher.
- New workspace.
- New chat.
- Workspace-bound thread history where relevant.
- Global thread access without forcing a workspace choice.
- Upgrade card.
- User menu.

Do not add Sources/Sumber back to this navigation without a new product decision.

### Workspace Library

Workspace detail uses a split **board + chat** layout: a card grid library on the left and a hero-style chat column on the right. Colors come from `globals.css` tokens (`background`, `card`, `primary`, `mint-*`, `sky-*`, `lemon-*`, `shadow-aqsha`)—not third-party palette clones.

- **Folder-per-view:** one active location at a time via `?folder=root` or `?folder=<folderId>`. Root shows folder tiles plus artifacts not in a folder; inside a folder shows only that folder’s artifacts.
- **Breadcrumb:** `Semua file` › folder name. Avoid the label “Workspace root” in UI copy.
- **Views:** board grid only (preview cards).
- **Toolbar:** breadcrumb, grid/list toggle, and a single **+ Baru** menu (Folder, Dokumen, URL). Workspace rename/archive stays in the workspace header.
- **Actions:** rename, move (menu), delete, and drag artifact onto folder tiles to move. No per-row move dropdown in the main surface.
- **Clicks:** single-click artifact toggles draft chat context (applied when a new thread starts from workspace chat); double-click opens folder or artifact. Folders open on double-click only.
- Use one-level folder grouping only.
- Artifacts can live at root (`Semua file`) or in one folder.
- New documents and URLs are created in the **currently open folder** when inside a folder.
- Do not expose artifact search until it is explicitly added to the product scope.
- Do not expose user-facing artifact version history.

### Chat

Assistant messages use readable prose with Markdown support. User messages stay compact and right-aligned. Deep run progress appears inline in the transcript so users can follow long-running work without navigating away.

### Right Panel

The right panel should not be used as a generated-artifact or provenance surface for the workspace-library MVP. When thread context selection ships, it should:

- List selectable workspace artifacts for workspace-bound threads.
- Require explicit artifact selection for global threads.
- Show selected-context summary.
- Avoid treating client-selected metadata as trusted ownership or prompt context.

Sources remain backend provenance records only and must not render as a user-facing tab, panel, settings page, or library.

## Components

- Use icon buttons for compact controls.
- Use lucide icons where an icon exists.
- Keep cards at 8-12px radius depending on local surrounding UI.
- Avoid nested cards.
- Preserve stable dimensions for sidebars, toolbar buttons, and artifact controls.

## Copy

Preferred terms:

- `Thread` for a saved conversation.
- `Deep Research` for durable long-running research.
- `Workspace` for a private user-owned education research area.
- `Folder` for one-level organization inside a workspace.
- `Artifact` / `Artefak` for workspace documents, saved URLs, and later reusable generated outputs.
- `Provenance` for backend source records used by tools.
- `Sources` only for internal/backend provenance, not a product surface.

Avoid these as product surfaces:

- `Source Library`
- `Sumber` as a sidebar feature.
- `Sources` as a tab or panel.
