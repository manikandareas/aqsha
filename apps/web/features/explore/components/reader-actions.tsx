"use client";

import type { FeedItem } from "@aqsha/convex/feed";
import { api } from "@aqsha/convex/api";
import {
  BookmarkIcon,
  CheckIcon,
  Loader2Icon,
  MessageSquareIcon,
} from "@aqsha/ui/icons";
import { useState } from "react";
import { useStartResearch } from "@/features/discovery/hooks/use-start-research";
import { useConvexMutationFn } from "@/lib/convex-query";

export function ReaderActions({
  item,
  askLabel,
  researchSeed,
}: {
  item: FeedItem;
  askLabel: string;
  researchSeed: string;
}) {
  const { startResearch, busy, error } = useStartResearch();
  const saveItem = useConvexMutationFn(api.feed.saveItem);
  const [optimisticSaved, setOptimisticSaved] = useState<{
    itemId: string;
    saved: boolean;
  } | null>(null);
  const saved =
    optimisticSaved?.itemId === item._id
      ? optimisticSaved.saved
      : Boolean(item.saved);

  const handleSave = async () => {
    if (saved) return;
    setOptimisticSaved({ itemId: item._id, saved: true });
    try {
      await saveItem({ feedItemId: item._id });
    } catch {
      setOptimisticSaved({ itemId: item._id, saved: false });
    }
  };

  return (
    <>
      <div className="mt-7 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void startResearch(researchSeed)}
          disabled={busy}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {busy ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <MessageSquareIcon className="size-4" />
          )}
          {askLabel}
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saved}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-4 text-[13px] font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
        >
          {saved ? (
            <CheckIcon className="size-4" />
          ) : (
            <BookmarkIcon className="size-4" />
          )}
          {saved ? "Tersimpan" : "Simpan"}
        </button>
      </div>
      {error ? (
        <p className="mt-2 text-[12.5px] font-medium text-destructive">{error}</p>
      ) : null}
    </>
  );
}
