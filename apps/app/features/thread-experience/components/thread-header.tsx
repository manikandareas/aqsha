"use client";

import {
  FolderIcon,
  MoreHorizontalIcon,
  PanelLeftIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";

export function ThreadHeader({
  title,
  workspaceName,
  showLeftTrigger,
  onToggleLeftSidebar,
  showRightTrigger,
}: {
  title: string;
  workspaceName?: string;
  showLeftTrigger: boolean;
  onToggleLeftSidebar: () => void;
  showRightTrigger: boolean;
}) {
  return (
    <header className="flex h-9 shrink-0 items-center justify-between gap-2 bg-background px-3">
      <div className="flex min-w-0 items-center gap-2">
        {showLeftTrigger ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="-ml-1 size-7 rounded-[7px] text-muted-foreground"
            onClick={onToggleLeftSidebar}
            aria-label="Buka sidebar kiri"
          >
            <PanelLeftIcon className="size-4" />
          </Button>
        ) : null}
        <h1 className="max-w-[34vw] truncate text-[13px] font-semibold text-foreground sm:max-w-[360px]">
          {title}
        </h1>
        <div className="hidden min-w-0 items-center gap-1.5 text-[12px] font-medium text-muted-foreground sm:flex">
          <FolderIcon className="size-3.5 shrink-0" />
          <span className="truncate">{workspaceName ?? "Global thread"}</span>
        </div>
      </div>
      <div className="flex items-center gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-7 rounded-[7px] text-muted-foreground"
          aria-label="Thread actions"
        >
          <MoreHorizontalIcon className="size-4" />
        </Button>
        {showRightTrigger ? <RightSidebarTrigger /> : null}
      </div>
    </header>
  );
}

function RightSidebarTrigger() {
  const { isMobile, open, openMobile, toggleSidebar } = useSidebar();
  const isOpen = isMobile ? openMobile : open;

  if (isOpen) return null;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className="size-7 rounded-[7px] text-muted-foreground"
      onClick={toggleSidebar}
      aria-label="Toggle research panel"
    >
      <PanelLeftIcon className="size-4 rotate-180" />
    </Button>
  );
}
