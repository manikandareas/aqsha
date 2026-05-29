# Aqsha Selia UI Migration Plan

## Scope

This plan migrates Aqsha's UI foundations to Selia's default component theme, then redesigns each product surface in controlled phases while preserving a packaged shadcn compatibility layer for components that still need it.

The primary UI migration targets are `packages/ui` and the primary Next.js application. `packages/ui` should become the owner of Selia components, shadcn compatibility components, shared AI Elements, and shared UI styles. The primary Next.js application should move from the physical folder `apps/app` to `apps/web`, then host both the public landing page at `/` and the authenticated product under `/app`. `apps/www` is explicitly out of scope for this migration. Convex behavior, Clerk auth, billing, workspace ownership, thread context, and research provider behavior are out of scope except where UI wiring needs to preserve those flows.

This is a planning artifact only. It does not implement the migration.

## Goals

- Use Selia's default styles and theme as the new visual baseline. The removed `apps/app/DESIGN.md` is no longer a style source of truth for this migration.
- Rename the Next.js product folder from `apps/app` to `apps/web` before adding the `/app` route prefix, so paths do not become `apps/app/app/app`.
- Keep the package name `@aqsha/app` during the folder rename unless a later cleanup phase intentionally renames package filters too.
- Use `/` for the future public landing page and `/app` for the authenticated product entry.
- Centralize reusable UI in `packages/ui`, not the Next.js app package.
- Move `apps/web/components/ai-elements/*` into `packages/ui` so chat UI primitives can be shared and versioned with the rest of the design system.
- Preserve shadcn-compatible primitives in `packages/ui` for AI Elements, BlockNote-adjacent UI, and external component code that expects shadcn-style APIs.
- Replace product-owned surfaces gradually with Selia-native components while allowing shadcn compatibility where it is still a dependency boundary.
- Preserve the current Aqsha product model: workspace-first research, explicit artifact context, settings workflows, and thread/workspace panel parity.
- Migrate per page/feature so review, QA, and rollback stay manageable.
- Leave `@blocknote/shadcn` and other external shadcn-based consumers supported through the compatibility layer until a separate editor-theme decision is made.

## Non-goals

- No rewrite of Next.js, Astro, Convex, Clerk, billing, or research runtime.
- No `apps/www` migration, redesign, shared primitive adoption, or verification in this plan.
- No visual redesign that breaks the existing workspace/thread context selection contract.
- No requirement to delete shadcn primitives outright. The intended end state keeps a packaged shadcn compatibility layer where it is useful.
- No immediate removal of Radix packages until imports prove they are unused from both Selia and shadcn compatibility code.
- No replacement of Clerk-hosted auth/account widgets unless a later phase explicitly designs a custom auth shell.

## Current Codebase Breakdown

### Packages

| Package | Role | UI relevance |
| --- | --- | --- |
| `apps/app` -> `apps/web` | Next.js 16 App Router public landing plus authenticated product | Main product consumer. Current folder is `apps/app`; target folder is `apps/web`. It currently owns `components/ui` and `components/ai-elements`; those should become temporary app-level adapters while reusable code moves into `packages/ui`. |
| `apps/www` | Astro marketing and legal pages | Explicitly out of scope for this migration. Do not migrate its components, styles, pages, or imports as part of the Selia UI plan. |
| `packages/ui` | Shared React primitives and token CSS | Main migration target. Should own Selia default components, shadcn compatibility components, AI Elements, and shared style entrypoints. |
| `packages/convex` | Convex backend | No UI migration, but UI QA must preserve data contracts and auth gates. |

### Routes and Feature Surfaces

| Surface | Routes/files | Main UI risk |
| --- | --- | --- |
| Public landing | target `apps/web/app/page.tsx` | New public landing page at `/`; should not require Clerk/Convex auth. |
| Global/new thread | current `apps/app/app/page.tsx`, target `apps/web/app/app/page.tsx` | Product entry moves from `/` to `/app`; composer, prompt commands, attachments, run progress, transcript, HITL cards. |
| Thread detail | current `apps/app/app/threads/[threadId]/page.tsx`, target `apps/web/app/app/threads/[threadId]/page.tsx` | Route moves from `/threads/[threadId]` to `/app/threads/[threadId]`; must preserve right-panel artifact context selection and draft-vs-persist behavior. |
| Workspace index | current `apps/app/app/workspaces/page.tsx`, target `apps/web/app/app/workspaces/page.tsx` | Route moves from `/workspaces` to `/app/workspaces`; workspace list, create/archive dialogs, empty/loading states. |
| Workspace detail | current `apps/app/app/workspaces/[workspaceId]/workspace-detail-client.tsx`, target `apps/web/app/app/workspaces/[workspaceId]/workspace-detail-client.tsx` | Route moves under `/app`; board toolbar, folder/artifact grid, drag/drop, context menus, upload toast, chat side panel. |
| Artifact detail | current `apps/app/app/workspaces/[workspaceId]/artifacts/[artifactId]/page.tsx`, target `apps/web/app/app/workspaces/[workspaceId]/artifacts/[artifactId]/page.tsx` | Route moves under `/app`; header, autosave state, URL/PDF/code/Mermaid renderers, BlockNote editor boundary. |
| Explore | current `apps/app/app/explore/page.tsx`, target `apps/web/app/app/explore/page.tsx` | Route moves from `/explore` to `/app/explore`; search form, paper cards, provider warning, save-to-workspace dialog. |
| Settings | current `apps/app/app/settings/*`, target `apps/web/app/app/settings/*` | Route moves from `/settings/*` to `/app/settings/*`; settings shell, account forms, Clerk security widget, billing panels, usage heatmap. |
| Auth | current `apps/app/app/sign-in/[[...rest]]`, target `apps/web/app/sign-in/[[...rest]]` | Keep auth routes public at `/sign-in` and `/sign-up`; default post-auth redirect should point to `/app`. |
| Existing Astro site | `apps/www/src/pages/*`, `apps/www/src/components/*` | Out of scope. Future landing work for this plan happens in `apps/web`, not `apps/www`. |

