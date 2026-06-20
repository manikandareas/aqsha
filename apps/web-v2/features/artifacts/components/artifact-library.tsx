"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Badge } from "@aqsha/ui/components/badge";
import { Button } from "@aqsha/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@aqsha/ui/components/dropdown-menu";
import {
  Code2Icon,
  FileIcon,
  FileTextIcon,
  FolderTreeIcon,
  LinkIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  UploadIcon,
} from "@aqsha/ui/icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog, NameDialog } from "@/features/workspaces/components/common-dialogs";
import { WorkspacePicker } from "@/features/workspaces/components/workspace-picker";
import {
  useArtifacts,
  useCreateDocument,
  useDeleteArtifact,
  useMoveArtifact,
  useRenameArtifact,
  useSaveUrl,
  useUploadArtifact,
} from "../api";
import { type Artifact, artifactTypeLabel, UPLOAD_ACCEPT } from "../types";
import { AddUrlDialog } from "./add-url-dialog";

function TypeIcon({ type }: { type: string }) {
  if (type === "url") return <LinkIcon className="text-muted-foreground" />;
  if (type === "pdf" || type === "docx") return <FileIcon className="text-muted-foreground" />;
  if (type === "code" || type === "json" || type === "csv")
    return <Code2Icon className="text-muted-foreground" />;
  return <FileTextIcon className="text-muted-foreground" />;
}

export function ArtifactLibrary({
  workspaceId,
  workspaceActive,
}: {
  workspaceId: string;
  workspaceActive: boolean;
}) {
  const query = useArtifacts(workspaceId);
  const create = useCreateDocument(workspaceId);
  const upload = useUploadArtifact(workspaceId);
  const saveUrl = useSaveUrl();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [urlOpen, setUrlOpen] = useState(false);

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-xl">Pustaka</h2>
        {workspaceActive ? (
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept={UPLOAD_ACCEPT}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) upload.mutate({ file });
              }}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={upload.isPending}
              onClick={() => fileRef.current?.click()}
            >
              {upload.isPending ? <Loader2Icon className="animate-spin" /> : <UploadIcon />}
              Unggah file
            </Button>
            <Button variant="outline" size="sm" onClick={() => setUrlOpen(true)}>
              <LinkIcon />
              Tambah tautan
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
              <PlusIcon />
              Buat dokumen
            </Button>
          </div>
        ) : null}
      </div>

      {query.isPending ? (
        <div className="flex justify-center py-10 text-muted-foreground">
          <Loader2Icon className="animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Belum ada artefak. Buat dokumen, unggah file, atau simpan tautan.
        </p>
      ) : (
        <ul className="mt-4 grid gap-1.5">
          {items.map((a) => (
            <ArtifactRow
              key={a._id}
              artifact={a}
              workspaceId={workspaceId}
              actionable={workspaceActive}
            />
          ))}
        </ul>
      )}

      {query.hasNextPage ? (
        <div className="mt-4 flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            disabled={query.isFetchingNextPage}
            onClick={() => query.fetchNextPage()}
          >
            {query.isFetchingNextPage ? <Loader2Icon className="animate-spin" /> : null}
            Muat lebih banyak
          </Button>
        </div>
      ) : null}

      <NameDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Buat dokumen"
        label="Judul dokumen"
        submitLabel="Buat"
        initialValue=""
        pending={create.isPending}
        onSubmit={(title) =>
          create.mutate(
            { title },
            {
              onSuccess: (res) => {
                setCreateOpen(false);
                router.push(`/app/workspaces/${workspaceId}/artifacts/${res.artifactId}`);
              },
            },
          )
        }
      />

      <AddUrlDialog
        open={urlOpen}
        onOpenChange={setUrlOpen}
        pending={saveUrl.isPending}
        onSubmit={(input) =>
          saveUrl.mutate(
            { workspaceId, url: input.url, title: input.title },
            { onSuccess: () => setUrlOpen(false) },
          )
        }
      />
    </section>
  );
}

function ArtifactRow({
  artifact,
  workspaceId,
  actionable,
}: {
  artifact: Artifact;
  workspaceId: string;
  actionable: boolean;
}) {
  const rename = useRenameArtifact();
  const remove = useDeleteArtifact();
  const [renameOpen, setRenameOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <li className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5">
      <TypeIcon type={artifact.artifactType} />
      <Link
        href={`/app/workspaces/${workspaceId}/artifacts/${artifact._id}`}
        className="min-w-0 flex-1 truncate text-sm hover:underline"
      >
        {artifact.title}
      </Link>
      <Badge variant="secondary">{artifactTypeLabel(artifact.artifactType)}</Badge>
      {artifact.indexingStatus === "pending" ? (
        <Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />
      ) : null}

      {actionable ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Aksi artefak">
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
        title="Ubah nama artefak"
        label="Judul"
        initialValue={artifact.title}
        pending={rename.isPending}
        onSubmit={(title) =>
          rename.mutate({ id: artifact._id, title }, { onSuccess: () => setRenameOpen(false) })
        }
      />

      <MoveArtifactDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        artifact={artifact}
        currentWorkspaceId={workspaceId}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Hapus artefak?"
        description={`"${artifact.title}" akan dihapus dari pustaka.`}
        confirmLabel="Hapus"
        destructive
        pending={remove.isPending}
        onConfirm={() =>
          remove.mutate({ id: artifact._id }, { onSuccess: () => setDeleteOpen(false) })
        }
      />
    </li>
  );
}

function MoveArtifactDialog({
  open,
  onOpenChange,
  artifact,
  currentWorkspaceId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  artifact: Artifact;
  currentWorkspaceId: string;
}) {
  const move = useMoveArtifact();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pindahkan artefak</DialogTitle>
          <DialogDescription>Pilih workspace tujuan untuk {artifact.title}.</DialogDescription>
        </DialogHeader>
        <WorkspacePicker
          excludeId={currentWorkspaceId}
          disabled={move.isPending}
          onSelect={(targetWorkspaceId) =>
            move.mutate(
              { id: artifact._id, targetWorkspaceId },
              { onSuccess: () => onOpenChange(false) },
            )
          }
        />
      </DialogContent>
    </Dialog>
  );
}
