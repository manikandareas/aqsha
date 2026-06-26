"use client";

import { cn } from "@/lib/utils";
import {
  getStatusText,
  type UploadQueueItem,
} from "./workspace-upload-toast-model";
import { WorkspaceUploadToastStatusIcon } from "./workspace-upload-toast-status-icon";

export function WorkspaceUploadToastRow({ item }: { item: UploadQueueItem }) {
  const statusText = getStatusText(item);

  return (
    <div className="flex min-w-0 items-center gap-2.5 rounded-lg px-2 py-1.5">
      <WorkspaceUploadToastStatusIcon status={item.status} className="size-3.5" />
      <span className="min-w-0 flex-1 truncate text-[12px] font-medium leading-4">
        {item.file.name}
      </span>
      <span
        title={statusText}
        className={cn(
          "max-w-[42%] shrink-0 truncate text-[11px] leading-4 text-muted-foreground",
          item.status === "failed" && "text-coral-foreground",
        )}
      >
        {statusText}
      </span>
    </div>
  );
}
