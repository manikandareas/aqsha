"use client";

import { api } from "@aqsha/convex/api";
import type { ExplorePaper } from "@aqsha/convex/explore";
import {
  ArrowLeftIcon,
  BookOpenIcon,
  ExternalLinkIcon,
  FileTextIcon,
  LinkIcon,
  PlusIcon,
} from "@aqsha/ui/icons";
import Link from "next/link";
import { useState } from "react";
import { CopyCitationButton } from "@/components/citation/copy-citation-button";
import { PropertyLink, PropertyRow } from "@/components/detail/property-list";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorkspacePickerDialog } from "@/features/workspaces/components/workspace-picker-dialog";
import { readableConvexErrorMessage } from "@/lib/convex-error";
import {
  useConvexActionQueryWithKey,
  useConvexMutationState,
} from "@/lib/convex-query";
import { toWorkspaceId } from "@/lib/convex-refs";
import { formatCitation, type CitationFormat } from "../utils/citation";
import { decodePaperRef } from "../utils/paper-ref";
import { bestPaperIngestUrl } from "../utils/paper-ingest";
import { ExploreChatShell } from "./explore-chat-shell";

const citationFormats: Array<{ value: CitationFormat; label: string }> = [
  { value: "bibtex", label: "BibTeX" },
  { value: "markdown", label: "Markdown" },
  { value: "plain", label: "Plain text" },
];

function buildPaperSeed(paper: ExplorePaper) {
  const abstract = paper.abstract ?? paper.snippet;
  return `${paper.title}\n\n${abstract}\n\nSumber: ${paper.url}`;
}

export function ExploreDetailPage({ paperRef }: { paperRef: string }) {
  const paperKey = safeDecodePaperRef(paperRef);
  const paperQuery = useConvexActionQueryWithKey(
    api.explore.getOrFetchPaper,
    ["explorePaperDetail", paperKey],
    paperKey ? { key: paperKey } : "skip",
  );
  const paperError = paperQuery.error
    ? readableConvexErrorMessage(paperQuery.error, "Paper gagal dimuat.")
    : null;
  const chatSeed = paperQuery.data ? buildPaperSeed(paperQuery.data) : undefined;

  return (
    <ExploreChatShell
      breadcrumbs={[
        { label: "Jelajahi", href: "/app/explore" },
        { label: "Paper" },
      ]}
      chatSeed={chatSeed}
    >
      <div className="mx-auto grid w-full max-w-[1080px] gap-8 px-5 pb-12 pt-4 sm:px-8 lg:grid-cols-[minmax(0,700px)_260px] lg:gap-10 lg:px-10">
        {paperQuery.isLoading ? (
          <ExploreDetailSkeleton />
        ) : paperError ? (
          <ExploreDetailState
            title="Paper gagal dimuat."
            message={paperError}
          />
        ) : !paperKey || !paperQuery.data ? (
          <ExploreDetailState
            title="Paper tidak tersedia."
            message="Paper ini tidak dapat ditemukan. Coba cari lewat Jelajahi."
          />
        ) : (
          <ExploreDetailContent paper={paperQuery.data} />
        )}
      </div>
    </ExploreChatShell>
  );
}

