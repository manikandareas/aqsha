"use client";

import { api } from "@aqsha/convex/api";
import type { ExplorePaper, ExploreSearchResponse } from "@aqsha/convex/explore";
import {
  BookmarkIcon,
  CheckIcon,
  ExternalLinkIcon,
  FileDownIcon,
  FilterIcon,
  LayoutGridIcon,
  Loader2Icon,
  SearchIcon,
} from "@aqsha/ui/icons";
import Link from "next/link";
import {
  type Dispatch,
  type FormEvent,
  type RefObject,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
type ExploreTimeRange = "all" | "week" | "month" | "year" | "threeYears" | "fiveYears";

type ExplorePageState = {
  query: string;
  submittedQuery: string;
  response: ExploreSearchResponse | null;
  isLoading: boolean;
  error: string | null;
  selectedPaper: ExplorePaper | null;
  savedKeys: Set<string>;
  activeTab: ExploreTab;
  activeTimeRange: ExploreTimeRange;
  searchOpen: boolean;
};

type ExplorePageAction =
  | { type: "queryChanged"; query: string }
  | { type: "searchOpenChanged"; searchOpen: boolean }
  | { type: "activeTabChanged"; activeTab: ExploreTab }
  | { type: "activeTimeRangeChanged"; activeTimeRange: ExploreTimeRange }
  | { type: "selectedPaperChanged"; paper: ExplorePaper | null }
  | { type: "paperSaved"; key: string }
  | { type: "started" }
  | { type: "succeeded"; response: ExploreSearchResponse; submittedQuery: string }
  | { type: "failed"; error: string };

type ExplorePageDispatch = Dispatch<ExplorePageAction>;

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

const exploreModes: Array<{ value: ExploreTab; label: string }> = [
  { value: "recommended", label: "Trending" },
  { value: "browse", label: "Browse all" },
];

const exploreTimeRanges: Array<{ value: ExploreTimeRange; label: string }> = [
  { value: "all", label: "All" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
  { value: "threeYears", label: "Last 3 years" },
  { value: "fiveYears", label: "Last 5 years" },
];

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
  activeTimeRange: "all",
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
  const searchFormRef = useRef<HTMLFormElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [state, dispatch] = useReducer(explorePageReducer, initialExplorePageState);
  const [timeRangeOpen, setTimeRangeOpen] = useState(false);
  const {
    query,
    submittedQuery,
    response,
    isLoading,
    error,
    selectedPaper,
    savedKeys,
    activeTab,
    activeTimeRange,
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
  }, [searchPapers]);

  useEffect(() => {
    if (!searchOpen) {
      return;
    }

    searchInputRef.current?.focus();

    const closeSearchOnOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || searchFormRef.current?.contains(target)) {
        return;
      }

      dispatch({ type: "searchOpenChanged", searchOpen: false });
    };

    document.addEventListener("pointerdown", closeSearchOnOutsidePointerDown);
    return () => {
      document.removeEventListener("pointerdown", closeSearchOnOutsidePointerDown);
    };
  }, [searchOpen]);

  const papers = response?.items ?? emptyExplorePapers;
  const visiblePapers = filterPapersByTimeRange(papers, activeTimeRange);
  const topTopics = deriveTopTopics(visiblePapers);
  const activeTimeRangeLabel =
    exploreTimeRanges.find((range) => range.value === activeTimeRange)?.label ?? "All";

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

          <ExploreToolbar
            activeTab={activeTab}
            activeTimeRange={activeTimeRange}
            activeTimeRangeLabel={activeTimeRangeLabel}
            dispatch={dispatch}
            isLoading={isLoading}
            query={query}
            searchFormRef={searchFormRef}
            searchInputRef={searchInputRef}
            searchOpen={searchOpen}
            timeRangeOpen={timeRangeOpen}
            onSubmit={handleSubmit}
            onTimeRangeOpenChange={setTimeRangeOpen}
          />

          {error ? (
            <div className="mt-5 max-w-[760px] rounded-[7px] border border-destructive/20 bg-destructive/10 px-4 py-3 text-[13px] font-medium text-destructive">
              {error}
            </div>
          ) : null}

          <ExploreResults
            activeTab={activeTab}
            isLoading={isLoading}
            papers={visiblePapers}
            savedKeys={savedKeys}
            submittedQuery={submittedQuery}
            topTopics={topTopics}
            onPickSuggestion={(suggestion) => {
              dispatch({ type: "queryChanged", query: suggestion });
              dispatch({ type: "searchOpenChanged", searchOpen: true });
              void runSearch(suggestion);
            }}
            onSelectPaper={(paper) => {
              dispatch({ type: "selectedPaperChanged", paper });
            }}
          />
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

function ExploreModeButton({
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
        "relative h-9 shrink-0 whitespace-nowrap rounded-[7px] px-3 text-[12px] font-semibold leading-none text-muted-foreground transition-colors hover:text-foreground sm:px-4 sm:text-[13px]",
        active && "bg-muted text-foreground after:absolute after:-bottom-px after:left-0 after:h-[2px] after:w-full after:bg-foreground",
      )}
    >
      {children}
    </button>
  );
}