### Current UI Primitive Inventory

Current `apps/app/components/ui` contains 26 local primitives. After the folder rename, these become `apps/web/components/ui` temporary adapters:

- `avatar`, `badge`, `breadcrumb`, `button-group`, `button`, `card`, `carousel`, `collapsible`, `command`, `context-menu`, `dialog`, `dropdown-menu`, `hover-card`, `input-group`, `input`, `label`, `popover`, `scroll-area`, `select`, `separator`, `sheet`, `sidebar`, `skeleton`, `spinner`, `textarea`, `tooltip`.

The largest local shadcn import counts in the current Next.js app are:

| Component | Import count | Migration note |
| --- | ---: | --- |
| `button` | 38 | First compatibility wrapper; touches almost every feature. |
| `sidebar` | 12 | High risk; owns layout context and mobile sheet behavior. |
| `dropdown-menu` | 9 | Rename/shape mismatch with Selia `menu`. |
| `skeleton` | 7 | Simple visual migration; can happen early. |
| `input` | 7 | Needed for settings and dialogs. |
| `tooltip` | 6 | Provider and trigger API check required. |
| `collapsible` | 6 | Mostly AI elements. |
| `badge` | 5 | Low-risk token alignment. |
| `dialog` | 4 | API mismatch; replace via compatibility layer first. |
| `select`, `scroll-area`, `hover-card`, `context-menu`, `command`, `card` | 3 each | Feature-specific rollout. |

`packages/ui` currently exports shared shadcn-style primitives: accordion, avatar, badge, button, card, dropdown-menu, input, progress, separator. Some existing consumers live outside this migration scope; do not use those consumers as acceptance criteria for this plan.

### Product Constraints

- The removed `apps/app/DESIGN.md` is no longer a style source of truth. Use Selia's default theme and component styling as the baseline.
- Product behavior constraints still apply even when the visual language changes.
- Workspace library stays board/grid-first with one-level folders, breadcrumb, `+ Baru`, and single-click context selection.
- Thread and workspace detail panels must remain in parity:
  - thread main chat and workspace chat side panel share behavior;
  - workspace main library and thread-side library panel share behavior.
- Context selection is draft-local first and persists only at send/start boundaries.
- Settings workflows must keep their current backend behavior, but visual density and layout can be reset toward Selia defaults where it improves the final UX.

## Selia Research Summary

### Official Selia Model

Selia is an opinionated React UI library built on Tailwind CSS and Base UI. Its docs position it as source-owned code that becomes part of the app, not a closed package dependency. This is a good fit for Aqsha because the migration can preserve local ownership and tune components for the existing product language.

Key official references:

