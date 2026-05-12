"use client";

import {
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  FileTextIcon,
  MoreHorizontalIcon,
  PanelLeftIcon,
  SearchIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

export type ResearchSource = {
  _id: string;
  messageId?: string;
  runId?: string;
  artifactId?: string;
  citationNumber: number;
  origin: "corpus" | "web" | "arxiv" | "doi";
  evidenceStrength: "strong" | "medium" | "weak";
  title: string;
  locator: string;
  url?: string;
  doi?: string;
  arxivId?: string;
  snippet: string;
};

type ResearchArtifact = {
  _id: string;
  type:
    | "research_report"
    | "markdown_report"
    | "research_document"
    | "source_bundle"
    | "citation_evidence_view"
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

export function ResearchSidebar({
  threadTitle,
  sources,
  artifacts = [],
  activeArtifact,
  activeTab,
  activeCitation,
  onTabChange,
  onOpenArtifact,
  onClosePanel,
}: {
  threadTitle?: string;
  sources: ResearchSource[];
  artifacts?: ResearchArtifact[];
  activeArtifact?: ResearchArtifact | null;
  activeTab: "sources" | "artifacts";
  activeCitation: number | null;
  onTabChange: (tab: "sources" | "artifacts") => void;
  onOpenArtifact?: (artifactId: string) => void;
  onClosePanel: () => void;
}) {
  const [copiedSummary, setCopiedSummary] = useState(false);
  const { setOpenMobile } = useSidebar();

  const sorted = useMemo(
    () => [...sources].sort((a, b) => a.citationNumber - b.citationNumber),
    [sources],
  );
  const refs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!activeCitation) return;
    refs.current[activeCitation]?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [activeCitation]);

  const handleCopySummary = async () => {
    const sourceLines = sorted.map(
      (source) =>
        `[${source.citationNumber}] ${source.title} - ${
          source.url ?? source.doi ?? source.arxivId ?? source.locator
        }`,
    );
    const artifactLines = artifacts.map((artifact) => `- ${artifact.title}`);
    const panelSummary = [
      threadTitle ?? "Research thread",
      "",
      `${sources.length} sumber`,
      ...sourceLines,
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
    onTabChange("artifacts");
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
            <HeaderTabButton
              active={activeTab === "sources"}
              onClick={() => onTabChange("sources")}
              label="Sumber"
              count={sources.length}
            />
            <HeaderTabButton
              active={activeTab === "artifacts"}
              onClick={() => onTabChange("artifacts")}
              label="Artefak"
              count={artifacts.length}
            />
          </div>
          <div className="flex items-center gap-0.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="size-6 rounded-[6px] text-muted-foreground"
                  aria-label="Aksi panel riset"
                >
                  <MoreHorizontalIcon className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>Panel riset</DropdownMenuLabel>
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
              aria-label="Tutup panel riset"
            >
              <PanelLeftIcon className="size-3.5 rotate-180" />
            </Button>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="min-h-0 overflow-x-hidden">
        <ScrollArea className="h-full">
          <div className="grid min-w-0 gap-3 px-3 pb-4 pt-1">
            {activeTab === "sources"
              ? renderSources()
              : renderArtifacts()}
          </div>
        </ScrollArea>
      </SidebarContent>
    </Sidebar>
  );

  function renderSources() {
    if (sorted.length === 0) {
      return (
        <EmptyBlock
          title="Belum ada sumber"
          body="Sumber akan muncul saat Aqsha menemukan kutipan yang relevan."
        />
      );
    }
    return sorted.map((source) => (
      <SourceCard
        key={source._id}
        source={source}
        isActive={source.citationNumber === activeCitation}
        refSetter={(node) => {
          refs.current[source.citationNumber] = node;
        }}
      />
    ));
  }

  function renderArtifacts() {
    if (artifacts.length === 0) {
      return (
        <EmptyBlock
          title="Belum ada artefak"
          body="Laporan dan evidence view akan tersimpan di sini."
        />
      );
    }
    return (
      <>
        {activeArtifact ? (
          <ArtifactReader
            artifact={activeArtifact}
          />
        ) : (
          <EmptyBlock
            title="Pilih artefak"
            body="Klik kartu artefak pada respons untuk membaca isinya di sini."
          />
        )}
      </>
    );
  }
}

function HeaderTabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-7 min-w-0 items-center gap-1.5 rounded-[7px] px-2 text-[12px] font-semibold transition-colors",
        active
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
      )}
    >
      <span className="truncate">{label}</span>
      <span
        className={cn(
          "inline-flex min-w-4 items-center justify-center rounded-[6px] px-1.5 py-0.5 text-[10px] font-semibold",
          active
            ? "bg-[var(--sky-soft)] text-primary"
            : "bg-muted text-muted-foreground",
        )}
      >
        {count}
      </span>
    </button>
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

