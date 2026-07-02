"use client";

import { ChevronDownIcon, ExternalLinkIcon } from "@aqsha/ui/icons";
import type { ComponentType } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  faviconUrl,
  originMeta,
  sourceDomain,
  sourceHref,
} from "@/features/threads/lib/source-card";
import type { SourceCardData } from "@/features/threads/lib/timeline-types";
import { cn } from "@/lib/utils";

/**
 * Source list inside a detail panel — shared by the message-sources, search-step, and step
 * panels. Tiap item = kartu collapsible kompak: header (favicon + judul 1 baris + domain)
 * dengan chevron; snippet + judul penuh baru tampil saat dibuka. Tautan keluar = ikon
 * terpisah di kanan header (bukan seluruh kartu) supaya tak bertabrakan dengan toggle.
 * Anti-overflow: `min-w-0` di tiap lapis flex + `[overflow-wrap:anywhere]` untuk token
 * panjang tanpa spasi (URL/DOI di snippet).
 */
export function SourceLinkList({ sources }: { sources: SourceCardData[] }) {
  if (sources.length === 0) {
    return <p className="text-[13px] text-muted-foreground">Belum ada sumber.</p>;
  }
  return (
    <div className="grid min-w-0 gap-1.5">
      {sources.map((source) => (
        <SourceLinkRow key={source.key} source={source} />
      ))}
    </div>
  );
}

function Favicon({ favicon, Icon }: { favicon: string | null; Icon: ComponentType<{ className?: string }> }) {
  return (
    <span
      aria-hidden
      className="mt-0.5 flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-[4px] bg-muted"
    >
      {favicon ? (
        <span
          className="size-3 bg-cover bg-center"
          style={{ backgroundImage: `url("${favicon}")` }}
        />
      ) : (
        <Icon className="size-2.5 text-muted-foreground" />
      )}
    </span>
  );
}

function SourceLinkRow({ source }: { source: SourceCardData }) {
  const { Icon, label } = originMeta(source.origin);
  const domain = sourceDomain(source);
  const favicon = faviconUrl(domain);
  const href = sourceHref(source);
  // Tanpa detail tambahan (snippet), collapsible tak berguna — render baris statis.
  const collapsible = Boolean(source.snippet);

  const heading = (
    <span className="min-w-0 flex-1">
      <span className="block truncate text-[12px] text-foreground leading-5">
        {source.title}
      </span>
      <span className="block truncate text-[11px] text-muted-foreground/70 leading-4">
        {domain ?? label}
      </span>
    </span>
  );

  const openLink = href ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Buka sumber di tab baru"
      className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-muted hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ExternalLinkIcon className="size-3.5" />
    </a>
  ) : null;

  if (!collapsible) {
    return (
      <div className="flex min-w-0 items-start gap-2.5 rounded-lg border bg-card py-2 pr-2 pl-3">
        <Favicon favicon={favicon} Icon={Icon} />
        {heading}
        {openLink}
      </div>
    );
  }

  return (
    <Collapsible className="min-w-0 overflow-hidden rounded-lg border bg-card">
      <div className="flex min-w-0 items-start gap-1 py-2 pr-2 pl-3">
        <CollapsibleTrigger
          className={cn(
            "group -my-2 flex min-w-0 flex-1 items-start gap-2.5 py-2 text-left",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <Favicon favicon={favicon} Icon={Icon} />
          {heading}
          <ChevronDownIcon className="mt-1 size-3.5 shrink-0 text-muted-foreground/50 transition-transform group-hover:text-muted-foreground group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        {openLink}
      </div>
      <CollapsibleContent>
        <div className="min-w-0 border-t px-3 py-2">
          {/* Judul penuh (header meng-truncate ke 1 baris). */}
          <p className="break-words text-[12px] text-foreground leading-5 [overflow-wrap:anywhere]">
            {source.title}
          </p>
          <p className="mt-1 break-words text-[11px] text-muted-foreground leading-5 [overflow-wrap:anywhere]">
            {source.snippet}
          </p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