function ExploreToolbar({
  activeTab,
  activeTimeRange,
  activeTimeRangeLabel,
  dispatch,
  isLoading,
  query,
  searchFormRef,
  searchInputRef,
  searchOpen,
  timeRangeOpen,
  onSubmit,
  onTimeRangeOpenChange,
}: {
  activeTab: ExploreTab;
  activeTimeRange: ExploreTimeRange;
  activeTimeRangeLabel: string;
  dispatch: ExplorePageDispatch;
  isLoading: boolean;
  query: string;
  searchFormRef: RefObject<HTMLFormElement | null>;
  searchInputRef: RefObject<HTMLInputElement | null>;
  searchOpen: boolean;
  timeRangeOpen: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onTimeRangeOpenChange: (open: boolean) => void;
}) {
  return (
    <section className="mt-8 border-b border-border/80">
      <div className="flex min-h-12 items-end justify-between gap-3">
        <div
          className="flex min-w-0 flex-1 items-end gap-2.5 overflow-x-auto overflow-y-hidden"
          aria-label="Explore mode"
        >
          {exploreModes.map((mode) => (
            <ExploreModeButton
              key={mode.value}
              active={activeTab === mode.value}
              onClick={() =>
                dispatch({
                  type: "activeTabChanged",
                  activeTab: mode.value,
                })
              }
            >
              {mode.label}
            </ExploreModeButton>
          ))}
        </div>
        <div className="mb-1.5 flex shrink-0 items-center justify-end gap-1.5">
          <ExploreSearchForm
            dispatch={dispatch}
            formRef={searchFormRef}
            inputRef={searchInputRef}
            isLoading={isLoading}
            open={searchOpen}
            query={query}
            onSubmit={onSubmit}
          />
          <ExploreTimeRangePopover
            activeTimeRange={activeTimeRange}
            activeTimeRangeLabel={activeTimeRangeLabel}
            dispatch={dispatch}
            open={timeRangeOpen}
            onOpenChange={onTimeRangeOpenChange}
          />
        </div>
      </div>
    </section>
  );
}

function ExploreSearchForm({
  dispatch,
  formRef,
  inputRef,
  isLoading,
  open,
  query,
  onSubmit,
}: {
  dispatch: ExplorePageDispatch;
  formRef: RefObject<HTMLFormElement | null>;
  inputRef: RefObject<HTMLInputElement | null>;
  isLoading: boolean;
  open: boolean;
  query: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      className={cn(
        "flex h-9 items-center justify-end rounded-[8px] transition-all",
        open
          ? "w-[220px] border border-border/80 bg-card/50 px-2 sm:w-[300px]"
          : "w-9",
      )}
    >
      {open ? (
        <label htmlFor="explore-search" className="sr-only">
          Search papers
        </label>
      ) : null}
      <input
        ref={inputRef}
        id="explore-search"
        value={query}
        onChange={(event) =>
          dispatch({ type: "queryChanged", query: event.target.value })
        }
        placeholder="Contoh: agile. Enter untuk mencari"
        className={cn(
          "h-8 min-w-0 flex-1 bg-transparent text-[13px] font-medium text-foreground outline-none placeholder:text-muted-foreground",
          !open && "sr-only",
        )}
      />
      {open ? (
        <span
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-[8px] text-muted-foreground"
          aria-hidden="true"
        >
          {isLoading ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <SearchIcon className="size-5" strokeWidth={2} />
          )}
        </span>
      ) : (
        <button
          type="button"
          onClick={() => {
            dispatch({ type: "searchOpenChanged", searchOpen: true });
          }}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-[8px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Open search"
        >
          <SearchIcon className="size-5" strokeWidth={2} />
        </button>
      )}
    </form>
  );
}

