"use client";

import {
  AlertCircleIcon,
  ExternalLinkIcon,
  FileDownIcon,
  Loader2Icon,
  MessageSquareIcon,
  MoreHorizontalIcon,
  ThumbsDownIcon,
} from "@aqsha/ui/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@aqsha/ui/components/dropdown-menu";
import Image from "next/image";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { SaveToWorkspaceButton } from "@/features/artifacts/components/save-to-workspace-button";
import { cn } from "@/lib/utils";
import {
  bestIngestUrl,
  feedDetailHref,
  kindLabel,
  kindPanelClass,
  type DiscoveryItem,
} from "../model";
import { domainFromUrl, formatCitationCount, relativeTime, sourceName } from "../format";
import type { FeedItem } from "../types";

export type DiscoveryCardHandlers = {
  onAskAstra: (item: DiscoveryItem) => void;
  onSaved: (item: DiscoveryItem) => void;
  onHide: (item: DiscoveryItem) => void;
};

export type CardProps = {
  item: DiscoveryItem;
  busy: boolean;
  handlers: DiscoveryCardHandlers;
};

// ── Spotlight card (hero + wide feature) — editorial split ─────────────────
type SpotlightProps = CardProps & { imageSide: "left" | "right"; size: "hero" | "feature" };

function DiscoverySpotlightCard(props: SpotlightProps) {
  const { item, imageSide, size } = props;
  const title = item.title;
  const tldr = item.tldr ?? item.summary;

  const titleClass =
    size === "hero"
      ? "text-[25px] leading-[1.1] sm:text-[31px]"
      : "text-[21px] leading-[1.14] sm:text-[25px]";
  const mediaHeight =
    size === "hero"
      ? "h-52 sm:h-64 @xl/feed:h-full @xl/feed:min-h-[300px]"
      : "h-48 sm:h-56 @xl/feed:h-full @xl/feed:min-h-[224px]";
  const columns =
    imageSide === "left"
      ? "@xl/feed:grid-cols-[minmax(260px,40%)_minmax(0,1fr)]"
      : "@xl/feed:grid-cols-[minmax(0,1fr)_minmax(260px,40%)]";

  return (
    <article className="group">
      <div className={cn("grid gap-5 @xl/feed:items-stretch @xl/feed:gap-7", columns)}>
        <CardLink
          item={item}
          hidden
          className={cn("order-1 block", imageSide === "left" ? "@xl/feed:order-1" : "@xl/feed:order-2")}
        >
          <CardMedia item={item} title={title} className={cn("w-full", mediaHeight)} />
        </CardLink>

        <div
          className={cn(
            "order-2 flex min-w-0 flex-col justify-center",
            imageSide === "left" ? "@xl/feed:order-2" : "@xl/feed:order-1",
          )}
        >
          <h2 className={cn("font-heading font-bold tracking-tight text-foreground", titleClass)}>
            <CardLink item={item} className="hover:underline underline-offset-4">
              {title}
            </CardLink>
          </h2>

          <RetractionFlag item={item} />

          {tldr ? (
            <p className="mt-3 line-clamp-3 text-[14px] leading-6 text-ink-soft sm:line-clamp-4">{tldr}</p>
          ) : null}

          <div className="mt-5 border-t border-border/50 pt-3">
            <CardFooter {...props} />
          </div>
        </div>
      </div>
    </article>
  );
}

export function DiscoveryHeroCard(props: CardProps) {
  return <DiscoverySpotlightCard {...props} imageSide="right" size="hero" />;
}

export function DiscoveryFeatureCard(props: CardProps & { imageSide: "left" | "right" }) {
  const { imageSide, ...rest } = props;
  return <DiscoverySpotlightCard {...rest} imageSide={imageSide} size="feature" />;
}

// ── Standard card (3-up editorial grid) ───────────────────────────────────
export function DiscoveryStandardCard(props: CardProps) {
  const { item } = props;

  return (
    <article className="group flex flex-col">
      <CardLink item={item} hidden className="block overflow-hidden rounded-[12px]">
        <CardMedia
          item={item}
          title={item.title}
          className="aspect-[16/10] w-full transition-opacity duration-200 group-hover:opacity-90"
        />
      </CardLink>

      <div className="flex min-w-0 flex-1 flex-col pt-2.5">
        <h3 className="font-heading text-[15px] font-bold leading-[1.25] tracking-tight text-foreground">
          <CardLink item={item} className="line-clamp-3 break-words hover:underline underline-offset-4">
            {item.title}
          </CardLink>
        </h3>

        <RetractionFlag item={item} />

        <div className="mt-auto pt-3">
          <CardFooter {...props} />
        </div>
      </div>
    </article>
  );
}

// ── Footer (source row + save + overflow) ─────────────────────────────────
function CardFooter(props: CardProps) {
  const { item, handlers } = props;
  return (
    <div className="flex items-center justify-between gap-3">
      <SourceRow item={item} />
      <div className="-mr-1 flex shrink-0 items-center gap-0.5">
        <CardSaveButton item={item} handlers={handlers} />
        <CardOverflowMenu {...props} />
      </div>
    </div>
  );
}

// Save-to-Workspace. Computes the best ingest URL, fires interest +1 via `onSaved`.
export function CardSaveButton({ item, handlers }: { item: DiscoveryItem; handlers: DiscoveryCardHandlers }) {
  return (
    <SaveToWorkspaceButton
      url={bestIngestUrl(item)}
      title={item.title}
      label=""
      size="icon"
      variant="ghost"
      ariaLabel="Simpan ke workspace"
      className="size-8 rounded-full text-muted-foreground hover:text-foreground"
      onSaved={() => handlers.onSaved(item)}
    />
  );
}

