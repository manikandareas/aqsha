"use client";

import type { DiscoveryItem, FeedItem } from "@aqsha/convex/feed";
import {
  AlertCircleIcon,
  CompassIcon,
  ExternalLinkIcon,
  FileDownIcon,
  FolderIcon,
  HeartIcon,
  HelpCircleIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  Quote,
  SparklesIcon,
  ThumbsDownIcon,
  TrendingUpIcon,
} from "@aqsha/ui/icons";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { encodePaperRef } from "@/features/explore/utils/paper-ref";
import {
  domainFromUrl,
  relativeTime,
  sourceName,
} from "@/features/explore/utils/reader-format";
import { cn } from "@/lib/utils";
import { formatCitationCount } from "../utils/discovery-format";
import {
  Sparkline,
  StanceTally,
  VERDICT_STYLE,
  VerdictBadge,
} from "./discovery-visuals";

export type DiscoveryCardHandlers = {
  onTeliti: (item: DiscoveryItem) => void;
  onSave: (item: DiscoveryItem) => void;
  onSaveToWorkspace: (item: DiscoveryItem) => void;
  onHide: (item: DiscoveryItem) => void;
  onOpenEvidence: (item: DiscoveryItem) => void;
  onGenerateIdeas: (item: DiscoveryItem) => void;
  onWhyRelevant: (item: DiscoveryItem) => void;
};

export type CardProps = {
  item: DiscoveryItem;
  lang: "id" | "en";
  saved: boolean;
  busy: boolean;
  relevanceNote?: string;
  whyLoading?: boolean;
  handlers: DiscoveryCardHandlers;
};

// ── Spotlight card (hero + wide feature) — editorial split ─────────────────
type SpotlightProps = CardProps & {
  imageSide: "left" | "right";
  size: "hero" | "feature";
};

function DiscoverySpotlightCard(props: SpotlightProps) {
  const { item, lang, imageSide, size } = props;
  const title = displayTitle(item, lang);
  const tldr = displayTldr(item, lang);
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
          className={cn(
            "order-1 block",
            imageSide === "left" ? "@xl/feed:order-1" : "@xl/feed:order-2",
          )}
        >
          <CardMedia
            item={item}
            title={title}
            className={cn("w-full", mediaHeight)}
          />
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
                <span className="text-[11px] text-muted-foreground">
                  Diperiksa {item.claim.publisher}
                </span>
              ) : null}
            </div>
          ) : null}

          <h2
            className={cn(
              "font-heading font-bold tracking-tight text-foreground",
              titleClass,
            )}
          >
            <CardLink item={item} className="hover:underline underline-offset-4">
              {title}
            </CardLink>
          </h2>

          <RetractionFlag item={item} />

          {tldr ? (
            <p className="mt-3 line-clamp-3 text-[14px] leading-6 text-ink-soft sm:line-clamp-4">
              {tldr}
            </p>
          ) : null}

          <SpotlightSignals item={item} />
          <WhyRelevantNote note={props.relevanceNote} />

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

export function DiscoveryFeatureCard(
  props: CardProps & { imageSide: "left" | "right" },
) {
  const { imageSide, ...rest } = props;
  return <DiscoverySpotlightCard {...rest} imageSide={imageSide} size="feature" />;
}

// ── Standard card (3-up editorial grid) ───────────────────────────────────
export function DiscoveryStandardCard(props: CardProps) {
  const { item, lang } = props;
  const title = displayTitle(item, lang);
  const isClaim = item.kind === "claim";

  return (
    <article className="group flex flex-col">
      <CardLink
        item={item}
        hidden
        className="block overflow-hidden rounded-[12px]"
      >
        <CardMedia
          item={item}
          title={title}
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
          <CardLink
            item={item}
            className="line-clamp-3 break-words hover:underline underline-offset-4"
          >
            {title}
          </CardLink>
        </h3>

        <RetractionFlag item={item} />
        <WhyRelevantNote note={props.relevanceNote} />

        <div className="mt-auto pt-3">
          <CardFooter {...props} />
        </div>
      </div>
    </article>
  );
}

