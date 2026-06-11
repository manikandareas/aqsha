"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { api } from "@aqsha/convex/api";
import {
  discoveryItemKey,
  feedItemToDiscoveryItem,
  type DiscoveryItem,
  type FeedItem,
} from "@aqsha/convex/feed";
import { CompassIcon } from "@aqsha/ui/icons";
import {
  panelBodyPaddingClass,
  panelComposerPaddingClass,
  threadTranscriptColumnClass,
} from "@/lib/panel-surface";
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
import {
  DiscoveryClaimCard,
  DiscoveryHeroCard,
  DiscoveryStandardCard,
  type DiscoveryCardHandlers,
} from "@/features/discovery/components/discovery-item-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useConvexQueryData } from "@/lib/convex-query";
import { useStartResearch } from "@/features/discovery/hooks/use-start-research";

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

function ExploreHandwrittenCue({
  shouldReduceMotion,
}: {
  shouldReduceMotion: boolean;
}) {
  return (
    <m.div
      className="absolute bottom-7 left-4 flex items-center gap-1.5 sm:left-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, ease: HOME_EASE_OUT, delay: 0.5 }}
    >
      <span className="font-hand text-[17px] text-muted-foreground">
        bacaan hari ini
      </span>
      <m.svg
        viewBox="0 0 219 41"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="-scale-x-100 rotate-[20deg] shrink-0 fill-muted-foreground"
        style={{ width: 42 }}
        initial={{ opacity: 0.4, scale: 1 }}
        animate={
          shouldReduceMotion
            ? { opacity: 0.4 }
            : { opacity: [0.4, 0.65, 0.4], scale: [1, 1.08, 1] }
        }
        transition={{
          duration: 2.4,
          ease: "easeInOut",
          repeat: Infinity,
          repeatDelay: 0.4,
        }}
      >
        <g clipPath="url(#clip0_home_cue)">
          <path d="M21.489 29.4305C36.9333 31.3498 51.3198 33.0559 65.7063 34.9753C66.7641 35.1885 67.6104 36.4681 69.9376 38.3875C63.1675 39.2406 57.8783 40.3069 52.5892 40.5201C38.6259 40.9467 24.8741 40.9467 10.9107 40.9467C9.21821 40.9467 7.5257 41.1599 5.83317 40.7334C0.332466 39.6671 -1.57164 36.0416 1.39028 31.1365C2.87124 28.7906 4.56377 26.658 6.46786 24.7386C13.6611 17.4876 21.0659 10.4499 28.4707 3.41224C29.7401 2.13265 31.6442 1.49285 34.183 0C34.6061 10.8765 23.8162 13.8622 21.489 22.3927C23.3931 21.9662 25.0856 21.7529 26.5666 21.3264C83.6894 5.54486 140.601 7.25099 197.3 22.606C203.224 24.0988 208.936 26.4447 214.649 28.5773C217.61 29.6437 220.149 31.9896 218.457 35.6151C216.976 39.2406 214.014 39.2406 210.629 37.7477C172.759 20.6866 132.561 18.7672 91.9404 19.407C70.7838 19.6203 50.0504 21.9662 29.5285 26.8713C26.9897 27.5111 24.4509 28.3641 21.489 29.4305Z" />
        </g>
        <defs>
          <clipPath id="clip0_home_cue">
            <rect width="219" height="41" />
          </clipPath>
        </defs>
      </m.svg>
    </m.div>
  );
}

