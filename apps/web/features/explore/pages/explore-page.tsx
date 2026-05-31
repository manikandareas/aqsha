"use client";

import { api } from "@aqsha/convex/api";
import type { ExplorePaper, ExploreSearchResponse } from "@aqsha/convex/explore";
import {
  ArrowUpRightIcon,
  BookOpenIcon,
  CheckIcon,
  ExternalLinkIcon,
  FileDownIcon,
  LibraryBigIcon,
  Loader2Icon,
  SearchIcon,
  SparklesIcon,
} from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { LibraryCardFrame } from "@/components/library-card-frame";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkspacePickerDialog } from "@/features/workspaces/components/workspace-picker-dialog";
import { WorkspaceShell } from "@/features/workspaces/components/workspace-shell";
import { useWorkspaceIndexData } from "@/features/workspaces/api/use-workspaces-data";
import { toWorkspaceId } from "@/lib/convex-refs";
import { readableConvexErrorMessage } from "@/lib/convex-error";
import {
  useConvexActionState,
  useConvexMutationState,
} from "@/lib/convex-query";
import { libraryArtifactGridClass } from "@/lib/library-grid";

const suggestedQueries = [
  "AI tutoring formative assessment",
  "retrieval augmented generation education",
  "student motivation learning analytics",
];

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
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [response, setResponse] = useState<ExploreSearchResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPaper, setSelectedPaper] = useState<ExplorePaper | null>(null);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(() => new Set());

  const providerWarning = (response?.providerStatus ?? []).find(
      (status) =>
        status.provider === "OpenAlex" &&
        (status.status === "error" || status.status === "fallback"),
    );

  const runSearch = async (nextQuery: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const result: ExploreSearchResponse = await searchPapers.mutateAsync({
        query: nextQuery || undefined,
        mode: nextQuery ? "search" : "recommendations",
        limit: 12,
      });
      setResponse(result);
      setSubmittedQuery(nextQuery);
      setIsLoading(false);
    } catch (searchError) {
      setError(readableConvexErrorMessage(searchError, "Gagal mencari paper."));
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (initialRecommendationsStarted.current) {
      return;
    }
    initialRecommendationsStarted.current = true;
    const task = window.setTimeout(() => {
      void (async () => {
        setIsLoading(true);
        setError(null);
        try {
          const result: ExploreSearchResponse = await searchPapers.mutateAsync({
            query: undefined,
            mode: "recommendations",
            limit: 12,
          });
          setResponse(result);
          setSubmittedQuery("");
          setIsLoading(false);
        } catch (searchError) {
          setError(readableConvexErrorMessage(searchError, "Gagal mencari paper."));
          setIsLoading(false);
        }
      })();
    }, 0);
    return () => window.clearTimeout(task);
  }, [searchPapers]);

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
    setSavedKeys((keys) => new Set(keys).add(selectedPaper.key));
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
        <div className="mx-auto grid w-full max-w-7xl gap-7 px-4 py-5 sm:px-8 lg:py-8">
          <section className="mx-auto grid w-full max-w-3xl gap-4 pt-4 text-center sm:pt-8">
            <div className="mx-auto flex size-10 items-center justify-center rounded-[10px] border border-mint-soft-border bg-mint-soft text-mint-foreground">
              <LibraryBigIcon className="size-5" />
            </div>
            <div className="grid gap-2">
              <h1 className="font-heading text-3xl font-semibold tracking-normal sm:text-4xl">
                Jelajahi paper
              </h1>
              <p className="mx-auto max-w-xl text-[13px] leading-6 text-muted-foreground">
                Temukan rekomendasi akademik dari OpenAlex dengan fallback ke arXiv, Exa, dan Jina.
              </p>
            </div>
            <form
              onSubmit={handleSubmit}
              className="mx-auto grid w-full grid-cols-[1fr_auto] items-center gap-2 rounded-[12px] border border-border/80 bg-card p-2 shadow-sm"
            >
              <label htmlFor="explore-search" className="sr-only">
                Cari paper
              </label>
              <input
                id="explore-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cari topik, DOI, judul, atau metode..."
                className="h-11 min-w-0 bg-transparent px-3 text-[14px] font-medium outline-none placeholder:text-muted-foreground"
              />
              <Button type="submit" size="icon" disabled={isLoading} aria-label="Cari paper">
                {isLoading ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <SearchIcon className="size-4" />
                )}
              </Button>
            </form>
            <div className="flex flex-wrap justify-center gap-2">
              {suggestedQueries.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => {
                    setQuery(suggestion);
                    void runSearch(suggestion);
                  }}
                  className="rounded-full border border-border/80 bg-background px-3 py-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </section>

          {providerWarning ? (
            <div className="mx-auto flex w-full max-w-4xl items-center gap-2 rounded-[8px] border border-lemon-soft-border bg-lemon-soft px-3 py-2 text-[12px] font-medium text-lemon-foreground">
              <SparklesIcon className="size-4 shrink-0" />
              OpenAlex tidak penuh tersedia; hasil dilengkapi dari provider akademik lain.
            </div>
          ) : null}

          {error ? (
            <div className="mx-auto w-full max-w-3xl rounded-[8px] border border-destructive/20 bg-destructive/5 px-4 py-3 text-[13px] font-medium text-destructive">
              {error}
            </div>
          ) : null}

          {isLoading ? (
            <ExploreSkeletonGrid />
          ) : response?.items.length ? (
            <section className={libraryArtifactGridClass}>
              {response.items.map((paper) => (
                <PaperCard
                  key={paper.key}
                  paper={paper}
                  saved={savedKeys.has(paper.key)}
                  onSave={() => setSelectedPaper(paper)}
                />
              ))}
            </section>
          ) : (
            <ExploreEmptyState query={submittedQuery} onPick={(suggestion) => {
              setQuery(suggestion);
              void runSearch(suggestion);
            }} />
          )}
        </div>
      </main>
      <WorkspacePickerDialog
        open={Boolean(selectedPaper)}
        onOpenChange={(open) => !open && setSelectedPaper(null)}
        title="Simpan paper"
        description="Pilih workspace tujuan untuk menyimpan paper sebagai URL artifact."
        onSelect={handleSave}
      />
    </WorkspaceShell>
  );
}

