# App Home Research Shelf Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mengubah beranda `/app` menjadi Research Shelf berpalet Paper + Candy yang menampilkan seluruh proyek secara jelas, responsif, dan accessible.

**Architecture:** `HomeDashboardPage.svelte` tetap menjadi orchestrator query dan page states. Presentasi setiap workspace dipisahkan ke `ProjectShelfCard.svelte`, sedangkan mapping warna deterministik diletakkan dalam helper TypeScript murni agar dapat diuji tanpa browser. Shared button, dropdown, icon, error normalizer, dan design tokens tetap dipakai.

**Tech Stack:** Svelte 5 runes, SvelteKit, TypeScript, Tailwind CSS v4, TanStack Svelte Query, `@aqsha/ui-svelte`, Vitest, Bun 1.3.10.

## Global Constraints

- Gunakan Bun `1.3.10`; jangan gunakan npm, pnpm, atau yarn.
- Jangan mengubah API workspace, database, sidebar utama, atau route contract.
- Gunakan icon dari `$lib/icons`/adapter Hugeicons yang sudah ada.
- Gunakan `readableApiErrorMessage` dari `$lib/errors`; jangan tampilkan raw `error.message`.
- Pertahankan Svelte 5 runes dan event attributes modern.
- Gunakan token mint, lavender, coral, lemon, background, card, border, foreground, dan ring yang sudah tersedia.
- Tidak ada staggered page entrance, gradient, glassmorphism, wide blur shadow, atau nested cards.
- Nama card seluruh proyek adalah `ProjectShelfCard`, bukan `RecentProjectCard`.

---

### Task 1: Project presentation model dan sorting regression tests

**Files:**
- Create: `apps/svelte/src/lib/features/workspaces/project-presentation.ts`
- Create: `apps/svelte/src/lib/features/workspaces/project-presentation.spec.ts`
- Create: `apps/svelte/src/lib/features/workspaces/project-sort.spec.ts`
- Modify: `apps/svelte/src/lib/features/workspaces/project-sort.ts`

**Interfaces:**
- Produces: `type ProjectAccent = 'mint' | 'lavender' | 'coral' | 'lemon'`.
- Produces: `projectAccent(kind: WorkspaceKind): ProjectAccent`.
- Preserves: `sortWorkspaces(items: Workspace[], sort: ProjectSortId): Workspace[]` without mutating `items`.

- [ ] **Step 1: Write failing tests for deterministic accent mapping**

```ts
import { describe, expect, it } from 'vitest';
import { projectAccent } from './project-presentation';

describe('projectAccent', () => {
  it('maps every workspace kind to a stable candy accent', () => {
    expect(projectAccent('undergraduate_thesis')).toBe('mint');
    expect(projectAccent('masters_thesis')).toBe('lavender');
    expect(projectAccent('dissertation')).toBe('coral');
    expect(projectAccent('journal_article')).toBe('lavender');
    expect(projectAccent('proposal')).toBe('coral');
    expect(projectAccent('paper')).toBe('lemon');
    expect(projectAccent('freeform')).toBe('mint');
  });
});
```

- [ ] **Step 2: Run the accent test and verify RED**

Run: `cd apps/svelte && bun run test:unit --run src/lib/features/workspaces/project-presentation.spec.ts`

Expected: FAIL because `./project-presentation` does not exist.

- [ ] **Step 3: Implement the exhaustive accent mapping**

```ts
import type { WorkspaceKind } from './types';

export type ProjectAccent = 'mint' | 'lavender' | 'coral' | 'lemon';

const PROJECT_ACCENTS = {
  undergraduate_thesis: 'mint',
  masters_thesis: 'lavender',
  dissertation: 'coral',
  journal_article: 'lavender',
  proposal: 'coral',
  paper: 'lemon',
  freeform: 'mint'
} as const satisfies Record<WorkspaceKind, ProjectAccent>;

export function projectAccent(kind: WorkspaceKind): ProjectAccent {
  return PROJECT_ACCENTS[kind];
}
```

