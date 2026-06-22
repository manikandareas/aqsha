"use client";

import { Progress } from "@aqsha/ui/components/progress";
import { cn } from "@/lib/utils";
import {
  getStatusText,
  type UploadQueueItem,
} from "./workspace-upload-toast-model";
import { WorkspaceUploadToastStatusIcon } from "./workspace-upload-toast-status-icon";

export function WorkspaceUploadToastRow({ item }: { item: UploadQueueItem }) {
  const isInProgress =
    item.status === "queued" ||
    item.status === "uploading" ||
    item.status === "processing";
  const statusText = getStatusText(item);

  return (
    <div className="grid gap-1.5 rounded-lg p-2">
      <div className="flex min-w-0 items-center gap-2">
        <WorkspaceUploadToastStatusIcon status={item.status} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-medium leading-4">
            {item.file.name}
          </div>
          <div
            className={cn(
              "truncate text-[11px] leading-4 text-muted-foreground",
              item.status === "failed" && "text-coral-foreground",
            )}
          >
            {statusText}
          </div>
        </div>
        {item.status === "uploading" ? (
          <span className="font-mono text-[11px] text-muted-foreground">
            {item.progress}%
          </span>
        ) : null}
      </div>
      {isInProgress ? (
        <Progress
          className="h-1.5 bg-muted"
          value={item.status === "queued" ? 0 : item.progress}
        />
      ) : null}
    </div>
  );
}
