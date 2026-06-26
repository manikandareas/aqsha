"use client";

import { Badge } from "@aqsha/ui/components/badge";
import { Button } from "@aqsha/ui/components/button";
import { useFeedItem, useRelated } from "../api";
import { FeedCard } from "./feed-card";
import { BackLink, Empty, Loader } from "./paper-reader";

/** Reader berita (Slice 4.4): getFeedItem(id) + related. Validasi kind=news. */
export function NewsReader({ id }: { id: string }) {
  const query = useFeedItem(id);
  const related = useRelated(id);
  const item = query.data;
  const ok = item && item.kind === "news";

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
          <ul className="mt-3 grid gap-3">
            {related.data.map((r) => (
              <li key={r._id}>
                <FeedCard item={r} onHidden={() => undefined} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
