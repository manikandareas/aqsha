"use client";

import { api } from "@aqsha/convex/api";
import type { ExplorePaper, ExploreSearchResponse } from "@aqsha/convex/explore";
import {
  BookmarkIcon,
  CheckIcon,
  ExternalLinkIcon,
  FileDownIcon,
  LayoutGridIcon,
  Loader2Icon,
  SearchIcon,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useReducer, useRef } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ExploreSurfaceHeader } from "@/features/explore/components/explore-surface-header";
import { WorkspacePickerDialog } from "@/features/workspaces/components/workspace-picker-dialog";
import { WorkspaceShell } from "@/features/workspaces/components/workspace-shell";
import { useWorkspaceIndexData } from "@/features/workspaces/api/use-workspaces-data";
import { toWorkspaceId } from "@/lib/convex-refs";
import { readableConvexErrorMessage } from "@/lib/convex-error";
import {
  useConvexActionState,
  useConvexMutationState,
} from "@/lib/convex-query";
import { cn } from "@/lib/utils";
import { encodePaperRef } from "../utils/paper-ref";

type ExploreTab = "recommended" | "browse";

type ExplorePageState = {
  query: string;
  submittedQuery: string;
  response: ExploreSearchResponse | null;
  isLoading: boolean;
  error: string | null;
  selectedPaper: ExplorePaper | null;
  savedKeys: Set<string>;
  activeTab: ExploreTab;
  searchOpen: boolean;
};

type ExplorePageAction =
  | { type: "queryChanged"; query: string }
  | { type: "searchOpenChanged"; searchOpen: boolean }
  | { type: "activeTabChanged"; activeTab: ExploreTab }
  | { type: "selectedPaperChanged"; paper: ExplorePaper | null }
  | { type: "paperSaved"; key: string }
  | { type: "started" }
  | { type: "succeeded"; response: ExploreSearchResponse; submittedQuery: string }
  | { type: "failed"; error: string };

const suggestedQueries = [
  "AI tutoring formative assessment",
  "retrieval augmented generation education",
  "student motivation learning analytics",
];

const thumbnailLayouts = [
  "grid",
  "split",
  "figure",
  "columns",
  "dense",
] as const;

const emptyExplorePapers: ExplorePaper[] = [];

const paperDateFormatter = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const initialExplorePageState: ExplorePageState = {
  query: "",
  submittedQuery: "",
  response: null,
  isLoading: true,
  error: null,
  selectedPaper: null,
  savedKeys: new Set(),
  activeTab: "recommended",
  searchOpen: false,
};

