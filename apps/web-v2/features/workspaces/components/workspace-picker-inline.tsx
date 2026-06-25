"use client";

import { api } from "@aqsha/convex/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useConvexQueryData } from "@/lib/convex-query";
import { cn } from "@/lib/utils";

export function WorkspacePickerInline({
  selectedWorkspaceId,
  onSelect,
  className,
  variant = "default",
}: {
  selectedWorkspaceId: string | null;
  onSelect: (workspaceId: string) => void;
  className?: string;
  variant?: "default" | "compact";
}) {
  const workspacePage = useConvexQueryData(api.workspaces.list, {
    paginationOpts: { cursor: null, numItems: 50 },
  });
  const workspaces = workspacePage?.page ?? [];

  if (variant === "compact") {
    return (
      <Select value={selectedWorkspaceId ?? undefined} onValueChange={onSelect}>
        <SelectTrigger
          size="sm"
          className={cn(
            "h-6 min-h-6 max-w-[160px] border-border/60 bg-muted/20 px-2 text-[10px]",
            className,
          )}
        >
          <SelectValue placeholder="Workspace" />
        </SelectTrigger>
        <SelectContent align="start">
          {workspaces.map((workspace) => (
            <SelectItem key={workspace._id} value={String(workspace._id)} className="text-xs">
              {workspace.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <span className="shrink-0 text-[11px] font-medium text-muted-foreground">Workspace</span>
      <Select value={selectedWorkspaceId ?? undefined} onValueChange={onSelect}>
        <SelectTrigger size="sm" className="h-7 min-h-7 w-full min-w-0 flex-1">
          <SelectValue placeholder="Pilih workspace" />
        </SelectTrigger>
        <SelectContent align="start">
          {workspaces.map((workspace) => (
            <SelectItem key={workspace._id} value={String(workspace._id)}>
              {workspace.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
