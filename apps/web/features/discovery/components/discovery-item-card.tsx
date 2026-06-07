"use client";

import type { DiscoveryItemRef, FeedItem } from "@aqsha/convex/feed";
import {
  AlertCircleIcon,
  BookmarkIcon,
  CheckIcon,
  CompassIcon,
  ExternalLinkIcon,
  FileDownIcon,
  FolderIcon,
  Loader2Icon,
  Quote,
  SparklesIcon,
  ThumbsDownIcon,
  TrendingUpIcon,
} from "@aqsha/ui/icons";
import Link from "next/link";
import type { ReactNode } from "react";
import { encodePaperRef } from "@/features/explore/utils/paper-ref";
import { cn } from "@/lib/utils";
import { formatCitationCount } from "../utils/discovery-format";
import {
  RelevanceDot,
  Sparkline,
  StanceTally,
  VerdictBadge,
} from "./discovery-visuals";

export type DiscoveryFeedItem = Omit<FeedItem, "_id"> & {
  _id?: string;
  itemRef: DiscoveryItemRef;
};

export type DiscoveryCardHandlers = {
  onTeliti: (item: DiscoveryFeedItem) => void;
  onSave: (item: DiscoveryFeedItem) => void;
  onSaveToWorkspace: (item: DiscoveryFeedItem) => void;
  onHide: (item: DiscoveryFeedItem) => void;
  onOpenEvidence: (item: DiscoveryFeedItem) => void;
  onGenerateIdeas: (item: DiscoveryFeedItem) => void;
  onWhyRelevant: (item: DiscoveryFeedItem) => void;
};

type CardProps = {
  item: DiscoveryFeedItem;
  lang: "id" | "en";
  saved: boolean;
  busy: boolean;
  relevanceNote?: string;
  whyLoading?: boolean;
  handlers: DiscoveryCardHandlers;
};

const cardShellClass =
  "group flex flex-col overflow-hidden rounded-[14px] border border-border bg-card shadow-soft-card transition-colors hover:border-border";

// ── Hero card (lead item, editorial size) ─────────────────────────────────
export function DiscoveryHeroCard(props: CardProps) {
  const { item, lang } = props;
  const title = displayTitle(item, lang);
  const tldr = displayTldr(item, lang);
  const isClaim = item.kind === "claim";

  return (
    <article className={cn(cardShellClass, "lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(280px,40%)]")}>
      <div className="order-2 flex min-w-0 flex-col p-5 sm:p-6 lg:order-1">
        <CardMetaRow item={item} />
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

        <h2 className="font-heading text-[22px] font-bold leading-[1.15] tracking-tight text-foreground sm:text-[26px]">
          <CardTitleLink item={item}>{title}</CardTitleLink>
        </h2>

        <SourceLine item={item} className="mt-2" />
        <RetractionFlag item={item} />

        {tldr ? (
          <p className="mt-3 line-clamp-3 text-[14px] leading-6 text-ink-soft">
            {tldr}
          </p>
        ) : null}

        <SignalSections item={item} className="mt-3" />
        <TopicChips item={item} className="mt-3" />
        <WhyRelevantNote note={props.relevanceNote} />

        <div className="mt-auto pt-4">
          <CardActions {...props} />
          <WhyRelevantTrigger {...props} />
        </div>
      </div>

      <HeroMedia item={item} title={title} />
    </article>
  );
}

