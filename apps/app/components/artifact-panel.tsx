"use client";

import {
  BookOpenIcon,
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  FileTextIcon,
  GlobeIcon,
  MoreHorizontalIcon,
  PanelLeftIcon,
  SearchIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import type { ResearchSource, SourceFocus } from "@/features/thread-experience/types";
import { getSourceGroups } from "@/features/thread-experience/utils/research-panel-model";
import { cn } from "@/lib/utils";

type ResearchArtifact = {
  _id: string;
  type:
    | "research_report"
    | "markdown_report"
    | "research_document"
    | "document"
    | "code"
    | "html"
    | "json"
    | "plain_text";
  title: string;
  version?: {
    _id: string;
    versionNumber: number;
    contentFormat: "markdown" | "html" | "plain" | "code" | "json";
    title: string;
    body?: string;
    changeSummary?: string;
    createdAt: number;
  } | null;
  createdAt: number;
};

export function ArtifactPanel({
  threadTitle,
  artifacts = [],
  sources = [],
  activeArtifact,
  activeTab,
  sourceFocus,
  onOpenArtifact,
  onOpenSources,
  onTabChange,
  onClosePanel,
}: {
  threadTitle?: string;
  artifacts?: ResearchArtifact[];
  sources?: ResearchSource[];
  activeArtifact?: ResearchArtifact | null;
  activeTab: "artifacts" | "sources";
  sourceFocus: SourceFocus | null;
  onOpenArtifact?: (artifactId: string) => void;
  onOpenSources?: (focus?: SourceFocus) => void;
  onTabChange: (tab: "artifacts" | "sources") => void;
  onClosePanel: () => void;
}) {
  const [copiedSummary, setCopiedSummary] = useState(false);
  const { setOpenMobile } = useSidebar();

  const handleCopySummary = async () => {
    const artifactLines = artifacts.map((artifact) => `- ${artifact.title}`);
    const panelSummary = [
      threadTitle ?? "Research thread",
      "",
      `${artifacts.length} artefak`,
      ...artifactLines,
    ].join("\n");
    await navigator.clipboard.writeText(panelSummary);
    setCopiedSummary(true);
    window.setTimeout(() => setCopiedSummary(false), 1200);
  };

  const handleOpenPrimaryArtifact = () => {
    const artifact = artifacts[0];
    if (!artifact) return;
    onOpenArtifact?.(artifact._id);
  };

  const handleClosePanel = () => {
    onClosePanel();
    setOpenMobile(false);
  };

  return (
    <Sidebar
      side="right"
      collapsible="offcanvas"
      className="overflow-hidden bg-transparent [&_[data-slot=sidebar-container]]:border-l-0 [&_[data-slot=sidebar-inner]]:bg-transparent"
    >
      <SidebarHeader className="gap-0 p-0">
        <div className="flex h-9 items-center gap-2 px-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className="flex h-7 min-w-0 items-center gap-1.5 rounded-[7px] bg-muted px-2 text-[12px] font-semibold text-foreground">
              <button
                type="button"
                onClick={() => onTabChange("artifacts")}
                className={activeTab === "artifacts" ? "text-foreground" : "text-muted-foreground"}
              >
                Artefak
              </button>
              <span className="inline-flex min-w-4 items-center justify-center rounded-[6px] bg-[var(--sky-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                {artifacts.length}
              </span>
            </span>
            <span className="flex h-7 min-w-0 items-center gap-1.5 rounded-[7px] px-2 text-[12px] font-semibold text-muted-foreground hover:bg-muted">
              <button
                type="button"
                onClick={() => {
                  onTabChange("sources");
                  onOpenSources?.();
                }}
                className={activeTab === "sources" ? "text-foreground" : "text-muted-foreground"}
              >
                Sources
              </button>
              <span className="inline-flex min-w-4 items-center justify-center rounded-[6px] bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                {sources.length}
              </span>
            </span>
          </div>
          <div className="flex items-center gap-0.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="size-6 rounded-[6px] text-muted-foreground"
                  aria-label="Aksi panel artefak"
                >
                  <MoreHorizontalIcon className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>Panel artefak</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={handleCopySummary}>
                  <CopyIcon className="size-3.5" />
                  {copiedSummary ? "Ringkasan disalin" : "Salin ringkasan"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={artifacts.length === 0}
                  onSelect={handleOpenPrimaryArtifact}
                >
                  <FileTextIcon className="size-3.5" />
                  Buka artefak utama
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="size-6 rounded-[6px] text-muted-foreground"
              onClick={handleClosePanel}
              aria-label="Tutup panel artefak"
            >
              <PanelLeftIcon className="size-3.5 rotate-180" />
            </Button>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="min-h-0 overflow-x-hidden">
        <ScrollArea className="h-full">
          <div className="grid min-w-0 gap-3 px-3 pb-4 pt-1">
            {activeTab === "sources" ? (
              <SourcesReader
                sources={sources}
                sourceFocus={sourceFocus}
              />
            ) : artifacts.length === 0 ? (
              <EmptyBlock
                title="Belum ada artefak"
                body="Laporan dan dokumen kerja akan tersimpan di sini."
              />
            ) : activeArtifact ? (
              <ArtifactReader artifact={activeArtifact} />
            ) : (
              <EmptyBlock
                title="Pilih artefak"
                body="Klik kartu artefak pada respons untuk membaca isinya di sini."
              />
            )}
          </div>
        </ScrollArea>
      </SidebarContent>
    </Sidebar>
  );
}

function EmptyBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[12px] border border-border/70 bg-card p-4 text-center shadow-sm">
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{body}</p>
    </div>
  );
}