export function ExplorePage() {
  const {
    viewer,
    workspaces,
    threads,
    createWorkspace,
    removeThread,
  } = useWorkspaceIndexData();
  const searchPapers = useConvexActionState(api.explore.searchPapers);
  const createUrl = useConvexMutationState(api.artifacts.createUrl);
  const initialRecommendationsStarted = useRef(false);
  const [state, dispatch] = useReducer(explorePageReducer, initialExplorePageState);
  const {
    query,
    submittedQuery,
    response,
    isLoading,
    error,
    selectedPaper,
    savedKeys,
    activeTab,
    searchOpen,
  } = state;

  const runSearch = async (nextQuery: string) => {
    dispatch({ type: "started" });
    try {
      const result: ExploreSearchResponse = await searchPapers.mutateAsync({
        query: nextQuery || undefined,
        mode: nextQuery ? "search" : "recommendations",
        limit: 12,
      });
      dispatch({ type: "succeeded", response: result, submittedQuery: nextQuery });
    } catch (searchError) {
      dispatch({
        type: "failed",
        error: readableConvexErrorMessage(searchError, "Gagal mencari paper."),
      });
    }
  };

  useEffect(() => {
    if (initialRecommendationsStarted.current) {
      return;
    }
    initialRecommendationsStarted.current = true;
    const task = window.setTimeout(() => {
      void (async () => {
        dispatch({ type: "started" });
        try {
          const result: ExploreSearchResponse = await searchPapers.mutateAsync({
            query: undefined,
            mode: "recommendations",
            limit: 12,
          });
          dispatch({ type: "succeeded", response: result, submittedQuery: "" });
        } catch (searchError) {
          dispatch({
            type: "failed",
            error: readableConvexErrorMessage(searchError, "Gagal mencari paper."),
          });
        }
      })();
    }, 0);
    return () => window.clearTimeout(task);
  }, [searchPapers]);

  const papers = response?.items ?? emptyExplorePapers;
  const topTopics = deriveTopTopics(papers);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runSearch(query.trim());
  };

  const handleSave = async (workspaceId: string) => {
    if (!selectedPaper) return;
    await createUrl.mutateAsync({
      workspaceId: toWorkspaceId(workspaceId),
      url: selectedPaper.url,
      title: selectedPaper.title,
    });
    dispatch({ type: "paperSaved", key: selectedPaper.key });
  };

  return (
    <WorkspaceShell
      viewer={viewer}
      workspaces={workspaces}
      threads={threads}
      createWorkspace={createWorkspace}
      removeThread={removeThread}
    >
      <main className="min-h-svh bg-background text-foreground">
        <ExploreSurfaceHeader breadcrumbs={[{ label: "Explore" }]} />
        <div className="mx-auto w-full max-w-[1080px] px-5 pb-12 pt-4 sm:px-10 md:pt-6 xl:px-14">
          <header className="max-w-[680px]">
            <h1 className="text-[30px] font-semibold leading-none tracking-normal text-foreground sm:text-[34px]">
              Papers
            </h1>
            <p className="mt-4 max-w-[680px] text-[14px] font-medium leading-6 text-muted-foreground sm:text-[15px]">
              Recommended research and searchable papers from Aqsha&apos;s academic providers.
            </p>
          </header>

          <section className="mt-8">
            <div className="inline-flex rounded-[8px] border border-border/80 bg-card/30 p-1">
              <ExploreTabButton
                active={activeTab === "recommended"}
                onClick={() => dispatch({ type: "activeTabChanged", activeTab: "recommended" })}
              >
                Recommended
              </ExploreTabButton>
              <ExploreTabButton
                active={activeTab === "browse"}
                onClick={() => dispatch({ type: "activeTabChanged", activeTab: "browse" })}
              >
                Compact
              </ExploreTabButton>
            </div>
          </section>

          <section className="mt-6 border-b border-border/80">
            <div className="flex min-h-11 items-center gap-3">
              <form
                onSubmit={handleSubmit}
                className={cn(
                  "ml-auto flex h-9 items-center justify-end rounded-[8px] transition-all",
                  searchOpen
                    ? "w-[220px] border border-border/80 bg-card/50 px-2 sm:w-[300px]"
                    : "w-9",
                )}
              >
                {searchOpen ? (
                  <label htmlFor="explore-search" className="sr-only">
                    Search papers
                  </label>
                ) : null}
                <input
                  id="explore-search"
                  value={query}
                  onChange={(event) => dispatch({ type: "queryChanged", query: event.target.value })}
                  placeholder="Search papers..."
                  className={cn(
                    "h-8 min-w-0 flex-1 bg-transparent text-[13px] font-medium text-foreground outline-none placeholder:text-muted-foreground",
                    !searchOpen && "sr-only",
                  )}
                />
                <button
                  type={searchOpen ? "submit" : "button"}
                  onClick={() => {
                    if (!searchOpen) {
                      dispatch({ type: "searchOpenChanged", searchOpen: true });
                    }
                  }}
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-[8px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label={searchOpen ? "Search papers" : "Open search"}
                >
                  {isLoading && searchOpen ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    <SearchIcon className="size-5" strokeWidth={2} />
                  )}
                </button>
              </form>
            </div>
          </section>

          {error ? (
            <div className="mt-5 max-w-[760px] rounded-[7px] border border-destructive/20 bg-destructive/10 px-4 py-3 text-[13px] font-medium text-destructive">
              {error}
            </div>
          ) : null}

          {isLoading ? (
            <ExploreSkeletonList activeTab={activeTab} />
          ) : papers.length ? (
            activeTab === "recommended" ? (
              <section className="grid gap-10 pt-7 lg:grid-cols-[minmax(0,1fr)_260px] lg:gap-10">
                <div className="min-w-0 divide-y divide-border/60">
                  {papers.map((paper, index) => (
                    <PaperListItem
                      key={paper.key}
                      index={index}
                      paper={paper}
                      saved={savedKeys.has(paper.key)}
                      variant="recommended"
                      onSave={() => dispatch({ type: "selectedPaperChanged", paper })}
                    />
                  ))}
                </div>
                <TopTopics topics={topTopics} />
              </section>
            ) : (
              <section className="pt-7">
                <div className="divide-y divide-border/60">
                  {papers.map((paper, index) => (
                    <PaperListItem
                      key={paper.key}
                      index={index}
                      paper={paper}
                      saved={savedKeys.has(paper.key)}
                      variant="browse"
                      onSave={() => dispatch({ type: "selectedPaperChanged", paper })}
                    />
                  ))}
                </div>
              </section>
            )
          ) : (
            <ExploreEmptyState query={submittedQuery} onPick={(suggestion) => {
              dispatch({ type: "queryChanged", query: suggestion });
              dispatch({ type: "searchOpenChanged", searchOpen: true });
              void runSearch(suggestion);
            }} />
          )}
        </div>
      </main>
      <WorkspacePickerDialog
        open={Boolean(selectedPaper)}
        onOpenChange={(open) => !open && dispatch({ type: "selectedPaperChanged", paper: null })}
        title="Simpan paper"
        description="Pilih workspace tujuan untuk menyimpan paper sebagai URL artifact."
        onSelect={handleSave}
      />
    </WorkspaceShell>
  );
}

function ExploreTabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-[6px] px-3 py-1.5 text-[13px] font-semibold leading-none text-muted-foreground transition-colors hover:text-foreground sm:text-[14px]",
        active && "bg-muted text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
      )}
    >
      {children}
    </button>
  );
}

function PaperListItem({
  paper,
  saved,
  index,
  variant,
  onSave,
}: {
  paper: ExplorePaper;
  saved: boolean;
  index: number;
  variant: "recommended" | "browse";
  onSave: () => void;
}) {
  const authors = paper.authors.length > 0 ? paper.authors.join(", ") : paper.sourceLabel;
  const date = formatPaperDate(paper);
  const topic = paper.topics[0] ?? paper.venue ?? paper.provider;
  const layout = thumbnailLayouts[index % thumbnailLayouts.length];
  const detailHref = `/app/explore/${encodePaperRef(paper.key)}`;
  const citationLabel = formatCitationCount(paper.citedByCount);

  return (
    <article
      className={cn(
        "group grid grid-cols-[72px_minmax(0,1fr)] gap-4 py-4 sm:grid-cols-[76px_minmax(0,1fr)_110px] sm:gap-5",
        variant === "browse" && "sm:grid-cols-[76px_minmax(0,1fr)_72px]",
      )}
    >
      <Link
        href={detailHref}
        className="mt-0.5 block"
        aria-label={`View ${paper.title}`}
      >
        <PaperThumbnail layout={layout} />
      </Link>

      <div className="min-w-0">
        <div className="flex min-w-0 items-start gap-2">
          <h2
            className={cn(
              "min-w-0 text-[15px] font-semibold leading-[1.2] text-foreground transition-colors group-hover:text-foreground sm:text-[16px]",
              variant === "browse" && "sm:text-[16px]",
            )}
          >
            <Link
              href={detailHref}
              className="underline-offset-3 focus:outline-none hover:underline focus-visible:underline"
            >
              {paper.title}
            </Link>
          </h2>
        </div>

        <p className="mt-1.5 line-clamp-1 text-[12px] font-medium leading-none text-muted-foreground">
          {authors}
          {date ? <span> · {date}</span> : null}
        </p>

        <p
          className={cn(
            "mt-2.5 max-w-[860px] text-[13px] font-medium leading-5 text-ink-soft",
            "line-clamp-2",
          )}
        >
          {paper.snippet}
        </p>

        {variant === "recommended" ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex h-5 items-center rounded-[4px] px-2 text-[11px] font-semibold leading-none",
                topicBadgeClass(topic),
              )}
            >
              {topic}
            </span>
            {paper.pdfUrl ? (
              <a
                href={paper.pdfUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-5 items-center gap-1 rounded-[4px] px-2 text-[11px] font-semibold text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
              >
                <FileDownIcon className="size-3.5" />
                PDF
              </a>
            ) : null}
          </div>
        ) : null}
      </div>

      <div
        className={cn(
          "col-start-2 flex items-center justify-between gap-2 text-ink-soft sm:col-start-auto sm:items-end sm:justify-end",
          variant === "recommended" ? "sm:flex-col" : "sm:self-center",
        )}
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={saved}
            className={cn(
              "inline-flex size-7 items-center justify-center rounded-[7px] text-muted-foreground opacity-100 transition-colors hover:bg-muted hover:text-foreground disabled:cursor-default sm:opacity-0 sm:group-hover:opacity-100",
              saved && "text-lemon opacity-100",
            )}
            aria-label={saved ? "Paper tersimpan" : "Simpan paper"}
          >
            {saved ? <CheckIcon className="size-4" /> : <BookmarkIcon className="size-4" />}
          </button>
          <a
            href={paper.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex size-7 items-center justify-center rounded-[7px] text-muted-foreground opacity-100 transition-colors hover:bg-muted hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100"
            aria-label="Open source"
          >
            <ExternalLinkIcon className="size-4" />
          </a>
        </div>

        <p className="whitespace-nowrap text-[12px] font-semibold text-muted-foreground">
          {citationLabel ?? paper.sourceLabel}
        </p>
      </div>
    </article>
  );
}

