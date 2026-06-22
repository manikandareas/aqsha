"use client";

import type { FeedConsensus } from "@aqsha/convex/feed";
import { cn } from "@/lib/utils";

// Scientific-consensus gauge (yes / possibly / no) over papers that answer a
// claim's underlying question. Extracted from the former evidence drawer so the
// fact-check detail page and any future surface share one implementation.
export function ConsensusMeter({ consensus }: { consensus: FeedConsensus }) {
  const { yes, no, possibly, total, papers } = consensus;
  if (total === 0) {
    return (
      <p className="mt-2 text-[12px] text-muted-foreground">
        Belum ada paper yang menjawab langsung pertanyaan ini.
      </p>
    );
  }
  const pct = (n: number) => Math.round((n / total) * 100);
  return (
    <div className="mt-2.5">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-mint" style={{ width: `${pct(yes)}%` }} />
        <div className="h-full bg-lemon" style={{ width: `${pct(possibly)}%` }} />
        <div className="h-full bg-destructive" style={{ width: `${pct(no)}%` }} />
      </div>
      <p className="mt-1.5 text-[11.5px] font-medium text-muted-foreground">
        <span className="text-mint-foreground">{yes} Ya</span> ·{" "}
        <span className="text-lemon-foreground">{possibly} Mungkin</span> ·{" "}
        <span className="text-destructive">{no} Tidak</span>{" "}
        <span className="text-muted-foreground/70">(dari {total} paper)</span>
      </p>
      <ul className="mt-2.5 space-y-1.5">
        {papers.slice(0, 6).map((paper) => (
          <li key={paper.key} className="flex items-start gap-2 text-[12px]">
            <StanceChip stance={paper.stance} />
            <a
              href={paper.url}
              target="_blank"
              rel="noreferrer"
              className="line-clamp-1 text-foreground underline-offset-2 hover:underline"
            >
              {paper.title}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StanceChip({
  stance,
}: {
  stance: "yes" | "no" | "possibly" | "neutral";
}) {
  const map = {
    yes: { label: "Ya", className: "bg-mint-soft text-mint-foreground" },
    no: { label: "Tidak", className: "bg-destructive/10 text-destructive" },
    possibly: { label: "Mungkin", className: "bg-lemon-soft text-lemon-foreground" },
    neutral: { label: "Netral", className: "bg-muted text-muted-foreground" },
  } as const;
  const s = map[stance];
  return (
    <span
      className={cn(
        "mt-0.5 inline-flex h-4 shrink-0 items-center rounded-[4px] px-1.5 text-[10px] font-semibold leading-none",
        s.className,
      )}
    >
      {s.label}
    </span>
  );
}