function HomeExploreBento() {
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();
  const { startResearch, busyKey } = useStartResearch();

  const feedData = useConvexQueryData(api.feed.getFeed, { limit: 7 });
  const isLoading = feedData === undefined;

  const items = useMemo<DiscoveryItem[]>(() => {
    return ((feedData ?? []) as FeedItem[]).map(feedItemToDiscoveryItem);
  }, [feedData]);

  if (!isLoading && items.length === 0) return null;

  const gridItems = items.slice(0, 3);
  const hero = items[3];

  const handlers: DiscoveryCardHandlers = {
    onTeliti: (item) =>
      void startResearch(
        `${item.title}\n\n${item.tldr ?? item.summary}\n\nSumber: ${item.url}`,
        { busyKey: discoveryItemKey(item) },
      ),
    onSave: () => router.push("/app/explore"),
    onSaveToWorkspace: () => router.push("/app/explore"),
    onHide: () => router.push("/app/explore"),
    onOpenEvidence: (item) => {
      if (item._id) router.push(`/app/explore/f/${item._id}`);
      else router.push("/app/explore");
    },
    onGenerateIdeas: () => router.push("/app/explore"),
    onWhyRelevant: () => router.push("/app/explore"),
  };

  return (
    <m.section
      className="mx-auto w-full max-w-5xl px-4 pb-16 pt-2 sm:px-8"
      initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: HOME_EASE_OUT, delay: 0.12 }}
    >
      <div className="@container/feed">
        {isLoading ? (
          <HomeBentoSkeleton />
        ) : (
          <div className="space-y-8">
            {gridItems.length > 0 && (
              <div className="grid grid-cols-1 gap-x-6 gap-y-8 @md/feed:grid-cols-2 @3xl/feed:grid-cols-3">
                {gridItems.map((item) => (
                  <div key={discoveryItemKey(item)}>
                    {item.kind === "claim" ? (
                      <DiscoveryClaimCard
                        item={item}
                        lang="id"
                        saved={false}
                        busy={busyKey === discoveryItemKey(item)}
                        handlers={handlers}
                      />
                    ) : (
                      <DiscoveryStandardCard
                        item={item}
                        lang="id"
                        saved={false}
                        busy={busyKey === discoveryItemKey(item)}
                        handlers={handlers}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
            {hero && (
              <DiscoveryHeroCard
                item={hero}
                lang="id"
                saved={false}
                busy={busyKey === discoveryItemKey(hero)}
                handlers={handlers}
              />
            )}
          </div>
        )}
      </div>

      <div className="mt-10 flex justify-center">
        <Link
          href="/app/explore"
          className="group inline-flex items-center gap-1.5 whitespace-nowrap px-1.5 py-0.5 font-sans text-[11px] font-medium text-muted-foreground outline-none drop-shadow-[0_0_10px_color-mix(in_oklch,var(--muted-foreground)_24%,transparent)] transition-colors hover:text-foreground focus-visible:text-foreground"
          aria-label="Buka Explore"
        >
          <span className="relative">
            Lihat lebih banyak
            <span className="absolute -bottom-0.5 left-0 h-px w-full origin-left scale-x-[0.7] bg-muted-foreground opacity-35 transition-transform duration-300 ease-out group-hover:scale-x-100 group-hover:opacity-55 group-focus-visible:scale-x-100 group-focus-visible:opacity-55" />
          </span>
          <m.span
            aria-hidden="true"
            className="grid size-3.5 place-items-center text-muted-foreground"
            animate={shouldReduceMotion ? undefined : { rotate: [0, -8, 8, 0] }}
            transition={{
              duration: 3.1,
              ease: "easeInOut",
              repeat: Infinity,
              repeatDelay: 0.45,
            }}
          >
            <CompassIcon className="size-3.5" strokeWidth={2.25} />
          </m.span>
        </Link>
      </div>
    </m.section>
  );
}

function HomeBentoSkeleton() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-5 @xl/feed:grid-cols-[minmax(0,1fr)_minmax(280px,40%)] @xl/feed:gap-7">
        <div className="order-2 flex flex-col justify-center gap-3 @xl/feed:order-1">
          <Skeleton className="h-3 w-28 rounded-full bg-muted/50" />
          <Skeleton className="h-7 w-[85%] rounded-[8px] bg-muted/60" />
          <Skeleton className="h-7 w-[65%] rounded-[8px] bg-muted/60" />
          <Skeleton className="mt-1 h-4 w-full rounded-full bg-muted/40" />
          <Skeleton className="h-4 w-[80%] rounded-full bg-muted/40" />
        </div>
        <Skeleton className="order-1 h-48 w-full rounded-[12px] bg-muted/60 @xl/feed:order-2 @xl/feed:h-full" />
      </div>
      <div className="grid grid-cols-1 gap-x-6 gap-y-8 @md/feed:grid-cols-2 @3xl/feed:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-3">
            <Skeleton className="aspect-[16/10] w-full rounded-[12px] bg-muted/50" />
            <Skeleton className="h-5 w-[85%] rounded-[6px] bg-muted/50" />
            <Skeleton className="h-4 w-1/2 rounded-full bg-muted/40" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function EmptyThreadCopy({ title }: { title?: string }) {
  return (
    <div className="grid flex-1 place-items-center py-16 text-center">
      <div className="grid gap-5">
        <p className="font-hand text-2xl text-lavender">
          quiet desk, clear artifacts
        </p>
        <div className="grid gap-3">
          <h1 className="font-heading text-[28px] font-bold leading-tight sm:text-[32px]">
            {title ?? "Mulai riset dari satu pertanyaan."}
          </h1>
          <p className="mx-auto max-w-xl text-[15px] leading-7 text-muted-foreground">
            Tempat tenang untuk menyusun pertanyaan, membaca kembali konteks,
            dan menjaga riset tetap rapi.
          </p>
        </div>
      </div>
    </div>
  );
}

export function AccessDeniedState() {
  return (
    <div className="flex flex-1 flex-col justify-between gap-8">
      <div className="mx-auto grid w-full max-w-xl flex-1 place-items-center py-10 text-center">
        <div className="grid gap-3">
          <h1 className="font-heading text-3xl font-bold leading-tight">
            Thread tidak tersedia.
          </h1>
          <p className="text-[15px] leading-7 text-muted-foreground">
            Thread ini tidak ditemukan untuk akun yang sedang masuk.
          </p>
        </div>
      </div>
      <div
        className={cn("border-t bg-background/85", panelComposerPaddingClass)}
      >
        <div className={threadTranscriptColumnClass}>
          <Composer mode="disabled" disabled rateStatus={undefined} />
        </div>
      </div>
    </div>
  );
}
