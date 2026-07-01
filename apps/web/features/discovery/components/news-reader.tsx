"use client";

import { buildNewsMentionLabel, type ContextRef } from "@aqsha/chat-core";
import Image from "next/image";
import { useMemo } from "react";
import { toast } from "sonner";
import { useSetAmbientContextRefs } from "@/features/thread-experience/components/composer-context-mentions";
import { useFeedItem, useHideDiscovery, useRecordInteraction, useRelated } from "../api";
import { clampDiscoveryTitle, discoveryItemToContextRef } from "../ask-astra";
import { discoveryItemKey, feedItemToDiscoveryItem, type DiscoveryItem } from "../model";
import { domainFromUrl, relativeTime } from "../format";
import { DiscoveryStandardCard, type DiscoveryCardHandlers } from "./discovery-item-card";
import { ExploreReaderChatShell } from "./explore-reader-chat-shell";
import {
  AstraAgentAvatars,
  Eyebrow,
  ExpandableText,
  PillCta,
  ReaderEmpty,
  ReaderLoader,
  ReaderSection,
  ReaderShell,
} from "./reader-ui";

/** Halaman baca berita + panel chat Astra; menyematkan berita sebagai token konteks otomatis. */
export function NewsReaderRoute({ id }: { id: string }) {
  const item = useFeedItem(id).data;
  const title = item && item.kind === "news" ? item.title : undefined;
  const ambientContextRefs = useMemo<ContextRef[]>(
    () =>
      title
        ? [{ kind: "news", feedItemId: id, label: buildNewsMentionLabel(clampDiscoveryTitle(title)) }]
        : [],
    [id, title],
  );
  return (
    <ExploreReaderChatShell breadcrumb="Berita" ambientContextRefs={ambientContextRefs}>
      {({ openChat }) => <NewsReader id={id} onAskAstra={openChat} />}
    </ExploreReaderChatShell>
  );
}

/** Reader berita: getFeedItem(id) + related. Header + media-reveal + lead + badan artikel.
 * `onAskAstra` (disediakan shell halaman) membuka panel chat. */
export function NewsReader({ id, onAskAstra }: { id: string; onAskAstra: () => void }) {
  const query = useFeedItem(id);
  const related = useRelated(id);
  const hide = useHideDiscovery();
  const record = useRecordInteraction();
  const setAmbientContextRefs = useSetAmbientContextRefs();
  const item = query.data;
  const ok = item && item.kind === "news";

  // "Tanya Astra" (kartu utama/related): sematkan item sebagai token konteks + buka panel chat.
  const openAstraFor = (di: DiscoveryItem) => {
    const ref = discoveryItemToContextRef(di);
    if (ref) setAmbientContextRefs([ref]);
    onAskAstra();
  };

  const handlers: DiscoveryCardHandlers = {
    onAskAstra: (r) => {
      record.mutate({ itemRef: r.itemRef, kind: "research" });
      openAstraFor(r);
    },
    onSaved: (r) => record.mutate({ itemRef: r.itemRef, kind: "save" }),
    onHide: (r) => hide.mutate(r.itemRef, { onError: () => toast.error("Gagal menyembunyikan.") }),
  };

  const lead = ok ? item.tldr : undefined;
  // Prefer badan artikel ter-ekstrak; jatuh ke summary kalau tak ada lead & enrichment belum jalan.
  const body = ok ? (item.articleText ?? (lead ? undefined : item.summary)) : undefined;
  const sourceUrl = ok ? (item.resolvedUrl ?? item.url) : undefined;
  const domain = sourceUrl ? domainFromUrl(sourceUrl) : null;
  const time = ok ? relativeTime(item.publishedAt) : null;

  const askAstra = () => {
    if (!ok) return;
    const di = feedItemToDiscoveryItem(item);
    record.mutate({ itemRef: di.itemRef, kind: "research" });
    openAstraFor(di);
  };

  return (
    <ReaderShell width="news">
      {query.isPending ? (
        <ReaderLoader />
      ) : !ok ? (
        <ReaderEmpty
          title="Berita tidak ditemukan"
          message="Tautannya mungkin sudah kedaluwarsa. Kembali ke Jelajahi untuk temuan terbaru."
        />
      ) : (
        <article className="mt-7">
          <div className="flex items-center gap-2.5">
            <Eyebrow tone="lemon">Berita</Eyebrow>
            <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-muted-foreground">
              {domain ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
                  alt=""
                  aria-hidden
                  className="size-4 rounded-sm"
                />
              ) : null}
              <span className="truncate font-medium text-foreground/85">{item.sourceLabel}</span>
              {time ? <span className="shrink-0">· {time}</span> : null}
            </span>
          </div>

          <h1 className="mt-4 font-serif text-[28px] leading-[1.14] tracking-tight text-foreground sm:text-[38px]">
            {item.title}
          </h1>

          {item.imageUrl ? (
            <figure className="mt-6 rounded-3xl border border-border/60 bg-muted/40 p-1.5">
              <div className="relative aspect-[16/9] w-full overflow-hidden rounded-[calc(1.5rem-0.375rem)] bg-muted">
                <Image
                  src={item.imageUrl}
                  alt={item.title}
                  fill
                  unoptimized
                  sizes="(max-width: 896px) 100vw, 896px"
                  className="object-cover"
                />
              </div>
            </figure>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            <PillCta href={sourceUrl}>Baca di sumber asli</PillCta>
            <PillCta variant="outline" onClick={askAstra} bareIcon icon={<AstraAgentAvatars />}>
              Tanya Astra
            </PillCta>
          </div>

          {lead ? (
            <p className="mt-7 border-l-2 border-lemon-soft-border pl-4 text-[17px] font-medium leading-[1.6] text-foreground">
              {lead}
            </p>
          ) : null}

          {body ? (
            <div className="mt-5">
              <ExpandableText text={body} clampLines={12} />
            </div>
          ) : !lead ? (
            <p className="mt-7 text-sm leading-relaxed text-muted-foreground">
              Kami belum sempat merangkum berita ini. Buka sumber aslinya untuk membaca selengkapnya.
            </p>
          ) : null}
        </article>
      )}

      {related.data && related.data.length > 0 ? (
        <ReaderSection title="Bacaan lain untukmu" className="mt-14">
          <div className="@container/feed">
            <div className="grid grid-cols-1 gap-x-6 gap-y-9 @lg/feed:grid-cols-2 @3xl/feed:grid-cols-3">
              {related.data.map((r) => {
                const di = feedItemToDiscoveryItem(r);
                return (
                  <DiscoveryStandardCard key={discoveryItemKey(di)} item={di} busy={false} handlers={handlers} />
                );
              })}
            </div>
          </div>
        </ReaderSection>
      ) : null}
    </ReaderShell>
  );
}
