"use client";

import { Badge } from "@aqsha/ui/components/badge";
import { Button } from "@aqsha/ui/components/button";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useFeedItem, useHideDiscovery, useRecordInteraction, useRelated } from "../api";
import { discoveryItemKey, feedItemToDiscoveryItem, type DiscoveryItem } from "../model";
import {
  DiscoveryStandardCard,
  type DiscoveryCardHandlers,
} from "./discovery-item-card";
import { BackLink, Empty, Loader } from "./paper-reader";

/** Reader berita (Slice 4.4): getFeedItem(id) + related. Validasi kind=news. */
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

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <BackLink />
      {query.isPending ? (
        <Loader />
      ) : !ok ? (
        <Empty message="Berita tidak ditemukan." />
      ) : (
        <article className="mt-4">
          <Badge variant="secondary">Berita</Badge>
          <h1 className="mt-2 font-serif text-3xl leading-tight">{item.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{item.sourceLabel}</p>
          <div className="mt-3">
            <Button asChild variant="outline" size="sm">
              <a href={item.resolvedUrl ?? item.url} target="_blank" rel="noopener noreferrer">
                Baca di sumber
              </a>
            </Button>
          </div>
          {item.summary ? (
            <p className="mt-6 whitespace-pre-line text-sm leading-relaxed">{item.summary}</p>
          ) : null}
        </article>
      )}

      {related.data && related.data.length > 0 ? (
        <section className="mt-10">
          <h2 className="font-serif text-xl">Temukan lainnya</h2>
          <div className="@container/feed mt-4 grid grid-cols-1 gap-x-5 gap-y-8 @md/feed:grid-cols-2">
            {related.data.map((r) => {
              const di = feedItemToDiscoveryItem(r);
              return (
                <DiscoveryStandardCard
                  key={discoveryItemKey(di)}
                  item={di}
                  busy={false}
                  handlers={handlers}
                />
              );
            })}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function buildSeed(item: DiscoveryItem): string {
  return `${item.title}\n\n${item.tldr ?? item.summary}\n\nSumber: ${item.resolvedUrl ?? item.url}`;
}
