"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@aqsha/convex/api";
import {
  discoveryItemKey,
  feedItemToDiscoveryItem,
  type DiscoveryItem,
  type FeedItem,
} from "@aqsha/convex/feed";
import { CompassIcon } from "@aqsha/ui/icons";
import { m, useReducedMotion } from "motion/react";
import {
  DiscoveryClaimCard,
  DiscoveryHeroCard,
  DiscoveryStandardCard,
  type DiscoveryCardHandlers,
} from "@/features/discovery/components/discovery-item-card";
import { useConvexQueryData } from "@/lib/convex-query";
import { useStartResearch } from "@/features/discovery/hooks/use-start-research";
import { HomeBentoSkeleton } from "./home-bento-skeleton";

const HOME_EASE_OUT = [0.23, 1, 0.32, 1] as const;

export function HomeExploreBento() {
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();
  const { startResearch, busyKey } = useStartResearch();

  const feedData = useConvexQueryData(api.feed.getFeed, { limit: 7 });
  const isLoading = feedData === undefined;

  const items: DiscoveryItem[] = ((feedData ?? []) as FeedItem[]).map(feedItemToDiscoveryItem);

  if (!isLoading && items.length === 0) return null;

  const gridItems = items.slice(0, 3);
  const hero = items[3];

  const handlers: DiscoveryCardHandlers = {
    onAskAstra: (item) =>
      void startResearch(
        `${item.title}\n\n${item.tldr ?? item.summary}\n\nSumber: ${item.resolvedUrl ?? item.url}`,
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
