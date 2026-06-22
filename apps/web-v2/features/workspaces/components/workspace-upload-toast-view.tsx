"use client";

import { Progress } from "@aqsha/ui/components/progress";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  RotateCcwIcon,
  UploadCloudIcon,
  XIcon,
} from "@aqsha/ui/icons";
import { Button } from "@/components/ui/button";
import {
  getUploadSummary,
  isRetryableUploadItem,
  type UploadQueueItem,
} from "./workspace-upload-toast-model";
import { WorkspaceUploadToastRow } from "./workspace-upload-toast-row";

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
  let failedCount = 0;
  let retryableCount = 0;

  for (const item of items) {
    if (item.status === "failed") {
      failedCount += 1;
    }
    if (isRetryableUploadItem(item)) {
      retryableCount += 1;
    }
  }

  const canRetry = retryableCount > 0 && !isUploadActive;

  return (
    <section className="w-[calc(100vw-2rem)] overflow-hidden rounded-[14px] border border-border bg-card text-card-foreground shadow-aqsha sm:w-[380px]">
      <header className="flex items-start gap-2 border-b border-border/70 px-3.5 py-3">
        <button
          aria-expanded={!isCollapsed}
          className="flex min-w-0 flex-1 items-start gap-3 rounded-lg text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/40"
          onClick={onToggleCollapsed}
          type="button"
        >
          <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <UploadCloudIcon className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[13px] font-semibold leading-5">
              {summary.title}
            </h2>
            <p className="truncate text-[11px] leading-4 text-muted-foreground">
              {summary.description}
            </p>
          </div>
          <div className="mt-1 flex size-5 shrink-0 items-center justify-center text-muted-foreground">
            {isCollapsed ? (
              <ChevronUpIcon className="size-3.5" />
            ) : (
              <ChevronDownIcon className="size-3.5" />
            )}
          </div>
        </button>
        <Button
          aria-label="Tutup status upload"
          className="-mr-1 -mt-1"
          onClick={onDismiss}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <XIcon className="size-3.5" />
        </Button>
      </header>

      {isCollapsed ? (
        <div className="px-3.5 pb-3 pt-2">
          <Progress className="h-1.5 bg-muted" value={summary.progress} />
        </div>
      ) : (
        <>
          <div className="max-h-72 overflow-y-auto p-2">
            {items.map((item) => (
              <WorkspaceUploadToastRow key={item.id} item={item} />
            ))}
          </div>

          {canRetry ? (
            <footer className="flex items-center justify-between border-t border-border/70 px-3.5 py-2.5">
              <span className="text-[11px] font-medium text-coral-foreground">
                {failedCount} file perlu dicoba lagi
              </span>
              <Button
                className="h-7 gap-1.5 text-[12px]"
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
        </>
      )}
    </section>
  );
}
