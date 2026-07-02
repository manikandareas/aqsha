"use client";

import { ExternalLinkIcon } from "@aqsha/ui/icons";
import { Spinner } from "@/components/ui/spinner";
import {
  faviconUrl,
  originMeta,
  researchSourceToCard,
  sourceDomain,
  sourceHref,
} from "../lib/source-card";
import type { DeepSubSearch, SourceCardData } from "../lib/timeline-types";
import type { ResearchSource } from "../types";
import { useMessageInteractions } from "./message-interactions";
import { ScrollDetailTrigger } from "./scroll-detail-trigger";

/**
 * Kartu sub-agen pencarian `/deep` (step `search-literature`). Satu blok per sub-pertanyaan
 * (status running/selesai) berisi daftar kartu sumber sebagai PREVIEW. Daftar tak di-scroll inline:
 * di-bungkus `ScrollDetailTrigger` → klik membuka panel langkah pencarian (sumber → URL). Sumber
 * di-resolve LIVE dari yang dipancarkan step (`sub.sources`); fallback ke `research_sources` (DB,
 * di-join `subQuestionIndex`). Pure presentation: tak fetch sendiri.
 */
export function DeepSearchCards({
  subSearches,
  sourcesBySubQ,
  turnId,
}: {
  subSearches: DeepSubSearch[];
  sourcesBySubQ?: Map<number, ResearchSource[]>;
  /** Run id `/deep` pesan ini — men-scope panel pencarian per-run (klik buka detail run yang benar). */
  turnId?: string;
}) {
  if (subSearches.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {subSearches.map((sub) => (
        <SubSearchBlock
          key={sub.index}
          sub={sub}
          turnId={turnId}
          sources={sub.sources ?? (sourcesBySubQ?.get(sub.index) ?? []).map(researchSourceToCard)}
        />
      ))}
    </div>
  );
}

function SubSearchBlock({
  sub,
  sources,
  turnId,
}: {
  sub: DeepSubSearch;
  sources: SourceCardData[];
  turnId?: string;
}) {
  const { openSearch } = useMessageInteractions();
  const running = sub.status === "running" || sub.status === "pending";
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 items-start gap-1.5">
        {running ? (
          <Spinner className="mt-0.5 size-3.5 shrink-0 text-primary" />
        ) : (
          <span className="mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] text-muted-foreground tabular-nums">
            {sub.index + 1}
          </span>
        )}
        <p className="min-w-0 break-words font-medium text-[12px] text-foreground leading-5">
          {sub.subQuestion}
        </p>
      </div>
      {sources.length > 0 ? (
        <ScrollDetailTrigger
          onOpen={openSearch && turnId ? () => openSearch(turnId, sub.index) : undefined}
        >
          <SourceCardList sources={sources} />
        </ScrollDetailTrigger>
      ) : (
        <p className="text-[11px] text-muted-foreground/70">
          {running ? "Mencari sumber…" : "Belum ada sumber."}
        </p>
      )}
    </div>
  );
}

/**
 * Daftar kartu sumber ringkas (preview) — dipakai blok sub-agen `/deep` dan body tool-row
 * `search_*` chat normal, keduanya di dalam `ScrollDetailTrigger` (cap + buka panel). Tanpa
 * ScrollArea sendiri: tinggi dibatasi oleh trigger.
 */
export function SourceCardList({ sources }: { sources: SourceCardData[] }) {
  if (sources.length === 0) return null;
  return (
    <div className="flex flex-col gap-0.5 p-1">
      {sources.map((source) => (
        <SourceCard key={source.key} source={source} />
      ))}
    </div>
  );
}

/**
 * Satu sumber sebagai BARIS TUNGGAL ringkas: logo kecil (favicon → ikon origin) + judul (truncate)
 * + badge `[n]` opsional + afordans outbound. Di dalam `ScrollDetailTrigger` baris ini non-interaktif
 * (preview); klik membuka panel. Berdiri sendiri (mis. tanpa trigger) tetap tautan keluar.
 */
function SourceCard({ source }: { source: SourceCardData }) {
  const { Icon, label } = originMeta(source.origin);
  const domain = sourceDomain(source);
  const favicon = faviconUrl(domain);
  const href = sourceHref(source);

  const row = (
    <span className="flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors group-hover:bg-muted/50">
      <span
        aria-hidden
        className="flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-[4px] bg-muted"
      >
        {favicon ? (
          <span className="size-3 bg-cover bg-center" style={{ backgroundImage: `url("${favicon}")` }} />
        ) : (
          <Icon className="size-2.5 text-muted-foreground" />
        )}
      </span>
      <span className="min-w-0 flex-1 truncate text-[12px] text-foreground leading-5">
        {source.title}
      </span>
      {source.citationNumber != null ? (
        <span className="shrink-0 font-medium text-[10px] text-muted-foreground tabular-nums">
          [{source.citationNumber}]
        </span>
      ) : null}
      {href ? (
        <ExternalLinkIcon className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      ) : null}
    </span>
  );

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title={domain ?? label}
        className="group block min-w-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {row}
      </a>
    );
  }
  return (
    <span className="group block min-w-0" title={domain ?? label}>
      {row}
    </span>
  );
}
