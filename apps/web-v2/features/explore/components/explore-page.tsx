"use client";

// Halaman Explore (redesign editorial 4-zona). Header (breadcrumb kiri + toggle
// Chat kanan) selaras dengan /app & workspace detail; sticky + glass (low-opacity
// bg + backdrop-blur) di atas feed yang scroll. Saat Chat dibuka, surface pecah
// jadi split (DetailSplitLayout) dengan panel chat Astra workspace-less.

import { ChevronRightIcon, MessageSquareIcon, PanelLeftIcon } from "@aqsha/ui/icons";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useState } from "react";
import { DetailSplitLayout } from "@/components/layout/detail-split-layout";
import { ResponsiveSidePanel } from "@/components/layout/responsive-side-panel";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { ComposerMentionsProvider } from "@/features/thread-experience/components/composer-context-mentions";
import { FEED_TOPIC_LABELS, type FeedTopic } from "@/features/discovery/types";
import { panelHeaderBarClass } from "@/lib/panel-surface";
import { cn } from "@/lib/utils";
import { useExploreAnalysis, useExploreFacets } from "../api";
import { ExploreChatSidePanel } from "./explore-chat-side-panel";
import { ExploreFindings } from "./explore-findings";
import { ExploreHero } from "./explore-hero";
import { GapFinder, type GapStatus } from "./gap-finder";
import { PulseStream } from "./pulse-stream";
import { SectionHeader } from "./section-header";
import { TensionMap } from "./tension-map";

const TOPIC_VALUES = [
  "sains_teknologi",
  "kesehatan",
  "lingkungan",
  "sosial_ekonomi",
  "pendidikan",
] as const;

export function ExplorePage() {
  const leftSidebar = useSidebar();
  // `q` & `topic` di URL (nuqs) — single source of truth, menggerakkan SEMUA section + shareable.
  const [q, setQ] = useQueryState("q", { defaultValue: "" });
  const [topic, setTopic] = useQueryState("topic", parseAsStringLiteral(TOPIC_VALUES));
  const [chatOpen, setChatOpen] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);

  const facets = useExploreFacets(q);
  const analysis = useExploreAnalysis(q);

  const trimmedQ = q.trim();
  const analysisStatus: GapStatus =
    trimmedQ.length < 2
      ? "idle"
      : analysis.data?.status === "ready"
        ? "ready"
        : analysis.isError || analysis.data?.status === "error"
          ? "error"
          : "loading";

  const submitQuery = (next: string) => {
    void setQ(next.trim() ? next.trim() : "");
  };

  const isLeftSidebarOpen = leftSidebar.isMobile
    ? leftSidebar.openMobile
    : leftSidebar.open;

  const handleThreadChange = (next: string | null) => {
    setThreadId(next);
    if (next !== null) setChatOpen(true);
  };

  return (
    <main className="flex h-svh min-h-0 flex-col overflow-hidden bg-background">
      <ComposerMentionsProvider threadId={threadId ?? undefined}>
        <DetailSplitLayout
          sideOpen={chatOpen}
          onSideOpenChange={setChatOpen}
          main={
            <div className="@container/explore min-h-0 flex-1 overflow-y-auto">
              <ExploreHeader
                activeTopic={topic}
                onResetTopic={() => setTopic(null)}
                chatOpen={chatOpen}
                onToggleChat={() => setChatOpen((open) => !open)}
                showLeftTrigger={!isLeftSidebarOpen}
                onToggleLeftSidebar={leftSidebar.toggleSidebar}
              />
              <div className="mx-auto w-full max-w-[1180px] px-6 pb-24 sm:px-7">
                <ExploreHero
                  activeTopic={topic}
                  onSelectTopic={(next) => void setTopic(next)}
                  query={q}
                  onSubmitQuery={submitQuery}
                  globeNodes={facets.data?.globe.nodes ?? []}
                  globeArcs={facets.data?.globe.arcs ?? []}
                  globeLoading={facets.isPending}
                />

                <PulseStream pulse={facets.data?.pulse} loading={facets.isPending} />

                <section className="pt-16">
                  <SectionHeader
                    title="Masuk lebih dalam"
                    subtitle="Tiap klaim menempel ke sitasi yang bisa dicek"
                  />
                  <div className="mt-5 grid grid-cols-1 border-y border-border @3xl/explore:grid-cols-[1.1fr_1fr] @3xl/explore:divide-x @3xl/explore:divide-border">
                    <GapFinder
                      q={q}
                      status={analysisStatus}
                      gaps={analysis.data?.gap ?? []}
                      onSubmitQuery={submitQuery}
                    />
                    <TensionMap status={analysisStatus} tension={analysis.data?.tension ?? null} />
                  </div>
                </section>

                <ExploreFindings topic={topic} query={q} />
              </div>
            </div>
          }
          side={
            <ResponsiveSidePanel open={chatOpen}>
              <ExploreChatSidePanel
                activeThreadId={threadId}
                onActiveThreadIdChange={handleThreadChange}
              />
            </ResponsiveSidePanel>
          }
        />
      </ComposerMentionsProvider>
    </main>
  );
}

function ExploreHeader({
  activeTopic,
  onResetTopic,
  chatOpen,
  onToggleChat,
  showLeftTrigger,
  onToggleLeftSidebar,
}: {
  activeTopic: FeedTopic | null;
  onResetTopic: () => void;
  chatOpen: boolean;
  onToggleChat: () => void;
  showLeftTrigger: boolean;
  onToggleLeftSidebar: () => void;
}) {
  const topicLabel = activeTopic ? FEED_TOPIC_LABELS[activeTopic] : null;

  return (
    <header className={panelHeaderBarClass}>
      <nav
        aria-label="Breadcrumb"
        className="flex min-w-0 items-center gap-1.5 text-[13px]"
      >
        {showLeftTrigger ? (
          <Button
            type="button"
            variant="ghost"
            className="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={onToggleLeftSidebar}
            aria-label="Buka sidebar kiri"
          >
            <PanelLeftIcon className="size-3.5" />
          </Button>
        ) : null}
        <button
          type="button"
          onClick={onResetTopic}
          className={cn(
            "shrink-0 truncate rounded-md font-medium transition-colors",
            topicLabel
              ? "text-muted-foreground hover:text-foreground"
              : "text-foreground",
          )}
        >
          Jelajahi
        </button>
        {topicLabel ? (
          <>
            <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground/60" />
            <span className="min-w-0 truncate font-medium text-foreground">
              {topicLabel}
            </span>
          </>
        ) : null}
      </nav>
      <button
        type="button"
        onClick={onToggleChat}
        className={cn(
          "flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold transition-colors",
          chatOpen
            ? "bg-primary/15 text-primary"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <MessageSquareIcon className="size-3.5" />
        Chat
      </button>
    </header>
  );
}