function PaperCard({
  paper,
  saved,
  onSave,
}: {
  paper: ExplorePaper;
  saved: boolean;
  onSave: () => void;
}) {
  const year = paper.year ? String(paper.year) : "Paper";
  const authors = paper.authors.length > 0 ? paper.authors.join(", ") : paper.sourceLabel;
  const detailItems = [
    paper.venue,
    typeof paper.citedByCount === "number"
      ? `${paper.citedByCount.toLocaleString()} citation`
      : null,
    paper.isOpenAccess ? "Open access" : null,
  ].filter((item): item is string => Boolean(item));

  return (
    <LibraryCardFrame as="article">
      <div className="flex min-h-0 flex-1 flex-col p-5">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 shrink-0 items-center justify-center rounded-[8px] bg-muted px-2 text-[12px] font-semibold leading-none text-muted-foreground">
            {year}
          </span>
          <span className="min-w-0 truncate text-[12px] font-semibold leading-none text-muted-foreground">
            {paper.provider}
          </span>
          {paper.score ? (
            <span className="ml-auto shrink-0 text-[11px] font-semibold leading-none text-muted-foreground">
              {Math.round(paper.score)} score
            </span>
          ) : null}
        </div>

        <h2 className="mt-5 line-clamp-4 text-[20px] font-semibold leading-[1.22] text-foreground">
          {paper.title}
        </h2>

        <p className="mt-2 line-clamp-1 text-[12px] font-medium text-muted-foreground">
          {authors}
        </p>

        <p className="mt-4 line-clamp-5 text-[13px] leading-6 text-ink-soft">
          {paper.snippet}
        </p>

        {paper.topics.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {paper.topics.slice(0, 3).map((topic) => (
              <span
                key={topic}
                className="rounded-full bg-muted px-2 py-1 text-[10px] font-semibold text-muted-foreground"
              >
                {topic}
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-auto grid gap-3 pt-6">
          {detailItems.length > 0 ? (
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-medium text-muted-foreground">
              {detailItems.map((item) => (
                <span key={item} className="line-clamp-1">
                  {item}
                </span>
              ))}
            </div>
          ) : null}

          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span className="relative inline-flex size-4 shrink-0 items-end justify-end">
              <span className="absolute left-0 top-0.5 size-3 rotate-[-14deg] rounded-[4px] bg-muted-foreground/45" />
              <span className="relative size-3.5 rounded-[4px] border border-card bg-muted-foreground/70" />
            </span>
            <span className="min-w-0 truncate text-[12px] font-semibold leading-none">
              {paper.doi
                ? `doi:${paper.doi}`
                : paper.arxivId
                  ? `arxiv:${paper.arxivId}`
                  : "Research paper"}
            </span>
            <ExternalLinkIcon className="ml-auto size-3.5 text-muted-foreground" />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="sm" className="h-8">
              <a href={paper.url} target="_blank" rel="noreferrer">
                <ExternalLinkIcon className="size-3.5" />
                Buka paper
              </a>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              disabled={saved}
              onClick={onSave}
            >
              {saved ? <CheckIcon className="size-3.5" /> : <BookOpenIcon className="size-3.5" />}
              {saved ? "Tersimpan" : "Simpan"}
            </Button>
            {paper.pdfUrl ? (
              <Button asChild variant="ghost" size="sm" className="h-8">
                <a href={paper.pdfUrl} target="_blank" rel="noreferrer">
                  <FileDownIcon className="size-3.5" />
                  PDF
                </a>
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </LibraryCardFrame>
  );
}

function ExploreSkeletonGrid() {
  return (
    <section className={libraryArtifactGridClass}>
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="grid aspect-[8/9] min-h-[300px] gap-4 rounded-[20px] border border-border bg-card p-5 shadow-aqsha"
        >
          <div className="flex justify-between">
            <Skeleton className="h-7 w-20 rounded-[8px]" />
            <Skeleton className="h-4 w-12" />
          </div>
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-24 w-full rounded-[8px]" />
          <div className="flex gap-2">
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
          <Skeleton className="mt-auto h-8 w-48" />
        </div>
      ))}
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
    <section className="mx-auto grid min-h-[34svh] w-full max-w-3xl place-items-center rounded-[10px] border border-dashed border-border bg-muted/20 p-8 text-center">
      <div className="grid gap-4">
        <ArrowUpRightIcon className="mx-auto size-7 text-muted-foreground" />
        <div className="grid gap-1">
          <h2 className="font-heading text-xl font-semibold">
            {query ? "Tidak ada paper yang cocok." : "Belum ada rekomendasi."}
          </h2>
          <p className="text-[13px] text-muted-foreground">
            Coba istilah akademik yang lebih spesifik.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {suggestedQueries.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onPick(suggestion)}
              className="rounded-full border border-border bg-background px-3 py-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
