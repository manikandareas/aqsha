"use client";

import { ArrowUpRightIcon, BookOpenIcon, FileTextIcon, GlobeIcon } from "@aqsha/ui/icons";
import { useThreadSources } from "../api";
import type { ResearchSource } from "../types";

/** Ikon + label per kelas sumber. */
function originMeta(origin: string): { Icon: typeof GlobeIcon; label: string } {
  switch (origin) {
    case "arxiv":
      return { Icon: FileTextIcon, label: "arXiv" };
    case "doi":
      return { Icon: BookOpenIcon, label: "Makalah" };
    default:
      return { Icon: GlobeIcon, label: "Web" };
  }
}

function SourceRow({ source }: { source: ResearchSource }) {
  const { Icon, label } = originMeta(source.origin);
  const href = source.url ?? (source.doi ? `https://doi.org/${source.doi}` : null);
  const body = (
    <div className="flex gap-2.5">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate font-medium text-xs">{source.title}</p>
          {href ? <ArrowUpRightIcon className="size-3 shrink-0 text-muted-foreground" /> : null}
        </div>
        <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{source.snippet}</p>
        <span className="mt-1 inline-block text-[10px] text-muted-foreground/70">{label}</span>
      </div>
    </div>
  );
  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-lg border bg-card px-3 py-2 transition-colors hover:bg-muted/40"
    >
      {body}
    </a>
  ) : (
    <div className="rounded-lg border bg-card px-3 py-2">{body}</div>
  );
}

/**
 * Panel Sources (Slice 6.4) — daftar bukti yang dikumpulkan tool riset Astra
 * (`search_web`/`search_arxiv`/`search_papers`/`lookup_doi`), dipersist per thread
 * (`research_sources`) sehingga tetap tampil saat reload history. Disembunyikan
 * bila kosong.
 */
export function SourcesPanel({ threadId, enabled = true }: { threadId: string; enabled?: boolean }) {
  const sources = useThreadSources(threadId, enabled);
  const items = sources.data ?? [];
  if (items.length === 0) return null;

  return (
    <section className="mt-6 border-t pt-4">
      <h2 className="mb-2 font-medium text-muted-foreground text-xs">Sumber ({items.length})</h2>
      <div className="flex flex-col gap-1.5">
        {items.map((source) => (
          <SourceRow key={source.id} source={source} />
        ))}
      </div>
    </section>
  );
}
