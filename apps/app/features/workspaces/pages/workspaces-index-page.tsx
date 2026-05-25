"use client";

import { ArchiveIcon, FolderIcon, MoreHorizontalIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useWorkspaceIndexData } from "../api/use-workspaces-data";
import { WorkspaceShell } from "../components/workspace-shell";
import { NameDialog } from "../components/workspace-dialogs";

export function WorkspacesIndexPage() {
  const {
    viewer,
    workspaces,
    threads,
    isLoadingWorkspaces,
    createWorkspace,
    archiveWorkspace,
    removeThread,
  } = useWorkspaceIndexData();
  const [createOpen, setCreateOpen] = useState(false);
  const [archiveId, setArchiveId] = useState<string | null>(null);
  const archiveTarget = workspaces.find((workspace) => workspace._id === archiveId);

  return (
    <WorkspaceShell
      viewer={viewer}
      workspaces={workspaces}
      threads={threads}
      createWorkspace={createWorkspace}
      removeThread={removeThread}
    >
      <main className="mx-auto grid w-full max-w-5xl gap-5 px-4 py-5 sm:px-8 lg:py-7">
        <header className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-4">
          <div className="min-w-0">
            <h1 className="truncate font-heading text-2xl font-semibold tracking-normal">
              Workspaces
            </h1>
            <p className="mt-1 text-[13px] font-medium text-muted-foreground">
              {workspaces.length} aktif
            </p>
          </div>
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <PlusIcon className="size-4" />
            Workspace
          </Button>
        </header>

        {isLoadingWorkspaces ? (
          <div className="grid gap-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-16 rounded-[8px]" />
            ))}
          </div>
        ) : workspaces.length === 0 ? (
          <div className="grid min-h-[42svh] place-items-center rounded-[8px] border border-dashed border-border bg-muted/20 p-8 text-center">
            <div className="grid gap-3">
              <FolderIcon className="mx-auto size-8 text-muted-foreground" />
              <h2 className="font-heading text-xl font-semibold">Belum ada workspace.</h2>
              <Button type="button" onClick={() => setCreateOpen(true)}>
                <PlusIcon className="size-4" />
                Buat workspace
              </Button>
            </div>
          </div>
        ) : (
          <section className="grid overflow-hidden rounded-[8px] border border-border">
            {workspaces.map((workspace) => (
              <div
                key={workspace._id}
                className="grid min-w-0 grid-cols-[1fr_auto] items-center gap-3 border-b border-border/70 px-3 py-3 last:border-b-0"
              >
                <Link
                  href={`/workspaces/${workspace._id}`}
                  className="grid min-w-0 gap-1 hover:opacity-80"
                >
                  <span className="truncate text-[14px] font-semibold">{workspace.name}</span>
                  <span className="truncate text-[12px] font-medium text-muted-foreground">
                    {workspace.description ?? "Workspace personal"}
                  </span>
                </Link>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="hidden sm:inline-flex">
                    Active
                  </Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Workspace actions"
                      >
                        <MoreHorizontalIcon className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setArchiveId(workspace._id)}
                      >
                        <ArchiveIcon className="size-4" />
                        Archive
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </section>
        )}
      </main>
      <NameDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Workspace baru"
        description="Buat area riset personal."
        submitLabel="Buat"
        descriptionField
        onSubmit={async (value) => {
          await createWorkspace(value);
        }}
      />
      <ConfirmDialog
        open={Boolean(archiveTarget)}
        onOpenChange={(open) => !open && setArchiveId(null)}
        title="Archive workspace"
        description="Workspace ini disembunyikan dari daftar aktif."
        confirmLabel="Archive"
        onConfirm={async () => {
          if (archiveTarget) {
            await archiveWorkspace({ workspaceId: archiveTarget._id as never });
          }
        }}
      />
    </WorkspaceShell>
  );
}
