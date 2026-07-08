"use client";

import { GlobeIcon } from "@aqsha/ui/icons";
import { createContext, type ReactNode, useContext } from "react";
import type { ExtraProps } from "streamdown";
import { LinkPreview } from "@/components/ui/link-preview";
import {
  faviconUrl,
  originMeta,
  sourceDomain,
  sourceHref,
} from "@/features/threads/lib/source-card";
import type { SourceCardData } from "@/features/threads/lib/timeline-types";
import { cn } from "@/lib/utils";

/**
 * Sitasi inline `[n]` di jawaban Astra, dirender sebagai pill gaya ai-sdk (favicon + hostname sumber
 * pertama, plus `+N` bila menunjuk >1 sumber) yang saat di-hover memunculkan kartu Link Preview
 * (screenshot microlink). Sumber di-resolve dari `CitationContext` (peta `nomor → kartu` yang dibangun
 * `message-list`); bila nomor tak ditemukan, luruh anggun ke teks `[n]` asli.
 */

const CitationContext = createContext<Map<number, SourceCardData[]> | undefined>(undefined);

/** Sediakan peta sitasi untuk subtree jawaban (dipakai `Response`). */
export function CitationProvider({
  value,
  children,
}: {
  value?: Map<number, SourceCardData[]>;
  children: ReactNode;
}) {
  return <CitationContext.Provider value={value}>{children}</CitationContext.Provider>;
}

/**
 * Peta sitasi `nomor → kartu` subtree jawaban aktif. Diekspor untuk komponen evidence viz
 * (`deep-viz/*`) yang me-resolve `papers: number[]` payload ke kartu sumber yang sama.
 */
export function useCitationMap(): Map<number, SourceCardData[]> | undefined {
  return useContext(CitationContext);
}

/** "1,2" → [1, 2] (abaikan token non-integer). */
function parseCitationNumbers(raw: unknown): number[] {
  if (typeof raw !== "string") return [];
  const out: number[] = [];
  for (const part of raw.split(",")) {
    const n = Number.parseInt(part.trim(), 10);
    if (Number.isInteger(n)) out.push(n);
  }
  return out;
}

/**
 * Renderer element `<citation citations="1,2">` (disuntik `citationRehypePlugin`) untuk Streamdown.
 * Membaca atribut `citations`, resolve ke kartu lewat context, lalu render pill. Fallback ke anak
 * (teks `[n]` asli) bila context kosong / nomor tak ter-resolve → degradasi mulus.
 */
export function CitationMarkdownComponent(props: Record<string, unknown> & ExtraProps) {
  const map = useCitationMap();
  const children = props.children as ReactNode;
  const numbers = parseCitationNumbers(props.citations);
  if (!map || numbers.length === 0) return <>{children}</>;

  const seen = new Set<string>();
  const cards: SourceCardData[] = [];
  for (const n of numbers) {
    for (const card of map.get(n) ?? []) {
      if (seen.has(card.key)) continue;
      seen.add(card.key);
      cards.push(card);
    }
  }
  if (cards.length === 0) return <>{children}</>;
  return <InlineCitation cards={cards} />;
}

/** Pill sitasi inline untuk satu token `[n]`/`[n,m]` → favicon + hostname sumber pertama (+N lainnya). */
export function InlineCitation({ cards }: { cards: SourceCardData[] }) {
  const first = cards[0];
  if (!first) return null;
  const domain = sourceDomain(first);
  const favicon = faviconUrl(domain);
  const href = sourceHref(first);
  const extra = cards.length - 1;
  const label = domain ?? originMeta(first.origin).label;

  const pill = (
    <a
      href={href ?? undefined}
      target={href ? "_blank" : undefined}
      rel={href ? "noopener noreferrer" : undefined}
      className={cn(
        "mx-0.5 inline-flex max-w-[12rem] translate-y-px items-center gap-1 rounded-full border bg-muted/60 py-0.5 pr-1.5 pl-1 align-baseline font-medium text-[11px] text-muted-foreground leading-none no-underline transition-colors hover:bg-muted hover:text-foreground",
      )}
    >
      <CitationFavicon favicon={favicon} />
      <span className="truncate">{label}</span>
      {extra > 0 ? <span className="shrink-0 text-muted-foreground/80 tabular-nums">+{extra}</span> : null}
    </a>
  );

  if (!href) return pill;
  return (
    <LinkPreview
      url={href}
      title={first.title}
      subtitle={domain ?? undefined}
      extra={extra > 0 ? <OtherSources cards={cards.slice(1)} /> : undefined}
    >
      {pill}
    </LinkPreview>
  );
}

/** Logo kecil: favicon → ikon globe (background-image, konsisten dengan kartu sumber). */
function CitationFavicon({ favicon }: { favicon: string | null }) {
  return (
    <span
      aria-hidden
      className="flex size-3.5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-background"
    >
      {favicon ? (
        <span
          className="size-2.5 bg-cover bg-center"
          style={{ backgroundImage: `url("${favicon}")` }}
        />
      ) : (
        <GlobeIcon className="size-2 text-muted-foreground" />
      )}
    </span>
  );
}

/** Ringkasan sumber lain (token sitasi yang menunjuk >1 sumber) di bawah kartu pratinjau. */
function OtherSources({ cards }: { cards: SourceCardData[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-medium text-[10px] text-muted-foreground">Sumber lain</span>
      {cards.map((card) => {
        const domain = sourceDomain(card);
        const favicon = faviconUrl(domain);
        const href = sourceHref(card);
        const row = (
          <span className="flex min-w-0 items-center gap-1.5">
            <CitationFavicon favicon={favicon} />
            <span className="min-w-0 flex-1 truncate text-[11px] text-foreground">{card.title}</span>
          </span>
        );
        return href ? (
          <a
            key={card.key}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded transition-opacity hover:opacity-80 focus-visible:outline-none"
          >
            {row}
          </a>
        ) : (
          <span key={card.key} className="block">
            {row}
          </span>
        );
      })}
    </div>
  );
}