function CardOverflowMenu({ item, busy, handlers }: CardProps) {
  const isPaper = item.kind === "paper";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Tindakan lain"
          className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground"
        >
          <MoreHorizontalIcon className="size-[18px]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={() => handlers.onAskAstra(item)} disabled={busy}>
          {busy ? <Loader2Icon className="animate-spin" /> : <MessageSquareIcon />}
          Tanya Astra
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <a href={item.url} target="_blank" rel="noreferrer">
            <ExternalLinkIcon /> Buka sumber
          </a>
        </DropdownMenuItem>
        {isPaper && item.pdfUrl ? (
          <DropdownMenuItem asChild>
            <a href={item.pdfUrl} target="_blank" rel="noreferrer">
              <FileDownIcon /> Unduh PDF
            </a>
          </DropdownMenuItem>
        ) : null}

        <DropdownMenuSeparator />

        <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => handlers.onHide(item)}>
          <ThumbsDownIcon /> Tidak relevan
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Source row (avatar + publisher + time) ────────────────────────────────
function SourceRow({ item }: { item: DiscoveryItem }) {
  const citation = item.kind === "paper" ? formatCitationCount(item.citedByCount) : null;
  const time = relativeTime(item.publishedAt) ?? (item.year ? String(item.year) : null);
  return (
    <div className="flex min-w-0 items-center gap-2">
      <SourceAvatar item={item} />
      <p className="min-w-0 truncate text-[12px] font-medium text-muted-foreground">
        <span className="font-semibold text-foreground/85">{sourceName(item)}</span>
        {time ? <span> · {time}</span> : null}
        {citation ? <span> · {citation}</span> : null}
      </p>
    </div>
  );
}

function SourceAvatar({ item }: { item: DiscoveryItem }) {
  const domain = item.kind === "news" ? domainFromUrl(item.url) : null;
  const letter = (sourceName(item).trim()[0] ?? "•").toUpperCase();
  return (
    <span
      className={cn(
        "relative inline-flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-full text-[10px] font-bold leading-none",
        kindAvatarClass(item.kind),
      )}
    >
      <span aria-hidden>{letter}</span>
      {domain ? (
        <span
          aria-hidden
          className="absolute inset-0 rounded-full bg-card bg-cover bg-center"
          style={{ backgroundImage: `url("https://www.google.com/s2/favicons?domain=${domain}&sz=64")` }}
        />
      ) : null}
    </span>
  );
}

function CardMedia({ item, title, className }: { item: DiscoveryItem; title: string; className?: string }) {
  if (item.imageUrl) {
    return (
      <div className={cn("relative overflow-hidden rounded-[12px] bg-muted", className)}>
        <Image src={item.imageUrl} alt={title} fill unoptimized sizes="(max-width: 640px) 100vw, 400px" className="object-cover" />
      </div>
    );
  }
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 overflow-hidden rounded-[12px]",
        kindPanelClass(item.kind),
        className,
      )}
      aria-hidden
    >
      {/* Motif linked-nodes (metafora brand) → fallback terbaca disengaja, bukan kotak kosong. */}
      <svg width="42" height="22" viewBox="0 0 42 22" fill="none" className="text-foreground/25">
        <line x1="8" y1="11" x2="21" y2="6" stroke="currentColor" strokeWidth="1.2" />
        <line x1="21" y1="6" x2="34" y2="15" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="8" cy="11" r="3" fill="currentColor" />
        <circle cx="21" cy="6" r="3.5" fill="currentColor" />
        <circle cx="34" cy="15" r="3" fill="currentColor" />
      </svg>
      <span className="font-heading text-[13px] font-bold tracking-[0.08em] text-foreground/40">
        {kindLabel(item.kind)}
      </span>
    </div>
  );
}

// ── Shared sub-pieces ─────────────────────────────────────────────────────
export function RetractionFlag({ item }: { item: DiscoveryItem }) {
  if (item.retractionStatus === "retracted") {
    return (
      <p className="mt-2 inline-flex w-fit items-center gap-1 rounded-[5px] border border-destructive/25 bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
        <AlertCircleIcon className="size-3" /> Paper ditarik (retracted)
      </p>
    );
  }
  if (item.retractionStatus === "concern") {
    return (
      <p className="mt-2 inline-flex w-fit items-center gap-1 rounded-[5px] border border-coral-soft-border bg-coral-soft px-2 py-0.5 text-[11px] font-semibold text-coral-foreground">
        <AlertCircleIcon className="size-3" /> Ada catatan kekhawatiran
      </p>
    );
  }
  return null;
}

export function CardLink({
  item,
  children,
  className,
  hidden,
}: {
  item: DiscoveryItem;
  children: ReactNode;
  className?: string;
  hidden?: boolean;
}) {
  const cls = cn("focus:outline-none focus-visible:underline", className);
  const extra = hidden ? { "aria-hidden": true, tabIndex: -1 } : {};
  const href = feedDetailHref(item);
  if (href) {
    return (
      <Link href={href} className={cls} {...extra}>
        {children}
      </Link>
    );
  }
  return (
    <a href={item.url} target="_blank" rel="noreferrer" className={cls} {...extra}>
      {children}
    </a>
  );
}

export function IconButton({
  label,
  children,
  ...props
}: { label: string; children: ReactNode } & ComponentProps<"button">) {
  return (
    <button
      type="button"
      className="inline-flex size-7 items-center justify-center rounded-[7px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </button>
  );
}

function kindAvatarClass(kind: FeedItem["kind"]): string {
  return kind === "paper"
    ? "bg-mint-soft text-mint-foreground"
    : "bg-lemon-soft text-lemon-foreground";
}
