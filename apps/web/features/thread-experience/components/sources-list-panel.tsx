"use client";

import { DownloadIcon, XIcon } from "@aqsha/ui/icons";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDownloadThreadReferences } from "@/features/threads/api";
import { dedupeCards } from "@/features/threads/lib/source-card";
import { DetailPanelShell } from "./detail-panel-chrome";
import { SourceLinkList } from "./source-link-list";
import { useThreadPanel, useThreadPanelData } from "./thread-panel-context";

/**
 * Ekspor daftar pustaka thread (FEAT-3) — unduh BibTeX/RIS yang diformat server dari
 * `research_sources` (SEMUA sumber thread, bukan hanya scope yang sedang dibuka).
 */
function ReferencesExportButton({ threadId }: { threadId: string }) {
  const download = useDownloadThreadReferences(threadId);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Ekspor referensi"
          disabled={download.isPending}
        >
          <DownloadIcon className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => download.mutate("bibtex")}>
          Ekspor BibTeX (.bib)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => download.mutate("ris")}>
          Ekspor RIS (.ris)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Tab Sumber — thread sources with two scopes in ONE panel: the aggregate of every
 * assistant message's sources (default), or a single message's list when opened from
 * that message's "Sumber" trigger (`messageId`). The scope shows as a clearable chip;
 * clearing returns to the aggregate. Each item links out — no single-source detail.
 */
export function SourcesListPanel({
  messageId,
  threadId,
}: {
  messageId?: string;
  threadId?: string;
}) {
  const panel = useThreadPanel();
  const lookups = useThreadPanelData();
  const messageSources = lookups?.messageSources;
  // Aggregate = union of the per-message lists (each already deduped), deduped again
  // across messages. `messageSources` preserves message order, so the list reads
  // top-to-bottom like the thread. Memoized so a live turn (whose lookups change identity
  // every token) doesn't re-flatten + re-dedupe the whole thread's sources on each render.
  const sources = useMemo(
    () =>
      messageId
        ? (messageSources?.get(messageId) ?? [])
        : dedupeCards([...(messageSources?.values() ?? [])].flat()),
    [messageSources, messageId],
  );

  return (
    <DetailPanelShell
      eyebrow={sources.length > 0 ? `${sources.length} sumber` : undefined}
      title="Sumber"
      actions={threadId ? <ReferencesExportButton threadId={threadId} /> : undefined}
    >
      <div className="grid gap-3">
        {messageId ? (
          <div className="flex">
            <button
              type="button"
              onClick={() => panel?.openSourcesPanel()}
              className="flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Hapus filter pesan — tampilkan semua sumber thread"
            >
              Dari pesan ini
              <XIcon className="size-3" />
            </button>
          </div>
        ) : null}
        <SourceLinkList sources={sources} />
      </div>
    </DetailPanelShell>
  );
}