function ArtifactReader({
  artifact,
}: {
  artifact: ResearchArtifact;
}) {
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
            aria-label={copied ? "Tersalin" : "Salin markdown"}
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
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
            >
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

function SourceCard({
  source,
  isActive,
  refSetter,
}: {
  source: ResearchSource;
  isActive: boolean;
  refSetter: (node: HTMLDivElement | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const citationText = `${source.title} ${source.url ?? source.doi ?? source.locator}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(citationText.trim());
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <article
      ref={refSetter}
      className={cn(
        "min-w-0 overflow-hidden rounded-[12px] border border-border/70 bg-card shadow-sm transition-colors hover:border-[var(--mint-soft-border)] hover:bg-muted/45",
        isActive && "border-[var(--mint-soft-border)] bg-[var(--mint-soft)] ring-1 ring-[var(--mint-soft-border)]",
      )}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-6 shrink-0 place-items-center rounded-[7px] border border-[var(--mint-soft-border)] bg-[var(--mint-soft)] font-mono text-[11px] font-semibold text-[var(--mint)]">
            {source.citationNumber}
          </span>
          <OriginChip origin={source.origin} />
        </div>
        <EvidenceChip strength={source.evidenceStrength} />
      </div>
      <div className="p-3">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="block w-full min-w-0 text-left"
        >
          <h3 className="line-clamp-2 break-words text-[13px] font-semibold leading-5 [overflow-wrap:anywhere]">
            {source.title}
          </h3>
          <p className="mt-1 break-all font-mono text-[11px] leading-4 text-muted-foreground [overflow-wrap:anywhere]">
            {source.doi ?? source.arxivId ?? source.url ?? source.locator}
          </p>
        </button>
        <p className="mt-3 border-l-2 border-[var(--lemon-soft-border)] bg-[var(--lemon-soft)] px-3 py-2 text-[13px] leading-6 text-[var(--ink-soft)] [overflow-wrap:anywhere]">
          {expanded ? source.snippet : clamp(source.snippet, 220)}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {source.url ? (
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-7 text-[12px]"
            >
              <a href={source.url} target="_blank" rel="noreferrer">
                <ExternalLinkIcon className="size-3" />
                Buka sumber
              </a>
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-[12px]"
            onClick={handleCopy}
          >
            {copied ? (
              <CheckIcon className="size-3" />
            ) : (
              <CopyIcon className="size-3" />
            )}
            Salin kutipan
          </Button>
        </div>
      </div>
    </article>
  );
}

function OriginChip({ origin }: { origin: ResearchSource["origin"] }) {
  const label = {
    corpus: "Corpus",
    web: "Web",
    arxiv: "arXiv",
    doi: "DOI",
  }[origin];
  const Icon = origin === "web" ? SearchIcon : FileTextIcon;
  return (
    <span className="inline-flex items-center gap-1 rounded-[7px] border border-[var(--mint-soft-border)] bg-[var(--mint-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--mint)]">
      <Icon className="size-3" />
      {label}
    </span>
  );
}

function EvidenceChip({ strength }: { strength: ResearchSource["evidenceStrength"] }) {
  const weak = strength === "weak";
  const label = weak ? "Lemah" : strength === "strong" ? "Kuat" : "Cukup";
  return (
    <span
      className={cn(
        "rounded-[7px] border px-2 py-0.5 text-[11px] font-semibold",
        weak
          ? "border-[var(--lemon-soft-border)] bg-[var(--lemon-soft)] text-[var(--lemon)]"
          : "border-[var(--mint-soft-border)] bg-[var(--mint-soft)] text-[var(--mint)]",
      )}
    >
      {label}
    </span>
  );
}

function clamp(value: string, max: number) {
  return value.length <= max ? value : `${value.slice(0, max - 3)}...`;
}