function ExploreDetailContent({ paper }: { paper: ExplorePaper & { lastSeenAt?: number } }) {
  const abstract = paper.abstract ?? paper.snippet;
  const summary = summarizeAbstract(abstract);
  const createUrl = useConvexMutationState(api.artifacts.createUrl);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async (workspaceId: string) => {
    await createUrl.mutateAsync({
      workspaceId: toWorkspaceId(workspaceId),
      url: bestPaperIngestUrl(paper),
      title: paper.title,
    });
    setSaved(true);
  };

  return (
    <>
      <section className="min-w-0">
        <div className="mb-4 flex items-center justify-end gap-2">
          <Button asChild variant="outline" size="sm" className="h-8 px-2.5 text-sm text-muted-foreground">
            <a href={paper.url} target="_blank" rel="noreferrer">
              Open
              <ExternalLinkIcon className="size-3" />
            </a>
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8 px-2.5 text-sm"
            disabled={saved}
            onClick={() => setPickerOpen(true)}
          >
            <PlusIcon className="size-3.5" />
            {saved ? "Added to library" : "Add to library"}
          </Button>
        </div>

        <header className="min-w-0">
          <h1 className="max-w-[700px] text-2xl font-semibold leading-tight tracking-normal text-foreground sm:text-3xl">
            {paper.title}
          </h1>
          <p className="mt-3 max-w-[660px] text-[14px] font-medium leading-6 text-muted-foreground">
            {summary}
          </p>
        </header>

        <Tabs defaultValue="overview" className="mt-8 gap-0">
          <TabsList className="h-10 w-full justify-start gap-5 rounded-none border-0 border-b border-border bg-transparent p-0">
            <TabsTrigger
              value="overview"
              className="h-10 min-w-0 rounded-none border-b-2 border-transparent bg-transparent px-0 text-[13px] font-semibold text-muted-foreground shadow-none data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              Overview
            </TabsTrigger>
            <TabsTrigger
              value="pdf"
              className="h-10 min-w-0 rounded-none border-b-2 border-transparent bg-transparent px-0 text-[13px] font-semibold text-muted-foreground shadow-none data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              PDF
            </TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="pt-6">
            <section>
              <h2 className="text-[15px] font-semibold text-foreground">
                Topics <span className="ml-2 font-medium text-muted-foreground">{paper.topics.length}</span>
              </h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {(paper.topics.length > 0 ? paper.topics : [paper.provider]).slice(0, 8).map((topic) => (
                  <span
                    key={topic}
                    className="rounded-md bg-lemon-soft px-2 py-1 text-xs font-semibold text-lemon-foreground"
                  >
                    {topic}
                  </span>
                ))}
              </div>
            </section>

            <section className="mt-8">
              <h2 className="text-[15px] font-semibold text-foreground">Abstract</h2>
              <p className="mt-4 max-w-[700px] text-[14px] font-medium leading-6 text-foreground">
                {abstract}
              </p>
            </section>
          </TabsContent>
          <TabsContent value="pdf">
            <PdfPanel paper={paper} />
          </TabsContent>
        </Tabs>
      </section>

      <ExploreDetailSidebar paper={paper} />

      <WorkspacePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title="Simpan paper"
        description="Pilih workspace tujuan. Paper akan otomatis diunduh dan metadatanya diekstrak."
        onSelect={handleSave}
      />
    </>
  );
}

function ExploreDetailSidebar({ paper }: { paper: ExplorePaper & { lastSeenAt?: number } }) {
  return (
    <aside className="space-y-6 pt-2 lg:sticky lg:top-6 lg:self-start">
      <section>
        <h2 className="mb-4 text-[12px] font-semibold text-muted-foreground">Properties</h2>
        <div className="space-y-4">
          <PropertyRow label="Year" value={paper.year ? String(paper.year) : "Unknown"} />
          <PropertyRow label="Venue" value={paper.venue ?? paper.sourceLabel} badge />
          {paper.arxivId ? (
            <PropertyLink label="ArXiv" value={paper.arxivId} href={`https://arxiv.org/abs/${paper.arxivId}`} />
          ) : null}
          {paper.doi ? <PropertyLink label="DOI" value={paper.doi} href={`https://doi.org/${paper.doi}`} /> : null}
          {paper.openalexId ? <PropertyLink label="OpenAlex" value={shortenLocator(paper.openalexId)} href={paper.openalexId} /> : null}
          <PropertyLink label="URL" value={shortenLocator(paper.url)} href={paper.url} />
          <PropertyRow label="Citations" value={formatCitationCount(paper.citedByCount)} />
          <PropertyRow label="Authors" value={String(paper.authors.length || 1)} />
          <PropertyRow
            label="Hosting"
            value={paper.pdfUrl ? "PDF available" : "Abstract only"}
            badge
            mutedValue={paper.sourceLabel}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-[12px] font-semibold text-muted-foreground">Cite</h2>
        <div className="space-y-2">
          {citationFormats.map((format) => (
            <CopyCitationButton key={format.value} value={formatCitation(paper, format.value)}>
              {format.label}
            </CopyCitationButton>
          ))}
        </div>
      </section>

      <section className="border-t border-border pt-5">
        <h2 className="mb-3 text-[12px] font-semibold text-muted-foreground">Attribution</h2>
        <p className="text-[13px] font-medium text-muted-foreground">
          {paper.pdfUrl ? "Abstract & full text" : "Abstract"}
        </p>
      </section>
    </aside>
  );
}

