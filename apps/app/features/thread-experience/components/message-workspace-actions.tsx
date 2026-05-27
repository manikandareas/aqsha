"use client";

import { FolderTreeIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export type MessageWorkspaceAction = {
  workspaceId: string;
  workspaceName: string;
  action: "created" | "renamed";
};

export function MessageWorkspaceActions({
  actions,
  align = "start",
}: {
  actions: MessageWorkspaceAction[];
  align?: "start" | "end";
}) {
  const router = useRouter();
  if (actions.length === 0) return null;

  return (
    <div className={cn("grid max-w-xl gap-2", align === "end" ? "ml-auto" : "")}>
      {actions.map((action) => (
        <button
          key={`${action.workspaceId}-${action.action}`}
          type="button"
          onClick={() => router.push(`/workspaces/${action.workspaceId}`)}
          className="flex max-w-xl items-center gap-3 rounded-[10px] border border-lavender-soft-border bg-lavender-soft px-3 py-2 text-left text-[13px] text-lavender-foreground transition-colors hover:bg-lavender-soft"
        >
          <FolderTreeIcon className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{action.workspaceName}</span>
            <span className="block text-[11px] font-medium text-muted-foreground">
              {action.action === "created" ? "Workspace dibuat" : "Workspace di-rename"}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
