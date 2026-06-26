// Header zona Explore: nomor mono + judul serif + subjudul + hairline + slot kanan.
// Dipakai zona Pulse (01), Masuk lebih dalam (02), Temuan untukmu (03).

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