- [Introduction](https://selia.earth/docs/introduction/)
- [Next.js installation](https://selia.earth/docs/installation/next/)
- [Design approach](https://selia.earth/docs/design-approach/)
- [GitHub registry](https://github.com/nauvalazhar/selia)

### Installation Facts

For Bun/Next.js, Selia's official flow is:

```bash
bunx selia@latest init
bunx selia@latest add button
```

The Next.js guide imports components from:

```tsx
import { Button } from "@/components/selia/button";
```

The Selia registry currently:

- asserts Tailwind CSS is installed;
- adds `@base-ui/react`, `tailwind-merge`, `clsx`, and `class-variance-authority`;
- appends Selia CSS to `app/globals.css` for Next.js;
- uses `components/selia` as the Next.js component target;
- creates `lib/utils.ts` only when missing;
- adds or expects a `.root` wrapper for isolation.

### Design Approach Notes

Selia relies on:

- `plain` variants for composition inside other surfaces;
- `data-slot` contextual styling from parent components;
- component source modification when repeated overrides indicate a product-level design-system rule.

This matters for Aqsha because current components use many local Tailwind overrides. The migration should move repeated overrides into Selia component source or Aqsha-specific wrappers, not keep scattering utility classes across pages.

### Component Mapping

| Current shadcn/local | Selia target | Notes |
| --- | --- | --- |
| `button` | `button` | Selia uses `variant="primary" | "secondary" | "tertiary" | "danger" | "outline" | "plain"` and sizes such as `sm`, `md`, `lg`, `icon`, `sm-icon`. Need a temporary variant/size adapter for current `default`, `ghost`, `destructive`, `icon-sm`. |
| `badge` | `badge` or `chip` | Use `chip` for metadata/status chips where the component is semantically selectable or compact; keep `badge` for labels. |
| `card` | `card`, `item`, `stack` | Replace repeated list/card rows with `Item` where appropriate, especially workspaces, settings rows, and paper metadata. |
| `dropdown-menu`, `context-menu` | `menu`, `menubar` if needed | Selia's menu composition differs from shadcn's dropdown API; use a compatibility wrapper first. |
| `dialog`, `sheet` | `dialog`, `drawer` | Dialog API uses `DialogPopup`, `DialogBody`, `DialogFooter`, etc. Mobile sidebar/sheet behavior should be handled by Aqsha layout, not the Selia sidebar itself. |
| `sidebar` | `sidebar` plus local layout state | Selia sidebar does not enforce off-canvas positioning or width; keep Aqsha `SidebarProvider` behavior or build a local shell wrapper around Selia primitives. |
| `command` | `command`, `autocomplete`, `input-group` | Prompt command picker and command dialog need a dedicated migration because current command is cmdk-based. |
| `input`, `textarea`, `label`, `input-group` | same names | Good early migration target, but check form accessibility. |
| `select`, `popover`, `hover-card`, `tooltip` | same or closest Selia primitives | Verify API differences before direct import rewrites. |
| `skeleton`, `spinner`, `progress` | `spinner`, `progress`, local skeleton wrapper | Selia has spinner/progress; skeleton may need a local Aqsha primitive. |
| `carousel` | keep local or replace later | Used by inline citations. If Selia has no exact carousel, keep as local product primitive until citation UI is redesigned. |
| `button-group` | `toolbar` or local group | Prefer Selia `Toolbar` for grouped message controls. |
| `toast` via `sonner` | Selia `toast` or keep sonner adapter | Upload queue uses `toast.custom`; migrate only after custom toast behavior is preserved. |

## Migration Strategy

Use a package-first strategy:

1. Add Selia source components to `packages/ui`.
2. Move shadcn-compatible primitives from `apps/web/components/ui` into `packages/ui` instead of deleting them.
3. Move reusable AI Elements from `apps/web/components/ai-elements` into `packages/ui`.
4. Turn `apps/web/components/ui` and `apps/web/components/ai-elements` into temporary re-export/adapter folders during migration.
5. Migrate product surfaces from shadcn compatibility exports to Selia-native exports per feature.

Do not mass-replace imports in one commit. Each phase should leave the app buildable, typecheckable, and visually testable.

### Target `packages/ui` Shape

The exact file names can be adjusted during implementation, but the package should make ownership boundaries obvious:

```text
packages/ui/src/
  selia/                 # Selia-generated source components, lightly curated
  shadcn/                # shadcn-compatible primitives kept for external/legacy consumers
  ai-elements/           # moved from apps/web/components/ai-elements
  styles/
    selia.css            # Selia default theme and utilities
    shadcn.css           # compatibility tokens/classes only if needed
    globals.css          # package entrypoint consumed by apps
  lib/
    cn.ts
```

Suggested package exports:

```json
{
  "./selia/button": "./src/selia/button.tsx",
  "./shadcn/button": "./src/shadcn/button.tsx",
  "./ai-elements/message": "./src/ai-elements/message.tsx",
  "./styles/globals.css": "./src/styles/globals.css"
}
```

During migration, `@aqsha/ui/components/button` may remain as a compatibility alias, but new Selia-native product code should import from explicit Selia paths such as `@aqsha/ui/selia/button`.

### Foundation Decisions

- Keep `apps/web/components/ui` temporarily, but make it an adapter/re-export layer pointed at `@aqsha/ui/shadcn/*` or `@aqsha/ui/selia/*`.
- Use Selia's raw/default CSS theme as the visual starting point. Do not force the previous app token set back into the new system.
- Move Selia CSS into `packages/ui/src/styles/selia.css`, then import it through `packages/ui/src/styles/globals.css` from `apps/web`.
- Keep Inter and JetBrains Mono because Selia recommends them and the app already loads them. Remove or de-emphasize old Aqsha-specific heading/handwriting font usage where it conflicts with Selia's default feel.
- Keep `lucide-react` for app feature icons. Selia embeds SVGs only inside components that need them; it does not require removing Lucide.
- Keep `@blocknote/shadcn`, shadcn-based AI Elements, and other external shadcn-style dependencies supported through `packages/ui/shadcn`.

## Implementation Phases

### Phase 0 - Baseline Audit and Visual Capture

Purpose: freeze the current behavior and UI before touching primitives.

Tasks:

- Run `bun install` if the worktree is fresh.
- Run `bun run lint` and `bun run typecheck`.
- Capture screenshots for:
  - current product `/`
  - `/explore`
  - `/workspaces`
  - `/workspaces/[workspaceId]`
  - `/workspaces/[workspaceId]/artifacts/[artifactId]`
  - `/threads/[threadId]`
  - `/settings/overview`
  - `/settings/account`
  - `/settings/appearance`
  - `/settings/security`
  - `/settings/usage-billing`
- Record current mobile screenshots for sidebar, workspace panel, and settings.
- Confirm the app still respects Clerk protected route behavior.

Acceptance:

- Existing lint/typecheck result is known.
- Screenshot baseline exists for desktop and mobile.
- No code migration has started.

### Phase 1 - Next.js App Rename and Route Boundary

Purpose: establish the public/product URL boundary before component migration, and avoid the confusing `apps/app/app/app` path shape.

Decisions:

- Rename the physical package folder from `apps/app` to `apps/web`.
- Keep `apps/web/package.json` name as `@aqsha/app` for now, so root scripts using `--filter '@aqsha/app'` keep working.
- Use `/` for the future public landing page.
- Move authenticated product routes under `/app`.
- Keep auth routes at `/sign-in` and `/sign-up`.

Target route shape:

```text
apps/web/app/page.tsx                         # /
apps/web/app/app/page.tsx                     # /app
apps/web/app/app/explore/page.tsx             # /app/explore
apps/web/app/app/workspaces/page.tsx          # /app/workspaces
apps/web/app/app/workspaces/[workspaceId]     # /app/workspaces/[workspaceId]
apps/web/app/app/threads/[threadId]/page.tsx  # /app/threads/[threadId]
apps/web/app/app/settings/*                   # /app/settings/*
apps/web/app/sign-in/[[...rest]]/page.tsx     # /sign-in
apps/web/app/sign-up/[[...rest]]/page.tsx     # /sign-up
```

Tasks:

- Rename `apps/app` to `apps/web`.
- Update root `package.json` workspace entry from `apps/app` to `apps/web`.
- Update repo docs and agent notes that refer to `apps/app`, except historical docs where the old path is intentionally describing prior state.
- Move current product route files under `apps/web/app/app/*`.
- Add a new public landing placeholder at `apps/web/app/page.tsx`; the real landing page design can be implemented in a later dedicated phase.
- Use route groups only if they improve clarity; avoid nesting the product deeper than `apps/web/app/app/*`.
- Update Clerk middleware/protected route logic so `/app/*` is protected and `/` remains public.
- Set default signed-in redirects to `/app`.
- Add route redirects for old product URLs:
  - `/workspaces` -> `/app/workspaces`
  - `/workspaces/[workspaceId]` -> `/app/workspaces/[workspaceId]`
  - `/threads/[threadId]` -> `/app/threads/[threadId]`
  - `/explore` -> `/app/explore`
  - `/settings` and `/settings/*` -> `/app/settings` and `/app/settings/*`

Acceptance:

- `bun run dev:app`, `bun run build:app`, and root `bun run typecheck` still resolve the package through `@aqsha/app`.
- Visiting `/` renders a public landing placeholder without requiring auth.
- Visiting `/app` renders the existing product entry and requires auth.
- Legacy product URLs redirect to their `/app/*` equivalents.
- Existing product workflows still work after the route move.
- Screenshot coverage is updated to include both public `/` and authenticated `/app`.

### Phase 2 - Selia Foundation in `packages/ui`

Purpose: introduce Selia as a shared package foundation without changing page behavior.

Tasks:

- Run Selia init in a temporary app/worktree location with Bun, or manually apply the generated changes if the CLI output needs curation:
  - `bunx selia@latest init`
  - `bunx selia@latest add button badge card input textarea label dialog drawer menu popover tooltip command autocomplete input-group sidebar scroll-area select separator collapsible spinner progress meter alert item stack toolbar chip`
- Add the exact component subset that exists in the current Selia registry; if a CLI component name differs, confirm it from the docs/registry before copying source into `packages/ui`.
- Move generated Selia components into `packages/ui/src/selia`.
- Move generated Selia CSS into `packages/ui/src/styles/selia.css`.
- Inspect generated package changes before committing:
  - add `@base-ui/react` to the package(s) that directly compile Selia components, preferably `packages/ui`;
  - avoid duplicate `clsx`, `tailwind-merge`, and `class-variance-authority` entries where already present.
- Update `packages/ui/package.json` exports for Selia components and styles.
- Update `apps/web/app/globals.css` to import shared package styles instead of app-local Selia CSS.
- Cut over app-level theme tokens so `--primary`, `--ring`, shadcn compatibility colors, and `--sidebar-*` resolve to Selia's default theme instead of reintroducing the old Aqsha green/teal palette.
- Keep legacy utility token names such as `mint`, `sky`, `lavender`, `lemon`, and `coral` only as temporary compatibility aliases mapped to Selia/status tokens while unmigrated surfaces still reference them.
- Confirm Tailwind v4 sees package classes from `packages/ui`; add `@source` entries if generated package classes are not included.
- Add the `.root` wrapper required by Selia in `apps/web/app/layout.tsx` around `children`, but confirm it does not affect Clerk, Convex, Nuqs, theme provider, or toaster behavior.
- Add a `packages/ui/src/selia/README.md` documenting which generated components were curated.

Acceptance:

- `bun run --filter '@aqsha/ui' typecheck` passes.
- `bun run --filter '@aqsha/app' typecheck` passes or only shows known unrelated blockers.
- `bun run --filter '@aqsha/app' lint` passes or only shows known unrelated blockers.
- App shell remains structurally unchanged before feature-level import migration.
- App shell and sidebar no longer display the previous green/teal primary palette unless a color is an explicit Selia/status token.
- No `@/components/ui` imports have been deleted yet.

### Phase 3 - shadcn Compatibility Layer in `packages/ui`

Purpose: keep current shadcn APIs available from the shared package so app-local shadcn can shrink without breaking AI Elements or external components.

Tasks:

- Move or recreate shadcn-compatible primitives in `packages/ui/src/shadcn`:
  - `Button`
  - `Badge`
  - `Input`
  - `Textarea`
  - `Skeleton`
  - `Spinner`
  - `Card`
  - `Dialog`
  - `Menu` adapter for dropdown usage
  - `Tooltip`
  - `Separator`
- Move less common but still required app primitives too:
  - `Avatar`
  - `Breadcrumb`
  - `ButtonGroup`
  - `Carousel`
  - `Collapsible`
  - `Command`
  - `ContextMenu`
  - `DropdownMenu`
  - `HoverCard`
  - `InputGroup`
  - `Popover`
  - `ScrollArea`
  - `Select`
  - `Sheet`
  - `Sidebar`
- Update `apps/web/components/ui/*` to re-export from `@aqsha/ui/shadcn/*`.
- Keep current API shape including `asChild`, current variant names, and current size names.
- For Selia-backed compatibility wrappers, map current variants:
  - `default` -> `primary`
  - `outline` -> `outline`
  - `ghost` -> `plain`
  - `secondary` -> `secondary`
  - `destructive` -> `danger`
  - `link` -> plain/rendered link style
- For Selia-backed compatibility wrappers, map current sizes:
  - `default` -> `sm` or `md` depending on existing Aqsha density;
  - `sm` -> `sm`;
  - `lg` -> `lg`;
  - `icon` -> `icon`;
  - `icon-sm` -> `sm-icon`;
  - `icon-xs` -> `xs-icon`.
- Keep accessibility behavior equivalent: focus rings, disabled states, `asChild`/render support, aria labels, keyboard nav.

Acceptance:

- Current `@/components/ui/*` imports continue to compile through package re-exports.
- AI Elements can still import shadcn-compatible components without forcing a Selia rewrite.
- Visual behavior remains acceptable while product pages migrate to Selia-native components.
- No page-level workflow regresses.

### Phase 4 - Move AI Elements into `packages/ui`

Purpose: make chat-specific reusable UI a package concern instead of an app-local concern.

Targets:

- `apps/web/components/ai-elements/*`
- new `packages/ui/src/ai-elements/*`
- `apps/web/components/ai-elements/*` temporary re-exports

Tasks:

- Move AI Elements files to `packages/ui/src/ai-elements`.
- Keep shadcn-compatible imports inside AI Elements pointed at `@aqsha/ui/shadcn/*`.
- Keep package-local utility imports stable by exposing `cn` and any needed helpers from `packages/ui`.
- Decide whether app-specific AI Elements that reference Aqsha-only feature data should stay in `apps/web`; move only reusable rendering primitives first.
- Add package exports for each moved AI Element or a stable namespace export.
- Update app imports gradually, or leave app-local files as re-export shims during the first PR.

Acceptance:

- `bun run --filter '@aqsha/ui' typecheck` passes.
- `bun run --filter '@aqsha/app' typecheck` passes.
- Existing thread rendering still compiles without rewriting the chat feature.

### Phase 5 - Skipped: Keep Current App Shell, Navigation, and Layout

Status: skipped by product decision.

Purpose: keep the current shadcn-based layout and sidebar because this shell is the preferred product baseline.

Targets:

- `components/app-sidebar.tsx`
- `components/nav-user.tsx`
- `components/theme-toggle.tsx`
- `components/layout/detail-split-layout.tsx`
- `components/layout/responsive-side-panel.tsx`
- `components/thread-shell.tsx`
- `features/workspaces/components/workspace-shell.tsx`
- `features/settings/components/settings-shell.tsx`
- `features/settings/components/settings-rail.tsx`

Tasks:

- Do not migrate the main app shell, primary sidebar, or layout providers to Selia.
- Keep the current shadcn sidebar primitives, `SidebarProvider` behavior, desktop layout, mobile off-canvas behavior, cookie state, and route styling.
- Keep detail split layouts and responsive side panels on their current implementation unless a future non-Selia layout task explicitly changes them.
- Preserve:
  - sidebar close/search controls;
  - workspace section visible when there is a create affordance;
  - thread section visible when there is a create affordance;
  - command dialog behavior;
  - mobile off-canvas behavior;
  - active route styling.
- Validate panel parity rules from `apps/web/AGENTS.md` after each shell change.

Acceptance:

- Current shadcn left sidebar remains visible and usable on desktop and mobile.
- Thread detail and workspace detail keep the same split-panel behavior.
- Settings rail keeps routing to all settings pages.
- Navigation keeps the current product information architecture.

### Phase 6 - Settings Redesign/Refactor

Purpose: migrate a contained surface first to validate Selia's default form, item, card, alert, and progress patterns without carrying old Aqsha visual constraints forward.

Targets:

- `features/settings/components/*`
- `features/settings/pages/*`
- `app/settings/*`

Tasks:

- Convert `SettingsPanel`, `SettingsSummaryCard`, `SettingsListItem`, and `SettingsField` to `@aqsha/ui/selia/*` primitives where possible.
- Use Selia `Item` for account rows, setup rows, billing rows, and security/deletion panels.
- Use Selia `Alert` for billing notice/error and account deletion feedback.
- Use Selia `Meter` or `Progress` for credit usage where it communicates quota/progress.
- Use Selia `Tabs` or `ToggleGroup` only where it improves existing segmented controls; do not add unnecessary page tabs.
- Keep Clerk `UserProfile` inside the security panel and style only the surrounding shell.
- Let spacing, radius, borders, and state colors follow the Selia default theme unless the product workflow needs a concrete exception.
- Preserve:
  - account display-name/avatar mutations;
  - `next-themes` appearance behavior;
  - Convex/Polar billing actions;
  - the existing settings information architecture and routes.

Acceptance:

- `/app/settings/overview`, `/app/settings/account`, `/app/settings/appearance`, `/app/settings/security`, `/app/settings/usage-billing` work.
- Billing checkout/portal buttons still call the same handlers.
- Account deletion panel still handles pending, notice, and error states.
- Settings reads as part of the Selia baseline while staying efficient for repeated account/billing work.

### Phase 7 - Workspace Library and Artifact Management

Purpose: migrate the core product workspace surface.

Targets:

- `features/workspaces/components/workspace-board-toolbar.tsx`
- `workspace-drive-library.tsx`
- `workspace-drive-grid.tsx`
- `workspace-drive-context-menus.tsx`
- `workspace-drive-empty.tsx`
- `workspace-dialogs.tsx`
- `workspace-library-dialogs-stack.tsx`
- `workspace-picker-dialog.tsx`
- `workspace-picker-inline.tsx`
- `workspace-upload-toast.tsx`
- `drive-artifact-card.tsx`
- `workspaces-index-page.tsx`

Tasks:

- Replace toolbar controls with Selia `Toolbar`, `Button`, `Menu`, and `Breadcrumb` or local breadcrumb if Selia's breadcrumb does not fit.
- Replace folder/artifact cards with `Item`/`Card` compositions that preserve stable grid dimensions.
- Replace context menus with Selia `Menu` only after proving right-click and keyboard behavior match. If Selia lacks a true context-menu primitive, keep the existing context-menu as a documented temporary exception.
- Migrate create/rename/archive dialogs to Selia `Dialog`.
- Migrate `WorkspacePickerDialog` to Selia `Dialog` plus `Item`.
- Decide whether to migrate the upload queue from `sonner` to Selia `Toast`. If Selia toast cannot support the current custom queue, keep `sonner` through this phase with Selia-styled contents.
- Preserve:
  - single-click artifact context toggle;
  - double-click open behavior;
  - folder drag/drop move;
  - marquee multi-select;
  - current folder creation target;
  - upload target folder;
  - folder-per-view breadcrumb.

Acceptance:

- Workspace index can create/archive/open workspaces.
- Workspace detail can create folder/document/URL, upload files, move artifacts, select context, and open artifacts.
- Empty workspace and empty folder states still include obvious create actions.
- Workspace main library and thread side-panel library stay visually and behaviorally aligned.

### Phase 8 - Thread Experience and Packaged AI Elements

Purpose: migrate the most interaction-heavy surface after package ownership, AI Elements, and workspace primitives are stable.

Targets:

- `features/thread-experience/components/*`
- `@aqsha/ui/ai-elements/*` consumers
- `apps/web/components/ai-elements/*` re-export shims while they still exist
- `lib/thread-context-draft-store.ts` consumers only where UI changes touch them.

Tasks:

- Convert transcript controls, message actions, tool/result panels, HITL cards, run progress, and composer controls to Selia-backed primitives.
- Keep reusable message/composer primitives in `packages/ui/src/ai-elements`; keep app-specific orchestration in `apps/web/features/thread-experience`.
- Replace `button-group` usages with Selia `Toolbar` where the semantics match.
- Migrate prompt command UI:
  - `composer-token-input.tsx`
  - `packages/ui/src/ai-elements/prompt-input.tsx`
  - command dialog in `app-sidebar.tsx`
- Use Selia `Command`, `Autocomplete`, and `InputGroup` only after verifying keyboard navigation, filtering, and slash-command insertion.
- Keep current `useUIMessages`, stream rendering, rate-limit handling, HITL blocking, and active run cancellation untouched.
- Preserve draft context behavior:
  - selected context chips reflect draft selection;
  - `isDirty` controls whether selected context is sent;
  - message attachments remain message-scoped unless saved to workspace.

Acceptance:

- Starting a new global thread works.
- Sending in an existing thread works.
- Workspace-bound chat side panel and full thread page behave the same.
- Prompt command insertion still works.
- HITL cards and active run progress remain legible and actionable.

### Phase 9 - Explore

Purpose: migrate a card-heavy discovery page after core app interactions are stable.

Targets:

- `features/explore/pages/explore-page.tsx`

Tasks:

- Replace search form with Selia `InputGroup`, `Input`, and `Button`.
- Replace provider warning/error with Selia `Alert`.
- Replace paper cards with Selia `Card` or `Item` depending on visual density.
- Replace topic chips with Selia `Chip` or `Badge`.
- Migrate save-to-workspace dialog after `WorkspacePickerDialog` is stable.
- Preserve:
  - OpenAlex-first provider messaging;
  - fallback warning;
  - save URL artifact flow;
  - loading skeleton grid;
  - empty suggested queries.

Acceptance:

- Recommendations load on entry.
- Search works at `/app/explore`.
- Save-to-workspace works.
- Empty/error/loading states are visually aligned with the migrated product surfaces.

### Phase 10 - Artifact Detail and Editor Boundary

Purpose: migrate detail chrome while keeping BlockNote stable.

Targets:

- `features/workspaces/pages/artifact-detail-page.tsx`
- `artifact-detail-header.tsx`
- `blocknote-editor-loader.tsx`
- `blocknote-document-editor.tsx`
- `pdf-artifact-viewer.tsx`
- `mermaid-artifact-viewer.tsx`

Tasks:

- Migrate header actions and status chips to Selia `Button`, `Badge`/`Chip`, and `Item`.
- Migrate URL/PDF/code/plain-text detail panels to Selia `Card`/`Item`/`Alert`.
- Keep `@blocknote/shadcn` in place for the editor body unless a dedicated replacement is chosen.
- Document `@blocknote/shadcn` as a remaining exception in package cleanup.
- Preserve:
  - autosave reducer behavior;
  - save status;
  - URL retry;
  - PDF pagination;
  - Mermaid rendering;
  - large content scroll boundaries.

Acceptance:

- Document artifacts edit and autosave.
- URL artifacts show ready/failed/pending states and retry.
- PDF/code/Mermaid artifacts still render.
- No editor hydration regressions.

### Phase 11 - Dependency Placement and Cleanup

Purpose: move UI dependencies to the package that owns them and remove app-local leftovers only when proven unused.

Tasks:

- Run import checks:
  - `rg "@/components/ui" apps/web`
  - `rg "@/components/ai-elements" apps/web`
  - `rg "radix-ui|@radix-ui|@blocknote/shadcn|shadcn" apps/web packages/ui`
- Move or keep `shadcn`, Radix, `cmdk`, and compatibility-only dependencies in `packages/ui` when `packages/ui/src/shadcn` or `packages/ui/src/ai-elements` owns the importing code.
- Remove `shadcn` dependency from `apps/web` only after:
  - `@import "shadcn/tailwind.css"` is gone;
  - no app-local generated shadcn primitives remain;
  - no app-local CLI dependency is needed.
- Keep `@blocknote/shadcn` if the editor still imports `BlockNoteView` from it.
- Keep Radix dependencies in `packages/ui` if shadcn compatibility components still import them.
- Remove unused `radix-ui` and `@radix-ui/*` packages from `apps/web` only after no app imports remain. Note that `@radix-ui/react-use-controllable-state` is used by AI Elements reasoning UI today, so ownership should move with that component before removal from the app.
- Remove or relocate `components.json` only after deciding whether shadcn CLI generation should continue at package level.

Acceptance:

- No unintended app-local shadcn or AI Elements imports remain.
- Package manifests match actual imports.
- `bun run lint`, `bun run typecheck`, and `bun run build` are clean or known-blocker documented.

## Verification Matrix

Run after every feature phase:

```bash
bun run --filter '@aqsha/app' lint
bun run --filter '@aqsha/app' typecheck
```

Run after package phases:

```bash
bun run --filter '@aqsha/ui' typecheck
```

Run before merging each phase:

```bash
bun run lint
bun run typecheck
bun run build
```

Browser QA checklist:

- Public landing `/` loads without auth.
- Authenticated product `/app` loads after sign-in.
- Legacy product routes redirect to `/app/*`.
- Desktop and mobile sidebar open/close.
- New global thread and existing thread send.
- Workspace detail main library and workspace chat side panel.
- Thread detail main chat and thread right context panel.
- Workspace create, rename, archive.
- Folder create, rename, delete, drag/drop artifact move.
- Artifact context select/clear and send/start persistence.
- Upload queue success and failure.
- Explore search and save.
- Settings account, appearance, security, billing.
- Clerk sign-in/sign-up pages.

## Risks and Mitigations

| Risk | Why it matters | Mitigation |
| --- | --- | --- |
| Partial theme mixing | Selia default theme is the new baseline, but old app token overrides can leak through and make surfaces inconsistent. | Centralize Selia CSS in `packages/ui`, remove old token reintroduction from migrated surfaces, and treat exceptions as explicit product needs. |
| Sidebar behavior regression | Current shadcn sidebar owns provider state, mobile sheet, cookie persistence, and layout dimensions. Selia sidebar intentionally leaves positioning to the app. | Keep local `SidebarProvider` and layout state; migrate visual parts first. |
| Menu API mismatch | Current dropdown/context-menu components are Radix/shadcn-shaped. Selia menu uses different composition. | Build adapters and migrate one surface at a time. Keep context-menu exception if needed. |
| Command/composer regression | Prompt command and token input behavior is bespoke and high-risk. | Defer to Phase 8; add focused keyboard/browser QA. |
| `@blocknote/shadcn` blocks full cleanup | Artifact editor depends on BlockNote shadcn package and styles. | Treat as explicit exception; remove only in a dedicated editor-theme phase. |
| Settings/Clerk style mismatch | Clerk `UserProfile` is third-party UI. | Style the surrounding panel and keep Clerk widget behavior unchanged. |
| AI Elements package move drags app code into `packages/ui` | Some chat UI files may reference Aqsha-specific feature data, stores, or Convex types. | Move reusable rendering primitives first; leave app orchestration and feature-specific adapters in `apps/web`. |
| Route-prefix migration breaks deep links | Moving product routes from `/...` to `/app/...` changes user-facing URLs. | Add redirects for every existing product route and verify post-auth redirect goes to `/app`. |
| Tailwind misses packaged classes | Tailwind v4 may not scan generated Selia classes inside `packages/ui` by default. | Add explicit `@source` entries in consuming app styles if generated package classes are not emitted. |
| Broad visual redesign breaks workflows | The product is already functionally solid; broad redesign can break proven flows. | Use per-surface phases and behavior-based acceptance criteria instead of old style-document rules. |

## Recommended First Implementation Slice

The first implementation PR should be Phase 1 only: rename `apps/app` to `apps/web`, add the `/app` product route boundary, create the landing placeholder at `/`, and preserve old product URLs with redirects.

The first Selia PR should come after that and cover package foundation only: Phase 2 plus the smallest Phase 3 compatibility subset needed to prove the boundary.

- generate or copy Selia into `packages/ui/src/selia`;
- move Selia default CSS into `packages/ui/src/styles/selia.css` and import it through the package style entrypoint;
- add package exports for `button`, `badge`, `input`, `textarea`, `separator`, `spinner`, and `progress`;
- create `packages/ui/src/shadcn/button.tsx` and a few low-risk shadcn-compatible primitives;
- turn only the matching `apps/web/components/ui/*` files into re-export shims;
- add the `.root` wrapper in `apps/web/app/layout.tsx`;
- do not touch sidebar, command, workspace grid, or composer yet.

This slice gives a real integration proof while keeping the blast radius small.

## Source Notes

- Selia Next.js install: https://selia.earth/docs/installation/next/
- Selia introduction and ownership model: https://selia.earth/docs/introduction/
- Selia design approach: https://selia.earth/docs/design-approach/
- Selia button API: https://selia.earth/docs/button/
- Selia sidebar guidelines: https://selia.earth/docs/sidebar/
- Selia item API: https://selia.earth/docs/item/
- Selia GitHub registry: https://github.com/nauvalazhar/selia
