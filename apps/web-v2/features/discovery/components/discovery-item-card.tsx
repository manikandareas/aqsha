"use client";

import {
  AlertCircleIcon,
  CompassIcon,
  ExternalLinkIcon,
  FileDownIcon,
  Loader2Icon,
  MessageSquareIcon,
  MoreHorizontalIcon,
  Quote,
  ThumbsDownIcon,
  TrendingUpIcon,
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
  isSavableToWorkspace,
  kindLabel,
  kindPanelClass,
  type DiscoveryItem,
} from "../model";
import {
  domainFromUrl,
  formatCitationCount,
  relativeTime,
  sourceName,
  VERDICT_STYLE,
} from "../format";
import type { FeedItem } from "../types";
import { Sparkline, StanceTally, VerdictBadge } from "./discovery-visuals";

export type DiscoveryCardHandlers = {
  onAskAstra: (item: DiscoveryItem) => void;
  onSaved: (item: DiscoveryItem) => void;
  onHide: (item: DiscoveryItem) => void;
  onOpenEvidence: (item: DiscoveryItem) => void;
  onGenerateIdeas: (item: DiscoveryItem) => void;
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
  const isClaim = item.kind === "claim";

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
          {isClaim && item.claim ? (
            <div className="mb-2.5 flex flex-wrap items-center gap-2">
              <VerdictBadge verdict={item.claim.verdict} />
              {item.claim.publisher ? (
                <span className="text-[11px] text-muted-foreground">Diperiksa {item.claim.publisher}</span>
              ) : null}
            </div>
          ) : null}

          <h2 className={cn("font-heading font-bold tracking-tight text-foreground", titleClass)}>
            <CardLink item={item} className="hover:underline underline-offset-4">
              {title}
            </CardLink>
          </h2>

          <RetractionFlag item={item} />

          {tldr ? (
            <p className="mt-3 line-clamp-3 text-[14px] leading-6 text-ink-soft sm:line-clamp-4">{tldr}</p>
          ) : null}

          <SpotlightSignals item={item} />

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
  const isClaim = item.kind === "claim";

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
        {isClaim && item.claim ? (
          <div className="mb-1.5">
            <VerdictBadge verdict={item.claim.verdict} />
          </div>
        ) : null}

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

// ── Claim card (Brief) — verdict-forward, image-top ───────────────────────
export function DiscoveryClaimCard(props: CardProps) {
  const { item, handlers } = props;
  const claim = item.claim;
  if (!claim) return <DiscoveryStandardCard {...props} />;

  return (
    <article className="group flex flex-col">
      <CardLink item={item} hidden className="block overflow-hidden rounded-[12px]">
        <CardMedia
          item={item}
          title={claim.claim}
          className="aspect-[16/10] w-full transition-opacity duration-200 group-hover:opacity-90"
        />
      </CardLink>

      <div className="flex min-w-0 flex-1 flex-col pt-2.5">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <VerdictBadge verdict={claim.verdict} />
          {claim.publisher ? (
            <span className="text-[11px] text-muted-foreground">Diperiksa {claim.publisher}</span>
          ) : null}
        </div>

        <h3 className="font-heading text-[15px] font-bold leading-[1.25] tracking-tight text-foreground">
          <CardLink item={item} className="line-clamp-3 break-words hover:underline underline-offset-4">
            {claim.claim}
          </CardLink>
        </h3>

        <div className="mt-auto flex items-center justify-between gap-3 pt-3">
          <CardLink
            item={item}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3.5 text-[12.5px] font-semibold text-primary-foreground transition-transform duration-150 ease-out hover:bg-primary-hover active:scale-[0.97]"
          >
            <Quote className="size-3.5" /> Lihat bukti
          </CardLink>
          <div className="-mr-1 flex items-center gap-0.5">
            <CardSaveButton item={item} handlers={handlers} />
            <CardOverflowMenu {...props} />
          </div>
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
        {isSavableToWorkspace(item) ? <CardSaveButton item={item} handlers={handlers} /> : null}
        <CardOverflowMenu {...props} />
      </div>
    </div>
  );
}

// Save-to-Workspace, all kinds. Computes the best ingest URL, fires interest +1
// via `onSaved`. Reuses the shared SaveToWorkspaceButton (dialog picker).
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
  const isClaim = item.kind === "claim";
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
        {isClaim ? (
          <DropdownMenuItem onSelect={() => handlers.onOpenEvidence(item)}>
            <Quote /> Lihat bukti
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={() => handlers.onGenerateIdeas(item)}>
            <CompassIcon /> Cari celah
          </DropdownMenuItem>
        )}

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
  if (item.kind === "claim" && item.claim) {
    const style = VERDICT_STYLE[item.claim.verdict];
    const Icon = style.icon;
    return (
      <span className={cn("inline-flex size-5 shrink-0 items-center justify-center rounded-full border", style.className)}>
        <Icon className="size-3" />
      </span>
    );
  }
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

function SpotlightSignals({ item }: { item: DiscoveryItem }) {
  const hasSparkline = item.kind === "topic" && item.sparkline && item.sparkline.length > 1;
  const hasStance =
    item.stanceSupporting !== undefined &&
    item.stanceContrasting !== undefined &&
    item.stanceSupporting + item.stanceContrasting > 0;
  if (!hasSparkline && !hasStance) return null;

  return (
    <div className="mt-4 space-y-3">
      {hasSparkline ? (
        <div className="max-w-[280px]">
          <Sparkline values={item.sparkline as number[]} />
          <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
            <TrendingUpIcon className="size-3" /> Volume 3 bulan terakhir
          </p>
        </div>
      ) : null}
      {hasStance ? (
        <StanceTally
          supporting={item.stanceSupporting as number}
          contrasting={item.stanceContrasting as number}
          className="max-w-[280px]"
        />
      ) : null}
    </div>
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
  if (item.kind === "claim" && item.claim) {
    const style = VERDICT_STYLE[item.claim.verdict];
    const Icon = style.icon;
    return (
      <div className={cn("flex flex-col items-center justify-center gap-2 overflow-hidden rounded-[12px] border", style.className, className)}>
        <Icon className="size-8" />
        <span className="font-heading text-[15px] font-bold">{style.label}</span>
      </div>
    );
  }
  return (
    <div className={cn("flex items-center justify-center overflow-hidden rounded-[12px]", kindPanelClass(item.kind), className)} aria-hidden>
      <span className="font-heading text-[14px] font-bold tracking-[0.08em] text-foreground/35">{kindLabel(item.kind)}</span>
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
  switch (kind) {
    case "claim":
      return "bg-coral-soft text-coral-foreground";
    case "topic":
      return "bg-sky-soft text-sky-foreground";
    case "paper":
      return "bg-mint-soft text-mint-foreground";
    case "idea":
      return "bg-lavender-soft text-lavender-foreground";
    default:
      return "bg-lemon-soft text-lemon-foreground";
  }
}