- [ ] **Step 4: Add sorting tests for order and immutability**

Create fixtures with distinct `name`, `createdAt`, and `updatedAt`; assert `updated-desc`, `updated-asc`, `created-desc`, and `name-asc`, plus `expect(result).not.toBe(input)` and unchanged input ID order.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `cd apps/svelte && bun run test:unit --run src/lib/features/workspaces/project-presentation.spec.ts src/lib/features/workspaces/project-sort.spec.ts`

Expected: both test files PASS.

### Task 2: Rename dan redesign project card

**Files:**
- Rename: `apps/svelte/src/lib/features/workspaces/components/RecentProjectCard.svelte` → `apps/svelte/src/lib/features/workspaces/components/ProjectShelfCard.svelte`
- Consume: `apps/svelte/src/lib/features/workspaces/project-presentation.ts`
- Consume: `apps/svelte/src/lib/features/workspaces/labels.ts`

**Interfaces:**
- Consumes: `projectAccent(workspace.kind)`.
- Props: `{ workspace: Workspace }`.
- Produces: satu semantic `<article>` dengan satu stretched project link.

- [ ] **Step 1: Rename the component without changing behavior**

Use a filesystem rename, then update the component name in imports during Task 4. Do not retain a compatibility wrapper because the old component is uncommitted and has no external consumers.

- [ ] **Step 2: Replace the cover style with exhaustive Paper + Candy classes**

Use a `Record<ProjectAccent, string>` mapping:

```ts
const COVER_STYLES: Record<ProjectAccent, string> = {
  mint: 'bg-mint-soft text-mint-foreground',
  lavender: 'bg-lavender-soft text-lavender-foreground',
  coral: 'bg-coral-soft text-coral-foreground',
  lemon: 'bg-lemon-soft text-lemon-foreground'
};
```

The kind label uses the matching soft-border token and a raised paper face. The label remains visible so color is never the only signal.

- [ ] **Step 3: Use relative edit time and stable card anatomy**

Import `formatRelativeToNow` from `../labels`. Render cover → title → relative edit time. Preserve fallback title and `Belum ada catatan` copy.

- [ ] **Step 4: Add accessible interaction states**

Use a single stretched anchor, `aria-label={\`Buka ${title}\`}`, `focus-visible` ring, border-only hover emphasis, and `motion-reduce:transform-none`. Do not add nested buttons or blur shadows.

- [ ] **Step 5: Run Svelte autofixer**

Run: `cd apps/svelte && bunx @sveltejs/mcp svelte-autofixer src/lib/features/workspaces/components/ProjectShelfCard.svelte --svelte-version 5`

Expected: no Svelte correctness findings requiring changes.

### Task 3: Refine creation slot dan utility strip

**Files:**
- Modify: `apps/svelte/src/lib/features/workspaces/components/NewProjectCard.svelte`
- Modify: `apps/svelte/src/lib/features/workspaces/components/HomeFeatureShortcuts.svelte`

**Interfaces:**
- `NewProjectCard` remains a link to `/app/projects/new`.
- `HomeFeatureShortcuts` remains navigation to `/app/explore` and `/app/library`.

- [ ] **Step 1: Give `NewProjectCard` explicit copy**

Render `PlusIcon`, label `Proyek baru`, and description `Mulai dari ide, judulnya bisa menyusul.` inside the dashed slot. Keep the whole element one link with a minimum 44px hit target.

- [ ] **Step 2: Make shortcuts a quiet utility strip**

Keep icon wells but remove hover lift and decorative scale. Use background/border color transitions only, a directional arrow, standard focus ring, and vertical stacking below the small breakpoint.

- [ ] **Step 3: Run Svelte autofixer on both files**

Run:

```bash
cd apps/svelte
bunx @sveltejs/mcp svelte-autofixer src/lib/features/workspaces/components/NewProjectCard.svelte --svelte-version 5
bunx @sveltejs/mcp svelte-autofixer src/lib/features/workspaces/components/HomeFeatureShortcuts.svelte --svelte-version 5
```

