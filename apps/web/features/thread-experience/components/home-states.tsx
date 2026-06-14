"use client";

import { panelBodyPaddingClass } from "@/lib/panel-surface";
import { cn } from "@/lib/utils";
import { m, useReducedMotion } from "motion/react";
import type { RateStatus } from "../types";
import type {
  DraftContextArtifact,
  StartThread,
  ThreadSummary,
} from "./component-types";
import { ComposerHeroState } from "./composer-hero-state";
import { Composer } from "./composer";
import { ExploreHandwrittenCue } from "./explore-handwritten-cue";
import { HomeExploreBento } from "./home-explore-bento";

const HOME_EASE_OUT = [0.23, 1, 0.32, 1] as const;

export function HomeStartState({
  rateStatus,
  startThread,
  threads,
  contextArtifacts,
  onRemoveContextArtifact,
  onThreadCreated,
  contextLabel,
  seed,
  compact = false,
}: {
  rateStatus: RateStatus | undefined;
  startThread: StartThread;
  threads: ThreadSummary[];
  contextArtifacts?: DraftContextArtifact[];
  onRemoveContextArtifact?: (artifactId: string) => void;
  onThreadCreated?: (threadId: string) => void;
  contextLabel?: string;
  seed?: string;
  compact?: boolean;
}) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden bg-background">
      <div
        className={cn(
          "relative mx-auto flex w-full items-center justify-center",
          compact
            ? cn("flex-1 max-w-none", panelBodyPaddingClass)
            : "min-h-[calc(100%-5rem)] max-w-5xl px-4 py-10 sm:px-8",
        )}
      >
        <m.div
          className={cn("w-full", compact ? "max-w-none" : "max-w-2xl")}
          initial={
            shouldReduceMotion
              ? { opacity: 0 }
              : { opacity: 0, transform: "translateY(10px) scale(0.985)" }
          }
          animate={{ opacity: 1, transform: "translateY(0px) scale(1)" }}
          transition={{
            duration: shouldReduceMotion ? 0.14 : 0.24,
            ease: HOME_EASE_OUT,
          }}
        >
          <ComposerHeroState
            headerClassName="mb-5 gap-2"
            logoClassName={compact ? "size-12 sm:size-18" : "size-12 sm:size-22"}
            titleClassName={cn(
              "font-sans font-bold tracking-tight text-foreground leading-none",
              compact ? "text-xl" : "text-2xl sm:text-3xl",
            )}
          >
            <Composer
              mode="draft"
              variant="hero"
              disabled={false}
              rateStatus={rateStatus}
              onStartThread={startThread}
              onThreadCreated={onThreadCreated}
              threads={threads}
              contextArtifacts={contextArtifacts}
              onRemoveContextArtifact={onRemoveContextArtifact}
              contextLabel={contextLabel}
              initialContent={seed}
              showSuggestions
            />
          </ComposerHeroState>
        </m.div>
        {compact ? null : <ExploreHandwrittenCue shouldReduceMotion={shouldReduceMotion ?? false} />}
      </div>
      {compact ? null : <HomeExploreBento />}
    </main>
  );
}
