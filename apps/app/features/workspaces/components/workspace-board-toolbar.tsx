"use client";

import {
  ChevronRightIcon,
  FileTextIcon,
  FolderIcon,
  LinkIcon,
  MessageSquareIcon,
  MoreHorizontalIcon,
  PanelLeftIcon,
  PenLineIcon,
  PlusIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { panelHeaderPaddingClass } from "@/lib/panel-surface";
import { cn } from "@/lib/utils";
import type { BreadcrumbSegment } from "../utils/workspace-library-model";

export function WorkspaceBoardToolbar({
  workspaceName,
  breadcrumb,
  onNavigate,
  onCreateFolder,
  onCreateDocument,
  onCreateUrl,
  onRenameWorkspace,
  onArchiveWorkspace,
  onToggleChat,
  chatOpen,
  onClosePanel,
  showCreateActions = true,
  showWorkspaceSettings = true,
}: {
  workspaceName: string;
  breadcrumb: BreadcrumbSegment[];
  onNavigate: (folderId: "root" | string) => void;
  onCreateFolder: () => void;
  onCreateDocument: () => void;
  onCreateUrl: () => void;
  onRenameWorkspace: () => void;
  onArchiveWorkspace: () => void;
  onToggleChat?: () => void;
  chatOpen?: boolean;
  onClosePanel?: () => void;
  showCreateActions?: boolean;
  showWorkspaceSettings?: boolean;
}) {
  const inSubfolder = breadcrumb.length > 1;

  return (
    <div className={cn("flex shrink-0 flex-col gap-3 border-border bg-background", panelHeaderPaddingClass)}>
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <h1 className="truncate font-heading text-lg font-semibold leading-tight tracking-tight text-foreground sm:text-xl">
            {workspaceName}
          </h1>
          {showCreateActions ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="size-7 shrink-0 self-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Tambah item"
                >
                  <PlusIcon className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                <DropdownMenuItem onClick={onCreateFolder}>
                  <FolderIcon className="size-4" />
                  Folder
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onCreateDocument}>
                  <FileTextIcon className="size-4" />
                  Dokumen
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onCreateUrl}>
                  <LinkIcon className="size-4" />
                  URL
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onClosePanel ? (
            <Button
              type="button"
              variant="ghost"
              className="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={onClosePanel}
              aria-label="Tutup panel"
            >
              <PanelLeftIcon className="size-3.5 rotate-180" />
            </Button>
          ) : onToggleChat ? (
            <button
              type="button"
              onClick={onToggleChat}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold transition-colors",
                chatOpen
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <MessageSquareIcon className="size-3.5" />
              Chat
            </button>
          ) : null}
          {showWorkspaceSettings ? (
            <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="size-8 rounded-full text-muted-foreground"
                aria-label="Pengaturan workspace"
              >
                <MoreHorizontalIcon className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={onRenameWorkspace}>
                <PenLineIcon className="size-4" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={onArchiveWorkspace}>
                Archive
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          ) : null}
        </div>
      </div>
      {inSubfolder ? (
        <nav
          aria-label="Lokasi folder"
          className="flex min-w-0 items-center gap-1 text-[12px] font-medium text-muted-foreground"
        >
          {breadcrumb.map((segment, index) => {
            const isLast = index === breadcrumb.length - 1;
            return (
              <span key={segment.id} className="flex min-w-0 items-center gap-1">
                {index > 0 ? <ChevronRightIcon className="size-3 shrink-0" /> : null}
                {isLast ? (
                  <span className="truncate font-semibold text-foreground">{segment.label}</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onNavigate(segment.id)}
                    className="truncate hover:text-foreground"
                  >
                    {segment.label}
                  </button>
                )}
              </span>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}
