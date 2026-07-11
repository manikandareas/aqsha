"use client";

import { summarizeStatsGroup } from "@aqsha/chat-core/stats-viz";
import { ArrowLeftIcon, ChartColumnIcon, DownloadIcon, MessageSquareIcon } from "@aqsha/ui/icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useExportAnalysisResults } from "@/features/threads/api";
import { StatsVizGroup } from "@/features/threads/components/stats-viz/stats-block";
import { StatsBlocksProvider } from "@/features/threads/components/stats-viz/stats-context";
import {
  StatsVerdictChips,
  statsCountsLabel,
} from "@/features/threads/components/stats-viz/stats-summary";
import { scrollToMessage } from "@/features/threads/lib/scroll-to-message";
import type { ThreadStatsPanelItem } from "@/features/threads/lib/thread-panel-data";
import { DetailPanelShell } from "./detail-panel-chrome";
import { useThreadPanel, useThreadPanelData } from "./thread-panel-context";

/**
 * Tab Statistik — thread analysis runs in ONE panel with two scopes (mirror Sumber): the
 * aggregate list of every `run_analysis` (default), or one run's full result blocks when opened
 * from its struk / an inline result ("Buka di panel"). `runKey` selects the scope; a chip returns
 * to the aggregate. Data comes from `ThreadPanelLookups.stats` (built by the chat surface), so the
 * list stays in sync with the chat's struk + inline blocks and shares the verdict vocabulary.
 */
export function StatsListPanel({ runKey, threadId }: { runKey?: string; threadId?: string }) {
  const items = useThreadPanelData()?.stats ?? [];
  return runKey ? (
    <ScopedStatsView runKey={runKey} items={items} threadId={threadId} />
  ) : (
    <AggregateStatsView items={items} threadId={threadId} />
  );
}

/**
 * Ekspor hasil analisis thread (fase C) — docx (Bab 4) / xlsx (tabel mentah) dibangun server dari
 * SEMUA hasil thread (bukan run scope tertentu; per-run = Fase D). Sandbox heavy → tombol disabled +
 * "Menyiapkan…" selagi pending; unduhan langsung (bukan simpan artifact). Pola `ReferencesExportButton`.
 */
function AnalysisExportButton({ threadId }: { threadId: string }) {
  const exportResults = useExportAnalysisResults(threadId);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Ekspor hasil analisis"
          title={exportResults.isPending ? "Menyiapkan file…" : "Ekspor hasil analisis"}
          disabled={exportResults.isPending}
        >
          <DownloadIcon className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => exportResults.mutate("docx")}>
          Ekspor Word (.docx)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => exportResults.mutate("xlsx")}>
          Ekspor Excel (.xlsx)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Daftar semua run analisis, urut kemunculan di timeline; klik row → view scoped. */
function AggregateStatsView({
  items,
  threadId,
}: {
  items: ThreadStatsPanelItem[];
  threadId?: string;
}) {
  const panel = useThreadPanel();
  return (
    <DetailPanelShell
      eyebrow={items.length > 0 ? `${items.length} analisis` : undefined}
      title="Statistik"
      actions={
        threadId && items.length > 0 ? <AnalysisExportButton threadId={threadId} /> : undefined
      }
    >
      {items.length === 0 ? (
        <StatsEmptyState />
      ) : (
        <ul className="grid gap-2">
          {items.map((item) => (
            <StatsListItem
              key={item.toolCallId}
              item={item}
              onOpen={() => panel?.openStatsPanel(item.runKey)}
            />
          ))}
        </ul>
      )}
    </DetailPanelShell>
  );
}

function StatsListItem({
  item,
  onOpen,
}: {
  item: ThreadStatsPanelItem;
  onOpen: () => void;
}) {
  const { group, messageId } = item;
  const summary = summarizeStatsGroup(group);
  return (
    <li className="overflow-hidden rounded-xl border bg-muted/20">
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full min-w-0 flex-col gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <div className="flex min-w-0 items-start gap-2">
          <ChartColumnIcon className="mt-0.5 size-3.5 shrink-0 text-primary" />
          <span className="min-w-0 break-words font-medium text-[13px] text-foreground">
            {group.title}
          </span>
          {group.custom ? (
            <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 font-medium text-[10px] text-amber-700 dark:text-amber-300">
              kustom
            </span>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 pl-[22px]">
          <StatsVerdictChips summary={summary} />
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {statsCountsLabel(summary.tables, summary.figures)}
          </span>
        </div>
      </button>
      <div className="flex border-t border-border/60">
        <button
          type="button"
          onClick={() => messageId && scrollToMessage(messageId)}
          disabled={!messageId}
          className="flex items-center gap-1.5 px-3 py-1.5 font-medium text-[11px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-40 disabled:hover:text-muted-foreground"
        >
          <MessageSquareIcon className="size-3" />
          Lihat di percakapan
        </button>
      </div>
    </li>
  );
}

/** Satu run penuh (tabel + verdict + figur) — reuse renderer chat via `StatsBlocksProvider`. */
function ScopedStatsView({
  runKey,
  items,
  threadId,
}: {
  runKey: string;
  items: ThreadStatsPanelItem[];
  threadId?: string;
}) {
  const panel = useThreadPanel();
  const item = items.find((it) => it.runKey === runKey);

  if (!item) {
    return (
      <DetailPanelShell title="Statistik">
        <div className="grid gap-3">
          <BackToAllChip onClick={() => panel?.openStatsPanel()} />
          <p className="text-[13px] text-muted-foreground">
            Analisis ini tidak ditemukan lagi di percakapan.
          </p>
        </div>
      </DetailPanelShell>
    );
  }

  const anchorId = item.messageId;
  const groups = new Map([[item.group.runKey, item.group]]);
  return (
    <DetailPanelShell
      title="Statistik"
      actions={
        anchorId || threadId ? (
          <>
            {anchorId ? (
              <button
                type="button"
                onClick={() => scrollToMessage(anchorId)}
                className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Lihat di percakapan"
                title="Lihat di percakapan"
              >
                <MessageSquareIcon className="size-3.5" />
              </button>
            ) : null}
            {threadId ? <AnalysisExportButton threadId={threadId} /> : null}
          </>
        ) : undefined
      }
    >
      <div className="grid gap-3">
        <BackToAllChip onClick={() => panel?.openStatsPanel()} />
        <StatsBlocksProvider groups={groups}>
          <StatsVizGroup group={item.group} />
        </StatsBlocksProvider>
      </div>
    </DetailPanelShell>
  );
}

function BackToAllChip({ onClick }: { onClick: () => void }) {
  return (
    <div className="flex">
      <button
        type="button"
        onClick={onClick}
        className="flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 font-medium text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeftIcon className="size-3" />
        Semua analisis
      </button>
    </div>
  );
}

function StatsEmptyState() {
  return (
    <div className="grid gap-1.5 py-6 text-center">
      <p className="font-medium text-[13px] text-foreground">Belum ada hasil analisis</p>
      <p className="text-[12px] text-muted-foreground">
        Mulai dengan{" "}
        <span className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">/analisis</span>{" "}
        untuk menjalankan uji statistik.
      </p>
    </div>
  );
}
