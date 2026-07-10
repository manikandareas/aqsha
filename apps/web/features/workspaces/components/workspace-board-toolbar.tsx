"use client";

import dynamic from "next/dynamic";
import { type FormEvent, type ReactNode, useState } from "react";
import {
  ArchiveIcon,
  CheckIcon,
  ChevronRightIcon,
  FileTextIcon,
  FolderIcon,
  MessageSquareIcon,
  MoreHorizontalIcon,
  PanelLeftIcon,
  PlusIcon,
  UploadIcon,
} from "@aqsha/ui/icons";
import { PanelOpenButton } from "@/components/layout/side-panel-frame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { readableApiErrorMessage } from "@/lib/api-error";
import { panelHeaderBarClass } from "@/lib/panel-surface";
import { cn } from "@/lib/utils";
import type { BreadcrumbSegment } from "../utils/workspace-library-model";

const fallbackWorkspaceEmoji = "📚";

const WorkspaceEmojiPickerContent = dynamic(
  () =>
    import("./workspace-emoji-picker-content").then(
      (mod) => mod.WorkspaceEmojiPickerContent,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-[21rem] place-items-center bg-popover text-[12px] font-medium text-muted-foreground">
        Memuat…
      </div>
    ),
  },
);

export function WorkspaceBoardToolbar({
  workspaceName,
  workspaceEmoji,
  titleSlot,
  breadcrumb,
  onNavigate,
  onCreateFolder,
  onCreateDocument,
  onCreateUrl,
  onRenameWorkspace,
  onUpdateWorkspaceEmoji,
  onArchiveWorkspace,
  controls,
  onToggleChat,
  chatOpen,
  showLeftSidebarTrigger,
  onToggleLeftSidebar,
  showCreateActions = true,
  showWorkspaceSettings = true,
  barClassName,
}: {
  workspaceName: string;
  workspaceEmoji?: string;
  titleSlot?: ReactNode;
  breadcrumb: BreadcrumbSegment[];
  onNavigate: (folderId: "root" | string) => void;
  onCreateFolder: () => void;
  onCreateDocument: () => void;
  onCreateUrl: () => void;
  onRenameWorkspace: (name: string) => Promise<unknown>;
  onUpdateWorkspaceEmoji: (emoji: string) => Promise<unknown>;
  onArchiveWorkspace: () => void;
  /** Compact search / filter / sort cluster, docked in the header's right side. */
  controls?: ReactNode;
  onToggleChat?: () => void;
  chatOpen?: boolean;
  showLeftSidebarTrigger?: boolean;
  onToggleLeftSidebar?: () => void;
  showCreateActions?: boolean;
  showWorkspaceSettings?: boolean;
  /** Bar surface override — e.g. `panelCardToolbarClass` when embedded INSIDE the panel card. */
  barClassName?: string;
}) {
  const inSubfolder = breadcrumb.length > 1;
  const showTitleControls = showWorkspaceSettings && !titleSlot;

  return (
    <div
      className={cn(
        barClassName ?? panelHeaderBarClass,
        inSubfolder && "h-auto flex-col items-stretch gap-1",
      )}
    >
      <div className={cn("flex w-full min-w-0 items-center justify-between gap-3", inSubfolder && "h-11 shrink-0")}>
        <div className="flex min-w-0 items-center gap-1.5">
          {showLeftSidebarTrigger && onToggleLeftSidebar ? (
            <Button
              type="button"
              variant="ghost"
              className="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={onToggleLeftSidebar}
              aria-label="Buka sidebar kiri"
            >
              <PanelLeftIcon className="size-3.5" />
            </Button>
          ) : null}
          {showTitleControls ? (
            <WorkspaceEmojiPopover
              emoji={workspaceEmoji}
              onUpdateEmoji={onUpdateWorkspaceEmoji}
            />
          ) : null}
          {titleSlot ?? (showTitleControls ? (
            <WorkspaceTitlePopover
              workspaceName={workspaceName}
              onRenameWorkspace={onRenameWorkspace}
            />
          ) : (
            <h1 className="self-center truncate font-sans text-base font-semibold leading-tight tracking-tight text-foreground sm:text-lg">
              {workspaceName}
            </h1>
          ))}
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
                  <UploadIcon className="size-4" />
                  Upload
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
        <div className="flex min-w-0 items-center gap-1">
          {controls}
          {controls && onToggleChat ? (
            <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-border/70" />
          ) : null}
          {onToggleChat ? (
            <PanelOpenButton
              open={chatOpen ?? false}
              onOpen={onToggleChat}
              icon={<MessageSquareIcon className="size-3.5" />}
              ariaLabel="Buka panel chat"
            />
          ) : null}
          {showWorkspaceSettings ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="size-7 rounded-full text-muted-foreground"
                  aria-label="Opsi workspace"
                >
                  <MoreHorizontalIcon className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem variant="destructive" onClick={onArchiveWorkspace}>
                  <ArchiveIcon className="size-4" />
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
          className="flex min-w-0 items-center gap-1 pb-2 text-[12px] font-medium text-muted-foreground"
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

function WorkspaceEmojiPopover({
  emoji,
  onUpdateEmoji,
}: {
  emoji?: string;
  onUpdateEmoji: (emoji: string) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const displayEmoji = emoji?.trim() || fallbackWorkspaceEmoji;

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      setError(null);
    }
  };

  const handleSelect = async (nextEmoji: string) => {
    if (isSaving) return;
    if (nextEmoji === displayEmoji) {
      setOpen(false);
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await onUpdateEmoji(nextEmoji);
      setOpen(false);
    } catch (updateError) {
      setError(readableApiErrorMessage(updateError, "Emoji belum bisa disimpan."));
    }
    setIsSaving(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="size-8 shrink-0 self-center rounded-full text-[20px] leading-none hover:bg-muted"
          aria-label="Ubah emoji workspace"
          disabled={isSaving}
        >
          <span aria-hidden="true">{displayEmoji}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[19rem] overflow-hidden p-0">
        {open ? (
          <WorkspaceEmojiPickerContent
            onSelect={(selectedEmoji) => {
              void handleSelect(selectedEmoji);
            }}
          />
        ) : null}
        {error ? (
          <p className="border-t border-border/70 px-3 py-2 text-[12px] font-medium text-destructive">
            {error}
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function WorkspaceTitlePopover({
  workspaceName,
  onRenameWorkspace,
}: {
  workspaceName: string;
  onRenameWorkspace: (name: string) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    setError(null);
    if (nextOpen) {
      setName(workspaceName);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextName = name.trim();
    if (!nextName || nextName === workspaceName.trim()) {
      setOpen(false);
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await onRenameWorkspace(nextName);
      setOpen(false);
    } catch (submitError) {
      setError(readableApiErrorMessage(submitError, "Nama belum bisa disimpan."));
    }
    setIsSubmitting(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <h1 className="min-w-0 self-center font-sans text-base font-semibold leading-tight tracking-tight text-foreground sm:text-lg">
        <PopoverTrigger asChild>
          <button
            type="button"
            className="block max-w-full truncate rounded-[4px] text-left outline-none transition-colors hover:text-foreground/80 focus-visible:ring-2 focus-visible:ring-ring/40"
            aria-label="Edit nama workspace"
          >
            {workspaceName}
          </button>
        </PopoverTrigger>
      </h1>
      <PopoverContent align="start" className="w-72 p-3">
        <form className="grid gap-2.5" onSubmit={handleSubmit}>
          <Input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nama workspace"
          />
          {error ? (
            <p className="text-[12px] font-medium text-destructive">{error}</p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isSubmitting}
              onClick={() => setOpen(false)}
            >
              Batal
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!name.trim() || isSubmitting}
            >
              <CheckIcon className="size-3.5" />
              Simpan
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
