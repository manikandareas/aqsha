"use client";

import Link from "next/link";
import { Badge } from "@aqsha/ui/components/badge";
import { Button } from "@aqsha/ui/components/button";
import { ArrowLeftIcon, Loader2Icon } from "@aqsha/ui/icons";
import { SaveToWorkspaceButton } from "@/features/artifacts/components/save-to-workspace-button";
import { usePaper, useRecordInteraction } from "../api";

/** Reader paper (Slice 4.4): getOrFetchPaper(key) → metadata + abstract + SaveToWorkspaceButton. */
export function PaperReader({ paperKey }: { paperKey: string }) {
  const query = usePaper(paperKey);
  const record = useRecordInteraction();
  const paper = query.data;

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <BackLink />
      {query.isPending ? (
        <Loader />
      ) : !paper ? (
        <Empty message="Paper tidak ditemukan atau tidak dapat diresolusi." />
      ) : (
        <article className="mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{paper.provider}</Badge>
            {paper.isOpenAccess ? <Badge variant="outline">Open access</Badge> : null}
            {paper.year ? <span className="text-sm text-muted-foreground">{paper.year}</span> : null}
            {paper.citedByCount != null ? (
              <span className="text-sm text-muted-foreground">{paper.citedByCount} sitasi</span>
            ) : null}
          </div>
          <h1 className="mt-2 font-serif text-3xl leading-tight">{paper.title}</h1>
          {paper.authors.length > 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">{paper.authors.join(", ")}</p>
          ) : null}
          {paper.venue ? <p className="text-sm text-muted-foreground">{paper.venue}</p> : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <SaveToWorkspaceButton
              url={paper.url}
              title={paper.title}
              label="Simpan ke workspace"
              onSaved={() =>
                record.mutate({ itemRef: { kind: "paper", paperKey: paper.key }, kind: "save" })
              }
            />
            <Button asChild variant="outline" size="sm">
              <a href={paper.url} target="_blank" rel="noopener noreferrer">
                Sumber
              </a>
            </Button>
            {paper.pdfUrl ? (
              <Button asChild variant="ghost" size="sm">
                <a href={paper.pdfUrl} target="_blank" rel="noopener noreferrer">
                  PDF
                </a>
              </Button>
            ) : null}
          </div>

          {paper.abstract || paper.snippet ? (
            <p className="mt-6 whitespace-pre-line text-sm leading-relaxed">
              {paper.abstract ?? paper.snippet}
            </p>
          ) : null}

          {paper.topics.length > 0 ? (
            <div className="mt-6 flex flex-wrap gap-1">
              {paper.topics.map((t) => (
                <Badge key={t} variant="outline" className="font-normal">
                  {t}
                </Badge>
              ))}
            </div>
          ) : null}
        </article>
      )}
    </main>
  );
}

function BackLink() {
  return (
    <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
      <Link href="/app/explore">
        <ArrowLeftIcon />
        Jelajahi
      </Link>
    </Button>
  );
}
function Loader() {
  return (
    <div className="flex justify-center py-16 text-muted-foreground">
      <Loader2Icon className="animate-spin" />
    </div>
  );
}
function Empty({ message }: { message: string }) {
  return <p className="py-16 text-center text-sm text-muted-foreground">{message}</p>;
}

export { BackLink, Loader, Empty };
