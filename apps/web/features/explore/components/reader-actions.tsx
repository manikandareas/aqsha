"use client";

import type { FeedItem } from "@aqsha/convex/feed";
import { api } from "@aqsha/convex/api";
import { Loader2Icon, MessageSquareIcon } from "@aqsha/ui/icons";
import { useStartResearch } from "@/features/discovery/hooks/use-start-research";
import { SaveToWorkspaceButton } from "@/features/workspaces/components/save-to-workspace-button";
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
  const recordSave = useConvexMutationFn(api.feed.recordDiscoveryInteraction);

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
        <SaveToWorkspaceButton
          // Reset the saved state when the reader navigates to another item
          // (App Router reuses this component across detail routes).
          key={item._id}
          url={item.resolvedUrl ?? item.url}
          title={item.title}
          onSaved={() =>
            void recordSave({
              itemRef: { kind: "feed", feedItemId: item._id },
              kind: "save",
            }).catch(() => {})
          }
          label="Simpan"
          savedLabel="Tersimpan"
          className="h-9 rounded-full border border-border px-4 text-[13px] font-medium text-foreground transition-colors hover:bg-muted"
        />
      </div>
      {error ? (
        <p className="mt-2 text-[12.5px] font-medium text-destructive">{error}</p>
      ) : null}
    </>
  );
}
