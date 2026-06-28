"use client";

// Command bar Explore (Row 0). Greeting ringkas + ask-bar lebar (anchor halaman) + interest
// pills. Pill = FeedTopic asli → klik men-scope feed. Widget analitik (Pulse, Konstelasi, dst.)
// hidup di bento page-level di bawah, bukan di sini — agar tak ada void & ask-bar jadi fokus.

import { PlusIcon } from "@aqsha/ui/icons";
import { useViewerDisplay } from "@/lib/use-viewer-identity";
import { FEED_TOPIC_LABELS, type FeedTopic } from "@/features/discovery/types";
import { DISCOVERY_TOPICS } from "@/features/discovery/nav";
import { cn } from "@/lib/utils";
import type { InterestPill } from "../types";
import { ExploreAskBar } from "./explore-ask-bar";

const PILLS: InterestPill[] = [
  { id: null, label: "Semua" },
  ...DISCOVERY_TOPICS.map((t) => ({ id: t, label: FEED_TOPIC_LABELS[t] })),
];

export function ExploreHero({
  activeTopic,
  onSelectTopic,
  query,
  onSubmitQuery,
}: {
  activeTopic: FeedTopic | null;
  onSelectTopic: (topic: FeedTopic | null) => void;
  query: string;
  onSubmitQuery: (q: string) => void;
}) {
  const { name } = useViewerDisplay(undefined, { name: "", email: "" });
  const firstName = name.trim().split(/\s+/)[0] ?? "";
  const greeting = firstName
    ? `${firstName}, mulai dari topik yang lagi hangat.`
    : "Mulai dari topik yang lagi hangat.";

  return (
    <section className="pt-10 pb-2 sm:pt-12">
      <h1 className="mb-6 max-w-[760px] font-heading text-[clamp(30px,3.6vw,46px)] font-medium leading-[1.07] tracking-tight text-balance text-foreground">
        {greeting}
      </h1>

      <ExploreAskBar value={query} onSubmit={onSubmitQuery} />

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {PILLS.map((pill) => {
          const active = pill.id === activeTopic;
          return (
            <button
              key={pill.id ?? "all"}
              type="button"
              onClick={() => onSelectTopic(pill.id)}
              aria-pressed={active}
              className={cn(
                "rounded-full border px-4 py-2 text-[13px] font-medium transition-[transform,border-color,background-color,color] duration-150 ease-out hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97]",
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
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-2 font-mono text-[11px] text-muted-foreground transition-[transform,border-color,color] duration-150 ease-out hover:border-primary hover:text-primary active:scale-[0.97]"
        >
          <PlusIcon className="size-3.5" /> Atur
        </button>
      </div>
    </section>
  );
}
