// Header zona Explore: judul serif + subjudul + hairline + slot kanan (full-width
// section). TileHeader = varian ringkas tanpa hairline untuk header di dalam tile bento.

import type { ReactNode } from "react";

export function SectionHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
      <h2 className="shrink-0 font-heading text-2xl font-semibold tracking-tight text-foreground">{title}</h2>
      {subtitle ? <span className="shrink-0 text-[13px] text-muted-foreground">{subtitle}</span> : null}
      <span className="h-px min-w-6 flex-1 bg-border" aria-hidden />
      {right}
    </div>
  );
}

/** Header ringkas di dalam tile bento — judul serif + slot kanan, tanpa hairline. */
export function TileHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="flex min-w-0 items-baseline gap-2.5">
        <h3 className="shrink-0 font-heading text-lg font-semibold tracking-tight text-foreground">
          {title}
        </h3>
        {subtitle ? (
          <span className="min-w-0 truncate text-[12.5px] text-muted-foreground">{subtitle}</span>
        ) : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}
