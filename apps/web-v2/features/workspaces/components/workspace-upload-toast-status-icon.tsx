"use client";

import {
  AlertCircleIcon,
  CheckCircle2Icon,
  Loader2Icon,
  UploadCloudIcon,
} from "@aqsha/ui/icons";
import type { WorkspaceUploadStatus } from "../utils/workspace-file-upload";

export function WorkspaceUploadToastStatusIcon({
  status,
}: {
  status: WorkspaceUploadStatus;
}) {
  if (status === "complete") {
    return <CheckCircle2Icon className="size-4 shrink-0 text-mint-foreground" />;
  }
  if (status === "failed") {
    return <AlertCircleIcon className="size-4 shrink-0 text-coral-foreground" />;
  }
  if (status === "processing") {
    return <Loader2Icon className="size-4 shrink-0 animate-spin text-sky-foreground" />;
  }
  if (status === "uploading") {
    return <Loader2Icon className="size-4 shrink-0 animate-spin text-primary" />;
  }
  return <UploadCloudIcon className="size-4 shrink-0 text-muted-foreground" />;
}
