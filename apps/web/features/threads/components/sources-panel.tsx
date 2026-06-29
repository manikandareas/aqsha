"use client";

import {
  ArrowUpRightIcon,
  BookOpenIcon,
  ChevronDownIcon,
  FileTextIcon,
  GlobeIcon,
  Link2Icon,
} from "@aqsha/ui/icons";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useMemo } from "react";
import type { SourceCardData } from "../lib/timeline-types";

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

function SourceRow({ source }: { source: SourceCardData }) {
  const { Icon, label } = originMeta(source.origin);
  const href = source.url ?? (source.doi ? `https://doi.org/${source.doi}` : null);
  const body = (
    <div className="flex gap-2.5">
      {source.citationNumber != null ? (
        <span className="mt-0.5 shrink-0 font-medium text-[11px] text-muted-foreground tabular-nums">
          [{source.citationNumber}]
        </span>
      ) : null}
      <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate font-medium text-xs">{source.title}</p>
          {href ? <ArrowUpRightIcon className="size-3 shrink-0 text-muted-foreground" /> : null}
        </div>
        {source.snippet ? (
          <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{source.snippet}</p>
        ) : null}
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
 * Daftar sumber inline per-turn (collapsible "N sumber") — ditampilkan tepat di bawah jawaban yang
 * menghasilkannya. Sumber = bukti yang dikumpulkan tool Astra (`search_web`/`search_arxiv`/dst.).
 * Pure: pemanggil menyiapkan kartu (agregasi hasil tool untuk chat normal, atau `research_sources`
 * bernomor `[n]` untuk deep). Kosong → tak render.
 */
export function InlineSources({
  sources,
  className,
}: {
  sources: SourceCardData[];
  className?: string;
}) {
  // Urut sesuai nomor sitasi [n] (yang belum bernomor di belakang) supaya cocok urutan prosa.
  // useMemo sebelum early-return (rules-of-hooks) → sort hanya saat `sources` berubah, bukan tiap render.
  const sorted = useMemo(
    () =>
      [...sources].sort(
        (a, b) =>
          (a.citationNumber ?? Number.MAX_SAFE_INTEGER) - (b.citationNumber ?? Number.MAX_SAFE_INTEGER),
      ),
    [sources],
  );
  if (sorted.length === 0) return null;
  return (
    <Collapsible className={cn("min-w-0", className)}>
      <CollapsibleTrigger className="group flex items-center gap-1.5 text-left text-muted-foreground text-xs transition-colors hover:text-foreground">
        <Link2Icon className="size-3.5 shrink-0" />
        <span className="font-medium">{sorted.length} sumber</span>
        <ChevronDownIcon className="size-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden">
        <div className="mt-2 flex flex-col gap-1.5">
          {sorted.map((source) => (
            <SourceRow key={source.key} source={source} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
