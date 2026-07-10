"use client";

import type { StatsFigureBlock } from "@aqsha/chat-core/stats-viz";
import { useStatsViz } from "./stats-context";

/**
 * Figur PNG dari sandbox Daytona (scatterplot heteroskedastisitas, P-P plot, dsb.) — base64
 * di-render langsung sebagai data-uri. Nomor "Gambar n" di-assign provider (urutan dokumen).
 * `max-w-full` + wrapper border supaya konsisten dengan tabel.
 */
export function StatsFigure({ block }: { block: StatsFigureBlock }) {
  const ctx = useStatsViz();
  const number = block.figureNumber ?? ctx?.assignFigure(block.id) ?? 0;
  const label = number > 0 ? `Gambar ${number}` : "Gambar";
  const caption = block.caption?.trim();
  return (
    <figure className="stats-viz my-5 min-w-0 not-prose">
      <div className="min-w-0 overflow-x-auto rounded-lg border bg-white p-2">
        {/* Chart statis dari sandbox (bukan konten user) — alt deskriptif dari caption/label. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`data:image/png;base64,${block.png}`}
          alt={caption || label}
          className="mx-auto block h-auto max-w-full"
        />
      </div>
      <figcaption className="mt-2 flex min-w-0 items-baseline gap-2 text-[11px] leading-4">
        <span className="shrink-0 font-medium font-mono text-muted-foreground/80 tracking-wide">
          {label}
        </span>
        {caption ? <span className="min-w-0 text-muted-foreground">{caption}</span> : null}
      </figcaption>
    </figure>
  );
}
