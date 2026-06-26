"use client";

import { Quote } from "@aqsha/ui/icons";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { TopCitedPaper } from "../aggregate";
import { formatCitationCount } from "../format";
import { feedDetailHref } from "../model";

// Fixed right rail: a single lean widget — the most-cited papers in the loaded
// set. Hides itself when there are no cited papers.
export function DiscoveryAside({ topCited }: { topCited: TopCitedPaper[] }) {
  if (topCited.length === 0) return null;
  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-[14px] border border-border bg-card p-3">
        <div className="px-1">
          <h2 className="mb-3 flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
            <Quote className="size-3.5" />
            Paling disitir
          </h2>
        </div>
        <ul className="space-y-0.5">
          {topCited.map(({ item, count }, index) => (
            <li key={item.paperKey ?? item.title}>
              <Link
                href={feedDetailHref(item) ?? item.url}
                className="group flex items-center gap-2.5 rounded-[9px] p-1.5 transition-colors hover:bg-muted"
              >
                <span
                  className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-mint-soft font-mono text-[12px] font-bold tabular-nums text-mint-foreground"
                  aria-hidden
                >
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-[12.5px] font-medium leading-snug text-muted-foreground group-hover:text-foreground">
                    {item.title}
                  </span>
                </span>
                <span
                  className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground"
                  title={formatCitationCount(count) ?? undefined}
                >
                  {compactCount(count)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function compactCount(value: number): string {
  return value >= 1_000
    ? `${(value / 1_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })}rb`
    : value.toLocaleString("id-ID");
}
