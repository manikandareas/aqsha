"use client";

import {
  ExternalLinkIcon,
  FileDownIcon,
  Loader2Icon,
  MessageSquareIcon,
  ThumbsDownIcon,
} from "@aqsha/ui/icons";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { feedDetailHref, kindLabel, kindPanelClass, type DiscoveryItem } from "../model";
import { buildSourceLine, formatCitationCount, topicBadgeClass } from "../format";
import { CardProps, CardSaveButton, IconButton, RetractionFlag } from "./discovery-item-card";

const thumbnailLayouts = ["grid", "split", "figure", "columns", "dense"] as const;

export function DiscoveryListItem({ item, index, busy, handlers }: CardProps & { index: number }) {
  const isPaper = item.kind === "paper";
  const tldr = item.tldr ?? item.summary;
  const citationLabel = isPaper ? formatCitationCount(item.citedByCount) : null;
  const detailHref = feedDetailHref(item);

  return (
    <article className="group grid grid-cols-[72px_minmax(0,1fr)] gap-4 py-4 sm:grid-cols-[76px_minmax(0,1fr)_auto] sm:gap-5">
      {detailHref ? (
        <Link href={detailHref} className="mt-0.5 block" aria-label={item.title}>
          <ListThumbnail item={item} index={index} />
        </Link>
      ) : (
        <div className="mt-0.5">
          <ListThumbnail item={item} index={index} />
        </div>
      )}

      <div className="min-w-0 overflow-hidden">
        <h2 className="text-[15px] font-semibold leading-[1.2] text-foreground sm:text-[16px]">
          {detailHref ? (
            <Link
              href={detailHref}
              className="line-clamp-2 break-words underline-offset-3 hover:underline focus-visible:underline focus:outline-none"
            >
              {item.title}
            </Link>
          ) : (
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="line-clamp-2 break-words underline-offset-3 hover:underline focus-visible:underline focus:outline-none"
            >
              {item.title}
            </a>
          )}
        </h2>

        <p className="mt-1.5 line-clamp-1 text-[12px] font-medium leading-none text-muted-foreground">
          {buildSourceLine(item)}
        </p>

        {tldr ? (
          <p className="mt-2.5 line-clamp-2 max-w-[860px] break-words text-[13px] font-medium leading-5 text-ink-soft">
            {tldr}
          </p>
        ) : null}

        <RetractionFlag item={item} />

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {item.topics[0] ? (
            <span
              className={cn(
                "inline-flex h-5 items-center rounded-[4px] px-2 text-[11px] font-semibold leading-none",
                topicBadgeClass(item.topics[0]),
              )}
            >
              {item.topics[0]}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => handlers.onAskAstra(item)}
            disabled={busy}
            className="inline-flex h-7 items-center gap-1.5 rounded-[7px] bg-primary px-2.5 text-[12px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
          >
            {busy ? <Loader2Icon className="size-3.5 animate-spin" /> : <MessageSquareIcon className="size-3.5" />}
            Tanya Astra
          </button>
          {isPaper && item.pdfUrl ? (
            <a
              href={item.pdfUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-7 items-center gap-1 rounded-[7px] px-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <FileDownIcon className="size-3.5" /> PDF
            </a>
          ) : null}
        </div>
      </div>

      <div className="col-start-2 flex min-w-0 items-center justify-between gap-2 sm:col-start-auto sm:flex-col sm:items-end sm:justify-center sm:gap-3">
        <div className="flex shrink-0 items-center gap-1">
          <CardSaveButton item={item} handlers={handlers} />
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex size-7 items-center justify-center rounded-[7px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Buka sumber"
          >
            <ExternalLinkIcon className="size-4" />
          </a>
          <IconButton label="Tidak relevan" onClick={() => handlers.onHide(item)}>
            <ThumbsDownIcon className="size-4" />
          </IconButton>
        </div>
        {citationLabel ? (
          <p className="max-w-full truncate whitespace-nowrap text-[12px] font-semibold text-muted-foreground">
            {citationLabel}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function ListThumbnail({ item, index }: { item: DiscoveryItem; index: number }) {
  if (item.kind === "paper") {
    return <PaperThumbnail layout={thumbnailLayouts[index % thumbnailLayouts.length]} />;
  }
  if (item.kind === "news" && item.imageUrl) {
    return (
      <div className="relative h-[98px] w-[72px] overflow-hidden rounded-[6px] border border-border bg-muted shadow-sm sm:h-[104px] sm:w-[76px]">
        <Image src={item.imageUrl} alt={item.title} fill unoptimized sizes="76px" className="object-cover" />
      </div>
    );
  }
  return (
    <div
      className={cn(
        "flex h-[98px] w-[72px] items-center justify-center rounded-[6px] border border-border shadow-sm sm:h-[104px] sm:w-[76px]",
        kindPanelClass(item.kind),
      )}
    >
      <span className="font-heading text-[10px] font-bold tracking-[0.06em] text-foreground/40">{kindLabel(item.kind)}</span>
    </div>
  );
}

function PaperThumbnail({ layout }: { layout: (typeof thumbnailLayouts)[number] }) {
  return (
    <div className="h-[98px] w-[72px] overflow-hidden rounded-[6px] border border-border bg-primary shadow-sm sm:h-[104px] sm:w-[76px]">
      <div className="h-full w-full p-[5px]">
        <div className="mb-1 h-2 rounded-[1px] bg-coral" />
        <div className="space-y-[2px]">
          <div className="mx-auto h-[3px] w-9 rounded-full bg-primary-foreground" />
          <div className="mx-auto h-[2px] w-12 rounded-full bg-primary-foreground/45" />
          <div className="mx-auto h-[2px] w-10 rounded-full bg-primary-foreground/30" />
        </div>
        <div className="mt-2 grid grid-cols-[1fr_1fr] gap-[3px]">
          <PaperLines count={layout === "dense" ? 9 : 7} />
          {layout === "figure" || layout === "split" ? (
            <div className="space-y-[3px]">
              <div className="h-7 rounded-[2px] bg-sky-soft" />
              <div className="grid grid-cols-3 gap-[2px]">
                <span className="h-3 rounded-[1px] bg-mint-soft" />
                <span className="h-3 rounded-[1px] bg-lemon-soft" />
                <span className="h-3 rounded-[1px] bg-sky-soft" />
              </div>
              <PaperLines count={3} />
            </div>
          ) : (
            <PaperLines count={layout === "columns" ? 9 : 7} />
          )}
        </div>
        {layout === "grid" ? (
          <div className="mt-2 grid grid-cols-3 gap-[2px]">
            <span className="h-5 rounded-[1px] bg-sky-soft" />
            <span className="h-5 rounded-[1px] bg-coral-soft" />
            <span className="h-5 rounded-[1px] bg-mint-soft" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PaperLines({ count }: { count: number }) {
  return (
    <div className="space-y-[2px]">
      {Array.from({ length: count }).map((_, index) => (
        <span
          key={index}
          className={cn(
            "block h-[2px] rounded-full bg-primary-foreground/35",
            index % 4 === 0 && "w-[84%]",
            index % 4 === 1 && "w-full",
            index % 4 === 2 && "w-[68%]",
            index % 4 === 3 && "w-[92%]",
          )}
        />
      ))}
    </div>
  );
}