// ── Standard card (grid / masonry) ────────────────────────────────────────
export function DiscoveryStandardCard(props: CardProps) {
  const { item, lang } = props;
  const title = displayTitle(item, lang);
  const tldr = displayTldr(item, lang);
  const isClaim = item.kind === "claim";

  return (
    <article className={cardShellClass}>
      {item.kind === "news" && item.imageUrl ? (
        <div
          className="h-40 w-full bg-muted bg-cover bg-center"
          style={{ backgroundImage: `url("${item.imageUrl}")` }}
          role="img"
          aria-label={title}
        />
      ) : null}

      <div className="min-w-0 p-4">
        <CardMetaRow item={item} />
        {isClaim && item.claim ? (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <VerdictBadge verdict={item.claim.verdict} />
            {item.claim.publisher ? (
              <span className="text-[11px] text-muted-foreground">
                {item.claim.publisher}
              </span>
            ) : null}
          </div>
        ) : null}

        <h3 className="text-[15px] font-semibold leading-snug text-foreground">
          <CardTitleLink item={item}>{title}</CardTitleLink>
        </h3>

        <SourceLine item={item} className="mt-1" />
        <RetractionFlag item={item} />

        {tldr ? (
          <p className="mt-2 line-clamp-3 text-[13px] leading-5 text-ink-soft">
            {tldr}
          </p>
        ) : null}

        <SignalSections item={item} className="mt-3" />
        <TopicChips item={item} className="mt-2.5" />
        <WhyRelevantNote note={props.relevanceNote} />

        <div className="pt-3.5">
          <CardActions {...props} compact />
          <WhyRelevantTrigger {...props} />
        </div>
      </div>
    </article>
  );
}

// ── Shared sub-pieces ─────────────────────────────────────────────────────
function CardMetaRow({ item }: { item: DiscoveryFeedItem }) {
  return (
    <div className="mb-1.5 flex items-center justify-between gap-2">
      <span className="inline-flex items-center gap-1.5 truncate text-[11px] font-medium text-muted-foreground">
        <KindGlyph kind={item.kind} />
        <span className="truncate">{item.reason ?? item.sourceLabel}</span>
      </span>
      <RelevanceDot score={item.relevanceScore} />
    </div>
  );
}

function SourceLine({
  item,
  className,
}: {
  item: DiscoveryFeedItem;
  className?: string;
}) {
  const citation = item.kind === "paper" ? formatCitationCount(item.citedByCount) : null;
  return (
    <p
      className={cn(
        "line-clamp-1 text-[12px] font-medium text-muted-foreground",
        className,
      )}
    >
      {buildSourceLine(item)}
      {citation ? <span> · {citation}</span> : null}
    </p>
  );
}

