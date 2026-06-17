"use client";

import { api } from "@aqsha/convex/api";
import type { ExplorePaper } from "@aqsha/convex/explore";
import {
  discoveryItemKey,
  feedItemToDiscoveryItem,
  paperToDiscoveryItem,
  savedRefKey,
  type DiscoveryItem,
  type DiscoveryItemRef,
  type DiscoverySavedRef,
  type FeedItem,
} from "@aqsha/convex/feed";
import { CheckCircle2Icon, SparklesIcon } from "@aqsha/ui/icons";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AppLoadingOverlay } from "@/components/app-loading-overlay";
import { ExploreChatShell } from "@/features/explore/pages/explore-chat-shell";
import { IdeaDialog, type IdeaSeed } from "@/features/discovery/components/idea-dialog";
import { WorkspacePickerDialog } from "@/features/workspaces/components/workspace-picker-dialog";
import { toWorkspaceId } from "@/lib/convex-refs";
import { readableConvexErrorMessage } from "@/lib/convex-error";
import {
  useConvexActionFn,
  useConvexActionQueryWithKey,
  useConvexMutationFn,
  useConvexPaginatedQueryData,
  useConvexQueryData,
} from "@/lib/convex-query";
import {
  DiscoveryClaimCard,
  DiscoveryFeatureCard,
  DiscoveryHeroCard,
  DiscoveryStandardCard,
  type DiscoveryCardHandlers,
} from "../components/discovery-item-card";
import { DiscoveryListItem } from "../components/discovery-list-item";
import { DiscoveryAside } from "../components/discovery-aside";
import {
  DiscoveryHeaderControls,
  DiscoveryModeNav,
} from "../components/discovery-toolbar";
import { VERDICT_STYLE } from "../utils/discovery-verdict-style";
import {
  DISCOVERY_LANG,
  useDiscoveryNav,
  rangeToFromYear,
} from "../hooks/use-discovery-nav";
import { useStartResearch } from "../hooks/use-start-research";
import {
  deriveTopCited,
  deriveTopicMomentum,
  deriveTopTopics,
  deriveVerdictBreakdown,
} from "../utils/discovery-format";

const emptyPapers: ExplorePaper[] = [];

// Infinite-scroll tuning for the Brief feed (getFeedPaginated).
const FEED_INITIAL_ITEMS = 18;
const FEED_LOAD_MORE = 12;
// Small, stable cap for the right-rail aggregates so they don't reshuffle as the
// paginated main list grows.
const ASIDE_FEED_LIMIT = 30;
// Bound consecutive auto-loadMore calls between user scrolls so a run of
// locally-hidden items (which shrinks a page without advancing the cursor view)
// can't spin the IntersectionObserver. Reset whenever new items actually arrive.
const MAX_AUTO_LOADS = 4;