// ── Claim card (Brief) — verdict-forward, image-top parity ─────────────────
export function DiscoveryClaimCard(props: CardProps) {
  const { item, saved, handlers } = props;
  const claim = item.claim;
  if (!claim) {
    return <DiscoveryStandardCard {...props} />;
  }

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
            <span className="text-[11px] text-muted-foreground">
              Diperiksa {claim.publisher}
            </span>
          ) : null}
        </div>

        <h3 className="font-heading text-[15px] font-bold leading-[1.25] tracking-tight text-foreground">
          <CardLink
            item={item}
            className="line-clamp-3 break-words hover:underline underline-offset-4"
          >
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
            <LikeButton saved={saved} onClick={() => handlers.onSave(item)} />
            <CardOverflowMenu {...props} />
          </div>
        </div>
      </div>
    </article>
  );
}

// ── Footer (source row + like + overflow) ─────────────────────────────────
function CardFooter(props: CardProps) {
  const { item, saved, handlers } = props;
  return (
    <div className="flex items-center justify-between gap-3">
      <SourceRow item={item} lang={props.lang} />
      <div className="-mr-1 flex shrink-0 items-center gap-0.5">
        <LikeButton saved={saved} onClick={() => handlers.onSave(item)} />
        <CardOverflowMenu {...props} />
      </div>
    </div>
  );
}

function LikeButton({
  saved,
  onClick,
}: {
  saved: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={saved ? "Hapus dari simpanan" : "Simpan"}
      title={saved ? "Tersimpan" : "Simpan"}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        saved && "text-coral hover:text-coral",
      )}
    >
      <HeartIcon className="size-[18px]" />
    </button>
  );
}

function CardOverflowMenu({
  item,
  busy,
  relevanceNote,
  whyLoading,
  handlers,
}: CardProps) {
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
        <DropdownMenuItem
          onSelect={() => handlers.onTeliti(item)}
          disabled={busy}
        >
          {busy ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <SparklesIcon />
          )}
          Teliti ini
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
        <DropdownMenuItem
          onSelect={() => handlers.onWhyRelevant(item)}
          disabled={whyLoading || Boolean(relevanceNote)}
        >
          <HelpCircleIcon />
          {whyLoading
            ? "Menilai relevansi…"
            : relevanceNote
              ? "Relevansi dijelaskan"
              : "Kenapa relevan?"}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {isPaper ? (
          <DropdownMenuItem onSelect={() => handlers.onSaveToWorkspace(item)}>
            <FolderIcon /> Simpan ke workspace
          </DropdownMenuItem>
        ) : null}
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

        <DropdownMenuItem
          variant="destructive"
          onSelect={() => handlers.onHide(item)}
        >
          <ThumbsDownIcon /> Tidak relevan
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Source row (avatar + publisher + time) ────────────────────────────────
function SourceRow({
  item,
  lang,
}: {
  item: DiscoveryItem;
  lang: "id" | "en";
}) {
  const citation = item.kind === "paper" ? formatCitationCount(item.citedByCount) : null;
  const time =
    relativeTime(item.publishedAt, lang) ?? (item.year ? String(item.year) : null);
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
      <span
        className={cn(
          "inline-flex size-5 shrink-0 items-center justify-center rounded-full border",
          style.className,
        )}
      >
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
          style={{
            backgroundImage: `url("https://www.google.com/s2/favicons?domain=${domain}&sz=64")`,
          }}
        />
      ) : null}
    </span>
  );
}

