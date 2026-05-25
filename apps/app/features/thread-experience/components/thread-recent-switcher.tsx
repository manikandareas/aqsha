"use client";

import { useMemo } from "react";
import { PanelTitleDropdownTrigger } from "@/components/panel-title-dropdown-trigger";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ThreadSummary } from "./component-types";

export function ThreadRecentSwitcher({
  title,
  threads,
  onSelectThread,
  onNewThread,
  newLabel,
  emptyLabel,
}: {
  title: string;
  threads: ThreadSummary[];
  onSelectThread: (threadId: string) => void;
  onNewThread: () => void;
  newLabel: string;
  emptyLabel: string;
}) {
  const recentThreads = useMemo(
    () => threads.toSorted((a, b) => b.lastActivityAt - a.lastActivityAt).slice(0, 4),
    [threads],
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <PanelTitleDropdownTrigger>{title}</PanelTitleDropdownTrigger>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-64 w-56 overflow-y-auto">
        <DropdownMenuItem onClick={onNewThread}>{newLabel}</DropdownMenuItem>
        {recentThreads.length === 0 ? (
          <DropdownMenuItem disabled>{emptyLabel}</DropdownMenuItem>
        ) : (
          recentThreads.map((thread) => (
            <DropdownMenuItem
              key={thread.threadId}
              onClick={() => onSelectThread(thread.threadId)}
            >
              <span className="truncate">{thread.title}</span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
