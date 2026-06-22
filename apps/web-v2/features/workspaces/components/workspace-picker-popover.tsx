"use client";

import { api } from "@aqsha/convex/api";
import { Loader2Icon } from "@aqsha/ui/icons";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { readableConvexErrorMessage } from "@/lib/convex-error";
import { useConvexMutationFn, useConvexQueryData } from "@/lib/convex-query";
import { cn } from "@/lib/utils";

// Mirrors `DEFAULT_WORKSPACE_EMOJI` in packages/convex/convex/workspaces/emoji.ts.
// Workspaces created since the emoji rollout always carry one, but older rows
// (and the optimistic gap before a fresh save) may not — fall back so the list
// never renders an empty glyph slot.
const DEFAULT_WORKSPACE_EMOJI = "📚";

/**
 * The Save-to-Workspace picker as a Popover (replaces the old dialog). Wraps a
 * caller-supplied `trigger` (the FolderIcon button) and, on open, lists the
 * user's workspaces — each row shows the workspace emoji + name. Clicking a row
 * saves into it immediately (no separate submit step); the popover closes on
 * success and stays open on failure so the user can retry.
 *
 * `onSelect` must re-throw on failure (the shared `saveUrlToWorkspace` helper
 * already toasts) so this component knows to keep the popover open.
 */
export function WorkspacePickerPopover({
  trigger,
  onSelect,
  currentWorkspaceId,
  title = "Simpan ke workspace",
  description,
  align = "end",
  contentClassName,
}: {
  trigger: ReactNode;
  onSelect: (workspaceId: string) => void | Promise<void>;
  currentWorkspaceId?: string;
  title?: string;
  description?: string;
  align?: "start" | "center" | "end";
  contentClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  // Only fetch while the popover is open — keeps the feed (many cards) from
  // subscribing to the workspace list for every rendered item.
  const workspacePage = useConvexQueryData(
    api.workspaces.list,
    open ? { paginationOpts: { cursor: null, numItems: 50 } } : "skip",
  );
  const workspaces = (workspacePage?.page ?? []).filter(
    (workspace) => workspace._id !== currentWorkspaceId,
  );
  const createWorkspace = useConvexMutationFn(api.workspaces.create);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const handleSelect = async (workspaceId: string) => {
    setPendingId(workspaceId);
    try {
      await onSelect(workspaceId);
      setOpen(false);
    } catch {
      // onSelect already surfaced its own toast; keep the popover open to retry.
    } finally {
      setPendingId(null);
    }
  };

  // Cold start: a user with no workspaces would otherwise hit a dead end. Let
  // them create one inline and save into it in a single step.
  const handleCreateAndSave = async () => {
    const name = newName.trim();
    if (!name) return;
    setIsCreating(true);
    let workspaceId: string;
    try {
      workspaceId = String(await createWorkspace({ name }));
    } catch (error) {
      toast.error(readableConvexErrorMessage(error, "Gagal membuat workspace."));
      setIsCreating(false);
      return;
    }
    try {
      await onSelect(workspaceId);
      setOpen(false);
      setNewName("");
    } catch {
      // The save (onSelect) failed and already surfaced its own toast. Keep the
      // popover open: the freshly created workspace now appears in the list, so
      // the user can retry into it without re-creating one.
    } finally {
      setIsCreating(false);
    }
  };

  const isLoading = open && workspacePage === undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align={align} className={cn("w-64 p-0", contentClassName)}>
        <div className="border-b border-border/70 px-3 py-2.5">
          <p className="text-[13px] font-semibold text-foreground">{title}</p>
          {description ? (
            <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        <div className="max-h-64 overflow-y-auto p-1.5">
          {workspaces.map((workspace) => {
            const isPending = pendingId === workspace._id;
            return (
              <button
                key={workspace._id}
                type="button"
                disabled={pendingId !== null}
                onClick={() => void handleSelect(workspace._id)}
                className="flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left text-[13px] font-medium text-foreground transition-colors hover:bg-muted/60 disabled:opacity-60"
              >
                <span className="shrink-0 text-base leading-none">
                  {workspace.emoji || DEFAULT_WORKSPACE_EMOJI}
                </span>
                <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
                {isPending ? (
                  <Loader2Icon className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
                ) : null}
              </button>
            );
          })}
          {isLoading ? (
            <div className="flex items-center justify-center py-5">
              <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : null}
          {workspacePage !== undefined && workspaces.length === 0 ? (
            <div className="px-1.5 py-1.5">
              <p className="mb-2 text-[12px] font-medium text-muted-foreground">
                Belum ada workspace. Buat satu untuk menyimpan.
              </p>
              <div className="flex items-center gap-1.5">
                <Input
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  placeholder="Nama workspace"
                  className="h-8"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleCreateAndSave();
                    }
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  className="h-8 shrink-0"
                  disabled={!newName.trim() || isCreating}
                  onClick={() => void handleCreateAndSave()}
                >
                  Buat
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
