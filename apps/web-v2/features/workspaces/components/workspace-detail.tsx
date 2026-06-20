"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@aqsha/ui/components/badge";
import { Button } from "@aqsha/ui/components/button";
import { ArchiveIcon, ArrowLeftIcon, Loader2Icon, PencilIcon } from "@aqsha/ui/icons";
import { ArtifactLibrary } from "@/features/artifacts/components/artifact-library";
import { useArchiveWorkspace, useUpdateWorkspace, useWorkspace } from "../api";
import { isArchived } from "../types";
import { ConfirmDialog, NameDialog } from "./common-dialogs";
import { EmojiPicker } from "./emoji-picker";
import { FolderSection } from "./folder-section";

export function WorkspaceDetail({ workspaceId }: { workspaceId: string }) {
  const query = useWorkspace(workspaceId);
  const update = useUpdateWorkspace();
  const archive = useArchiveWorkspace();
  const [renameOpen, setRenameOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  if (query.isPending) {
    return (
      <div className="flex justify-center py-24 text-muted-foreground">
        <Loader2Icon className="animate-spin" />
      </div>
    );
  }

  const workspace = query.data;
  if (!workspace) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-16 text-center">
        <p className="text-sm text-muted-foreground">Workspace tidak ditemukan.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/app/workspaces">Kembali ke daftar</Link>
        </Button>
      </main>
    );
  }

  const archived = isArchived(workspace);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <Link
        href="/app/workspaces"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" />
        Workspace
      </Link>

      <div className="mt-4 flex items-start gap-4">
        <EmojiPicker
          value={workspace.emoji}
          disabled={update.isPending}
          onSelect={(emoji) => update.mutate({ id: workspace.id, emoji })}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate font-serif text-3xl">{workspace.name}</h1>
            {archived ? <Badge variant="secondary">Diarsipkan</Badge> : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setRenameOpen(true)}>
            <PencilIcon />
            Ubah nama
          </Button>
          {!archived ? (
            <Button variant="outline" size="sm" onClick={() => setArchiveOpen(true)}>
              <ArchiveIcon />
              Arsipkan
            </Button>
          ) : null}
        </div>
      </div>

      <FolderSection workspaceId={workspace.id} workspaceActive={!archived} />

      <ArtifactLibrary workspaceId={workspace.id} workspaceActive={!archived} />

      <NameDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        title="Ubah nama workspace"
        label="Nama workspace"
        initialValue={workspace.name}
        pending={update.isPending}
        onSubmit={(name) =>
          update.mutate({ id: workspace.id, name }, { onSuccess: () => setRenameOpen(false) })
        }
      />

      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="Arsipkan workspace?"
        description={`"${workspace.name}" akan disembunyikan dari daftar aktif. Tindakan ini tidak bisa dibatalkan.`}
        confirmLabel="Arsipkan"
        pending={archive.isPending}
        onConfirm={() =>
          archive.mutate({ id: workspace.id }, { onSuccess: () => setArchiveOpen(false) })
        }
      />
    </main>
  );
}