function SourcesReader({
  sources,
  sourceFocus,
}: {
  sources: ResearchSource[];
  sourceFocus: SourceFocus | null;
}) {
  const groups = useMemo(() => getSourceGroups(sources), [sources]);

  if (sources.length === 0) {
    return (
      <EmptyBlock
        title="Belum ada sources"
        body="Kandidat sumber akan muncul setelah agent menemukan evidence."
      />
    );
  }

  const treeKey = [
    sourceFocus?.type,
    sourceFocus?.type === "run" ? sourceFocus.runId : sourceFocus?.messageId,
    sources.map((source) => source._id).join("|"),
  ].join(":");

  return (
    <SourcesTable
      key={treeKey}
      groups={groups}
      sources={sources}
    />
  );
}

function SourcesTable({
  groups,
  sources,
}: {
  groups: ReturnType<typeof getSourceGroups>;
  sources: ResearchSource[];
}) {
  const [query, setQuery] = useState("");
  const rows = useMemo(
    () =>
      groups.flatMap((group) =>
        group.sources.map((source) => ({
          group,
          source,
        })),
      ),
    [groups],
  );
  const filteredRows = useMemo(
    () => filterSourceRows(rows, query),
    [query, rows],
  );
  const usageCounts = useMemo(() => countSourcesByUsage(sources), [sources]);

  return (
    <div className="rounded-[10px] border border-border/70 bg-card">
      <div className="grid gap-3 border-b border-border/70 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-foreground">
              Source provenance
            </p>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {filteredRows.length} dari {sources.length} kandidat
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(["cited", "accepted", "rejected", "candidate"] as const).map((usage) => (
              <span
                key={usage}
                className={cn(
                  "rounded-[6px] border px-2 py-1 text-[10px] font-semibold capitalize",
                  usageToneClass(usage),
                )}
              >
                {usage} {usageCounts[usage] ?? 0}
              </span>
            ))}
          </div>
        </div>
        <label className="relative block">
          <span className="sr-only">Cari source</span>
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari judul, provider, status, DOI, URL..."
            className="h-9 rounded-[8px] border-border/70 bg-background pl-8 text-[12px] shadow-none"
          />
        </label>
      </div>

      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[640px] table-fixed border-collapse text-left text-[12px]">
          <colgroup>
            <col className="w-[58%]" />
            <col className="w-[16%]" />
            <col className="w-[18%]" />
            <col className="w-[8%]" />
          </colgroup>
          <thead className="sticky top-0 bg-card text-[10px] uppercase tracking-normal text-muted-foreground">
            <tr className="border-b border-border/70">
              <th className="px-3 py-2 font-semibold">Judul</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 font-semibold">Domain</th>
              <th className="px-2 py-2 font-semibold" aria-label="Aksi" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {filteredRows.length > 0 ? (
              filteredRows.map(({ source }) => (
                <tr
                  key={source._id}
                  className="align-top transition-colors hover:bg-muted/35"
                >
                  <td className="px-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-2">
                      {sourceIcon(source)}
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-foreground">
                          {source.title}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={cn(
                      "inline-flex rounded-[6px] border px-2 py-1 text-[10px] font-semibold capitalize",
                      usageToneClass(source.usage),
                    )}>
                      {source.usage}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="block truncate font-medium text-foreground">
                      {sourceDomainLabel(source)}
                    </span>
                  </td>
                  <td className="px-2 py-2.5">
                    {source.url ? (
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex size-7 items-center justify-center rounded-[7px] text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="Buka source"
                      >
                        <ExternalLinkIcon className="size-3.5" />
                      </a>
                    ) : null}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-[12px] text-muted-foreground">
                  Tidak ada source yang cocok dengan pencarian.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function sourceIcon(source: ResearchSource) {
  const className = "size-4 shrink-0";
  if (source.origin === "arxiv" || source.origin === "doi") {
    return <BookOpenIcon className={cn(className, "text-[var(--lavender)]")} />;
  }
  if (source.provider?.includes("jina")) {
    return <SearchIcon className={cn(className, "text-primary")} />;
  }
  return <GlobeIcon className={cn(className, "text-[var(--mint)]")} />;
}

function sourceDomainLabel(source: ResearchSource) {
  const locator = source.url ?? source.locator;
  if (locator) {
    try {
      return new URL(locator).hostname.replace(/^www\./, "");
    } catch {
      return locator.replace(/^https?:\/\//, "").split("/")[0] || locator;
    }
  }
  if (source.doi) {
    return "doi.org";
  }
  if (source.arxivId) {
    return "arxiv.org";
  }
  return source.origin;
}

type SourceTableRow = {
  group: ReturnType<typeof getSourceGroups>[number];
  source: ResearchSource;
};

function filterSourceRows(rows: SourceTableRow[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return rows;
  }

  return rows.filter(({ group, source }) =>
    [
      group.label,
      source.title,
      source.locator,
      source.url,
      source.doi,
      source.arxivId,
      source.provider,
      source.origin,
      source.usage,
      source.evidenceStrength,
      source.readStatus,
      source.qualityReason,
      source.bucketName,
      source.discoveryQuery,
      source.snippet,
    ]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(needle)),
  );
}

function countSourcesByUsage(sources: ResearchSource[]) {
  return sources.reduce<Record<ResearchSource["usage"], number>>(
    (counts, source) => {
      counts[source.usage] += 1;
      return counts;
    },
    { accepted: 0, candidate: 0, cited: 0, rejected: 0 },
  );
}

function usageToneClass(usage: ResearchSource["usage"]) {
  switch (usage) {
    case "accepted":
      return "border-[var(--mint-soft-border)] bg-[var(--mint-soft)] text-[var(--mint)]";
    case "cited":
      return "border-[var(--sky-soft-border)] bg-[var(--sky-soft)] text-primary";
    case "rejected":
      return "border-[var(--coral-soft-border)] bg-[var(--coral-soft)] text-[var(--coral)]";
    case "candidate":
    default:
      return "border-border/70 bg-muted text-muted-foreground";
  }
}

function ArtifactReader({ artifact }: { artifact: ResearchArtifact }) {
  const [copied, setCopied] = useState(false);
  const version = artifact.version;
  const body = version?.body ?? "Artefak ini disimpan di storage.";
  const format = version?.contentFormat ?? "markdown";

  const copyBody = async () => {
    await navigator.clipboard.writeText(body);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(
      `${window.location.origin}${window.location.pathname}?artifact=${artifact._id}`,
    );
  };

  return (
    <article className="-mx-3 -mt-1 min-w-0 px-5 pb-8 pt-5 sm:px-7">
      <div className="mx-auto flex w-full max-w-[760px] items-start justify-between gap-4">
        <div className="min-w-0 pt-1">
          <h2 className="font-heading text-[26px] font-bold leading-tight tracking-normal text-foreground">
            {artifact.title}
          </h2>
          <p className="mt-2 text-[12px] font-medium text-muted-foreground">
            v{version?.versionNumber ?? 1} · {format}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="size-8 rounded-[7px] text-muted-foreground hover:bg-muted"
            onClick={copyBody}
            aria-label={copied ? "Tersalin" : "Salin artefak"}
          >
            {copied ? (
              <CheckIcon className="size-3.5" />
            ) : (
              <CopyIcon className="size-3.5" />
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="size-8 rounded-[7px] text-muted-foreground hover:bg-muted"
            onClick={copyLink}
            aria-label="Bagikan link"
          >
            <ExternalLinkIcon className="size-3.5" />
          </Button>
        </div>
      </div>
      <div className="mx-auto mt-8 w-full max-w-[760px] text-[16px] leading-7 text-foreground">
        {format === "html" ? (
          <iframe
            title={artifact.title}
            sandbox=""
            srcDoc={body}
            className="h-[70svh] w-full border-0 bg-white"
          />
        ) : format === "code" || format === "plain" || format === "json" ? (
          <pre className="overflow-auto border-y bg-transparent py-4 font-mono text-[13px] leading-6 text-foreground">
            <code>{body}</code>
          </pre>
        ) : (
          <ArtifactMarkdown body={body} />
        )}
      </div>
    </article>
  );
}

function ArtifactMarkdown({ body }: { body: string }) {
  return (
    <div className="aqsha-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
