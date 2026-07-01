"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@aqsha/ui/components/badge";
import { Button } from "@aqsha/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@aqsha/ui/components/dropdown-menu";
import { ArchiveIcon, ChevronRightIcon, Loader2Icon, MoreHorizontalIcon } from "@aqsha/ui/icons";
import { useArchiveWorkspace, useWorkspacesList } from "../api";
import { isArchived, type Workspace } from "../types";
import { workspaceEmoji } from "../utils/workspace-emoji";
import { ConfirmDialog } from "./common-dialogs";
import { CreateWorkspaceButton } from "./create-workspace-dialog";

export function WorkspaceList() {
  const [includeArchived, setIncludeArchived] = useState(false);
  const query = useWorkspacesList(includeArchived);
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl">Workspace</h1>
          <p className="text-sm text-muted-foreground">
            Rapikan riset kamu ke dalam workspace dan folder.
          </p>
        </div>
        <CreateWorkspaceButton />
      </div>

      <div className="mt-6 flex items-center justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIncludeArchived((v) => !v)}
          className="text-muted-foreground"
        >
          {includeArchived ? "Sembunyikan arsip" : "Tampilkan arsip"}
        </Button>
      </div>

      {query.isPending ? (
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2Icon className="animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          Belum ada workspace. Buat yang pertama untuk mulai mengoleksi riset.
        </p>
      ) : (
        <ul className="mt-4 grid gap-2">
          {items.map((w) => (
            <WorkspaceRow key={w.id} workspace={w} />
          ))}
        </ul>
      )}

      {query.hasNextPage ? (
        <div className="mt-6 flex justify-center">
          <Button
            variant="outline"
            onClick={() => query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
          >
            {query.isFetchingNextPage ? <Loader2Icon className="animate-spin" /> : null}
            Muat lebih banyak
          </Button>
        </div>
      ) : null}
    </main>
  );
}

function WorkspaceRow({ workspace }: { workspace: Workspace }) {
  const archived = isArchived(workspace);
  const archive = useArchiveWorkspace();
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <li className="flex items-center gap-3 rounded-lg border bg-card px-3 py-3">
      <Link
        href={`/app/workspaces/${workspace.id}`}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        <span className="text-2xl">{workspaceEmoji(workspace.emoji)}</span>
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="truncate font-medium">{workspace.name}</span>
            {archived ? <Badge variant="secondary">Diarsipkan</Badge> : null}
          </span>
        </span>
      </Link>

      {!archived ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Aksi workspace">
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setConfirmOpen(true)}>
              <ArchiveIcon />
              Arsipkan
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      <Link href={`/app/workspaces/${workspace.id}`} aria-label="Buka workspace">
        <ChevronRightIcon className="text-muted-foreground" />
      </Link>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Arsipkan workspace?"
        description={`"${workspace.name}" akan disembunyikan dari daftar aktif. Tindakan ini tidak bisa dibatalkan.`}
        confirmLabel="Arsipkan"
        pending={archive.isPending}
        onConfirm={() =>
          archive.mutate({ id: workspace.id }, { onSuccess: () => setConfirmOpen(false) })
        }
      />
    </li>
  );
}
