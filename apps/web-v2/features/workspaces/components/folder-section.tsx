"use client";

import { useState } from "react";
import { Button } from "@aqsha/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@aqsha/ui/components/dropdown-menu";
import {
  FolderIcon,
  FolderTreeIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "@aqsha/ui/icons";
import {
  useCreateFolder,
  useDeleteFolder,
  useFolders,
  useMoveFolder,
  useRenameFolder,
} from "../api";
import type { Folder } from "../types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog, NameDialog } from "./common-dialogs";
import { WorkspacePicker } from "./workspace-picker";

export function FolderSection({
  workspaceId,
  workspaceActive,
}: {
  workspaceId: string;
  workspaceActive: boolean;
}) {
  const query = useFolders(workspaceId);
  const create = useCreateFolder();
  const [createOpen, setCreateOpen] = useState(false);
  const folders = query.data?.items ?? [];

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-xl">Folder</h2>
        {workspaceActive ? (
          <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
            <PlusIcon />
            Buat folder
          </Button>
        ) : null}
      </div>

      {query.isPending ? (
        <div className="flex justify-center py-10 text-muted-foreground">
          <Loader2Icon className="animate-spin" />
        </div>
      ) : folders.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Belum ada folder di workspace ini.
        </p>
      ) : (
        <ul className="mt-4 grid gap-1.5">
          {folders.map((f) => (
            <FolderRow key={f.id} folder={f} actionable={workspaceActive} />
          ))}
        </ul>
      )}

      <NameDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Buat folder"
        label="Nama folder"
        submitLabel="Buat"
        pending={create.isPending}
        onSubmit={(name) =>
          create.mutate({ workspaceId, name }, { onSuccess: () => setCreateOpen(false) })
        }
      />
    </section>
  );
}

function FolderRow({ folder, actionable }: { folder: Folder; actionable: boolean }) {
  const rename = useRenameFolder();
  const remove = useDeleteFolder();
  const [renameOpen, setRenameOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <li className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5">
      <FolderIcon className="text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-sm">{folder.name}</span>

      {actionable ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Aksi folder">
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setRenameOpen(true)}>
              <PencilIcon />
              Ubah nama
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setMoveOpen(true)}>
              <FolderTreeIcon />
              Pindahkan
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => setDeleteOpen(true)}
            >
              <Trash2Icon />
              Hapus
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      <NameDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        title="Ubah nama folder"
        label="Nama folder"
        initialValue={folder.name}
        pending={rename.isPending}
        onSubmit={(name) =>
          rename.mutate(
            { id: folder.id, workspaceId: folder.workspaceId, name },
            { onSuccess: () => setRenameOpen(false) },
          )
        }
      />

      <MoveFolderDialog open={moveOpen} onOpenChange={setMoveOpen} folder={folder} />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Hapus folder?"
        description={`"${folder.name}" dihapus. Artefak di dalamnya tidak ikut terhapus.`}
        confirmLabel="Hapus"
        destructive
        pending={remove.isPending}
        onConfirm={() =>
          remove.mutate(
            { id: folder.id, workspaceId: folder.workspaceId },
            { onSuccess: () => setDeleteOpen(false) },
          )
        }
      />
    </li>
  );
}

function MoveFolderDialog({
  open,
  onOpenChange,
  folder,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folder: Folder;
}) {
  const move = useMoveFolder();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pindahkan folder</DialogTitle>
          <DialogDescription>
            Pilih workspace tujuan untuk folder {folder.name}.
          </DialogDescription>
        </DialogHeader>
        <WorkspacePicker
          excludeId={folder.workspaceId}
          disabled={move.isPending}
          onSelect={(targetWorkspaceId) =>
            move.mutate(
              { id: folder.id, workspaceId: folder.workspaceId, targetWorkspaceId },
              { onSuccess: () => onOpenChange(false) },
            )
          }
        />
      </DialogContent>
    </Dialog>
  );
}
