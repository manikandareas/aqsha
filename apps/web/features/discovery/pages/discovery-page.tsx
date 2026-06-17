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
import { useState } from "react";
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
  DiscoveryToolbar,
  DiscoveryViewTabs,
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

export function DiscoveryPage() {
  const router = useRouter();

  const [nav, setNav] = useDiscoveryNav();

  // Feed (reactive) drives Brief (all kinds, incl. claims); Papers (action) below.
  const feedArgs = nav.view === "papers" ? ("skip" as const) : {};

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
  const paperItemRefs: DiscoveryItemRef[] =
    nav.view === "papers"
      ? (papersQuery.data?.items ?? emptyPapers).map((paper) => ({
          kind: "paper" as const,
          paperKey: paper.key,
        }))
      : [];
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

  const rawItems: DiscoveryItem[] = (() => {
    if (nav.view === "papers") {
      return (papersQuery.data?.items ?? emptyPapers).map((paper) =>
        paperToDiscoveryItem(paper, savedRefs),
      );
    }
    return ((feedData ?? []) as FeedItem[]).map(feedItemToDiscoveryItem);
  })();

  const items = rawItems.filter((item) => {
    const key = discoveryItemKey(item);
    return !hiddenIds.has(key) && !hiddenRefs.has(key);
  });
  const topTopics = deriveTopTopics(rawItems, 8);
  // Right-rail aggregates — derived from the items already loaded (zero backend).
  // Each derive returns an empty/zero result for views that lack the data, so the
  // matching rail module hides itself.
  const verdictBreakdown = deriveVerdictBreakdown(rawItems);
  const topCited = deriveTopCited(rawItems, 4);
  const topicMomentum = deriveTopicMomentum(rawItems, 4);

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

  const isBrief = nav.view === "brief";
  const hero = isBrief ? items[0] : undefined;
  const briefRows = isBrief ? buildBriefRows(items.slice(1)) : [];

  return (
    <ExploreChatShell
      breadcrumbs={[{ label: "Jelajahi" }]}
      headerCenter={
        <DiscoveryViewTabs
          view={nav.view}
          onViewChange={(view) => void setNav({ view })}
        />
      }
    >
      <div className="mx-auto w-full max-w-[1200px] px-5 pb-12 pt-4 sm:px-8 xl:px-10">
          {nav.view === "papers" ? (
            <DiscoveryToolbar
              query={nav.q}
              onSubmitQuery={(q) => void setNav({ q })}
              range={nav.range}
              onRangeChange={(range) => void setNav({ range })}
              isSearching={papersQuery.isFetching}
            />
          ) : null}

          {localError || researchError || viewError ? (
            <div className="mt-4 max-w-[760px] rounded-[7px] border border-destructive/20 bg-destructive/10 px-4 py-3 text-[13px] font-medium text-destructive">
              {localError ?? researchError ?? viewError}
            </div>
          ) : null}

          <section className="grid grid-cols-1 gap-8 pt-6 @4xl/explore:grid-cols-[minmax(0,1fr)_340px] @4xl/explore:gap-10">
            <div className="@container/feed min-w-0">
              {isLoading ? (
                <AppLoadingOverlay variant="absolute" />
              ) : items.length === 0 ? (
                <DiscoveryEmptyState view={nav.view} />
              ) : isBrief ? (
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
                        lang={DISCOVERY_LANG}
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

            <aside className="min-w-0 @4xl/explore:sticky @4xl/explore:top-6 @4xl/explore:self-start">
              <DiscoveryAside
                view={nav.view}
                verdicts={verdictBreakdown}
                momentum={topicMomentum}
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
