"use client";

import type { FeedItem } from "@aqsha/convex/feed";
import { ExternalLinkIcon, SparklesIcon } from "@aqsha/ui/icons";
import Link from "next/link";
import { VerdictBadge } from "@/features/discovery/components/discovery-visuals";
import { cn } from "@/lib/utils";
import { faviconUrl, relativeTime, sourceName } from "../utils/reader-format";

// ── Hero media (single source image) ──────────────────────────────────────
export function ReaderHeroMedia({
  imageUrl,
  title,
  className,
}: {
  imageUrl?: string;
  title: string;
  className?: string;
}) {
  if (!imageUrl) return null;
  return (
    <div
      className={cn(
        "aspect-[16/9] w-full overflow-hidden rounded-[14px] border border-border bg-muted bg-cover bg-center",
        className,
      )}
      style={{ backgroundImage: `url("${imageUrl}")` }}
      role="img"
      aria-label={title}
    />
  );
}

// ── Source card (favicon + publisher + outbound link) ─────────────────────
export function ReaderSourceCard({
  url,
  label,
  ctaLabel = "Buka sumber",
}: {
  url: string;
  label: string;
  ctaLabel?: string;
}) {
  const favicon = faviconUrl(url);
  const letter = (label.trim()[0] ?? "•").toUpperCase();
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      title={ctaLabel}
      className="group inline-flex w-fit max-w-full items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-3 text-[13px] transition-colors hover:border-foreground/20 hover:bg-muted/60"
    >
      <span className="relative inline-flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-[11px] font-bold text-muted-foreground">
        <span aria-hidden>{letter}</span>
        {favicon ? (
          <span
            aria-hidden
            className="absolute inset-0 rounded-full bg-card bg-cover bg-center"
            style={{ backgroundImage: `url("${favicon}")` }}
          />
        ) : null}
      </span>
      <span className="truncate font-semibold text-foreground">{label}</span>
      <span className="hidden text-muted-foreground/50 sm:inline">·</span>
      <span className="hidden whitespace-nowrap text-[12.5px] font-medium text-muted-foreground transition-colors group-hover:text-foreground sm:inline">
        {ctaLabel}
      </span>
      <ExternalLinkIcon className="size-3.5 shrink-0 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:text-foreground" />
    </a>
  );
}

// ── Full article body (no truncation) ─────────────────────────────────────
export function ReaderArticleBody({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const paragraphs = toParagraphs(text);
  if (paragraphs.length === 0) return null;
  return (
    <div
      className={cn(
        "space-y-4 text-[15px] leading-7 text-foreground/90",
        className,
      )}
    >
      {paragraphs.map((paragraph, index) => (
        <p key={index} className="whitespace-pre-line">
          {paragraph}
        </p>
      ))}
    </div>
  );
}

// Split body text into paragraphs, tolerating both blank-line-separated bodies
// (our claim scraper) and single-newline bodies (Exa article text).
function toParagraphs(text: string): string[] {
  const byBlankLine = text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (byBlankLine.length > 1) return byBlankLine;
  const byLine = text
    .split(/\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return byLine.length > 0 ? byLine : [text.trim()].filter(Boolean);
}

// ── "Discover more" related grid ──────────────────────────────────────────
export function ReaderRelatedGrid({
  items,
  lang = "id",
}: {
  items: FeedItem[];
  lang?: "id" | "en";
}) {
  if (items.length === 0) return null;
  return (
    <section className="mt-12 border-t border-border/60 pt-8">
      <h2 className="mb-5 inline-flex items-center gap-2 text-[15px] font-semibold text-foreground">
        <SparklesIcon className="size-4 text-muted-foreground" /> Bacaan terkait
      </h2>
      <div className="grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((item) => (
          <ReaderRelatedCard key={item._id} item={item} lang={lang} />
        ))}
      </div>
    </section>
  );
}

function ReaderRelatedCard({
  item,
  lang,
}: {
  item: FeedItem;
  lang: "id" | "en";
}) {
  const href = `/app/explore/${item.kind === "news" ? "n" : "f"}/${item._id}`;
  const title = (lang === "id" ? item.titleId : undefined) ?? item.title;
  const time = relativeTime(item.publishedAt, lang);
  return (
    <Link href={href} className="group flex flex-col focus:outline-none">
      {item.imageUrl ? (
        <div
          className="aspect-[16/10] w-full overflow-hidden rounded-[10px] border border-border bg-muted bg-cover bg-center transition-opacity group-hover:opacity-90"
          style={{ backgroundImage: `url("${item.imageUrl}")` }}
          role="img"
          aria-label={title}
        />
      ) : item.kind === "claim" && item.claim ? (
        <div className="flex aspect-[16/10] w-full items-center justify-center rounded-[10px] border border-border bg-muted">
          <VerdictBadge verdict={item.claim.verdict} />
        </div>
      ) : (
        <div
          className="aspect-[16/10] w-full rounded-[10px] border border-border bg-gradient-to-br from-lemon-soft to-coral-soft"
          aria-hidden
        />
      )}
      <h3 className="mt-2.5 line-clamp-2 font-heading text-[14px] font-bold leading-snug tracking-tight text-foreground underline-offset-2 group-hover:underline">
        {title}
      </h3>
      <p className="mt-1 truncate text-[11.5px] font-medium text-muted-foreground">
        {sourceName(item)}
        {time ? ` · ${time}` : ""}
      </p>
    </Link>
  );
}
