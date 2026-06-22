"use client";

import { api } from "@aqsha/convex/api";
import type { FeedItem } from "@aqsha/convex/feed";
import { ClockIcon } from "@aqsha/ui/icons";
import { topicBadgeClass } from "@/features/discovery/utils/discovery-format";
import { useConvexQueryData } from "@/lib/convex-query";
import { cn } from "@/lib/utils";
import { ReaderActions } from "../components/reader-actions";
import {
  ReaderArticleBody,
  ReaderHeroMedia,
  ReaderRelatedGrid,
  ReaderSourceCard,
} from "../components/reader-bits";
import { relativeTime } from "../utils/reader-format";
import { ReaderDetailShell } from "./reader-detail-shell";
import { ReaderDetailLoading } from "./reader-detail-loading";
import { ReaderDetailState } from "./reader-detail-state";

function buildNewsSeed(item: FeedItem) {
  const title = item.titleId ?? item.title;
  const body = item.articleText ?? item.summary;
  // Prefer the decoded publisher URL over the opaque Google News redirect so
  // the research agent gets a readable source.
  const sourceUrl = item.resolvedUrl ?? item.url;
  return `${title}\n\n${body}\n\nSumber: ${sourceUrl}`;
}

export function NewsDetailPage({ feedItemId }: { feedItemId: string }) {
  const data = useConvexQueryData(
    api.feed.getFeedItem,
    feedItemId ? { feedItemId } : "skip",
  );
  const chatSeed =
    data && data.kind === "news" ? buildNewsSeed(data as FeedItem) : undefined;

  return (
    <ReaderDetailShell breadcrumbLabel="Berita" chatSeed={chatSeed}>
      {data === undefined ? (
        <ReaderDetailLoading />
      ) : !data || data.kind !== "news" ? (
        <ReaderDetailState
          title="Berita tidak tersedia."
          message="Item ini tidak ditemukan atau bukan berita. Coba kembali ke Jelajahi."
        />
      ) : (
        <NewsDetailContent item={data as FeedItem} />
      )}
    </ReaderDetailShell>
  );
}

function NewsDetailContent({ item }: { item: FeedItem }) {
  const title = item.titleId ?? item.title;
  const lead = item.tldrId ?? item.tldr ?? item.summary;
  const body = item.articleText ?? item.summary;
  const showBody = Boolean(body) && body !== lead;
  const time = relativeTime(item.publishedAt, "id");

  const related = useConvexQueryData(api.feed.getRelatedFeedItems, {
    feedItemId: item._id,
    limit: 8,
  });

  const seed = buildNewsSeed(item);

  return (
    <article className="min-w-0">
      <h1 className="font-heading text-[28px] font-bold leading-[1.12] tracking-tight text-foreground sm:text-[36px]">
        {title}
      </h1>

      {lead ? (
        <p className="mt-4 text-[16px] leading-7 text-ink-soft">{lead}</p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <ReaderSourceCard
          url={item.resolvedUrl ?? item.url}
          label={item.sourceLabel}
        />
        {time ? (
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
            <ClockIcon className="size-3.5" /> Diterbitkan {time}
          </span>
        ) : null}
      </div>

      <ReaderHeroMedia
        imageUrl={item.imageUrl}
        title={title}
        className="mt-6"
      />

      {showBody ? <ReaderArticleBody text={body} className="mt-7" /> : null}

      {item.topics.length > 0 ? (
        <div className="mt-6 flex flex-wrap gap-2">
          {item.topics.slice(0, 6).map((topic) => (
            <span
              key={topic}
              className={cn(
                "inline-flex h-6 items-center rounded-[5px] px-2 text-[11px] font-semibold leading-none",
                topicBadgeClass(topic),
              )}
            >
              {topic}
            </span>
          ))}
        </div>
      ) : null}

      <ReaderActions item={item} askLabel="Tanya Astra" researchSeed={seed} />

      <ReaderRelatedGrid items={(related ?? []) as FeedItem[]} />
    </article>
  );
}
