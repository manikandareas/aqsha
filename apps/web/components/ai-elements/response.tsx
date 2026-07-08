"use client";

import { CitationProvider } from "@/components/ai-elements/inline-citation";
import { MessageResponse } from "@/components/ai-elements/message";
import { VizFigureProvider } from "@/features/threads/components/deep-viz/viz-context";
import { reportRehypePlugins } from "@/features/threads/lib/citation-markdown";
import type { SourceCardData } from "@/features/threads/lib/timeline-types";
import { useSmoothText } from "@/features/threads/lib/use-smooth-text";
import { cn } from "@/lib/utils";

/**
 * Teks jawaban asisten. Selagi streaming, di-reveal mulus via `useSmoothText`
 * (in-house) lalu dirender markdown lewat `MessageResponse` (Streamdown) → efek
 * "stream down" identik V1 (list/code/bold/tabel tumbuh progresif). Streamdown
 * menelan markdown setengah-jadi saat streaming; saat selesai teks tampil utuh.
 *
 * `citations` (peta `nomor → kartu`, dibangun `buildCitationMap`) mengaktifkan pill sitasi inline:
 * penanda `[n]` diubah jadi pill sumber + kartu Link Preview saat hover. Tanpa `citations`, `[n]`
 * tetap teks biasa (degradasi mulus, mis. jawaban tanpa pencarian).
 *
 * `viz` HANYA untuk laporan `/deep`: memasang `VizFigureProvider` yang mengizinkan fence
 * `aqsha:viz` dirender sebagai figur evidence viz. Di pesan lain fence semacam itu pasti
 * tulisan model (bukan keluaran injector) dan dirender sebagai code block polos (anti-pemalsuan).
 */
export function Response({
  text,
  streaming,
  className,
  citations,
  viz,
}: {
  text: string;
  streaming?: boolean;
  className?: string;
  citations?: Map<number, SourceCardData[]>;
  viz?: boolean;
}) {
  const shown = useSmoothText(text, { enabled: streaming ?? false });
  const content = (
    <MessageResponse
      className={cn("aqsha-prose aqsha-prose-message", className)}
      rehypePlugins={reportRehypePlugins}
    >
      {shown}
    </MessageResponse>
  );
  return (
    <CitationProvider value={citations}>
      {viz ? <VizFigureProvider>{content}</VizFigureProvider> : content}
    </CitationProvider>
  );
}