Expected: no Svelte correctness findings requiring changes.

### Task 4: Recompose `HomeDashboardPage` and complete page states

**Files:**
- Modify: `apps/svelte/src/lib/features/workspaces/pages/HomeDashboardPage.svelte`
- Modify: `apps/svelte/src/routes/app/(product)/+page.svelte` only if import cleanup is required
- Consume: `apps/svelte/src/lib/errors/index.ts`

**Interfaces:**
- Imports `ProjectShelfCard`.
- Reads `list.isPending`, `list.isError`, `list.error`, `list.hasNextPage`, and `list.isFetchingNextPage`.
- Retry calls `list.refetch()`.

- [ ] **Step 1: Replace the page hierarchy**

Render a centered content container with: header (`Ruang risetmu`, contextual greeting, primary `Proyek baru` action), utility strip, then project shelf header and responsive grid.

- [ ] **Step 2: Remove orchestrated page entrance motion**

Delete `prefersReducedMotion`, `home-stagger`, inline stagger variables, `@keyframes home-rise`, and the page-level `<style>` block. Keep only component-level interaction transitions.

- [ ] **Step 3: Add normalized error state before empty/populated states**

```svelte
{:else if list.isError}
  <div role="alert" class="rounded-xl border-2 border-border bg-card p-6">
    <h3 class="font-heading text-lg font-bold">Proyekmu belum bisa dimuat</h3>
    <p class="mt-2 text-sm text-muted-foreground">
      {readableApiErrorMessage(list.error, 'Coba lagi sebentar, ya.')}
    </p>
    <Button type="button" variant="outline" class="mt-4" onclick={() => list.refetch()}>
      Coba lagi
    </Button>
  </div>
```

- [ ] **Step 4: Stabilize loading, empty, populated, and pagination layouts**

Skeletons use the same cover aspect ratio and metadata blocks as cards. Empty state teaches creation without nesting `NewProjectCard` inside another card. Pagination button exposes disabled/loading copy while fetching.

- [ ] **Step 5: Run Svelte autofixer on the page**

Run: `cd apps/svelte && bunx @sveltejs/mcp svelte-autofixer src/lib/features/workspaces/pages/HomeDashboardPage.svelte --svelte-version 5`

Expected: no Svelte correctness findings requiring changes.

### Task 5: Verification dan visual QA

**Files:**
- Verify all files touched in Tasks 1–4.

**Interfaces:**
- No new interfaces.

- [ ] **Step 1: Format only the touched Svelte workspace files**

Run: `cd apps/svelte && bunx prettier --write src/lib/features/workspaces/project-presentation.ts src/lib/features/workspaces/project-presentation.spec.ts src/lib/features/workspaces/project-sort.ts src/lib/features/workspaces/project-sort.spec.ts src/lib/features/workspaces/components/ProjectShelfCard.svelte src/lib/features/workspaces/components/NewProjectCard.svelte src/lib/features/workspaces/components/HomeFeatureShortcuts.svelte src/lib/features/workspaces/components/ProjectSortMenu.svelte src/lib/features/workspaces/pages/HomeDashboardPage.svelte 'src/routes/app/(product)/+page.svelte'`

- [ ] **Step 2: Run focused tests**

Run: `cd apps/svelte && bun run test:unit --run src/lib/features/workspaces/project-presentation.spec.ts src/lib/features/workspaces/project-sort.spec.ts`

Expected: PASS.

- [ ] **Step 3: Run Svelte check**

Run: `cd apps/svelte && bun run check`

Expected: zero errors.

- [ ] **Step 4: Run visual QA**

Inspect `/app` at mobile, tablet, and desktop widths in light and dark mode. Verify no horizontal overflow, card titles remain contained, sorting menu is not clipped, focus is visible, the creation path works, and mobile shell chrome does not collide with page content.

- [ ] **Step 5: Inspect final diff**

Run: `git diff --check` and `git status --short`. Confirm only the approved `/app` slice plus its tests and prior route replacement are part of the implementation.
