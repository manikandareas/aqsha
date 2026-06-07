"use client";

import { api } from "@aqsha/convex/api";
import type { ExplorePaper } from "@aqsha/convex/explore";
import type { FeedItem, FeedItemKind } from "@aqsha/convex/feed";
import { CheckCircle2Icon, SparklesIcon } from "@aqsha/ui/icons";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ExploreSurfaceHeader } from "@/features/explore/components/explore-surface-header";
import { EvidenceDrawer } from "@/features/feed/components/evidence-drawer";
import { IdeaDialog, type IdeaSeed } from "@/features/feed/components/idea-dialog";
import { WorkspacePickerDialog } from "@/features/workspaces/components/workspace-picker-dialog";
import { WorkspaceShell } from "@/features/workspaces/components/workspace-shell";
import { useWorkspaceIndexData } from "@/features/workspaces/api/use-workspaces-data";
import { toWorkspaceId } from "@/lib/convex-refs";
import { readableConvexErrorMessage } from "@/lib/convex-error";
import {
  useConvexActionFn,
  useConvexActionQueryWithKey,
  useConvexMutationFn,
  useConvexQueryData,
} from "@/lib/convex-query";
import {
  DiscoveryHeroCard,
  DiscoveryStandardCard,
  type DiscoveryCardHandlers,
  type DiscoveryFeedItem,
} from "../components/discovery-item-card";
import { DiscoveryAside } from "../components/discovery-aside";
import { DiscoveryToolbar } from "../components/discovery-toolbar";
import { VERDICT_STYLE } from "../components/discovery-visuals";
import { useDiscoveryNav, rangeToFromYear } from "../hooks/use-discovery-nav";
import { deriveTopTopics } from "../utils/discovery-format";

const emptyPapers: ExplorePaper[] = [];

