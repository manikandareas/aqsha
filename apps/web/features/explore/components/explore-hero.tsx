"use client";

// Zona 0+1 · Hero. Kiri: greeting + ask-bar + interest pills.
// Kanan: "Tren riset" (compact Pulse). Interest pill = FeedTopic asli → klik men-scope feed Zona 4.

import { PlusIcon } from "@aqsha/ui/icons";
import { useViewerDisplay } from "@/lib/use-viewer-identity";
import { FEED_TOPIC_LABELS, type FeedTopic } from "@/features/discovery/types";
import { DISCOVERY_TOPICS } from "@/features/discovery/nav";
import { cn } from "@/lib/utils";
import type { InterestPill, PulseData } from "../types";
import { ExploreAskBar } from "./explore-ask-bar";
import { PulseStream } from "./pulse-stream";

const PILLS: InterestPill[] = [
  { id: null, label: "Semua" },
  ...DISCOVERY_TOPICS.map((t) => ({ id: t, label: FEED_TOPIC_LABELS[t] })),
];

export function ExploreHero({
  activeTopic,
  onSelectTopic,
  query,
  onSubmitQuery,
  pulse,
  pulseLoading,
}: {
  activeTopic: FeedTopic | null;
  onSelectTopic: (topic: FeedTopic | null) => void;
  query: string;
  onSubmitQuery: (q: string) => void;
  pulse?: PulseData;
  pulseLoading: boolean;
}) {
  const { name } = useViewerDisplay(undefined, { name: "", email: "" });
  const firstName = name.trim().split(/\s+/)[0] ?? "";
  const greeting = firstName
    ? `${firstName}, mulai dari topik yang lagi hangat.`
    : "Mulai dari topik yang lagi hangat.";
  return (
    <section className="grid items-center gap-8 pt-10 pb-4 @3xl/explore:grid-cols-[1.06fr_0.94fr] @3xl/explore:gap-8 sm:pt-12">
      <div className="max-w-[560px]">
        <h1 className="mb-6 font-heading text-[clamp(34px,4.4vw,52px)] font-medium leading-[1.06] tracking-tight text-foreground text-balance">
          {greeting}
        </h1>

        <ExploreAskBar value={query} onSubmit={onSubmitQuery} />

        <div className="mt-6 mb-8 flex flex-wrap items-center gap-2">
          {PILLS.map((pill) => {
            const active = pill.id === activeTopic;
            return (
              <button
                key={pill.id ?? "all"}
                type="button"
                onClick={() => onSelectTopic(pill.id)}
                className={cn(
                  "rounded-full border px-4 py-2 text-[13px] font-medium transition-all hover:-translate-y-0.5",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-muted-foreground/40",
                )}
              >
                {pill.label}
              </button>
            );
          })}
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-2 font-mono text-[11px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <PlusIcon className="size-3.5" /> Atur
          </button>
        </div>
      </div>

      <div className="relative min-h-[420px] self-stretch">
        <PulseStream pulse={pulse} loading={pulseLoading} query={query} />
      </div>
    </section>
  );
}