function PdfPanel({ paper }: { paper: ExplorePaper }) {
  if (!paper.pdfUrl) {
    return (
      <section className="mt-6 grid min-h-[260px] place-items-center border border-border bg-card p-5 text-center">
        <div>
          <FileTextIcon className="mx-auto size-7 text-muted-foreground" />
          <h2 className="mt-3 text-[15px] font-semibold text-foreground">Abstract only</h2>
          <p className="mt-2 max-w-xs text-sm font-medium leading-5 text-muted-foreground">
            No hosted PDF was returned for this result.
          </p>
          <Button asChild variant="outline" size="sm" className="mt-4 h-8">
            <a href={paper.url} target="_blank" rel="noreferrer">
              <LinkIcon className="size-3" />
              Open source
            </a>
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-6 overflow-hidden border border-border bg-card">
      <div className="flex min-h-9 items-center justify-between gap-3 border-b border-border px-3">
        <span className="truncate text-xs font-semibold text-muted-foreground">{shortenLocator(paper.pdfUrl)}</span>
        <Button asChild variant="ghost" size="sm" className="h-8">
          <a href={paper.pdfUrl} target="_blank" rel="noreferrer">
            <ExternalLinkIcon className="size-3" />
            Open PDF
          </a>
        </Button>
      </div>
      <iframe
        src={paper.pdfUrl}
        title={`${paper.title} PDF`}
        sandbox="allow-downloads"
        className="h-[60svh] min-h-[380px] w-full bg-background"
      />
    </section>
  );
}

function ExploreDetailSkeleton() {
  return (
    <>
      <section className="min-w-0">
        <div className="mb-4 flex items-center justify-between">
          <Skeleton className="size-7 rounded-md bg-muted" />
          <Skeleton className="h-8 w-28 rounded-md bg-muted" />
        </div>
        <Skeleton className="h-16 w-[76%] rounded-md bg-muted" />
        <Skeleton className="mt-4 h-14 w-[70%] rounded-md bg-muted/70" />
        <Skeleton className="mt-8 h-10 w-full rounded-none bg-muted/50" />
        <Skeleton className="mt-6 h-6 w-24 rounded-md bg-muted" />
        <Skeleton className="mt-4 h-40 w-full rounded-md bg-muted/60" />
      </section>
      <aside className="space-y-4 pt-2">
        <Skeleton className="h-4 w-20 rounded-md bg-muted" />
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-8 w-full rounded-md bg-muted/60" />
        ))}
      </aside>
    </>
  );
}

function ExploreDetailState({ title, message }: { title: string; message: string }) {
  return (
    <section className="lg:col-span-2">
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-5 text-muted-foreground">
        <Link href="/app/explore">
          <ArrowLeftIcon className="size-4" />
          Explore
        </Link>
      </Button>
      <div className="grid min-h-[48svh] place-items-center rounded-[8px] border border-border/80 bg-card/30 p-6 text-center">
        <div>
          <BookOpenIcon className="mx-auto size-8 text-muted-foreground" />
          <h1 className="mt-4 text-xl font-semibold text-foreground">{title}</h1>
          <p className="mt-2 max-w-md text-[14px] font-medium leading-6 text-muted-foreground">
            {message}
          </p>
        </div>
      </div>
    </section>
  );
}

function formatCitationCount(value: number | undefined) {
  if (value === undefined) {
    return "Unknown";
  }
  return value.toLocaleString("en");
}

function safeDecodePaperRef(paperRef: string) {
  try {
    return decodePaperRef(paperRef);
  } catch {
    return "";
  }
}

function shortenLocator(value: string) {
  return value.replace(/^https?:\/\//i, "").replace(/^doi\.org\//i, "");
}

function summarizeAbstract(value: string) {
  const text = value.replace(/\s+/g, " ").trim();
  const [firstSentence] = text.match(/.*?[.!?](?:\s|$)/) ?? [];
  const summary = firstSentence?.trim() || text;
  if (summary.length <= 220) {
    return summary;
  }
  const compact = summary.slice(0, 220).replace(/\s+\S*$/, "").trim();
  return `${compact}.`;
}
