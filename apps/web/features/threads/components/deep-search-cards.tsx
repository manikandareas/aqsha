"use client";

import { BookOpenIcon, ExternalLinkIcon, FileTextIcon, GlobeIcon } from "@aqsha/ui/icons";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import type { DeepSubSearch } from "../lib/timeline-types";
import type { ResearchSource } from "../types";

/**
 * Kartu sub-agen pencarian `/deep` (step `search-literature`). Satu blok per sub-pertanyaan
 * (status running/selesai) berisi grid kartu sumber. Daftar sumber di-resolve dari
 * `research_sources` (di-fetch surface) lalu dikelompokkan per `subQuestionIndex` → diteruskan
 * ke sini sebagai `sourcesBySubQ`. Pure presentation: tak fetch sendiri.
 */
export function DeepSearchCards({
  subSearches,
  sourcesBySubQ,
}: {
  subSearches: DeepSubSearch[];
  sourcesBySubQ?: Map<number, ResearchSource[]>;
}) {
  if (subSearches.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {subSearches.map((sub) => (
        <SubSearchBlock
          key={sub.index}
          sub={sub}
          sources={sourcesBySubQ?.get(sub.index) ?? []}
        />
      ))}
    </div>
  );
}

function SubSearchBlock({ sub, sources }: { sub: DeepSubSearch; sources: ResearchSource[] }) {
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
        // Daftar sumber per kartu di-scroll dalam max-h (bisa banyak per sub-pertanyaan) → beberapa
        // kartu sub-agen tetap kebaca bersamaan tanpa daftar yang memanjang tak terbatas.
        <ScrollArea
          vignette
          className="rounded-lg border bg-background"
          viewportClassName="max-h-[140px]"
        >
          <div className="flex flex-col gap-0.5">
            {sources.map((source) => (
              <SourceCard key={source.id} source={source} />
            ))}
          </div>
        </ScrollArea>
      ) : (
        <p className="text-[11px] text-muted-foreground/70">
          {running ? "Mencari sumber…" : "Belum ada sumber."}
        </p>
      )}
    </div>
  );
}

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

/** Domain (tanpa `www.`) dari url/doi — diturunkan client-side (tak disimpan di DB). */
function deriveDomain(source: ResearchSource): string | null {
  const raw = source.url ?? (source.doi ? `https://doi.org/${source.doi}` : null);
  if (!raw) return null;
  try {
    return new URL(raw).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Favicon Google s2 dari domain (pola yang sama dengan discovery/source-link-row). */
function faviconUrl(domain: string | null): string | null {
  return domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64` : null;
}

/**
 * Satu sumber sebagai BARIS TUNGGAL ringkas (daftar tautan rapat, tanpa border): logo kecil di kiri
 * (OG image → favicon → ikon origin) lalu judul (truncate) + badge `[n]` + afordans outbound di kanan.
 * Logo dirender via CSS `background-image` (bukan `next/image`) — URL eksternal sembarang aman tanpa
 * `remotePatterns` dan kegagalan muat luruh anggun ke latar muted. Domain tampil di `title` (tooltip).
 */
function SourceCard({ source }: { source: ResearchSource }) {
  const { Icon, label } = originMeta(source.origin);
  const domain = deriveDomain(source);
  const favicon = faviconUrl(domain);
  const href = source.url ?? (source.doi ? `https://doi.org/${source.doi}` : null);

  const row = (
    <span className="flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors group-hover:bg-muted/50">
      {/* Logo kecil: OG image → favicon → ikon origin. */}
      <span
        aria-hidden
        className="flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-[4px] bg-muted bg-cover bg-center"
        style={source.imageUrl ? { backgroundImage: `url("${source.imageUrl}")` } : undefined}
      >
        {source.imageUrl ? null : favicon ? (
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
