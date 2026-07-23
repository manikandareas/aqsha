# Project References Library Design

## Summary

Add a project-scoped references page at `/app/projects/[projectId]/references`. The page reuses the global Library experience while showing only canonical citations linked to the active project.

Citations remain account-owned canonical records. Projects hold links to citations, allowing one citation to appear in multiple projects without duplicating metadata. The global Library aggregates every citation in the account.

## Goals

- Make every project sidebar “Referensi” item open a functional project-scoped Library page.
- Keep the project page visually and behaviorally consistent with the global Library page.
- Display `Perpustakaan / Nama Proyek` in the project page header.
- Support search, filters, pagination, detail view, export, selection, and citation management in project scope.
- Automatically link citations created or imported from a project page to that project.
- Let users link existing global Library citations to the active project.
- Preserve one canonical citation across all projects.

## Non-goals

- Giving each project a separate copy of citation metadata.
- Introducing citation ownership at the project level.
- Replacing the global Library.
- Redesigning unrelated project or document pages.
- Changing the existing project sidebar information architecture.

## Domain Model

A citation is a canonical account-level record. A workspace citation link associates that citation with a project. The relationship is many-to-many:

- one citation may be linked to multiple projects;
- one project may contain multiple citations;
- unlinking does not delete the canonical citation;
- globally deleting a citation removes it and all project links.

Creating or importing from project scope must produce or reuse a canonical citation and link it to the active project. Duplicate detection must reuse the canonical record when appropriate rather than creating a project-specific copy.

## Route and Navigation

Create the route:

```text
/apps/svelte/src/routes/app/(product)/projects/[projectId]/references/+page.svelte
```

The existing project parent layout supplies the validated workspace and query hydration boundary. The page passes `workspace.id` and its display title into the reusable Library page.

The existing sidebar reference URL remains:

```text
/app/projects/[projectId]/references
```

The project submenu is active only when the current pathname equals that project’s references URL. Navigating between projects must update the scope and data without retaining another project’s selection or detail state.

## Frontend Architecture

Refactor `LibraryPage.svelte` into one reusable page with an explicit discriminated scope:

```text
{ kind: 'global' }
{ kind: 'project', workspaceId, workspaceName }
```

The shared page owns presentation and common interaction state:

- header and toolbar;
- search and filters;
- loading, empty, and no-results states;
- list rows and selection;
- detail split panel;
- dialogs and confirmation flows;
- URL state.

Scope-specific data access and actions live behind a focused controller or adapter rather than being scattered throughout the markup. The scope boundary supplies:

- list query;
- base URL for URL-state updates;
- copy/render context;
- create/import behavior;
- row membership action;
- bulk membership action;
- cache invalidation targets.

Shared components such as `LibraryRow`, `CitationDetailView`, and the bulk bar accept semantic actions or variants. They must not infer scope from the current URL.

Implementation must follow professional Svelte 5 practices from `svelte5-best-practices` and `svelte-core-bestpractices`: typed `$props`, clear `$derived` state, narrowly justified `$effect` usage, SSR-safe state, stable keyed rendering, and small components with explicit responsibilities. Route and URL construction must use SvelteKit routing utilities where route IDs exist.

## Header and URL State

The global header remains `Perpustakaan`.

The project header renders:

```text
Perpustakaan / Nama Proyek
```

- `Perpustakaan` links to `/app/library`.
- The project segment uses `projectDisplayTitle(workspace)`.
- The count represents only citations linked to the project.
- Long project names truncate without hiding the Library parent link.

Both scopes use the same query contract:

```text
?q=&status=&source=&tag=&cite=
```

URL-state updates must preserve the active base path. Changing filters or opening citation detail on a project page must never navigate to the global Library.

## Project List API

Upgrade `GET /workspaces/:id/citations` to support the same list semantics as the global endpoint:

- `cursor`;
- `limit`;
- `q`;
- `status`;
- `source`;
- `tag`.

Return the same normalized list contract used by the global Library:

```text
{
  items: CitationListItem[];
  nextCursor: string | null;
  total: number;
}
```

Filtering and pagination occur in the database/service layer, not by loading an unbounded project collection into the client. Authorization must verify project ownership and citation ownership through the authenticated account.

Global and project query keys must remain distinct and include scope plus filter state.

## Adding References in Project Scope

The project add menu contains:

1. `Dari Perpustakaan`
2. `Import file (.bib/.ris)`
3. `Dari DOI`
4. `Isi manual`
5. `Mendeley / Zotero`

### Existing Library picker

The picker is searchable and paginated. It lists canonical citations from the account, indicates citations already linked to the project, and disables or safely no-ops duplicate linking. Confirming an available citation creates only the workspace link.

### New citations and imports

Manual creation, DOI creation, file import, and provider sync initiated in project scope must link every successfully selected citation to the active project. This includes canonical citations reused through duplicate handling.

