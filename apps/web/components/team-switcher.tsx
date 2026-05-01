"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { createWorkspace, setActiveWorkspace } from "@/features/workspace-api";
import { queryKeys } from "@/lib/react-query/keys";
import {
  BellIcon,
  BriefcaseBusinessIcon,
  CheckIcon,
  ChevronDownIcon,
  Loader2Icon,
  PlusIcon,
} from "lucide-react";

export type TeamSwitcherWorkspace = {
  id: string;
  name: string;
  slug: string | null;
  role: "owner" | "member";
  planCode: "free" | "pro";
  isActive: boolean;
};

export function TeamSwitcher({
  activeWorkspaceId,
  workspaces,
}: {
  activeWorkspaceId: string | null;
  workspaces: TeamSwitcherWorkspace[];
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pendingWorkspaceId, setPendingWorkspaceId] = React.useState<string | null>(
    null,
  );
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [isCreating, setIsCreating] = React.useState(false);
  const [workspaceName, setWorkspaceName] = React.useState("");
  const activeWorkspace =
    workspaces.find((workspace) => workspace.id === activeWorkspaceId) ??
    workspaces.find((workspace) => workspace.isActive) ??
    workspaces[0];

  if (!activeWorkspace) {
    return null;
  }

  async function refreshWorkspaceScope() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.journals.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.session.all }),
    ]);
    router.refresh();
  }

  async function handleSwitch(workspace: TeamSwitcherWorkspace) {
    if (workspace.id === activeWorkspace.id || pendingWorkspaceId) {
      return;
    }

    setPendingWorkspaceId(workspace.id);

    try {
      await setActiveWorkspace(workspace.id);
      await refreshWorkspaceScope();
    } finally {
      setPendingWorkspaceId(null);
    }
  }

  function handleCreateDialogOpenChange(open: boolean) {
    setCreateDialogOpen(open);

    if (!open) {
      setCreateError(null);
      setWorkspaceName("");
    }
  }

  async function handleCreateWorkspace(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isCreating) {
      return;
    }

    const name = workspaceName.trim();

    if (!name) {
      setCreateError("Workspace name is required.");
      return;
    }

    setCreateError(null);
    setIsCreating(true);

    try {
      await createWorkspace(name);
      await refreshWorkspaceScope();
      router.push("/app");
      handleCreateDialogOpenChange(false);
    } catch (error) {
      setCreateError(
        error instanceof Error
          ? error.message
          : "Failed to create workspace. Please try again.",
      );
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <Dialog open={createDialogOpen} onOpenChange={handleCreateDialogOpenChange}>
      <SidebarMenu>
        <SidebarMenuItem>
          <div className="flex items-center justify-between gap-2 px-1">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<SidebarMenuButton className="flex-1 max-w-fit" />}
              >
                <WorkspaceMark
                  workspace={activeWorkspace}
                  className="size-[28px]"
                />
                <span className="truncate text-[15px] font-semibold">
                  {activeWorkspace.name}
                </span>
                <ChevronDownIcon className="ml-1 h-4 w-4 shrink-0 opacity-50" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-64 rounded-lg"
                align="start"
                side="bottom"
                sideOffset={4}
              >
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    Workspaces
                  </DropdownMenuLabel>
                  {workspaces.map((workspace, index) => {
                    const isActive = workspace.id === activeWorkspace.id;
                    const isPending = pendingWorkspaceId === workspace.id;

                    return (
                      <DropdownMenuItem
                        key={workspace.id}
                        onClick={() => void handleSwitch(workspace)}
                        className="gap-2 p-2"
                        disabled={Boolean(pendingWorkspaceId) || isCreating}
                      >
                        <WorkspaceMark workspace={workspace} className="size-6" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate">{workspace.name}</div>
                          <div className="text-[11px] capitalize text-muted-foreground">
                            {workspace.planCode} · {workspace.role}
                          </div>
                        </div>
                        {isPending ? (
                          <Loader2Icon className="size-3.5 animate-spin" />
                        ) : isActive ? (
                          <CheckIcon className="size-3.5" />
                        ) : (
                          <DropdownMenuShortcut>
                            ⌘{index + 1}
                          </DropdownMenuShortcut>
                        )}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    className="gap-2 p-2"
                    onClick={() => setCreateDialogOpen(true)}
                    disabled={Boolean(pendingWorkspaceId) || isCreating}
                  >
                    <div className="flex size-6 items-center justify-center rounded-md border bg-background">
                      {isCreating ? (
                        <Loader2Icon className="size-4 animate-spin" />
                      ) : (
                        <PlusIcon className="size-4" />
                      )}
                    </div>
                    <div className="font-medium text-muted-foreground">
                      Add workspace
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <button
              type="button"
              aria-label="Notifications"
              className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
            >
              <BellIcon className="h-[18px] w-[18px]" />
              <span className="absolute top-1.5 right-1.5 flex h-2 w-2 rounded-full bg-primary ring-2 ring-sidebar" />
            </button>
          </div>
        </SidebarMenuItem>
      </SidebarMenu>
      <DialogContent>
        <form onSubmit={handleCreateWorkspace} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Create workspace</DialogTitle>
            <DialogDescription>
              Add a new workspace for separate journals and chat threads.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="workspace-name">Workspace name</Label>
            <Input
              id="workspace-name"
              value={workspaceName}
              onChange={(event) => setWorkspaceName(event.target.value)}
              placeholder="Research Lab"
              disabled={isCreating}
              autoFocus
              aria-invalid={Boolean(createError)}
            />
            {createError ? (
              <p className="text-sm text-destructive">{createError}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleCreateDialogOpenChange(false)}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isCreating || !workspaceName.trim()}>
              {isCreating ? (
                <>
                  <Loader2Icon className="size-4 animate-spin" />
                  Creating
                </>
              ) : (
                "Create workspace"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function WorkspaceMark({
  workspace,
  className,
}: {
  workspace: TeamSwitcherWorkspace;
  className: string;
}) {
  return (
    <div
      className={`flex aspect-square shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground ${className} [&_svg]:h-[18px] [&_svg]:w-[18px]`}
    >
      <BriefcaseBusinessIcon />
      <span className="sr-only">{workspace.name}</span>
    </div>
  );
}
