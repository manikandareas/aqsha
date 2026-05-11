"use client";

import {
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  FileTextIcon,
  SearchIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

export type ResearchSource = {
  _id: string;
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
    | "markdown_report"
    | "research_document"
    | "source_bundle"
    | "citation_evidence_view";
  title: string;
  createdAt: number;
};

export function ResearchSidebar({
  threadTitle,
  sources,
  artifacts = [],
  activeArtifactId,
  activeCitation,
  onOpenArtifact,
}: {
  threadTitle?: string;
  sources: ResearchSource[];
  artifacts?: ResearchArtifact[];
  activeArtifactId?: string | null;
  activeCitation: number | null;
  onOpenArtifact?: (artifactId: string) => void;
}) {
  const [tab, setTab] = useState<"sources" | "artifacts">(
    sources.length > 0 ? "sources" : "artifacts",
  );

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

  return (
    <Sidebar
      side="right"
      collapsible="offcanvas"
      className="overflow-hidden bg-card [&_[data-slot=sidebar-container]]:border-l [&_[data-slot=sidebar-inner]]:bg-card"
    >
      <SidebarHeader className="gap-3 border-b border-sidebar-border/80 p-4">
        <div className="grid gap-1">
          <span className="text-[11px] font-semibold text-muted-foreground">
            Panel riset
          </span>
          <h2 className="truncate font-heading text-base font-bold">
            {threadTitle ?? "Panel riset"}
          </h2>
        </div>
        <div className="flex gap-1 border-b border-transparent">
          <TabButton
            active={tab === "sources"}
            onClick={() => setTab("sources")}
            label="Sumber"
            count={sources.length}
          />
          <TabButton
            active={tab === "artifacts"}
            onClick={() => setTab("artifacts")}
            label="Artefak"
            count={artifacts.length}
          />
        </div>
      </SidebarHeader>

      <SidebarContent className="min-h-0 overflow-x-hidden">
        <ScrollArea className="h-full">
          <div className="grid min-w-0 gap-3 p-3">
            {tab === "sources" ? (
              sorted.length === 0 ? (
                <EmptyBlock
                  title="Belum ada sumber"
                  body="Sumber akan muncul saat Aqsha menemukan kutipan yang relevan."
                />
              ) : (
                sorted.map((source) => (
                  <SourceCard
                    key={source._id}
                    source={source}
                    isActive={source.citationNumber === activeCitation}
                    refSetter={(node) => {
                      refs.current[source.citationNumber] = node;
                    }}
                  />
                ))
              )
            ) : artifacts.length === 0 ? (
              <EmptyBlock
                title="Belum ada artefak"
                body="Laporan dan evidence view akan tersimpan di sini."
              />
            ) : (
              artifacts.map((artifact) => (
                <ArtifactCard
                  key={artifact._id}
                  artifact={artifact}
                  active={artifact._id === activeArtifactId}
                  onOpen={() => onOpenArtifact?.(artifact._id)}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </SidebarContent>
    </Sidebar>
  );
}

function TabButton({
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
        "flex items-center gap-2 border-b-2 px-3 pb-2.5 pt-1 text-[13px] font-semibold transition-colors",
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      <span
        className={cn(
          "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
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
    <div className="rounded-[8px] border border-dashed bg-muted/30 p-4 text-center">
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{body}</p>
    </div>
  );
}

function ArtifactCard({
  artifact,
  active,
  onOpen,
}: {
  artifact: ResearchArtifact;
  active: boolean;
  onOpen: () => void;
}) {
  const label = {
    markdown_report: "Laporan",
    research_document: "Dokumen",
    source_bundle: "Bundel sumber",
    citation_evidence_view: "Evidence",
  }[artifact.type];
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "block w-full min-w-0 overflow-hidden rounded-[10px] border bg-background/60 p-3 text-left transition-colors hover:border-[var(--lavender-soft-border)]",
        active && "border-[var(--lavender)] bg-[var(--lavender-soft)]",
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <FileTextIcon className="size-3.5 text-[var(--lavender)]" />
        <span className="rounded-full border border-[var(--lavender-soft-border)] bg-[var(--lavender-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--lavender)]">
          {label}
        </span>
      </div>
      <h3 className="line-clamp-2 text-[13px] font-semibold leading-5">
        {artifact.title}
      </h3>
    </button>
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
        "min-w-0 overflow-hidden rounded-[10px] border bg-background/60 p-3 transition-colors",
        isActive && "border-[var(--mint)] bg-[var(--mint-soft)]",
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-6 shrink-0 place-items-center rounded-full border border-[var(--mint-soft-border)] bg-[var(--mint-soft)] font-mono text-[11px] font-semibold text-[var(--mint)]">
            {source.citationNumber}
          </span>
          <OriginChip origin={source.origin} />
        </div>
        <EvidenceChip strength={source.evidenceStrength} />
      </div>
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
      <p className="mt-3 break-words text-[13px] leading-6 text-[var(--ink-soft)] [overflow-wrap:anywhere]">
        {expanded ? source.snippet : clamp(source.snippet, 220)}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {source.url ? (
          <Button asChild variant="outline" size="sm" className="h-7 text-[12px]">
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
          {copied ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
          Salin kutipan
        </Button>
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
    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--mint-soft-border)] bg-[var(--mint-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--mint)]">
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
        "rounded-full border px-2 py-0.5 text-[11px] font-semibold",
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