function SpotlightSignals({ item }: { item: DiscoveryItem }) {
  const hasSparkline =
    item.kind === "topic" && item.sparkline && item.sparkline.length > 1;
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

function CardMedia({
  item,
  title,
  className,
}: {
  item: DiscoveryItem;
  title: string;
  className?: string;
}) {
  if (item.imageUrl) {
    return (
      <div
        className={cn(
          "overflow-hidden rounded-[12px] bg-muted bg-cover bg-center",
          className,
        )}
        style={{ backgroundImage: `url("${item.imageUrl}")` }}
        role="img"
        aria-label={title}
      />
    );
  }
  if (item.kind === "claim" && item.claim) {
    const style = VERDICT_STYLE[item.claim.verdict];
    const Icon = style.icon;
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 overflow-hidden rounded-[12px] border",
          style.className,
          className,
        )}
      >
        <Icon className="size-8" />
        <span className="font-heading text-[15px] font-bold">{style.label}</span>
      </div>
    );
  }
  return (
    <div
      className={cn(
        "flex items-center justify-center overflow-hidden rounded-[12px]",
        kindPanelClass(item.kind),
        className,
      )}
      aria-hidden
    >
      <span className="font-heading text-[14px] font-bold tracking-[0.08em] text-foreground/35">
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

export function WhyRelevantNote({ note }: { note?: string }) {
  if (!note) return null;
  return (
    <p className="mt-3 max-w-[520px] border-l-2 border-sky-soft-border pl-3 text-[12px] leading-5 text-sky-foreground">
      {note}
    </p>
  );
}

export function WhyRelevantTrigger({
  item,
  relevanceNote,
  whyLoading,
  handlers,
}: CardProps) {
  return (
    <button
      type="button"
      onClick={() => handlers.onWhyRelevant(item)}
      disabled={whyLoading || Boolean(relevanceNote)}
      className="mt-2 text-[11.5px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:no-underline disabled:opacity-60"
    >
      {whyLoading
        ? "Menilai relevansi…"
        : relevanceNote
          ? "Relevansi dijelaskan"
          : "Kenapa relevan untukku?"}
    </button>
  );
}

// Internal detail-page href for a feed item (paper → /[ref], news → /n/[id],
// claim → /f/[id]); null when there is no internal surface (fall back to the
// external source url). Feed-sourced items always carry `_id`.
export function feedDetailHref(item: DiscoveryItem): string | null {
  if (item.kind === "paper" && item.paperKey) {
    return `/app/explore/${encodePaperRef(item.paperKey)}`;
  }
  if (item.kind === "news" && item._id) return `/app/explore/n/${item._id}`;
  if (item.kind === "claim" && item._id) return `/app/explore/f/${item._id}`;
  return null;
}

function CardLink({
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
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-[7px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        active && "text-mint-foreground",
      )}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

export function kindLabel(kind: FeedItem["kind"]): string {
  switch (kind) {
    case "paper":
      return "Paper";
    case "news":
      return "Berita";
    case "claim":
      return "Klaim";
    case "topic":
      return "Topik";
    default:
      return "Ide";
  }
}

export function kindPanelClass(kind: FeedItem["kind"]): string {
  switch (kind) {
    case "claim":
      return "bg-gradient-to-br from-coral-soft to-lemon-soft";
    case "topic":
      return "bg-gradient-to-br from-sky-soft to-lavender-soft";
    case "paper":
      return "bg-gradient-to-br from-sky-soft to-mint-soft";
    case "idea":
      return "bg-gradient-to-br from-lavender-soft to-mint-soft";
    default:
      return "bg-gradient-to-br from-lemon-soft to-coral-soft";
  }
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

export function buildSourceLine(item: DiscoveryItem): string {
  const parts: string[] = [];
  if (item.kind === "paper" && item.authors && item.authors.length > 0) {
    parts.push(item.authors.slice(0, 4).join(", "));
  } else {
    parts.push(item.sourceLabel);
  }
  const date = formatItemDate(item);
  if (date) parts.push(date);
  return parts.join(" · ");
}

function formatItemDate(item: DiscoveryItem): string {
  if (item.kind === "paper" && item.year && !item.publishedAt) {
    return String(item.year);
  }
  if (item.publishedAt) {
    try {
      return new Date(item.publishedAt).toLocaleDateString("id-ID", {
        year: "numeric",
        month: "short",
      });
    } catch {
      return "";
    }
  }
  return item.year ? String(item.year) : "";
}

function displayTitle(item: DiscoveryItem, lang: "id" | "en"): string {
  if (lang === "id" && item.titleId) return item.titleId;
  return item.title;
}

function displayTldr(
  item: DiscoveryItem,
  lang: "id" | "en",
): string | undefined {
  if (lang === "id") return item.tldrId ?? item.tldr ?? item.summary;
  return item.tldr ?? item.summary;
}
