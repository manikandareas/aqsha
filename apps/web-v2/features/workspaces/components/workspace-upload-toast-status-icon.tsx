"use client";

import {
  AlertCircleIcon,
  CheckCircle2Icon,
  ClockIcon,
  Loader2Icon,
} from "@aqsha/ui/icons";
import { cn } from "@/lib/utils";
import type { WorkspaceUploadStatus } from "../utils/workspace-file-upload";

export function WorkspaceUploadToastStatusIcon({
  status,
  className,
}: {
  status: WorkspaceUploadStatus;
  className?: string;
}) {
  const base = cn("shrink-0", className ?? "size-4");
  if (status === "complete") {
    return <CheckCircle2Icon className={cn(base, "text-mint-foreground")} />;
  }
  if (status === "failed") {
    return <AlertCircleIcon className={cn(base, "text-coral-foreground")} />;
  }
  if (status === "queued") {
    return <ClockIcon className={cn(base, "text-muted-foreground")} />;
  }
  // uploading / processing
  return <Loader2Icon className={cn(base, "animate-spin text-primary")} />;
}
