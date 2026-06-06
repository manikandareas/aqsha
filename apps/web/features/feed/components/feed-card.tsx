"use client";

import type { FeedItem } from "@aqsha/convex/feed";
import {
  AlertCircleIcon,
  BookmarkIcon,
  CheckIcon,
  CompassIcon,
  ExternalLinkIcon,
  Loader2Icon,
  Quote,
  SparklesIcon,
  ThumbsDownIcon,
  TrendingUpIcon,
} from "@aqsha/ui/icons";
import Link from "next/link";
import { encodePaperRef } from "@/features/explore/utils/paper-ref";
import { cn } from "@/lib/utils";
import {
  RelevanceDot,
  Sparkline,
  StanceTally,
  VERDICT_STYLE,
  VerdictBadge,
} from "./feed-visuals";

export type FeedCardHandlers = {
  onTeliti: (item: FeedItem) => void;
  onSave: (item: FeedItem) => void;
  onHide: (item: FeedItem) => void;
  onOpenEvidence: (item: FeedItem) => void;
  onGenerateIdeas: (item: FeedItem) => void;
  onWhyRelevant: (item: FeedItem) => void;
};

export function FeedCard({
  item,
  lang,
  saved,
  busy,
  relevanceNote,
  whyLoading,
  handlers,
}: {
  item: FeedItem;
  lang: "id" | "en";
  saved: boolean;
  busy: boolean;
  relevanceNote?: string;
  whyLoading?: boolean;
  handlers: FeedCardHandlers;
}) {
  const title = displayTitle(item, lang);
  const tldr = displayTldr(item, lang);
  const isClaim = item.kind === "claim";
  const accent = isClaim && item.claim ? VERDICT_STYLE[item.claim.verdict].accent : null;

  return (
    <article className="group mb-4 break-inside-avoid overflow-hidden rounded-[12px] border border-border bg-card shadow-soft-card">
      {accent ? <div className={cn("h-1 w-full", accent)} /> : null}

      {item.kind === "news" && item.imageUrl ? (
        <div
          className="h-40 w-full bg-muted bg-cover bg-center"
          style={{ backgroundImage: `url("${item.imageUrl}")` }}
          role="img"
          aria-label={title}
        />
      ) : null}

      <div className="p-4">
        {/* meta row: reason + relevance */}
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 truncate text-[11px] font-medium text-muted-foreground">
            <KindGlyph kind={item.kind} />
            <span className="truncate">{item.reason ?? item.sourceLabel}</span>
          </span>
          <RelevanceDot score={item.relevanceScore} />
        </div>

        {/* claim verdict badge */}
        {isClaim && item.claim ? (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <VerdictBadge verdict={item.claim.verdict} />
            {item.claim.publisher ? (
              <span className="text-[11px] text-muted-foreground">
                Diperiksa {item.claim.publisher}
              </span>
            ) : null}
          </div>
        ) : null}

        {/* title */}
        <h3 className="text-[15px] font-semibold leading-snug text-foreground">
          <CardTitleLink item={item}>{title}</CardTitleLink>
        </h3>

        {/* source line */}
        <p className="mt-1 line-clamp-1 text-[11.5px] font-medium text-muted-foreground">
          {item.sourceLabel}
          {item.publishedAt ? <span> · {formatDate(item.publishedAt)}</span> : null}
          {item.kind === "paper" && item.trendScore > 0 ? (
            <span> · {formatTrend(item.trendScore)}</span>
          ) : null}
        </p>

        {/* retraction flag */}
        {item.retractionStatus === "retracted" ? (
          <p className="mt-2 inline-flex items-center gap-1 rounded-[5px] border border-destructive/25 bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
            <AlertCircleIcon className="size-3" /> Paper ditarik (retracted)
          </p>
        ) : item.retractionStatus === "concern" ? (
          <p className="mt-2 inline-flex items-center gap-1 rounded-[5px] border border-coral-soft-border bg-coral-soft px-2 py-0.5 text-[11px] font-semibold text-coral-foreground">
            <AlertCircleIcon className="size-3" /> Ada catatan kekhawatiran
          </p>
        ) : null}

        {/* tldr / summary */}
        {tldr ? (
          <p className="mt-2.5 line-clamp-3 text-[13px] leading-5 text-ink-soft">
            {tldr}
          </p>
        ) : null}

        {/* topic sparkline */}
        {item.kind === "topic" && item.sparkline && item.sparkline.length > 1 ? (
          <div className="mt-3 rounded-[8px] border border-border bg-background/60 p-2">
            <Sparkline values={item.sparkline} />
            <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
              <TrendingUpIcon className="size-3" /> Volume 3 bulan terakhir
            </p>
          </div>
        ) : null}

        {/* stance tally (claim consensus, if computed) */}
        {item.stanceSupporting !== undefined &&
        item.stanceContrasting !== undefined &&
        item.stanceSupporting + item.stanceContrasting > 0 ? (
          <StanceTally
            supporting={item.stanceSupporting}
            contrasting={item.stanceContrasting}
            className="mt-3"
          />
        ) : null}

        {/* topics */}
        {item.topics.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {item.topics.slice(0, 3).map((topic) => (
              <span
                key={topic}
                className="inline-flex h-5 items-center rounded-[4px] bg-mint-soft px-2 text-[10.5px] font-semibold leading-none text-mint-foreground"
              >
                {topic}
              </span>
            ))}
          </div>
        ) : null}

        {/* why-relevant note */}
        {relevanceNote ? (
          <p className="mt-3 rounded-[8px] border border-sky-soft-border bg-sky-soft px-2.5 py-2 text-[12px] leading-5 text-sky-foreground">
            {relevanceNote}
          </p>
        ) : null}

        {/* actions */}
        <div className="mt-3.5 flex flex-wrap items-center gap-2">
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
            <button
              type="button"
              onClick={() => handlers.onOpenEvidence(item)}
              className="inline-flex h-8 items-center gap-1.5 rounded-[7px] border border-border px-2.5 text-[12.5px] font-medium text-foreground transition-colors hover:bg-muted"
            >
              <Quote className="size-3.5" /> Lihat bukti
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handlers.onGenerateIdeas(item)}
              className="inline-flex h-8 items-center gap-1.5 rounded-[7px] border border-border px-2.5 text-[12.5px] font-medium text-foreground transition-colors hover:bg-muted"
            >
              <CompassIcon className="size-3.5" /> Cari celah
            </button>
          )}

          <div className="ml-auto flex items-center gap-1">
            <IconButton
              label={saved ? "Tersimpan" : "Simpan"}
              active={saved}
              onClick={() => handlers.onSave(item)}
            >
              {saved ? (
                <CheckIcon className="size-4" />
              ) : (
                <BookmarkIcon className="size-4" />
              )}
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

        {/* why relevant trigger */}
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
      </div>
    </article>
  );
}

function CardTitleLink({
  item,
  children,
}: {
  item: FeedItem;
  children: React.ReactNode;
}) {
  const internal = item.kind === "paper" && item.paperKey;
  if (internal) {
    return (
      <Link
        href={`/app/explore/${encodePaperRef(item.paperKey as string)}`}
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
  children: React.ReactNode;
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
          : "bg-mint";
  return <span className={cn("size-1.5 shrink-0 rounded-full", dot)} />;
}

function displayTitle(item: FeedItem, lang: "id" | "en"): string {
  if (lang === "id" && item.titleId) return item.titleId;
  return item.title;
}

function displayTldr(item: FeedItem, lang: "id" | "en"): string | undefined {
  if (lang === "id") return item.tldrId ?? item.tldr ?? item.summary;
  return item.tldr ?? item.summary;
}

function formatTrend(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k sitasi`;
  }
  return `${value} sitasi`;
}

function formatDate(ms: number): string {
  try {
    return new Date(ms).toLocaleDateString("id-ID", {
      year: "numeric",
      month: "short",
    });
  } catch {
    return "";
  }
}