export function DiscoveryPage() {
  const { viewer, workspaces, threads, createWorkspace, removeThread } =
    useWorkspaceIndexData();
  const router = useRouter();

  const [nav, setNav] = useDiscoveryNav();

  // Feed (reactive) drives Brief + Cek fakta; Papers (action) is handled below.
  const feedArgs = useMemo(() => {
    if (nav.view === "papers") return "skip" as const;
    const base: { kinds?: FeedItemKind[]; serendipity?: boolean } = {};
    if (nav.view === "cek-fakta") base.kinds = ["claim"];
    if (nav.view === "brief" && nav.serendipity) base.serendipity = true;
    return base;
  }, [nav.view, nav.serendipity]);

  const feedData = useConvexQueryData(api.feed.getFeed, feedArgs);
  const savedData = useConvexQueryData(api.feed.getSavedItems, {});

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

  // Mutations / actions.
  const startThread = useConvexMutationFn(api.agent.messages.startThread);
  const saveDiscoveryItem = useConvexMutationFn(api.feed.saveDiscoveryItem);
  const unsaveDiscoveryItem = useConvexMutationFn(api.feed.unsaveDiscoveryItem);
  const hideDiscoveryItem = useConvexMutationFn(api.feed.hideDiscoveryItem);
  const recordDiscoveryInteraction = useConvexMutationFn(
    api.feed.recordDiscoveryInteraction,
  );
  const createUrl = useConvexMutationFn(api.artifacts.createUrl);
  const explainRelevance = useConvexActionFn(api.feedAi.explainRelevance);

  // Local UI state (keyed by the stable surrogate id `sid`).
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedOverride, setSavedOverride] = useState<Map<string, boolean>>(new Map());
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [relevanceNotes, setRelevanceNotes] = useState<Map<string, string>>(new Map());
  const [whyLoading, setWhyLoading] = useState<Set<string>>(new Set());
  const [evidenceItem, setEvidenceItem] = useState<DiscoveryFeedItem | null>(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [ideaSeed, setIdeaSeed] = useState<IdeaSeed | null>(null);
  const [ideaOpen, setIdeaOpen] = useState(false);
  const [workspaceItem, setWorkspaceItem] = useState<DiscoveryFeedItem | null>(null);

  const rawItems = useMemo<DiscoveryFeedItem[]>(() => {
    if (nav.view === "papers") {
      return (papersQuery.data?.items ?? emptyPapers).map(paperToDiscoveryItem);
    }
    return ((feedData ?? []) as FeedItem[]).map(feedItemToDiscoveryItem);
  }, [nav.view, papersQuery.data, feedData]);

  const items = useMemo(
    () => rawItems.filter((item) => !hiddenIds.has(sid(item))),
    [rawItems, hiddenIds],
  );
  const topTopics = useMemo(() => deriveTopTopics(rawItems, 8), [rawItems]);
  const savedRows = useMemo(
    () => (savedData ?? []) as Array<{ _id: string; title: string; paperKey?: string }>,
    [savedData],
  );
  const baseSaved = useMemo(() => {
    const set = new Set<string>();
    for (const row of savedRows) {
      set.add(row._id);
      if (row.paperKey) set.add(`paper:${row.paperKey}`);
    }
    return set;
  }, [savedRows]);
  const latestClaim = useMemo(
    () => rawItems.find((item) => item.kind === "claim" && item.claim),
    [rawItems],
  );

  const isLoading =
    nav.view === "papers" ? papersQuery.isLoading : feedData === undefined;
  const viewError =
    nav.view === "papers" && papersQuery.error
      ? readableConvexErrorMessage(papersQuery.error, "Gagal mencari paper.")
      : null;

  const isSaved = (item: DiscoveryFeedItem) => {
    const id = sid(item);
    return savedOverride.has(id)
      ? Boolean(savedOverride.get(id))
      : baseSaved.has(id);
  };

  const recordItemInteraction = (
    item: DiscoveryFeedItem,
    kind: "save" | "hide" | "research" | "open_evidence",
  ) => {
    return recordDiscoveryInteraction({ itemRef: item.itemRef, kind });
  };

  const startResearch = async (content: string, item?: DiscoveryFeedItem) => {
    if (busyId) return;
    setBusyId(item ? sid(item) : "idea");
    setError(null);
    try {
      const result = await startThread({
        content,
        agentKind: "pro",
        commandId: "deep-research",
      });
      if (item) {
        void recordItemInteraction(item, "research").catch(() => {});
      }
      if (result?.ok && "threadId" in result && result.threadId) {
        router.push(`/app/threads/${result.threadId}`);
        return;
      }
      const rateLimited =
        !!result &&
        !result.ok &&
        "reason" in result &&
        result.reason === "rate_limited";
      setError(
        rateLimited
          ? "Batas pengiriman tercapai. Coba lagi sebentar lagi."
          : "Riset tidak bisa dimulai sekarang. Coba lagi nanti.",
      );
      setBusyId(null);
    } catch (caught) {
      setError(readableConvexErrorMessage(caught, "Gagal memulai riset."));
      setBusyId(null);
    }
  };

  const handleSave = async (item: DiscoveryFeedItem) => {
    const id = sid(item);
    const next = !isSaved(item);
    setSavedOverride((prev) => new Map(prev).set(id, next));
    try {
      if (next) await saveDiscoveryItem({ itemRef: item.itemRef });
      else await unsaveDiscoveryItem({ itemRef: item.itemRef });
    } catch (caught) {
      setSavedOverride((prev) => new Map(prev).set(id, !next));
      setError(readableConvexErrorMessage(caught, "Gagal menyimpan. Coba lagi."));
    }
  };

  const handleWhyRelevant = async (item: DiscoveryFeedItem) => {
    const id = sid(item);
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
    onTeliti: (item) => void startResearch(buildSeed(item), item),
    onSave: (item) => void handleSave(item),
    onSaveToWorkspace: (item) => setWorkspaceItem(item),
    onHide: (item) => {
      setHiddenIds((prev) => new Set(prev).add(sid(item)));
      void hideDiscoveryItem({ itemRef: item.itemRef }).catch(() => {});
    },
    onOpenEvidence: (item) => {
      setEvidenceItem(item);
      setEvidenceOpen(true);
      void recordItemInteraction(item, "open_evidence").catch(() => {});
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

  const renderStandard = (item: DiscoveryFeedItem) => (
    <DiscoveryStandardCard
      item={item}
      lang={nav.lang}
      saved={isSaved(item)}
      busy={busyId === sid(item)}
      relevanceNote={relevanceNotes.get(sid(item))}
      whyLoading={whyLoading.has(sid(item))}
      handlers={handlers}
    />
  );

  const isBrief = nav.view === "brief";
  const hero = isBrief ? items[0] : undefined;
  const masonryItems = isBrief ? items.slice(1) : items;

  return (
    <WorkspaceShell
      viewer={viewer}
      workspaces={workspaces}
      threads={threads}
      createWorkspace={createWorkspace}
      removeThread={removeThread}
    >
      <main className="min-h-svh bg-background text-foreground">
        <ExploreSurfaceHeader breadcrumbs={[{ label: "Jelajahi" }]} />
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

          {error || viewError ? (
            <div className="mt-4 max-w-[760px] rounded-[7px] border border-destructive/20 bg-destructive/10 px-4 py-3 text-[13px] font-medium text-destructive">
              {error ?? viewError}
            </div>
          ) : null}

          <section className="grid grid-cols-1 gap-8 pt-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:gap-10">
            <div className="min-w-0">
              {isLoading ? (
                <DiscoverySkeleton />
              ) : items.length === 0 ? (
                <DiscoveryEmptyState view={nav.view} />
              ) : (
                <div className="space-y-4">
                  {hero ? renderHeroCard(hero) : null}
                  {masonryItems.length > 0 ? (
                    <div className="columns-1 gap-4 sm:columns-2 xl:columns-3 [&>*]:mb-4 [&>*]:break-inside-avoid">
                      {masonryItems.map((item) => (
                        <div key={sid(item)}>{renderStandard(item)}</div>
                      ))}
                    </div>
                  ) : null}
                  {nav.view !== "papers" ? <CaughtUp /> : null}
                </div>
              )}
            </div>

            <aside className="min-w-0 xl:sticky xl:top-6 xl:self-start">
              <DiscoveryAside
                topTopics={topTopics}
                saved={savedRows}
                latestClaim={latestClaim}
                lang={nav.lang}
                onStartTopic={(topic) => {
                  setIdeaSeed({ title: topic });
                  setIdeaOpen(true);
                }}
                onOpenClaim={(item) => {
                  setEvidenceItem(item);
                  setEvidenceOpen(true);
                }}
              />
            </aside>
          </section>
        </div>
      </main>

      <EvidenceDrawer
        item={toFeedItem(evidenceItem)}
        open={evidenceOpen}
        onOpenChange={setEvidenceOpen}
        onTeliti={() => {
          if (!evidenceItem) return;
          setEvidenceOpen(false);
          void startResearch(buildSeed(evidenceItem), evidenceItem);
        }}
        busyTeliti={evidenceItem ? busyId === sid(evidenceItem) : false}
      />

      <IdeaDialog
        seed={ideaSeed}
        open={ideaOpen}
        onOpenChange={setIdeaOpen}
        onStartResearch={(questionText) => {
          setIdeaOpen(false);
          void startResearch(questionText);
        }}
        busy={busyId === "idea"}
      />

      <WorkspacePickerDialog
        open={Boolean(workspaceItem)}
        onOpenChange={(open) => !open && setWorkspaceItem(null)}
        title="Simpan ke workspace"
        description="Pilih workspace tujuan. Paper akan otomatis diunduh dan metadatanya diekstrak."
        onSelect={handleSaveToWorkspace}
      />
    </WorkspaceShell>
  );

  function renderHeroCard(item: DiscoveryFeedItem) {
    return (
      <DiscoveryHeroCard
        item={item}
        lang={nav.lang}
        saved={isSaved(item)}
        busy={busyId === sid(item)}
        relevanceNote={relevanceNotes.get(sid(item))}
        whyLoading={whyLoading.has(sid(item))}
        handlers={handlers}
      />
    );
  }
}

function sid(item: DiscoveryFeedItem): string {
  return item.itemRef.kind === "paper"
    ? `paper:${item.itemRef.paperKey}`
    : item.itemRef.feedItemId;
}

function feedItemToDiscoveryItem(item: FeedItem): DiscoveryFeedItem {
  return {
    ...item,
    itemRef: { kind: "feed", feedItemId: item._id },
  };
}

function paperToDiscoveryItem(paper: ExplorePaper): DiscoveryFeedItem {
  return {
    itemRef: { kind: "paper", paperKey: paper.key },
    kind: "paper",
    title: paper.title,
    summary: paper.snippet,
    tldr: paper.snippet,
    url: paper.url,
    provider: "openalex",
    sourceLabel: paper.sourceLabel,
    paperKey: paper.key,
    doi: paper.doi,
    authors: paper.authors,
    year: paper.year,
    venue: paper.venue,
    pdfUrl: paper.pdfUrl,
    citedByCount: paper.citedByCount,
    isOpenAccess: paper.isOpenAccess,
    topics: paper.topics,
    trendScore: paper.citedByCount ?? paper.score ?? 0,
    publishedAt: paper.publicationDate
      ? parseDateMs(paper.publicationDate)
      : paper.year
        ? Date.UTC(paper.year, 0, 1)
        : undefined,
  };
}

function toFeedItem(item: DiscoveryFeedItem | null): FeedItem | null {
  if (!item) return null;
  if (!item._id) return null;
  return {
    ...item,
    _id: item._id,
  };
}

function parseDateMs(value: string): number | undefined {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : undefined;
}

function buildSeed(item: DiscoveryFeedItem): string {
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
    <div className="space-y-4">
      <Skeleton className="h-56 w-full rounded-[14px] bg-muted/60" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-64 w-full rounded-[14px] bg-muted/50" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <Skeleton key={index} className="h-56 w-full rounded-[14px] bg-muted/40" />
        ))}
      </div>
    </div>
  );
}
