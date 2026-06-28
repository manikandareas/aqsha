"use client";

import { SparklesIcon } from "@aqsha/ui/icons";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useFeedItem, useHideDiscovery, useRecordInteraction, useRelated } from "../api";
import { discoveryItemKey, feedItemToDiscoveryItem, type DiscoveryItem } from "../model";
import { domainFromUrl, relativeTime } from "../format";
import { DiscoveryStandardCard, type DiscoveryCardHandlers } from "./discovery-item-card";
import {
  Eyebrow,
  ExpandableText,
  PillCta,
  ReaderBackLink,
  ReaderEmpty,
  ReaderLoader,
  ReaderSection,
  ReaderShell,
} from "./reader-ui";

/** Reader berita: getFeedItem(id) + related. Header + media-reveal + lead + badan artikel. */
export function NewsReader({ id }: { id: string }) {
  const router = useRouter();
  const query = useFeedItem(id);
  const related = useRelated(id);
  const hide = useHideDiscovery();
  const record = useRecordInteraction();
  const item = query.data;
  const ok = item && item.kind === "news";

  const handlers: DiscoveryCardHandlers = {
    onAskAstra: (r) => {
      record.mutate({ itemRef: r.itemRef, kind: "research" });
      router.push(`/app/threads?seed=${encodeURIComponent(buildSeed(r))}`);
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
    router.push(`/app/threads?seed=${encodeURIComponent(buildSeed(di))}`);
  };

  return (
    <ReaderShell width="news">
      <ReaderBackLink />
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
            <PillCta variant="outline" onClick={askAstra} icon={<SparklesIcon className="size-4" />}>
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

function buildSeed(item: DiscoveryItem): string {
  return `${item.title}\n\n${item.tldr ?? item.summary}\n\nSumber: ${item.resolvedUrl ?? item.url}`;
}
