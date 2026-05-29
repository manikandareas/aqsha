"use client";

import { MoreHorizontalIcon, MoreVerticalIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function ThreadDeleteActions({
  description,
  onDelete,
  variant = "header",
}: {
  description: string;
  onDelete: () => Promise<void>;
  variant?: "header" | "sidebar-row";
}) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const isSidebarRow = variant === "sidebar-row";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={cn(
              isSidebarRow
                ? "absolute top-1 right-1 size-7 shrink-0 rounded-[6px] text-muted-foreground hover:bg-muted hover:text-foreground group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 aria-expanded:opacity-100 md:opacity-0 [&_svg]:size-3.5"
                : "size-8 shrink-0 rounded-full text-muted-foreground",
            )}
            onClick={
              isSidebarRow
                ? (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }
                : undefined
            }
            aria-label="Aksi thread"
          >
            {isSidebarRow ? <MoreVerticalIcon /> : <MoreHorizontalIcon className="size-4" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align={isSidebarRow ? "start" : "end"}
          side={isSidebarRow ? "right" : undefined}
          sideOffset={isSidebarRow ? 4 : undefined}
          className="w-44"
        >
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setDeleteDialogOpen(true)}
          >
            <Trash2Icon className="size-4" />
            Hapus thread
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Hapus thread"
        description={description}
        confirmLabel="Hapus"
        onConfirm={onDelete}
      />
    </>
  );
}
