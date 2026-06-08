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
import { useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ExploreChatShell } from "@/features/explore/pages/explore-chat-shell";
import { IdeaDialog, type IdeaSeed } from "@/features/discovery/components/idea-dialog";
import { WorkspacePickerDialog } from "@/features/workspaces/components/workspace-picker-dialog";
import { toWorkspaceId } from "@/lib/convex-refs";
import { readableConvexErrorMessage } from "@/lib/convex-error";
import {
  useConvexActionFn,
  useConvexActionQueryWithKey,
  useConvexMutationFn,
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
import { DiscoveryToolbar } from "../components/discovery-toolbar";
import { VERDICT_STYLE } from "../components/discovery-visuals";
import { useDiscoveryNav, rangeToFromYear } from "../hooks/use-discovery-nav";
import { useStartResearch } from "../hooks/use-start-research";
import {
  deriveKindBreakdown,
  deriveTopCited,
  deriveTopTopics,
  deriveVerdictBreakdown,
} from "../utils/discovery-format";

const emptyPapers: ExplorePaper[] = [];

export function DiscoveryPage() {
  const router = useRouter();

  const [nav, setNav] = useDiscoveryNav();

  // Feed (reactive) drives Brief (all kinds, incl. claims); Papers (action) below.
  const feedArgs = useMemo(() => {
    if (nav.view === "papers") return "skip" as const;
    const base: { serendipity?: boolean } = {};
    if (nav.serendipity) base.serendipity = true;
    return base;
  }, [nav.view, nav.serendipity]);

  const feedData = useConvexQueryData(api.feed.getFeed, feedArgs);
  const papersQuery = useConvexActionQueryWithKey(
    api.explore.searchPapers,
    ["discoveryPapers", nav.q, nav.range],
    nav.view === "papers"
      ? {
          query: nav.q || undefined,
          mode: nav.q ? "search" : "recommendations",
          limit: 12,
          fromYear: rangeToFromYear(nav.range),
        }
      : "skip",
  );
  const paperItemRefs = useMemo<DiscoveryItemRef[]>(
    () =>
      nav.view === "papers"
        ? (papersQuery.data?.items ?? emptyPapers).map((paper) => ({
            kind: "paper" as const,
            paperKey: paper.key,
          }))
        : [],
    [nav.view, papersQuery.data],
  );
  const savedRefsData = useConvexQueryData(
    api.feed.getSavedDiscoveryRefs,
    nav.view === "papers" ? { itemRefs: paperItemRefs } : "skip",
  );
  const hiddenRefsData = useConvexQueryData(
    api.feed.getHiddenDiscoveryRefs,
    nav.view === "papers" ? { itemRefs: paperItemRefs } : "skip",
  );

  // Mutations / actions.
  const saveDiscoveryItem = useConvexMutationFn(api.feed.saveDiscoveryItem);
  const unsaveDiscoveryItem = useConvexMutationFn(api.feed.unsaveDiscoveryItem);
  const hideDiscoveryItem = useConvexMutationFn(api.feed.hideDiscoveryItem);
  const recordDiscoveryInteraction = useConvexMutationFn(
    api.feed.recordDiscoveryInteraction,
  );
  const createUrl = useConvexMutationFn(api.artifacts.createUrl);
  const explainRelevance = useConvexActionFn(api.feedAi.explainRelevance);
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

  const savedRefs = useMemo(() => {
    const set = new Set<string>();
    for (const ref of (savedRefsData ?? []) as DiscoverySavedRef[]) {
      set.add(savedRefKey(ref));
    }
    return set;
  }, [savedRefsData]);
  const hiddenRefs = useMemo(() => {
    const set = new Set<string>();
    for (const ref of (hiddenRefsData ?? []) as DiscoverySavedRef[]) {
      set.add(savedRefKey(ref));
    }
    return set;
  }, [hiddenRefsData]);

  const rawItems = useMemo<DiscoveryItem[]>(() => {
    if (nav.view === "papers") {
      return (papersQuery.data?.items ?? emptyPapers).map((paper) =>
        paperToDiscoveryItem(paper, savedRefs),
      );
    }
    return ((feedData ?? []) as FeedItem[]).map(feedItemToDiscoveryItem);
  }, [nav.view, papersQuery.data, feedData, savedRefs]);

  const items = useMemo(
    () =>
      rawItems.filter((item) => {
        const key = discoveryItemKey(item);
        return !hiddenIds.has(key) && !hiddenRefs.has(key);
      }),
    [rawItems, hiddenIds, hiddenRefs],
  );
  const topTopics = useMemo(() => deriveTopTopics(rawItems, 8), [rawItems]);
  // Right-rail aggregates — derived from the items already loaded (zero backend).
  // Each derive returns an empty/zero result for views that lack the data, so the
  // matching rail module hides itself.
  const verdictBreakdown = useMemo(
    () => deriveVerdictBreakdown(rawItems),
    [rawItems],
  );
  const kindBreakdown = useMemo(() => deriveKindBreakdown(rawItems), [rawItems]);
  const topCited = useMemo(() => deriveTopCited(rawItems, 4), [rawItems]);

  const isLoading =
    nav.view === "papers" ? papersQuery.isLoading : feedData === undefined;
  const viewError =
    nav.view === "papers" && papersQuery.error
      ? readableConvexErrorMessage(papersQuery.error, "Gagal mencari paper.")
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
    try {
      const result = await explainRelevance({
        title: item.title,
        context: item.tldr ?? item.summary,
        topics: item.topics,
      });
      if (result.ok) {
        setRelevanceNotes((prev) => new Map(prev).set(id, result.reason));
      }
    } catch {
      // keep the trigger available to retry
    } finally {
      setWhyLoading((prev) => {
        const nextSet = new Set(prev);
        nextSet.delete(id);
        return nextSet;
      });
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
    onTeliti: (item) =>
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

  const renderStandard = (item: DiscoveryItem) => {
    const shared = {
      item,
      lang: nav.lang,
      saved: isSaved(item),
      busy: busyKey === discoveryItemKey(item),
      relevanceNote: relevanceNotes.get(discoveryItemKey(item)),
      whyLoading: whyLoading.has(discoveryItemKey(item)),
      handlers,
    };
    // Claim cards use a lean, verdict-forward layout in the Brief masonry.
    return item.kind === "claim" ? (
      <DiscoveryClaimCard {...shared} />
    ) : (
      <DiscoveryStandardCard {...shared} />
    );
  };

  const isBrief = nav.view === "brief";
  const hero = isBrief ? items[0] : undefined;
  const briefRows = useMemo(
    () => (isBrief ? buildBriefRows(items.slice(1)) : []),
    [isBrief, items],
  );

  return (
    <ExploreChatShell breadcrumbs={[{ label: "Jelajahi" }]}>
      <div className="mx-auto w-full max-w-[1760px] px-5 pb-12 pt-4 sm:px-8 md:pt-6 xl:px-10">
          <header className="max-w-[680px]">
            <h1 className="text-[30px] font-semibold leading-none tracking-normal text-foreground sm:text-[34px]">
              Jelajahi
            </h1>
            <p className="mt-4 max-w-[680px] text-[14px] font-medium leading-6 text-muted-foreground sm:text-[15px]">
              Bacaan riset hari ini — berita sains, klaim ditimbang bukti, dan
              paper. Temukan ide, lalu mulai meneliti dalam satu klik.
            </p>
          </header>

          <DiscoveryToolbar
            view={nav.view}
            onViewChange={(view) => void setNav({ view })}
            query={nav.q}
            onSubmitQuery={(q) => void setNav({ q })}
            range={nav.range}
            onRangeChange={(range) => void setNav({ range })}
            lang={nav.lang}
            onLangChange={(lang) => void setNav({ lang })}
            serendipity={nav.serendipity}
            onSerendipityChange={(value) => void setNav({ serendipity: value })}
            isSearching={papersQuery.isFetching}
          />

          {localError || researchError || viewError ? (
            <div className="mt-4 max-w-[760px] rounded-[7px] border border-destructive/20 bg-destructive/10 px-4 py-3 text-[13px] font-medium text-destructive">
              {localError ?? researchError ?? viewError}
            </div>
          ) : null}

          <section className="grid grid-cols-1 gap-8 pt-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:gap-10">
            <div className="min-w-0">
              {isLoading ? (
                <DiscoverySkeleton />
              ) : items.length === 0 ? (
                <DiscoveryEmptyState view={nav.view} />
              ) : isBrief ? (
                <div className="space-y-10">
                  {hero ? renderHeroCard(hero) : null}
                  {briefRows.map((row) =>
                    row.type === "grid" ? (
                      <div
                        key={row.key}
                        className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 xl:grid-cols-3"
                      >
                        {row.items.map((item) => (
                          <div key={discoveryItemKey(item)}>{renderStandard(item)}</div>
                        ))}
                      </div>
                    ) : (
                      <div key={row.key} className="border-t border-border/60 pt-10">
                        {renderFeatureCard(row.item, row.side)}
                      </div>
                    ),
                  )}
                  <CaughtUp />
                </div>
              ) : (
                <div>
                  <div className="divide-y divide-border/60">
                    {items.map((item, index) => (
                      <DiscoveryListItem
                        key={discoveryItemKey(item)}
                        item={item}
                        index={index}
                        lang={nav.lang}
                        saved={isSaved(item)}
                        busy={busyKey === discoveryItemKey(item)}
                        relevanceNote={relevanceNotes.get(discoveryItemKey(item))}
                        whyLoading={whyLoading.has(discoveryItemKey(item))}
                        handlers={handlers}
                      />
                    ))}
                  </div>
                  {nav.view !== "papers" ? <CaughtUp /> : null}
                </div>
              )}
            </div>

            <aside className="min-w-0 xl:sticky xl:top-6 xl:self-start">
              <DiscoveryAside
                verdicts={verdictBreakdown}
                kinds={kindBreakdown}
                topTopics={topTopics}
                topCited={topCited}
                onSelectTopic={(name) => void setNav({ view: "papers", q: name })}
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

  function renderHeroCard(item: DiscoveryItem) {
    return (
      <DiscoveryHeroCard
        item={item}
        lang={nav.lang}
        saved={isSaved(item)}
        busy={busyKey === discoveryItemKey(item)}
        relevanceNote={relevanceNotes.get(discoveryItemKey(item))}
        whyLoading={whyLoading.has(discoveryItemKey(item))}
        handlers={handlers}
      />
    );
  }

  function renderFeatureCard(item: DiscoveryItem, side: "left" | "right") {
    return (
      <DiscoveryFeatureCard
        item={item}
        imageSide={side}
        lang={nav.lang}
        saved={isSaved(item)}
        busy={busyKey === discoveryItemKey(item)}
        relevanceNote={relevanceNotes.get(discoveryItemKey(item))}
        whyLoading={whyLoading.has(discoveryItemKey(item))}
        handlers={handlers}
      />
    );
  }
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
  return `${item.title}\n\n${item.tldr ?? item.summary}\n\nSumber: ${item.url}`;
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

function DiscoveryEmptyState({ view }: { view: string }) {
  const message =
    view === "papers"
      ? "Tidak ada paper yang cocok. Coba istilah lain atau perlebar rentang waktu."
      : "Konten untuk lajur ini akan muncul setelah penyegaran terjadwal berikutnya.";
  return (
    <div className="mt-2 max-w-[560px] rounded-[10px] border border-border bg-card px-5 py-8 text-center">
      <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-mint-soft text-mint-foreground">
        <SparklesIcon className="size-5" />
      </div>
      <h3 className="text-[15px] font-semibold text-foreground">Belum ada item</h3>
      <p className="mx-auto mt-1.5 max-w-[380px] text-[13px] font-medium leading-5 text-muted-foreground">
        {message}
      </p>
    </div>
  );
}

function DiscoverySkeleton() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,40%)] lg:gap-7">
        <div className="order-2 flex flex-col justify-center gap-3 lg:order-1">
          <Skeleton className="h-3 w-28 rounded-full bg-muted/50" />
          <Skeleton className="h-8 w-[90%] rounded-[8px] bg-muted/60" />
          <Skeleton className="h-8 w-[70%] rounded-[8px] bg-muted/60" />
          <Skeleton className="mt-1 h-4 w-full rounded-full bg-muted/40" />
          <Skeleton className="h-4 w-[85%] rounded-full bg-muted/40" />
        </div>
        <Skeleton className="order-1 h-52 w-full rounded-[12px] bg-muted/60 sm:h-64 lg:order-2 lg:h-full" />
      </div>
      <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="flex flex-col gap-3">
            <Skeleton className="aspect-[16/10] w-full rounded-[12px] bg-muted/50" />
            <Skeleton className="h-5 w-[88%] rounded-[6px] bg-muted/50" />
            <Skeleton className="h-4 w-1/2 rounded-full bg-muted/40" />
          </div>
        ))}
      </div>
    </div>
  );
}