function ExploreTimeRangePopover({
  activeTimeRange,
  activeTimeRangeLabel,
  dispatch,
  open,
  onOpenChange,
}: {
  activeTimeRange: ExploreTimeRange;
  activeTimeRangeLabel: string;
  dispatch: ExplorePageDispatch;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "relative inline-flex size-9 shrink-0 items-center justify-center rounded-[8px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            activeTimeRange !== "all" && "bg-muted text-foreground",
          )}
          aria-label={`Filter papers by date: ${activeTimeRangeLabel}`}
        >
          <FilterIcon className="size-4.5" strokeWidth={2} />
          {activeTimeRange !== "all" ? (
            <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-foreground" />
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52 p-1.5">
        <div className="px-2 py-1.5">
          <p className="text-[12px] font-semibold text-muted-foreground">
            Date Range
          </p>
        </div>
        <div className="grid gap-1">
          {exploreTimeRanges.map((range) => (
            <TimeRangeOptionButton
              key={range.value}
              active={activeTimeRange === range.value}
              onClick={() => {
                dispatch({
                  type: "activeTimeRangeChanged",
                  activeTimeRange: range.value,
                });
                onOpenChange(false);
              }}
            >
              {range.label}
            </TimeRangeOptionButton>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ExploreResults({
  activeTab,
  isLoading,
  papers,
  savedKeys,
  submittedQuery,
  topTopics,
  onPickSuggestion,
  onSelectPaper,
}: {
  activeTab: ExploreTab;
  isLoading: boolean;
  papers: ExplorePaper[];
  savedKeys: Set<string>;
  submittedQuery: string;
  topTopics: Array<{ name: string; count: number }>;
  onPickSuggestion: (suggestion: string) => void;
  onSelectPaper: (paper: ExplorePaper) => void;
}) {
  if (isLoading) {
    return <ExploreSkeletonList activeTab={activeTab} />;
  }

  if (papers.length === 0) {
    return <ExploreEmptyState query={submittedQuery} onPick={onPickSuggestion} />;
  }

  if (activeTab === "recommended") {
    return (
      <section className="grid gap-10 pt-7 lg:grid-cols-[minmax(0,1fr)_260px] lg:gap-10">
        <ExplorePaperList
          papers={papers}
          savedKeys={savedKeys}
          variant="recommended"
          onSelectPaper={onSelectPaper}
        />
        <TopTopics topics={topTopics} />
      </section>
    );
  }

  return (
    <section className="pt-7">
      <ExplorePaperList
        papers={papers}
        savedKeys={savedKeys}
        variant="browse"
        onSelectPaper={onSelectPaper}
      />
    </section>
  );
}

function ExplorePaperList({
  papers,
  savedKeys,
  variant,
  onSelectPaper,
}: {
  papers: ExplorePaper[];
  savedKeys: Set<string>;
  variant: "recommended" | "browse";
  onSelectPaper: (paper: ExplorePaper) => void;
}) {
  return (
    <div className="min-w-0 divide-y divide-border/60">
      {papers.map((paper, index) => (
        <PaperListItem
          key={paper.key}
          index={index}
          paper={paper}
          saved={savedKeys.has(paper.key)}
          variant={variant}
          onSave={() => onSelectPaper(paper)}
        />
      ))}
    </div>
  );
}

function TimeRangeOptionButton({
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
        "flex h-8 w-full items-center justify-between rounded-[7px] px-2.5 text-left text-[12px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        active && "bg-muted text-foreground",
      )}
    >
      <span>{children}</span>
      {active ? <span className="size-1.5 rounded-full bg-foreground" /> : null}
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
        variant === "browse" && "sm:grid-cols-[76px_minmax(0,1fr)_96px]",
      )}
    >
      <Link
        href={detailHref}
        className="mt-0.5 block"
        aria-label={`View ${paper.title}`}
      >
        <PaperThumbnail layout={layout} />
      </Link>

      <div className="min-w-0 overflow-hidden">
        <div className="flex min-w-0 items-start gap-2">
          <h2
            className={cn(
              "min-w-0 text-[15px] font-semibold leading-[1.2] text-foreground transition-colors group-hover:text-foreground sm:text-[16px]",
              variant === "browse" && "sm:text-[16px]",
            )}
          >
            <Link
              href={detailHref}
              className="line-clamp-2 break-words underline-offset-3 focus:outline-none hover:underline focus-visible:underline"
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
            "mt-2.5 max-w-[860px] break-words text-[13px] font-medium leading-5 text-ink-soft",
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
          "col-start-2 flex min-w-0 items-center justify-between gap-2 text-ink-soft sm:col-start-auto sm:items-end sm:justify-end",
          variant === "recommended"
            ? "sm:flex-col"
            : "sm:min-w-[96px] sm:flex-col sm:justify-center sm:self-center",
        )}
      >
        <div className="flex shrink-0 items-center gap-2">
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

        <p className="max-w-full truncate whitespace-nowrap text-[12px] font-semibold text-muted-foreground">
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
    case "activeTimeRangeChanged":
      return { ...state, activeTimeRange: action.activeTimeRange };
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

function filterPapersByTimeRange(papers: ExplorePaper[], range: ExploreTimeRange) {
  if (range === "all") {
    return papers;
  }

  const now = Date.now();
  const rangeStart = startOfExploreTimeRange(range, now);
  return papers.filter((paper) => {
    const timestamp = paperTimestamp(paper);
    return timestamp !== null && timestamp >= rangeStart;
  });
}

function startOfExploreTimeRange(range: Exclude<ExploreTimeRange, "all">, now: number) {
  const date = new Date(now);
  if (range === "week") {
    date.setDate(date.getDate() - 7);
  } else if (range === "month") {
    date.setMonth(date.getMonth() - 1);
  } else if (range === "year") {
    date.setFullYear(date.getFullYear() - 1);
  } else if (range === "threeYears") {
    date.setFullYear(date.getFullYear() - 3);
  } else {
    date.setFullYear(date.getFullYear() - 5);
  }
  return date.getTime();
}

function paperTimestamp(paper: ExplorePaper) {
  if (paper.publicationDate) {
    const timestamp = new Date(paper.publicationDate).getTime();
    if (!Number.isNaN(timestamp)) {
      return timestamp;
    }
  }

  return paper.year ? new Date(paper.year, 0, 1).getTime() : null;
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