The service boundary must treat “available in the project” as the successful outcome. It must not report project success when citation creation succeeds but linking fails. Multi-record import results must identify and link all created, merged, or reused canonical records selected by the user.

Linking an already-linked citation is idempotent.

## Item and Bulk Actions

### Global scope

A row provides:

- open detail;
- copy citation using the global/default style;
- add to project;
- edit canonical metadata;
- open external source when available;
- delete from Library.

### Project scope

A row provides:

- open detail;
- copy citation using the project citation style;
- unlink from this project;
- edit canonical metadata;
- open external source when available;
- an explicitly labeled advanced action to delete from Library.

The primary project-scoped destructive action is `Lepas dari proyek`. It removes only the workspace link. Global deletion must be visually and verbally distinct because it removes the citation from every linked project.

Tagging and editing modify canonical metadata and therefore affect every scope where the citation appears. Copy and render operations use project citation settings in project scope.

Bulk project operations use `Lepas dari proyek` as their primary membership-removal action. Export and tagging remain available. Merge or global delete actions require explicit copy explaining their account-wide impact.

After unlinking or deleting the citation currently open in the detail panel, close the panel and remove `cite` from the URL. Failed mutations leave list, detail, and selection state intact.

## Global Deletion Impact

Before global deletion, the confirmation flow must communicate that the citation will disappear from all linked projects. When practical, include the number of affected projects from a service-provided impact count. The backend remains authoritative and removes links consistently with the canonical soft-delete operation.

Global delete is never presented simply as `Hapus` on the project page; use `Hapus dari Perpustakaan`.

## Empty and Loading States

The project page uses the same visual language as the global Library.

When the project has no linked citations and no filters are active, show project-specific copy and actions:

- primary: `Tambah dari Perpustakaan`;
- secondary: import file, DOI, and manual entry.

When active filters return no matches, show the normal no-results message instead of onboarding copy.

Loading skeletons match the global Library layout. Query errors use the established normalized API-error presentation and provide a retry path where the surrounding query pattern supports it.

## Cache and Consistency

Mutations invalidate only the necessary query families while preserving correctness:

- linking or unlinking invalidates the affected project collection and membership state;
- canonical create, edit, tag, merge, import, or delete invalidates the global citation family;
- canonical mutations also invalidate project collections that may render changed metadata;
- project citation style changes invalidate project render results;
- deletion or merge invalidates affected detail queries.

Selection state must be reconciled when successful mutations remove or merge selected items.

## Error Handling and Security

- Normalize client-visible API errors through the existing readable API-error helper.
- Backend failures use structured application errors.
- Project not found remains a parent-layout 404.
- A citation outside the active project scope cannot be opened through a forged project-page `cite` parameter.
- Cross-account projects, citations, and links are rejected.
- Unlink is idempotent or returns a harmless successful result when the link is already absent.
- Duplicate link attempts do not create duplicate rows.
- Import and provider flows do not claim project completion until the selected citations are linked.

## Testing

### Service and API tests

- Project list returns only linked citations owned by the authenticated account.
- Search, status, source, tag, cursor pagination, and `total` match global list semantics.
- Cross-account access is rejected.
- Manual and DOI creation in project scope create or reuse a canonical citation and link it.
- File import and provider sync link every selected created, merged, or reused citation.
- Linking is idempotent.
- Unlinking preserves the canonical citation and links in other projects.
- Global deletion removes the citation from every project collection.
- Project detail access rejects citations not linked to that project.

### Frontend unit and component tests

- Scope selects the correct query, render context, base path, and actions.
- Breadcrumb renders the project display name and links to global Library.
- URL updates preserve the project route.
- Global rows expose add-to-project; project rows expose unlink.
- The existing-Library picker identifies already-linked citations.
- Project empty state renders contextual copy and actions.
- Unlink/delete closes active detail only after success.
- Mutation failures preserve visible and selected items.
- Cache invalidation covers global and affected project collections.

### Integration verification

- Every sidebar reference submenu opens the correct project page.
- Manual, DOI, file import, provider sync, and existing-Library picker flows place citations into the active project.
- One canonical citation can appear in multiple projects without duplication in the global Library.
- Unlinking from one project does not affect another project.
- Global deletion removes the citation from all scopes after confirmation.

## Acceptance Criteria

- `/app/projects/[projectId]/references` is fully functional.
- Its layout and shared interactions match the global Library page.
- Its header reads `Perpustakaan / Nama Proyek`.
- It shows only citations linked to the active project.
- Search, filters, pagination, count, detail, export, and selection operate within project scope.
- New and imported citations are automatically linked to the active project.
- Existing global citations can be linked through a searchable picker.
- Project unlink and global delete are clearly distinguished.
- No duplicate page implementation is introduced.
- Svelte code passes the repository’s lint, typecheck, and test expectations and follows modern Svelte 5 patterns.
