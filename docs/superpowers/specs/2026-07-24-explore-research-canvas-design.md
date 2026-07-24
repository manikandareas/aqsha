# Explore research canvas design

## Goal

Turn `/app/explore` into a calm research canvas where filtering is available before a search, source discovery stays legible, and the curated feed uses the same source-first visual language as literature results.

## Scope

- Replace the desktop pre-search filter popover with a persistent filter rail.
- Make every filter category an accessible accordion; open **Publikasi** by default.
- Keep the filter rail visible on desktop for both landing and search states.
- Rework literature results and the landing feed into consistent, ordered source lists.
- Remove Explore-specific house-ad insertion.
- Preserve current URL-backed query, sort, filter, and topic behavior.

Out of scope: changing OpenAlex query semantics, changing source-saving behavior, or changing ads outside Explore.

## Experience

### Desktop layout

At `lg` and above, the page uses a two-column research canvas inside the existing app shell:

1. A sticky, 288px filter rail on the left.
2. A flexible content column on the right.

The rail appears on first load, before a user enters a search. The landing content keeps its search prompt but aligns to the content column; it no longer owns a floating filter. Once a query is active, the compact search bar, result count, and sort control form a compact toolbar above the list.

### Mobile layout

Below `lg`, the rail is hidden and the existing Filter control opens a bottom drawer. The drawer uses the same accordion editor and preserves draft filters until the user applies or discards them. The page never renders the oversized desktop popover on mobile.

### Filter rail

The editor renders one full-width accordion per catalog category. **Publikasi** is open on first render; all other categories are collapsed. Each accordion header:

- exposes its expanded state to assistive technology;
- shows a compact active-filter count when the category has staged clauses; and
- keeps fields vertical and full-width when expanded.

Active clauses remain visible as removable chips above the accordions. The rail footer stays reachable while scrolling and provides Reset and Terapkan actions. A user may stage filters before entering a query; submitting the query commits the current draft, as it does today.

The selected/open category state must reconcile after the asynchronous catalog arrives, so the initial rail never remains empty because it was created against an empty catalog.

### Source lists

Both result modes use a single framed list with internal hairline separators rather than a grid of unrelated cards.

Each literature-result row prioritizes:

1. a selectable source and paper title;
2. author, year, venue, and citation context;
3. a short, readable abstract excerpt;
4. status tags such as open access, type, and PDF availability; and
5. stable actions for saving and opening the canonical source.

Rows have enough vertical spacing to scan, but retain the compact density expected in a research tool. On narrow widths, metadata wraps before actions, and controls remain easy to target.

The landing feed uses a sibling source-row component for discovery items instead of the hero/grid/feature card sequence. It retains each discovery item's save and hide interactions, supports the existing infinite loading behavior, and uses the same title, metadata, tag, and action rhythm as search results.

### Ads and states

Explore no longer constructs feed blocks or renders `HouseAdBanner`; no banner is inserted into the landing feed. Empty, loading, error, and end-of-feed states remain in the content column and use the same framed-list geometry where appropriate.

## Architecture

- `ExplorePage` owns the responsive layout and decides between persistent rail and mobile drawer.
- `LiteratureSearchHero` becomes a search-only landing component; it no longer hosts a filter overlay.
- `LiteratureFilterSidebar` presents the shared editor as the permanent rail.
- `LiteratureFilterEditor` owns accessible accordion presentation and local draft synchronization, while the page remains responsible for URL commits.
- `LiteratureResults` and `LiteratureResultRow` provide the literature list grammar.
- A dedicated Explore discovery-row component adapts `DiscoveryItem` data for the same grammar without coupling the feed model to the OpenAlex result type.
- `ExploreFindings` maps its deduplicated items directly to discovery rows, keeping its hide/save, pagination, and empty-state behavior. The Explore-only feed block builder and its ad-oriented contract are removed.

## States and error handling

- Catalog pending: render stable accordion header placeholders or a quiet loading treatment without collapsing the rail.
- Catalog loaded: guarantee a valid initially open category, preferring Publikasi.
- Filter draft: Apply commits draft filters with the current query; Reset clears the draft only; closing the mobile drawer discards unapplied edits.
- Search pending: render source-list skeleton rows.
- Search failure: preserve the visible filter rail and show the existing retry action beside the list.
- No results: explain that the query and current filters have no match, with an immediate clear-filters action when filters are active.
- Reduced motion: accordion and state transitions resolve immediately under `prefers-reduced-motion`.

## Accessibility and responsiveness

- Accordion headers are buttons with `aria-expanded`, logical keyboard order, and visible mint focus treatment.
- Every input retains an associated label; no field relies on placeholder-only meaning.
- The desktop rail is only present where its content can remain at least 288px wide. Smaller viewports use the drawer.
- Result rows avoid fixed text widths; titles, metadata, and actions wrap without overflow.
- Existing contrast, focus, and dark-theme token rules remain unchanged.

## Test plan

1. Add a failing component test proving the desktop landing state renders the filter rail rather than the filter popover.
2. Add a failing editor test proving Publikasi starts open after asynchronous catalog data is available and category headers expand/collapse their own fields.
3. Add a failing feed test proving Explore renders discovery items directly and never emits an ad block.
4. Keep URL codec coverage for staged filters, query submission, sort changes, and back/forward resynchronization.
5. Run Svelte autofixer on touched components, then `bun --filter @aqsha/svelte test`, `check`, and `lint`.
6. Verify `/app/explore` in Brave at desktop and mobile widths: landing rail, accordion behavior, applied filters, result wrapping, feed pagination, and an ad-free feed.

## Acceptance criteria

- On desktop, `/app/explore` shows the filter rail before a query is entered.
- The desktop page has no filter popover.
- Publikasi is expanded by default; the remaining categories are collapsed until opened.
- Expanded filter fields have a usable full-width layout.
- Literature results and the landing feed share a calm, ordered source-list language.
- No `HouseAdBanner` appears anywhere in Explore.
- Existing filtering, sorting, saving, hiding, loading, empty, error, keyboard, and mobile-drawer behavior remain functional.
