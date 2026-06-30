"use client";

import { ExternalLinkIcon } from "@aqsha/ui/icons";
import {
  faviconUrl,
  originMeta,
  sourceDomain,
  sourceHref,
} from "@/features/threads/lib/source-card";
import type { SourceCardData } from "@/features/threads/lib/timeline-types";

/**
 * Source list inside a detail panel — each item opens its own URL in a new tab. Shared
 * by the message-sources, search-step, and step panels (sources never open an in-app
 * detail; they link out).
 */
export function SourceLinkList({ sources }: { sources: SourceCardData[] }) {
  if (sources.length === 0) {
    return <p className="text-[13px] text-muted-foreground">Belum ada sumber.</p>;
  }
  return (
    <div className="grid gap-1.5">
      {sources.map((source) => (
        <SourceLinkRow key={source.key} source={source} />
      ))}
    </div>
  );
}

function SourceLinkRow({ source }: { source: SourceCardData }) {
  const { Icon, label } = originMeta(source.origin);
  const domain = sourceDomain(source);
  const favicon = faviconUrl(domain);
  const href = sourceHref(source);

  const body = (
    <span className="flex min-w-0 flex-1 items-start gap-2.5">
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
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 break-words text-[12px] text-foreground leading-5">
          {source.title}
        </span>
        {source.snippet ? (
          // Panel = tampilan detail penuh: snippet tak di-clamp (preview inline yang memendekkannya).
          <span className="mt-0.5 break-words text-[11px] text-muted-foreground leading-5">
            {source.snippet}
          </span>
        ) : null}
        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground/70">
          {domain ?? label}
        </span>
      </span>
    </span>
  );

  if (!href) {
    return <div className="flex rounded-lg border bg-card px-3 py-2">{body}</div>;
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {body}
      <ExternalLinkIcon className="size-3.5 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-muted-foreground" />
    </a>
  );
}