function PaperThumbnail({ layout }: { layout: (typeof thumbnailLayouts)[number] }) {
  return (
    <div className="h-[98px] w-[72px] overflow-hidden rounded-[6px] border border-border bg-primary shadow-sm sm:h-[104px] sm:w-[76px]">
      <div className="h-full w-full p-[5px]">
        <div className="mb-1 h-2 rounded-[1px] bg-coral" />
        <div className="space-y-[2px]">
          <div className="mx-auto h-[3px] w-9 rounded-full bg-primary-foreground" />
          <div className="mx-auto h-[2px] w-12 rounded-full bg-primary-foreground/45" />
          <div className="mx-auto h-[2px] w-10 rounded-full bg-primary-foreground/30" />
        </div>
        <div className="mt-2 grid grid-cols-[1fr_1fr] gap-[3px]">
          <PaperLines count={layout === "dense" ? 9 : 7} />
          {layout === "figure" || layout === "split" ? (
            <div className="space-y-[3px]">
              <div className="h-7 rounded-[2px] bg-sky-soft" />
              <div className="grid grid-cols-3 gap-[2px]">
                <span className="h-3 rounded-[1px] bg-mint-soft" />
                <span className="h-3 rounded-[1px] bg-lemon-soft" />
                <span className="h-3 rounded-[1px] bg-sky-soft" />
              </div>
              <PaperLines count={3} />
            </div>
          ) : (
            <PaperLines count={layout === "columns" ? 9 : 7} />
          )}
        </div>
        {layout === "grid" ? (
          <div className="mt-2 grid grid-cols-3 gap-[2px]">
            <span className="h-5 rounded-[1px] bg-sky-soft" />
            <span className="h-5 rounded-[1px] bg-coral-soft" />
            <span className="h-5 rounded-[1px] bg-mint-soft" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PaperLines({ count }: { count: number }) {
  return (
    <div className="space-y-[2px]">
      {Array.from({ length: count }).map((_, index) => (
        <span
          key={index}
          className={cn(
            "block h-[2px] rounded-full bg-primary-foreground/35",
            index % 4 === 0 && "w-[84%]",
            index % 4 === 1 && "w-full",
            index % 4 === 2 && "w-[68%]",
            index % 4 === 3 && "w-[92%]",
          )}
        />
      ))}
    </div>
  );
}

function TopTopics({ topics }: { topics: Array<{ name: string; count: number }> }) {
  if (topics.length === 0) {
    return null;
  }

  return (
    <aside className="hidden pt-1 lg:block">
      <h2 className="mb-4 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground/70">
        Top topics
      </h2>
      <ol className="space-y-4">
        {topics.map((topic) => (
          <li key={topic.name} className="flex items-center justify-between gap-5 text-[13px] font-medium">
            <span className="truncate text-muted-foreground">{topic.name}</span>
            <span className="font-mono text-[11px] text-muted-foreground/80">{topic.count}</span>
          </li>
        ))}
      </ol>
    </aside>
  );
}

function ExploreSkeletonList({ activeTab }: { activeTab: ExploreTab }) {
  return (
    <section
      className={cn(
        "grid gap-10 pt-7",
        activeTab === "recommended" && "lg:grid-cols-[minmax(0,1fr)_260px] lg:gap-10",
      )}
    >
      <div className="divide-y divide-border/60">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="grid grid-cols-[72px_minmax(0,1fr)] gap-4 py-4 sm:grid-cols-[76px_minmax(0,1fr)_110px] sm:gap-5"
          >
            <Skeleton className="h-[98px] w-[72px] rounded-[6px] bg-muted/70 sm:h-[104px] sm:w-[76px]" />
            <div className="space-y-2.5">
              <Skeleton className="h-4 w-[82%] rounded-[4px] bg-muted/70" />
              <Skeleton className="h-3.5 w-[48%] rounded-[4px] bg-muted/50" />
              <Skeleton className="h-3.5 w-full rounded-[4px] bg-muted/50" />
              <Skeleton className="h-3.5 w-[72%] rounded-[4px] bg-muted/50" />
              <Skeleton className="h-5 w-32 rounded-[4px] bg-lemon-soft" />
            </div>
            <div className="hidden items-end justify-end sm:flex">
              <Skeleton className="h-5 w-20 rounded-[4px] bg-muted/50" />
            </div>
          </div>
        ))}
      </div>
      {activeTab === "recommended" ? (
        <div className="hidden space-y-5 lg:block">
          <Skeleton className="h-4 w-28 rounded-[4px] bg-muted/50" />
          {Array.from({ length: 10 }).map((_, index) => (
            <div key={index} className="flex justify-between">
              <Skeleton className="h-4 w-40 rounded-[4px] bg-muted/50" />
              <Skeleton className="h-4 w-8 rounded-[4px] bg-muted/50" />
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ExploreEmptyState({
  query,
  onPick,
}: {
  query: string;
  onPick: (suggestion: string) => void;
}) {
  return (
    <section className="grid min-h-[34svh] place-items-center pt-14 text-center">
      <div className="max-w-lg">
        <LayoutGridIcon className="mx-auto size-7 text-muted-foreground" />
        <h2 className="mt-5 text-xl font-semibold text-foreground">
          {query ? "Tidak ada paper yang cocok." : "Belum ada rekomendasi."}
        </h2>
        <p className="mt-2 text-[14px] font-medium text-ink-soft">
          Coba istilah akademik yang lebih spesifik.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {suggestedQueries.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onPick(suggestion)}
              className="rounded-[7px] border border-border/80 bg-card/40 px-3 py-2 text-[12px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function explorePageReducer(
  state: ExplorePageState,
  action: ExplorePageAction,
): ExplorePageState {
  switch (action.type) {
    case "queryChanged":
      return { ...state, query: action.query };
    case "searchOpenChanged":
      return { ...state, searchOpen: action.searchOpen };
    case "activeTabChanged":
      return { ...state, activeTab: action.activeTab };
    case "selectedPaperChanged":
      return { ...state, selectedPaper: action.paper };
    case "paperSaved":
      return { ...state, savedKeys: new Set(state.savedKeys).add(action.key) };
    case "started":
      return { ...state, isLoading: true, error: null };
    case "succeeded":
      return {
        ...state,
        response: action.response,
        submittedQuery: action.submittedQuery,
        isLoading: false,
        error: null,
      };
    case "failed":
      return { ...state, isLoading: false, error: action.error };
  }
}

function deriveTopTopics(papers: ExplorePaper[]) {
  const counts = new Map<string, number>();
  for (const paper of papers) {
    const topics = paper.topics.length > 0 ? paper.topics : [paper.venue, paper.provider];
    for (const topic of topics) {
      if (!topic) {
        continue;
      }
      counts.set(topic, (counts.get(topic) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .toSorted((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 12)
    .map(([name, count]) => ({ name, count }));
}

function formatPaperDate(paper: ExplorePaper) {
  if (paper.publicationDate) {
    const date = new Date(paper.publicationDate);
    if (!Number.isNaN(date.getTime())) {
      return paperDateFormatter.format(date);
    }
  }

  return paper.year ? String(paper.year) : "";
}

function formatCitationCount(value: number | undefined) {
  if (value === undefined) {
    return null;
  }
  const count =
    value >= 1_000
      ? `${(value / 1_000).toLocaleString("en", { maximumFractionDigits: 1 })}k`
      : value.toLocaleString("en");
  return `${count} citations`;
}

function topicBadgeClass(topic: string) {
  const normalized = topic.toLowerCase();
  if (normalized.includes("agent") || normalized.includes("reason")) {
    return "bg-lavender-soft text-lavender-foreground";
  }
  if (normalized.includes("world") || normalized.includes("robot")) {
    return "bg-coral-soft text-coral-foreground";
  }
  if (normalized.includes("image") || normalized.includes("video") || normalized.includes("3d")) {
    return "bg-sky-soft text-sky-foreground";
  }
  return "bg-lemon-soft text-lemon-foreground";
}
