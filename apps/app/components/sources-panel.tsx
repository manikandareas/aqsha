"use client";

import {
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  FileTextIcon,
  LibraryIcon,
  SearchIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
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

export function SourcesPanel({
  sources,
  activeCitation,
  onClose,
}: {
  sources: ResearchSource[];
  activeCitation: number | null;
  onClose?: () => void;
}) {
  const sorted = useMemo(
    () => [...sources].sort((a, b) => a.citationNumber - b.citationNumber),
    [sources],
  );
  const refs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!activeCitation) {
      return;
    }
    refs.current[activeCitation]?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [activeCitation]);

  return (
    <aside className="flex h-full min-h-0 flex-col border-l bg-card/78 backdrop-blur max-lg:fixed max-lg:inset-x-3 max-lg:bottom-3 max-lg:z-40 max-lg:max-h-[72svh] max-lg:rounded-[14px] max-lg:border max-lg:shadow-aqsha lg:w-[360px]">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <LibraryIcon className="size-4 text-[var(--mint)]" />
          <h2 className="truncate font-heading text-base font-bold">Sources</h2>
        </div>
        {onClose ? (
          <Button variant="ghost" size="sm" onClick={onClose}>
            Tutup
          </Button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {sorted.map((source) => (
          <SourceCard
            key={source._id}
            source={source}
            isActive={source.citationNumber === activeCitation}
            refSetter={(node) => {
              refs.current[source.citationNumber] = node;
            }}
          />
        ))}
      </div>
    </aside>
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
        "rounded-[8px] border bg-background/78 p-3 transition-colors",
        isActive && "border-[var(--mint)] bg-[var(--mint-soft)]",
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-7 shrink-0 place-items-center rounded-full border border-[var(--mint-soft-border)] bg-[var(--mint-soft)] font-mono text-xs font-semibold text-[var(--mint)]">
            {source.citationNumber}
          </span>
          <OriginChip origin={source.origin} />
        </div>
        <EvidenceChip strength={source.evidenceStrength} />
      </div>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="block w-full text-left"
      >
        <h3 className="line-clamp-2 text-sm font-semibold leading-5">
          {source.title}
        </h3>
        <p className="mt-1 break-all font-mono text-[11px] leading-4 text-muted-foreground">
          {source.doi ?? source.arxivId ?? source.url ?? source.locator}
        </p>
      </button>
      <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">
        {expanded ? source.snippet : clamp(source.snippet, 220)}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {source.url ? (
          <Button asChild variant="outline" size="sm" className="h-8">
            <a href={source.url} target="_blank" rel="noreferrer">
              <ExternalLinkIcon className="size-3.5" />
              Buka sumber
            </a>
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          onClick={handleCopy}
        >
          {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
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
    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--mint-soft-border)] bg-[var(--mint-soft)] px-2 py-1 text-[11px] font-semibold text-[var(--mint)]">
      <Icon className="size-3" />
      {label}
    </span>
  );
}

function EvidenceChip({ strength }: { strength: ResearchSource["evidenceStrength"] }) {
  const weak = strength === "weak";
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-1 text-[11px] font-semibold",
        weak
          ? "border-[var(--lemon-soft-border)] bg-[var(--lemon-soft)] text-[var(--lemon)]"
          : "border-[var(--mint-soft-border)] bg-[var(--mint-soft)] text-[var(--mint)]",
      )}
    >
      {weak ? "Weak evidence" : strength === "strong" ? "Strong" : "Medium"}
    </span>
  );
}

function clamp(value: string, max: number) {
  return value.length <= max ? value : `${value.slice(0, max - 3)}...`;
}
