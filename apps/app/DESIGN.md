# Aqsha App Design

This document is the visual and interaction source of truth for `apps/app`, the authenticated Convex-backed research chatbot.

## Product Surface

Aqsha is a chat-first research workspace with durable runs and artifacts. The current product does not include a user-facing Sources feature:

- No Sources/Sumber item in the sidebar.
- No Source Library page.
- No Sources settings page.
- No Sources tab in the right panel.
- No source cards or source-detail panel.

Sources used by agent tools are still stored internally as provenance, but they are not a primary UI surface.

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
- New chat.
- Disabled future entries such as automation and research audit.
- Thread history grouped by recency.
- Upgrade card.
- User menu.

Do not add Sources/Sumber back to this navigation without a new product decision.

### Chat

Assistant messages use readable prose with Markdown support. User messages stay compact and right-aligned. Deep run progress appears inline in the transcript so users can follow long-running work without navigating away.

### Artifact Panel

The right panel is artifact-only. It should:

- Render only when an artifact exists or an active run may produce one.
- Open automatically when a new artifact appears.
- Show artifact title, version, format, copy action, and share-link action.
- Render Markdown, HTML, plain text, code, and JSON safely.

Do not add a Sources tab to this panel.

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
- `Artifact` / `Artefak` for generated documents and reusable outputs.
- `Provenance` for backend source records used by tools.

Avoid these as product surfaces:

- `Source Library`
- `Sources tab`
- `Sumber` as a sidebar feature.
