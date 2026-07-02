"use client";

import { DownloadIcon } from "@aqsha/ui/icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDownloadThreadReferences } from "@/features/threads/api";
import { DetailPanelShell } from "./detail-panel-chrome";
import { SourceLinkList } from "./source-link-list";
import { useThreadPanel, useThreadPanelData } from "./thread-panel-context";

/**
 * Ekspor daftar pustaka thread (FEAT-3) — unduh BibTeX/RIS yang diformat server dari
 * `research_sources` (SEMUA sumber thread, bukan hanya pesan yang sedang dibuka).
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
 * All sources collected for one assistant message (opened from the "Sumber" trigger).
 * Each item links out to its URL — no single-source detail.
 */
export function SourcesListPanel({
  messageId,
  threadId,
}: {
  messageId: string;
  threadId?: string;
}) {
  const panel = useThreadPanel();
  const lookups = useThreadPanelData();
  const sources = lookups?.messageSources.get(messageId) ?? [];

  return (
    <DetailPanelShell
      eyebrow={sources.length > 0 ? `${sources.length} sumber` : undefined}
      title="Sumber"
      onClose={panel?.closePanel}
      actions={threadId ? <ReferencesExportButton threadId={threadId} /> : undefined}
    >
      <SourceLinkList sources={sources} />
    </DetailPanelShell>
  );
}
