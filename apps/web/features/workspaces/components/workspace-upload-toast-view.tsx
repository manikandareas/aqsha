"use client";

import { Progress } from "@aqsha/ui/components/progress";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  RotateCcwIcon,
  XIcon,
} from "@aqsha/ui/icons";
import { Button } from "@/components/ui/button";
import {
  getUploadSummary,
  isRetryableUploadItem,
  type UploadQueueItem,
} from "./workspace-upload-toast-model";
import { WorkspaceUploadToastRow } from "./workspace-upload-toast-row";
import { WorkspaceUploadToastStatusIcon } from "./workspace-upload-toast-status-icon";

export function WorkspaceUploadToast({
  items,
  isUploadActive,
  isCollapsed,
  onDismiss,
  onToggleCollapsed,
  onRetryFailed,
}: {
  items: UploadQueueItem[];
  isUploadActive: boolean;
  isCollapsed: boolean;
  onDismiss: () => void;
  onToggleCollapsed: () => void;
  onRetryFailed: () => void;
}) {
  const summary = getUploadSummary(items);
  const failedCount = summary.failedCount;
  const retryableCount = items.filter(isRetryableUploadItem).length;
  const canRetry = retryableCount > 0 && !isUploadActive;
  const showBar = summary.tone !== "complete";

  return (
    <section className="w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-aqsha sm:w-[340px]">
      <header className="flex items-center gap-2.5 px-3 py-2.5">
        <WorkspaceUploadToastStatusIcon status={summary.tone} className="size-4" />
        <button
          aria-expanded={!isCollapsed}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/40"
          onClick={onToggleCollapsed}
          type="button"
        >
          <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold leading-5">
            {summary.title}
          </span>
          {showBar ? (
            <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">
              {summary.completeCount}/{summary.total}
            </span>
          ) : null}
          <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
            {isCollapsed ? (
              <ChevronUpIcon className="size-3.5" />
            ) : (
              <ChevronDownIcon className="size-3.5" />
            )}
          </span>
        </button>
        <Button
          aria-label="Tutup status upload"
          className="-mr-1 size-6"
          onClick={onDismiss}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <XIcon className="size-3.5" />
        </Button>
      </header>

      {showBar ? (
        <div className="px-3 pb-2.5">
          <Progress className="h-1 bg-muted" value={summary.progress} />
        </div>
      ) : null}

      {!isCollapsed ? (
        <div className="max-h-64 overflow-y-auto border-t border-border/60 px-1.5 py-1.5">
          {items.map((item) => (
            <WorkspaceUploadToastRow key={item.id} item={item} />
          ))}
        </div>
      ) : null}

      {canRetry ? (
        <footer className="flex items-center justify-between gap-2 border-t border-border/60 px-3 py-2">
          <span className="truncate text-[11px] font-medium text-coral-foreground">
            {failedCount} file gagal
          </span>
          <Button
            className="h-7 gap-1.5 text-[11.5px]"
            onClick={onRetryFailed}
            size="sm"
            type="button"
            variant="outline"
          >
            <RotateCcwIcon className="size-3.5" />
            Coba lagi
          </Button>
        </footer>
      ) : null}
    </section>
  );
}
