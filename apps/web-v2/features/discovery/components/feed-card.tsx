"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@aqsha/ui/components/badge";
import { Button } from "@aqsha/ui/components/button";
import { SaveToWorkspaceButton } from "@/features/artifacts/components/save-to-workspace-button";
import { useHideDiscovery, useRecordInteraction } from "../api";
import { feedItemHref, type FeedItem, KIND_LABELS } from "@/features/discovery/types";

/**
 * Kartu feed discovery (Slice 4.3). Save-to-Workspace (saveUrl P3) + interest bump +1,
 * Hide (interest −1, hilang dari list), 'Tanya Astra' = STUB → P6. Tautan judul ke sumber
 * eksternal; reader internal menyusul (4.4).
 */
export function FeedCard({ item, onHidden }: { item: FeedItem; onHidden: (id: string) => void }) {
  const router = useRouter();
  const href = item.resolvedUrl ?? item.url;
  const link = feedItemHref(item);
  const hide = useHideDiscovery();
  const record = useRecordInteraction();
  const ref = { kind: "feed" as const, feedItemId: item._id };

  const askAstra = () => {
    record.mutate({ itemRef: ref, kind: "research" });
    const seed = `${item.title}\n\n${item.tldr ?? item.summary}\n\nSumber: ${item.resolvedUrl ?? item.url}`;
    router.push(`/app/threads?seed=${encodeURIComponent(seed)}`);
  };

  const meta = [
    item.sourceLabel,
    item.year ? String(item.year) : null,
    item.citedByCount != null ? `${item.citedByCount} sitasi` : null,
    item.isOpenAccess ? "Open access" : null,
  ].filter(Boolean);

  return (
    <article className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2">
        <Badge variant="secondary">{KIND_LABELS[item.kind]}</Badge>
        {item.retractionStatus === "retracted" ? (
          <Badge variant="destructive">Ditarik</Badge>
        ) : null}
        {item.reason ? (
          <span className="truncate text-xs text-muted-foreground">{item.reason}</span>
        ) : null}
        {typeof item.relevanceScore === "number" && item.relevanceScore > 0 ? (
          <span className="ml-auto text-xs text-muted-foreground">{item.relevanceScore}%</span>
        ) : null}
      </div>

      {link.external ? (
        <a
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 block font-medium leading-snug hover:underline"
        >
          {item.title}
        </a>
      ) : (
        <Link href={link.href} className="mt-2 block font-medium leading-snug hover:underline">
          {item.title}
        </Link>
      )}

      {item.tldr || item.summary ? (
        <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">
          {item.tldr ?? item.summary}
        </p>
      ) : null}

      {meta.length > 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">{meta.join(" · ")}</p>
      ) : null}

      {item.topics.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {item.topics.slice(0, 4).map((topic) => (
            <Badge key={topic} variant="outline" className="font-normal">
              {topic}
            </Badge>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex items-center gap-1">
        <SaveToWorkspaceButton
          url={href}
          title={item.title}
          onSaved={() => record.mutate({ itemRef: ref, kind: "save" })}
        />
        <Button variant="ghost" size="sm" onClick={askAstra}>
          Tanya Astra
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto text-muted-foreground"
          disabled={hide.isPending}
          onClick={() =>
            hide.mutate(ref, {
              onSuccess: () => onHidden(item._id),
              onError: () => toast.error("Gagal menyembunyikan."),
            })
          }
        >
          Sembunyikan
        </Button>
      </div>
    </article>
  );
}
