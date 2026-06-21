"use client";

import { ChevronDownIcon } from "@aqsha/ui/icons";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { Shimmer } from "./shimmer";

/**
 * Paragraf pertama (sampai baris kosong pertama) dari jejak reasoning — sekilas
 * pemikiran model, bukan transkrip penuh. Satu-paragraf dikembalikan utuh; yang
 * panjang dipotong ke paragraf pembuka. Pure.
 */
export function firstReasoningParagraph(text: string): string {
  return text.trim().split(/\r?\n\s*\r?\n/)[0]?.trim() ?? "";
}

const previewClass =
  "w-full min-w-0 whitespace-pre-wrap break-words text-[12px] leading-[1.6] text-muted-foreground";

/**
 * Preview extended-thinking di atas jawaban asisten (pola AI-Elements collapse-
 * after-stream). Selagi berpikir (`thinking`) glimpse paragraf pertama ber-shimmer.
 * Saat jejak selesai DAN lebih dari sekadar glimpse → collapse ke glimpse sebagai
 * trigger yang membuka transkrip penuh; jejak satu-paragraf tetap teks muted polos.
 */
export function Reasoning({
  text,
  thinking,
  className,
}: {
  text: string;
  /** True selagi reasoning masih streaming (jawaban belum mulai). */
  thinking: boolean;
  className?: string;
}) {
  const preview = firstReasoningParagraph(text);
  if (!preview) return null;

  const full = text.trim();
  const hasMore = full !== preview;

  if (thinking || !hasMore) {
    return (
      <div className={cn(previewClass, className)}>
        {thinking ? <Shimmer as="span">{preview}</Shimmer> : preview}
      </div>
    );
  }

  return (
    <Collapsible className={cn("w-full min-w-0", className)}>
      <CollapsibleTrigger className="group flex w-full min-w-0 items-start gap-1 text-left">
        <span className={cn(previewClass, "line-clamp-2 hover:text-foreground")}>{preview}</span>
        <ChevronDownIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 group-focus-visible:opacity-100 group-data-[state=open]:rotate-180 group-data-[state=open]:opacity-100" />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden">
        <div className={cn(previewClass, "mt-1.5")}>{full}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