export function DiscoveryPage() {
  const router = useRouter();

  const [nav, setNav] = useDiscoveryNav();

  const searchActive = nav.q.trim().length > 0;

  // Non-search: the mode/topic feed (For You / Top / Topics), paginated for auto
  // infinite scroll. Search: the cross-content searchDiscovery index, augmented
  // with a live external searchPapers pass (owner decision #8). Exactly one of
  // these two paginated queries is live at a time; the other is skipped.
  const pagedFeed = useConvexPaginatedQueryData(
    api.feed.getFeedPaginated,
    searchActive
      ? "skip"
      : {
          mode: nav.mode,
          ...(nav.mode === "topics" && nav.topic ? { topic: nav.topic } : {}),
        },
    { initialNumItems: FEED_INITIAL_ITEMS },
  );
  const searchFeed = useConvexPaginatedQueryData(
    api.feed.searchDiscovery,
    searchActive
      ? { q: nav.q, fromYear: rangeToFromYear(nav.range) }
      : "skip",
    { initialNumItems: FEED_INITIAL_ITEMS },
  );
  const externalPapers = useConvexActionQueryWithKey(
    api.explore.searchPapers,
    ["discoverySearch", nav.q, nav.range],
    searchActive
      ? {
          query: nav.q,
          mode: "search",
          limit: 12,
          fromYear: rangeToFromYear(nav.range),
        }
      : "skip",
  );
  const activeFeed = searchActive ? searchFeed : pagedFeed;

  // Aside aggregates read a small, stable getFeed cap so the right rail doesn't
  // reshuffle on every loadMore as the paginated main list grows.
  const asideFeedData = useConvexQueryData(api.feed.getFeed, {
    limit: ASIDE_FEED_LIMIT,
  });

  // Saved/hidden refs for the external (search) papers — feed items carry their
  // own `saved` flag, but the augmented external papers need a lookup.
  const paperItemRefs: DiscoveryItemRef[] = searchActive
    ? (externalPapers.data?.items ?? emptyPapers).map((paper) => ({
        kind: "paper" as const,
        paperKey: paper.key,
      }))
    : [];
  const savedRefsData = useConvexQueryData(
    api.feed.getSavedDiscoveryRefs,
    searchActive ? { itemRefs: paperItemRefs } : "skip",
  );
  const hiddenRefsData = useConvexQueryData(
    api.feed.getHiddenDiscoveryRefs,
    searchActive ? { itemRefs: paperItemRefs } : "skip",
  );

  // Mutations / actions.
  const saveDiscoveryItem = useConvexMutationFn(api.feed.saveDiscoveryItem);
  const unsaveDiscoveryItem = useConvexMutationFn(api.feed.unsaveDiscoveryItem);
  const hideDiscoveryItem = useConvexMutationFn(api.feed.hideDiscoveryItem);
  const recordDiscoveryInteraction = useConvexMutationFn(
    api.feed.recordDiscoveryInteraction,
  );
  const createUrl = useConvexMutationFn(api.artifacts.createUrl);
  const explainRelevance = useConvexActionFn(api.feed.ai.explainRelevance);
  const {
    startResearch,
    busyKey,
    error: researchError,
  } = useStartResearch();

  // Local UI state (keyed by the stable surrogate id `sid`).
  const [localError, setLocalError] = useState<string | null>(null);
  const [savedOverride, setSavedOverride] = useState<Map<string, boolean>>(new Map());
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [relevanceNotes, setRelevanceNotes] = useState<Map<string, string>>(new Map());
  const [whyLoading, setWhyLoading] = useState<Set<string>>(new Set());
  const [ideaSeed, setIdeaSeed] = useState<IdeaSeed | null>(null);
  const [ideaOpen, setIdeaOpen] = useState(false);
  const [workspaceItem, setWorkspaceItem] = useState<DiscoveryItem | null>(null);

  // Auto infinite-scroll plumbing (Brief feed).
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const autoLoadCountRef = useRef(0);
  const prevResultsLenRef = useRef(0);

  const savedRefs = (() => {
    const set = new Set<string>();
    for (const ref of (savedRefsData ?? []) as DiscoverySavedRef[]) {
      set.add(savedRefKey(ref));
    }
    return set;
  })();
  const hiddenRefs = (() => {
    const set = new Set<string>();
    for (const ref of (hiddenRefsData ?? []) as DiscoverySavedRef[]) {
      set.add(savedRefKey(ref));
    }
    return set;
  })();

  // Main list: the active paginated feed (mode feed or search index), plus — in
  // search — the external papers not already present in the cached results.
  const feedDiscoveryItems: DiscoveryItem[] = (
    activeFeed.results as FeedItem[]
  ).map(feedItemToDiscoveryItem);
  const feedPaperKeys = new Set(
    feedDiscoveryItems
      .map((item) => item.paperKey)
      .filter((key): key is string => Boolean(key)),
  );
  // Defer the live external papers until the in-app search index is fully
  // paginated. That keeps the dedup against feed paper keys stable (a later index
  // page can't retroactively remove an already-shown external row) and lands the
  // external augmentation as one clean block at the end instead of reshuffling
  // mid-scroll.
  const externalDiscoveryItems: DiscoveryItem[] =
    searchActive && searchFeed.status === "Exhausted"
      ? (externalPapers.data?.items ?? emptyPapers)
          .filter((paper) => !feedPaperKeys.has(paper.key))
          .map((paper) => paperToDiscoveryItem(paper, savedRefs))
      : [];
  const mainRawItems: DiscoveryItem[] = [
    ...feedDiscoveryItems,
    ...externalDiscoveryItems,
  ];
  // Right-rail aggregates read the stable capped getFeed, never the growing
  // paginated results, so the rail stays put across loadMore and search.
  const asideRawItems: DiscoveryItem[] = (
    (asideFeedData ?? []) as FeedItem[]
  ).map(feedItemToDiscoveryItem);

  const items = mainRawItems.filter((item) => {
    const key = discoveryItemKey(item);
    return !hiddenIds.has(key) && !hiddenRefs.has(key);
  });
  const topTopics = deriveTopTopics(asideRawItems, 8);
  // Each derive returns an empty/zero result for views that lack the data, so the
  // matching rail module hides itself.
  const verdictBreakdown = deriveVerdictBreakdown(asideRawItems);
  const topCited = deriveTopCited(asideRawItems, 4);
  const topicMomentum = deriveTopicMomentum(asideRawItems, 4);

  const feedStatus = activeFeed.status;
  const loadMoreFeed = activeFeed.loadMore;
  const resultsLen = activeFeed.results.length;

  // The full-area overlay gates ONLY on the active paginated index's first page
  // (mode feed or search index). The live external-papers pass (search) is a
  // deferred augmentation appended after the index is exhausted — it must never
  // blank out already-loaded index results, so it's excluded here.
  const isLoading = feedStatus === "LoadingFirstPage";

  // While the deferred external pass is still in flight (index already exhausted),
  // surface a "loading more" affordance instead of a premature empty state.
  const externalPending =
    searchActive && feedStatus === "Exhausted" && externalPapers.isLoading;

  // Manual fallback when auto-load stalls: reset the budget, re-baseline the
  // growth tracker, and pull one more page. The observer re-arms auto-scroll once
  // the list actually grows again.
  const handleManualLoadMore = () => {
    autoLoadCountRef.current = 0;
    prevResultsLenRef.current = resultsLen;
    loadMoreFeed(FEED_LOAD_MORE);
  };

  // Signature for the active paginated session — it changes whenever the query
  // restarts at page 1 (mode/topic switch, or entering/leaving search). Resetting
  // the auto-load budget here starts each fresh session unthrottled and doubles
  // as a recovery path if auto-load ever stalled. Refs only (no setState).
  const feedSessionKey = searchActive
    ? `search:${nav.q}:${nav.range}`
    : `feed:${nav.mode}:${nav.topic ?? ""}`;
  useEffect(() => {
    autoLoadCountRef.current = 0;
    prevResultsLenRef.current = 0;
  }, [feedSessionKey]);

  // Auto-load the next page when the sentinel scrolls into view. The budget
  // (MAX_AUTO_LOADS) only counts down on genuine no-progress stalls — e.g. a page
  // whose rows are all locally hidden, which shrinks below numItems without
  // advancing the cursor — and is refunded the moment the feed actually grows, so
  // normal scrolling never trips it. Tracking growth/shrink inside the callback
  // (refs only) keeps this reactive-safe: a reactive hide can shrink results, and
  // a later re-grow past the new baseline still reads as progress.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        if (feedStatus !== "CanLoadMore") return;
        if (resultsLen !== prevResultsLenRef.current) {
          if (resultsLen > prevResultsLenRef.current) autoLoadCountRef.current = 0;
          prevResultsLenRef.current = resultsLen;
        }
        // Budget spent without the visible list growing (e.g. Topics post-filter
        // dropped whole pages). Stop auto-spinning; the always-present manual
        // "Muat lebih banyak" button (shown at CanLoadMore) is the escape.
        if (autoLoadCountRef.current >= MAX_AUTO_LOADS) return;
        autoLoadCountRef.current += 1;
        loadMoreFeed(FEED_LOAD_MORE);
      },
      { rootMargin: "600px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [feedSessionKey, feedStatus, loadMoreFeed, resultsLen]);

  const searchError =
    searchActive && externalPapers.error
      ? readableConvexErrorMessage(externalPapers.error, "Gagal mencari.")
      : null;

  const isSaved = (item: DiscoveryItem) => {
    const id = discoveryItemKey(item);
    return savedOverride.has(id)
      ? Boolean(savedOverride.get(id))
      : item.saved;
  };

  const recordItemInteraction = (
    item: DiscoveryItem,
    kind: "save" | "hide" | "research" | "open_evidence",
  ) => {
    return recordDiscoveryInteraction({ itemRef: item.itemRef, kind });
  };

  const handleSave = async (item: DiscoveryItem) => {
    const id = discoveryItemKey(item);
    const next = !isSaved(item);
    setSavedOverride((prev) => new Map(prev).set(id, next));
    try {
      if (next) await saveDiscoveryItem({ itemRef: item.itemRef });
      else await unsaveDiscoveryItem({ itemRef: item.itemRef });
    } catch (caught) {
      setSavedOverride((prev) => new Map(prev).set(id, !next));
      setLocalError(readableConvexErrorMessage(caught, "Gagal menyimpan. Coba lagi."));
    }
  };

  const handleWhyRelevant = async (item: DiscoveryItem) => {
    const id = discoveryItemKey(item);
    if (relevanceNotes.has(id) || whyLoading.has(id)) return;
    setWhyLoading((prev) => new Set(prev).add(id));
    const clearLoading = () =>
      setWhyLoading((prev) => {
        const nextSet = new Set(prev);
        nextSet.delete(id);
        return nextSet;
      });
    try {
      const result = await explainRelevance({
        title: item.title,
        context: item.tldr ?? item.summary,
        topics: item.topics,
      });
      if (result.ok) {
        setRelevanceNotes((prev) => new Map(prev).set(id, result.reason));
      }
      clearLoading();
    } catch {
      clearLoading();
    }
  };

  const handleSaveToWorkspace = async (workspaceId: string) => {
    if (!workspaceItem) return;
    await createUrl({
      workspaceId: toWorkspaceId(workspaceId),
      url: workspaceItem.doi
        ? `https://doi.org/${workspaceItem.doi}`
        : (workspaceItem.pdfUrl ?? workspaceItem.url),
      title: workspaceItem.title,
    });
    setWorkspaceItem(null);
  };

  const handlers: DiscoveryCardHandlers = {
    onAskAstra: (item) =>
      void startResearch(buildSeed(item), {
        busyKey: discoveryItemKey(item),
        onSuccess: async () => {
          await recordItemInteraction(item, "research").catch(() => {});
        },
      }),
    onSave: (item) => void handleSave(item),
    onSaveToWorkspace: (item) => setWorkspaceItem(item),
    onHide: (item) => {
      setHiddenIds((prev) => new Set(prev).add(discoveryItemKey(item)));
      void hideDiscoveryItem({ itemRef: item.itemRef }).catch(() => {});
    },
    onOpenEvidence: (item) => {
      if (!item._id) return;
      void recordItemInteraction(item, "open_evidence").catch(() => {});
      router.push(`/app/explore/f/${item._id}`);
    },
    onGenerateIdeas: (item) => {
      setIdeaSeed({
        title: item.title,
        context: item.tldr ?? item.summary,
        topics: item.topics,
      });
      setIdeaOpen(true);
    },
    onWhyRelevant: (item) => void handleWhyRelevant(item),
  };

  // Feed modes render the editorial mosaic; search renders a flat results list.
  const showMosaic = !searchActive;
  const hero = showMosaic ? items[0] : undefined;
  const briefRows = showMosaic ? buildBriefRows(items.slice(1)) : [];

  return (
    <ExploreChatShell
      breadcrumbs={[{ label: "Jelajahi" }]}
      headerCenter={
        <DiscoveryModeNav
          mode={nav.mode}
          topic={nav.topic}
          onSelectMode={(mode) => void setNav({ mode, topic: null })}
          onSelectTopic={(topic) => void setNav({ mode: "topics", topic })}
        />
      }
      headerRight={
        <DiscoveryHeaderControls
          query={nav.q}
          onSubmitQuery={(q) => void setNav({ q })}
          range={nav.range}
          onRangeChange={(range) => void setNav({ range })}
          isSearching={
            searchActive &&
            (searchFeed.status === "LoadingFirstPage" ||
              externalPapers.isFetching)
          }
        />
      }
    >
      <div className="mx-auto w-full max-w-[1200px] px-5 pb-12 pt-4 sm:px-8 xl:px-10">
          {searchActive ? (
            <SearchResultsHeader
              query={nav.q}
              onClear={() => void setNav({ q: "" })}
            />
          ) : null}

          {localError || researchError || searchError ? (
            <div className="mt-4 max-w-[760px] rounded-[7px] border border-destructive/20 bg-destructive/10 px-4 py-3 text-[13px] font-medium text-destructive">
              {localError ?? researchError ?? searchError}
            </div>
          ) : null}

          <section className="grid grid-cols-1 gap-8 pt-6 @4xl/explore:grid-cols-[minmax(0,1fr)_340px] @4xl/explore:gap-10">
            <div className="@container/feed min-w-0">
              {isLoading ? (
                <AppLoadingOverlay variant="absolute" />
              ) : items.length === 0 && feedStatus === "Exhausted" && !externalPending ? (
                <DiscoveryEmptyState
                  mode={searchActive ? "search" : nav.mode}
                  query={nav.q}
                />
              ) : showMosaic ? (
                <div className="space-y-10">
                  {hero ? (
                    <DiscoveryHeroCard
                      item={hero}
                      lang={DISCOVERY_LANG}
                      saved={isSaved(hero)}
                      busy={busyKey === discoveryItemKey(hero)}
                      relevanceNote={relevanceNotes.get(discoveryItemKey(hero))}
                      whyLoading={whyLoading.has(discoveryItemKey(hero))}
                      handlers={handlers}
                    />
                  ) : null}
                  {briefRows.map((row) =>
                    row.type === "grid" ? (
                      <div
                        key={row.key}
                        className="grid grid-cols-1 gap-x-5 gap-y-8 @md/feed:grid-cols-2 @2xl/feed:grid-cols-3"
                      >
                        {row.items.map((item) => (
                          <div key={discoveryItemKey(item)}>
                            {item.kind === "claim" ? (
                              <DiscoveryClaimCard
                                item={item}
                                lang={DISCOVERY_LANG}
                                saved={isSaved(item)}
                                busy={busyKey === discoveryItemKey(item)}
                                relevanceNote={relevanceNotes.get(discoveryItemKey(item))}
                                whyLoading={whyLoading.has(discoveryItemKey(item))}
                                handlers={handlers}
                              />
                            ) : (
                              <DiscoveryStandardCard
                                item={item}
                                lang={DISCOVERY_LANG}
                                saved={isSaved(item)}
                                busy={busyKey === discoveryItemKey(item)}
                                relevanceNote={relevanceNotes.get(discoveryItemKey(item))}
                                whyLoading={whyLoading.has(discoveryItemKey(item))}
                                handlers={handlers}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div key={row.key} className="border-t border-border/60 pt-10">
                        <DiscoveryFeatureCard
                          item={row.item}
                          imageSide={row.side}
                          lang={DISCOVERY_LANG}
                          saved={isSaved(row.item)}
                          busy={busyKey === discoveryItemKey(row.item)}
                          relevanceNote={relevanceNotes.get(discoveryItemKey(row.item))}
                          whyLoading={whyLoading.has(discoveryItemKey(row.item))}
                          handlers={handlers}
                        />
                      </div>
                    ),
                  )}
                  {feedStatus !== "Exhausted" ? (
                    <div ref={sentinelRef} aria-hidden className="h-px w-full" />
                  ) : null}
                  <FeedFooter
                    status={feedStatus}
                    externalPending={externalPending}
                    caughtUp
                    onLoadMore={handleManualLoadMore}
                  />
                </div>
              ) : (
                <div>
                  <div className="divide-y divide-border/60">
                    {items.map((item, index) => (
                      <DiscoveryListItem
                        key={discoveryItemKey(item)}
                        item={item}
                        index={index}
                        lang={DISCOVERY_LANG}
                        saved={isSaved(item)}
                        busy={busyKey === discoveryItemKey(item)}
                        relevanceNote={relevanceNotes.get(discoveryItemKey(item))}
                        whyLoading={whyLoading.has(discoveryItemKey(item))}
                        handlers={handlers}
                      />
                    ))}
                  </div>
                  {feedStatus !== "Exhausted" ? (
                    <div ref={sentinelRef} aria-hidden className="h-px w-full" />
                  ) : null}
                  <FeedFooter
                    status={feedStatus}
                    externalPending={externalPending}
                    caughtUp={false}
                    onLoadMore={handleManualLoadMore}
                  />
                </div>
              )}
            </div>

            <aside className="min-w-0 @4xl/explore:sticky @4xl/explore:top-6 @4xl/explore:self-start">
              <DiscoveryAside
                mode={nav.mode}
                verdicts={verdictBreakdown}
                momentum={topicMomentum}
                topTopics={topTopics}
                topCited={topCited}
                onSelectTopic={(name) => void setNav({ q: name })}
              />
            </aside>
          </section>
        </div>

      <IdeaDialog
        seed={ideaSeed}
        open={ideaOpen}
        onOpenChange={setIdeaOpen}
        onStartResearch={(questionText) => {
          setIdeaOpen(false);
          void startResearch(questionText, { busyKey: "idea" });
        }}
        busy={busyKey === "idea"}
      />

      <WorkspacePickerDialog
        open={Boolean(workspaceItem)}
        onOpenChange={(open) => !open && setWorkspaceItem(null)}
        title="Simpan ke workspace"
        description="Pilih workspace tujuan. Paper akan otomatis diunduh dan metadatanya diekstrak."
        onSelect={handleSaveToWorkspace}
      />
    </ExploreChatShell>
  );
}

type BriefRow =
  | { type: "grid"; key: string; items: DiscoveryItem[] }
  | {
      type: "feature";
      key: string;
      item: DiscoveryItem;
      side: "left" | "right";
    };

// Lay the Brief feed out as an editorial mosaic: repeating units of a 3-up
// standard grid followed by two full-width spotlights (alternating image side),
// matching the magazine rhythm of the redesign reference.
function buildBriefRows(items: DiscoveryItem[]): BriefRow[] {
  const rows: BriefRow[] = [];
  let bucket: DiscoveryItem[] = [];
  let featureCount = 0;

  const flush = () => {
    if (bucket.length > 0) {
      rows.push({
        type: "grid",
        key: `grid-${discoveryItemKey(bucket[0])}`,
        items: bucket,
      });
      bucket = [];
    }
  };

  items.forEach((item, index) => {
    if (index % 5 < 3) {
      bucket.push(item);
    } else {
      flush();
      rows.push({
        type: "feature",
        key: `feature-${discoveryItemKey(item)}`,
        item,
        side: featureCount % 2 === 0 ? "right" : "left",
      });
      featureCount += 1;
    }
  });
  flush();

  return rows;
}

function buildSeed(item: DiscoveryItem): string {
  if (item.kind === "claim" && item.claim) {
    const verdict = VERDICT_STYLE[item.claim.verdict].label;
    const lines = [
      `Klaim viral: ${item.claim.claim}`,
      `Verdict pemeriksa fakta: ${verdict}${item.claim.publisher ? ` (${item.claim.publisher})` : ""}`,
      "",
      "Telaah bukti ilmiah di balik klaim ini: apa yang dikatakan literatur, seberapa kuat buktinya, dan konteks apa yang penting.",
      item.claim.reviewUrl ? `Sumber pemeriksa: ${item.claim.reviewUrl}` : "",
    ];
    return lines.filter(Boolean).join("\n");
  }
  // Prefer the decoded publisher URL over the opaque Google News redirect so
  // the research agent gets a readable source (parity with buildNewsSeed).
  return `${item.title}\n\n${item.tldr ?? item.summary}\n\nSumber: ${item.resolvedUrl ?? item.url}`;
}

function CaughtUp() {
  return (
    <div className="mt-8 flex flex-col items-center gap-2 border-t border-border/60 py-10 text-center">
      <div className="flex size-9 items-center justify-center rounded-full bg-mint-soft text-mint-foreground">
        <CheckCircle2Icon className="size-5" />
      </div>
      <p className="text-[14px] font-semibold text-foreground">Kamu sudah update</p>
      <p className="max-w-[320px] text-[12.5px] text-muted-foreground">
        Itu semua untuk sekarang. Feed disegarkan berkala — kembali lagi nanti
        atau simpan beberapa item untuk diteliti.
      </p>
    </div>
  );
}

function FeedLoadingMore() {
  return (
    <div className="flex items-center justify-center py-8 text-[12.5px] font-medium text-muted-foreground">
      Memuat lebih banyak…
    </div>
  );
}

// Bottom-of-feed footer shared by the mosaic (mode) and list (search) renders.
// The caller owns the invisible IntersectionObserver sentinel (it lives next to
// the parent's observer); this only renders the load-state UI: a "loading more"
// spinner, a manual "Muat lebih banyak" button (shown at CanLoadMore), or — when
// exhausted — the deferred-external spinner (search) or a "caught up" note
// (mosaic, via `caughtUp`). The button is the escape hatch for a heavily
// post-filtered Topics view where auto-load can exhaust its budget without
// advancing; in practice it's only reached when stranded, since auto-load
// (600px margin) keeps the feed growing ahead of a scrolling user.
function FeedFooter({
  status,
  externalPending,
  caughtUp,
  onLoadMore,
}: {
  status: "LoadingFirstPage" | "LoadingMore" | "CanLoadMore" | "Exhausted";
  externalPending: boolean;
  caughtUp: boolean;
  onLoadMore: () => void;
}) {
  if (status === "Exhausted") {
    if (externalPending) return <FeedLoadingMore />;
    return caughtUp ? <CaughtUp /> : null;
  }
  if (status === "LoadingMore") return <FeedLoadingMore />;
  if (status === "CanLoadMore") {
    return (
      <div className="flex justify-center py-8">
        <button
          type="button"
          onClick={onLoadMore}
          className="inline-flex h-9 items-center rounded-[8px] border border-border/80 px-4 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted"
        >
          Muat lebih banyak
        </button>
      </div>
    );
  }
  return null;
}

// Search results header: "Hasil untuk '…'" with a clear affordance.
function SearchResultsHeader({
  query,
  onClear,
}: {
  query: string;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-3">
      <p className="text-[13px] font-medium text-muted-foreground">
        Hasil untuk{" "}
        <span className="font-semibold text-foreground">“{query}”</span>
      </p>
      <button
        type="button"
        onClick={onClear}
        className="inline-flex h-8 items-center rounded-[8px] border border-border/80 px-2.5 text-[12.5px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        Hapus pencarian
      </button>
    </div>
  );
}

function DiscoveryEmptyState({
  mode,
  query,
}: {
  mode: string;
  query: string;
}) {
  const message =
    mode === "search"
      ? `Tidak ada hasil untuk “${query}”. Coba kata kunci lain atau perlebar rentang waktu.`
      : mode === "topics"
        ? "Belum ada konten untuk topik ini. Coba topik lain atau kembali nanti."
        : "Konten untuk lajur ini akan muncul setelah penyegaran terjadwal berikutnya.";
  return (
    <div className="mt-2 max-w-[560px] rounded-[10px] border border-border bg-card px-5 py-8 text-center">
      <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-mint-soft text-mint-foreground">
        <SparklesIcon className="size-5" />
      </div>
      <h3 className="text-[15px] font-semibold text-foreground">
        {mode === "search" ? "Tidak ada hasil" : "Belum ada item"}
      </h3>
      <p className="mx-auto mt-1.5 max-w-[380px] text-[13px] font-medium leading-5 text-muted-foreground">
        {message}
      </p>
    </div>
  );
}
