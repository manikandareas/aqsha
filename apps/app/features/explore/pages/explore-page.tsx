"use client";

import { api } from "@aqsha/convex/api";
import type { ExplorePaper, ExploreSearchResponse } from "@aqsha/convex/explore";
import { useAction, useMutation } from "convex/react";
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
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkspacePickerDialog } from "@/features/workspaces/components/workspace-picker-dialog";
import { WorkspaceShell } from "@/features/workspaces/components/workspace-shell";
import { useWorkspaceIndexData } from "@/features/workspaces/api/use-workspaces-data";
import { toWorkspaceId } from "@/lib/convex-refs";
import { cn } from "@/lib/utils";

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
  const searchPapers = useAction(api.explore.searchPapers);
  const createUrl = useMutation(api.artifacts.createUrl);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [response, setResponse] = useState<ExploreSearchResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPaper, setSelectedPaper] = useState<ExplorePaper | null>(null);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(() => new Set());

  const providerWarning = useMemo(() => {
    const statuses = response?.providerStatus ?? [];
    return statuses.find(
      (status) =>
        status.provider === "OpenAlex" &&
        (status.status === "error" || status.status === "fallback"),
    );
  }, [response]);

  const runSearch = useCallback(async (nextQuery: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const result: ExploreSearchResponse = await searchPapers({
        query: nextQuery || undefined,
        mode: nextQuery ? "search" : "recommendations",
        limit: 12,
      });
      setResponse(result);
      setSubmittedQuery(nextQuery);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "Gagal mencari paper.");
    } finally {
      setIsLoading(false);
    }
  }, [searchPapers]);

  useEffect(() => {
    const task = window.setTimeout(() => {
      void runSearch("");
    }, 0);
    return () => window.clearTimeout(task);
  }, [runSearch]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runSearch(query.trim());
  };

  const handleSave = async (workspaceId: string) => {
    if (!selectedPaper) return;
    await createUrl({
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
            <section className="grid auto-rows-fr gap-3 md:grid-cols-2 lg:grid-cols-12">
              {response.items.map((paper, index) => (
                <PaperCard
                  key={paper.key}
                  paper={paper}
                  index={index}
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
  index,
  saved,
  onSave,
}: {
  paper: ExplorePaper;
  index: number;
  saved: boolean;
  onSave: () => void;
}) {
  const accent = accentForKey(paper.key);
  const wide = index % 5 === 0 || index % 7 === 3;
  return (
    <article
      className={cn(
        "group relative grid min-h-[300px] overflow-hidden rounded-[10px] border border-border/80 bg-card shadow-sm transition-[border-color,transform] hover:-translate-y-0.5 hover:border-primary/25",
        wide ? "lg:col-span-7" : "lg:col-span-5",
      )}
    >
      <div className={cn("absolute inset-y-0 left-0 w-1.5", accent)} aria-hidden />
      <div className="grid h-full content-between gap-5 p-4 pl-5">
        <div className="grid gap-4">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <Badge variant="outline" className="rounded-[6px] px-2 py-0.5 text-[10px]">
              {paper.provider}
            </Badge>
            <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">
              {paper.year ?? "Paper"}
            </span>
          </div>

          <div className="grid gap-2">
            <h2 className="line-clamp-3 font-heading text-xl font-semibold leading-tight tracking-normal">
              {paper.title}
            </h2>
            <p className="line-clamp-1 text-[12px] font-medium text-muted-foreground">
              {paper.authors.length > 0 ? paper.authors.join(", ") : paper.sourceLabel}
            </p>
          </div>

          <div className="grid min-h-[98px] content-start rounded-[8px] border border-border/70 bg-background/70 px-3 py-3">
            <p className="line-clamp-4 text-[13px] leading-6 text-ink-soft">
              {paper.snippet}
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {paper.topics.slice(0, 4).map((topic) => (
              <span
                key={topic}
                className="rounded-full bg-muted px-2 py-1 text-[10px] font-semibold text-muted-foreground"
              >
                {topic}
              </span>
            ))}
          </div>
        </div>

        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-muted-foreground">
            {paper.venue ? <span className="line-clamp-1">{paper.venue}</span> : null}
            {typeof paper.citedByCount === "number" ? (
              <span>{paper.citedByCount.toLocaleString()} citation</span>
            ) : null}
            {paper.isOpenAccess ? <span>Open access</span> : null}
          </div>

          {paper.doi || paper.arxivId ? (
            <p className="truncate font-mono text-[10px] text-muted-foreground">
              {paper.doi ? `doi:${paper.doi}` : `arxiv:${paper.arxivId}`}
            </p>
          ) : null}

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
    </article>
  );
}

function ExploreSkeletonGrid() {
  return (
    <section className="grid gap-3 md:grid-cols-2 lg:grid-cols-12">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className={cn(
            "grid min-h-[300px] gap-4 rounded-[10px] border border-border/80 bg-card p-4",
            index % 3 === 0 ? "lg:col-span-7" : "lg:col-span-5",
          )}
        >
          <div className="flex justify-between">
            <Skeleton className="h-5 w-20 rounded-[6px]" />
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

function accentForKey(key: string) {
  const accents = [
    "bg-primary",
    "bg-mint-foreground",
    "bg-sky-foreground",
    "bg-lemon-foreground",
    "bg-lavender-foreground",
  ];
  const code = [...key].reduce((total, char) => total + char.charCodeAt(0), 0);
  return accents[code % accents.length];
}