function RetractionFlag({ item }: { item: DiscoveryFeedItem }) {
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

function SignalSections({
  item,
  className,
}: {
  item: DiscoveryFeedItem;
  className?: string;
}) {
  const hasSparkline =
    item.kind === "topic" && item.sparkline && item.sparkline.length > 1;
  const hasStance =
    item.stanceSupporting !== undefined &&
    item.stanceContrasting !== undefined &&
    item.stanceSupporting + item.stanceContrasting > 0;
  if (!hasSparkline && !hasStance) return null;

  return (
    <div className={cn("space-y-3", className)}>
      {hasSparkline ? (
        <div className="max-w-[260px]">
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
          className="max-w-[260px]"
        />
      ) : null}
    </div>
  );
}

function TopicChips({
  item,
  className,
}: {
  item: DiscoveryFeedItem;
  className?: string;
}) {
  if (item.topics.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {item.topics.slice(0, 3).map((topic) => (
        <span
          key={topic}
          className="inline-flex h-5 items-center rounded-[4px] bg-mint-soft px-2 text-[10.5px] font-semibold leading-none text-mint-foreground"
        >
          {topic}
        </span>
      ))}
    </div>
  );
}

function WhyRelevantNote({ note }: { note?: string }) {
  if (!note) return null;
  return (
    <p className="mt-3 max-w-[520px] border-l-2 border-sky-soft-border pl-3 text-[12px] leading-5 text-sky-foreground">
      {note}
    </p>
  );
}

function WhyRelevantTrigger({
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

function CardActions({
  item,
  saved,
  busy,
  handlers,
  compact,
}: CardProps & { compact?: boolean }) {
  const isClaim = item.kind === "claim";
  const isPaper = item.kind === "paper";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => handlers.onTeliti(item)}
        disabled={busy}
        className="inline-flex h-8 items-center gap-1.5 rounded-[7px] bg-primary px-3 text-[12.5px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
      >
        {busy ? (
          <Loader2Icon className="size-3.5 animate-spin" />
        ) : (
          <SparklesIcon className="size-3.5" />
        )}
        Teliti ini
      </button>

      {isClaim ? (
        <SecondaryAction
          compact={compact}
          label="Lihat bukti"
          icon={<Quote className="size-3.5" />}
          onClick={() => handlers.onOpenEvidence(item)}
        />
      ) : (
        <SecondaryAction
          compact={compact}
          label="Cari celah"
          icon={<CompassIcon className="size-3.5" />}
          onClick={() => handlers.onGenerateIdeas(item)}
        />
      )}

      <div className="ml-auto flex items-center gap-1">
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
        {isPaper ? (
          <IconButton
            label="Simpan ke workspace"
            onClick={() => handlers.onSaveToWorkspace(item)}
          >
            <FolderIcon className="size-4" />
          </IconButton>
        ) : null}
        <IconButton
          label={saved ? "Tersimpan" : "Simpan"}
          active={saved}
          onClick={() => handlers.onSave(item)}
        >
          {saved ? <CheckIcon className="size-4" /> : <BookmarkIcon className="size-4" />}
        </IconButton>
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
    </div>
  );
}

function SecondaryAction({
  compact,
  label,
  icon,
  onClick,
}: {
  compact?: boolean;
  label: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  if (compact) {
    return (
      <IconButton label={label} onClick={onClick}>
        {icon}
      </IconButton>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 items-center gap-1.5 rounded-[7px] border border-border px-2.5 text-[12.5px] font-medium text-foreground transition-colors hover:bg-muted"
    >
      {icon} {label}
    </button>
  );
}

function HeroMedia({
  item,
  title,
}: {
  item: DiscoveryFeedItem;
  title: string;
}) {
  if (item.kind === "news" && item.imageUrl) {
    return (
      <div
        className="order-1 h-44 w-full bg-muted bg-cover bg-center lg:order-2 lg:h-full lg:min-h-[240px]"
        style={{ backgroundImage: `url("${item.imageUrl}")` }}
        role="img"
        aria-label={title}
      />
    );
  }
  return (
    <div
      className={cn(
        "order-1 flex h-36 w-full items-center justify-center lg:order-2 lg:h-full lg:min-h-[240px]",
        kindPanelClass(item.kind),
      )}
      aria-hidden="true"
    >
      <span className="font-heading text-[15px] font-bold tracking-[0.08em] text-foreground/35">
        {kindLabel(item.kind)}
      </span>
    </div>
  );
}

function CardTitleLink({
  item,
  children,
}: {
  item: DiscoveryFeedItem;
  children: ReactNode;
}) {
  if (item.kind === "paper" && item.paperKey) {
    return (
      <Link
        href={`/app/explore/${encodePaperRef(item.paperKey)}`}
        className="break-words underline-offset-2 hover:underline focus-visible:underline focus:outline-none"
      >
        {children}
      </Link>
    );
  }
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noreferrer"
      className="break-words underline-offset-2 hover:underline focus-visible:underline focus:outline-none"
    >
      {children}
    </a>
  );
}

function IconButton({
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

function KindGlyph({ kind }: { kind: FeedItem["kind"] }) {
  const dot =
    kind === "claim"
      ? "bg-coral"
      : kind === "topic"
        ? "bg-sky-foreground"
        : kind === "news"
          ? "bg-lemon"
          : kind === "idea"
            ? "bg-lavender"
            : "bg-mint";
  return <span className={cn("size-1.5 shrink-0 rounded-full", dot)} />;
}

function kindLabel(kind: FeedItem["kind"]): string {
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

function kindPanelClass(kind: FeedItem["kind"]): string {
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

function buildSourceLine(item: DiscoveryFeedItem): string {
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

function formatItemDate(item: DiscoveryFeedItem): string {
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

function displayTitle(item: DiscoveryFeedItem, lang: "id" | "en"): string {
  if (lang === "id" && item.titleId) return item.titleId;
  return item.title;
}

function displayTldr(
  item: DiscoveryFeedItem,
  lang: "id" | "en",
): string | undefined {
  if (lang === "id") return item.tldrId ?? item.tldr ?? item.summary;
  return item.tldr ?? item.summary;
}
