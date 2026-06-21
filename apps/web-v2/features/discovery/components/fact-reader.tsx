"use client";

import { Badge } from "@aqsha/ui/components/badge";
import { Button } from "@aqsha/ui/components/button";
import { useFeedItem, usePapersByKeys } from "../api";
import { BackLink, Empty, Loader } from "./paper-reader";

/**
 * Reader fact-check (Slice 4.4): getFeedItem(id) + papersByKeys(supporting). Validasi kind=claim.
 * Consensus meter DIBUANG (owner decision) → hanya verdict + paper pendukung.
 */
export function FactReader({ id }: { id: string }) {
  const query = useFeedItem(id);
  const item = query.data;
  const ok = item && item.kind === "claim";
  const supportingKeys = item?.claim?.supportingPaperKeys ?? [];
  const papers = usePapersByKeys(ok ? supportingKeys : []);

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <BackLink />
      {query.isPending ? (
        <Loader />
      ) : !ok ? (
        <Empty message="Klaim tidak ditemukan." />
      ) : (
        <article className="mt-4">
          <Badge variant="secondary">Fakta</Badge>
          <h1 className="mt-2 font-serif text-2xl leading-snug">{item.claim?.claim ?? item.title}</h1>

          {item.claim ? (
            <div className="mt-3 rounded-lg border bg-card p-4">
              <p className="text-sm">
                <span className="font-medium">Putusan:</span> {item.claim.verdictLabelRaw}
              </p>
              {item.claim.publisher ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  Oleh {item.claim.publisher}
                </p>
              ) : null}
              {item.claim.reviewUrl ? (
                <Button asChild variant="outline" size="sm" className="mt-2">
                  <a href={item.claim.reviewUrl} target="_blank" rel="noopener noreferrer">
                    Baca pemeriksaan fakta
                  </a>
                </Button>
              ) : null}
            </div>
          ) : null}

          {item.summary ? (
            <p className="mt-4 whitespace-pre-line text-sm leading-relaxed">{item.summary}</p>
          ) : null}

          {papers.data && papers.data.length > 0 ? (
            <section className="mt-8">
              <h2 className="font-serif text-lg">Paper pendukung</h2>
              <ul className="mt-3 grid gap-2">
                {papers.data.map((p) => (
                  <li key={p.key} className="rounded-lg border bg-card p-3">
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium hover:underline"
                    >
                      {p.title}
                    </a>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[p.year, p.citedByCount != null ? `${p.citedByCount} sitasi` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </article>
      )}
    </main>
  );
}
