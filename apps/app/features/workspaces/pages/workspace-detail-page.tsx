"use client";

import {
  ArchiveIcon,
  FileTextIcon,
  FolderIcon,
  LinkIcon,
  MessageSquarePlusIcon,
  MoreHorizontalIcon,
  PenLineIcon,
  Trash2Icon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Composer } from "@/features/thread-experience/components/composer";
import { useWorkspaceDetailData } from "../api/use-workspaces-data";
import { WorkspaceShell } from "../components/workspace-shell";
import { ConfirmDialog, NameDialog, UrlDialog } from "../components/workspace-dialogs";
import {
  getMoveTargetOptions,
  groupArtifactsByFolder,
  type WorkspaceArtifact,
  type WorkspaceFolder,
} from "../utils/workspace-library-model";

export function WorkspaceDetailPage({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const data = useWorkspaceDetailData(workspaceId);
  const [renameWorkspaceOpen, setRenameWorkspaceOpen] = useState(false);
  const [archiveWorkspaceOpen, setArchiveWorkspaceOpen] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [createDocumentOpen, setCreateDocumentOpen] = useState(false);
  const [createUrlOpen, setCreateUrlOpen] = useState(false);
  const [renameFolder, setRenameFolder] = useState<WorkspaceFolder | null>(null);
  const [deleteFolder, setDeleteFolder] = useState<WorkspaceFolder | null>(null);
  const [renameArtifact, setRenameArtifact] = useState<WorkspaceArtifact | null>(null);
  const [deleteArtifact, setDeleteArtifact] = useState<WorkspaceArtifact | null>(null);
  const groups = useMemo(
    () => groupArtifactsByFolder({ folders: data.folders, artifacts: data.artifacts }),
    [data.artifacts, data.folders],
  );
  const moveTargets = useMemo(() => getMoveTargetOptions(data.folders), [data.folders]);

  return (
    <WorkspaceShell
      viewer={data.viewer}
      workspaces={data.workspaces}
      selectedWorkspaceId={workspaceId}
      threads={data.threads}
      createWorkspace={data.createWorkspace}
    >
      <main className="grid h-svh min-h-0 grid-rows-[auto_1fr] overflow-hidden">
        {data.isLoading ? (
          <WorkspaceLoading />
        ) : data.workspace === null ? (
          <WorkspaceMissing />
        ) : data.workspace ? (
          <>
            <header className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-border/70 px-4 py-3 sm:px-6">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <h1 className="truncate font-heading text-xl font-semibold">
                    {data.workspace.name}
                  </h1>
                  <Badge variant="outline">{data.workspace.status}</Badge>
                </div>
                <p className="mt-1 truncate text-[12px] font-medium text-muted-foreground">
                  {data.workspace.description ?? "Workspace personal"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" onClick={() => setCreateFolderOpen(true)}>
                  <FolderIcon className="size-4" />
                  Folder
                </Button>
                <Button type="button" onClick={() => setCreateDocumentOpen(true)}>
                  <FileTextIcon className="size-4" />
                  Dokumen
                </Button>
                <Button type="button" variant="outline" onClick={() => setCreateUrlOpen(true)}>
                  <LinkIcon className="size-4" />
                  URL
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="Workspace actions">
                      <MoreHorizontalIcon className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={() => setRenameWorkspaceOpen(true)}>
                      <PenLineIcon className="size-4" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => setArchiveWorkspaceOpen(true)}
                    >
                      <ArchiveIcon className="size-4" />
                      Archive
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </header>
            <div className="grid min-h-0 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_21rem]">
              <section className="min-h-0 overflow-y-auto px-4 py-4 sm:px-6">
                <WorkspaceLibrary
                  groups={groups}
                  moveTargets={moveTargets}
                  onRenameFolder={setRenameFolder}
                  onDeleteFolder={setDeleteFolder}
                  onRenameArtifact={setRenameArtifact}
                  onDeleteArtifact={setDeleteArtifact}
                  onOpenArtifact={(artifactId) =>
                    router.push(`/workspaces/${workspaceId}/artifacts/${artifactId}`)
                  }
                  onMoveArtifact={async (artifactId, target) => {
                    await data.moveArtifact({
                      artifactId: artifactId as never,
                      folderId: target === "root" ? undefined : (target as never),
                    });
                  }}
                />
              </section>
              <aside className="min-h-0 border-t border-border/70 bg-muted/20 lg:border-l lg:border-t-0">
                <WorkspaceChat
                  workspaceId={workspaceId}
                  threads={data.workspaceThreads}
                  rateStatus={data.rateStatus}
                  startThread={data.startThread}
                  onOpenThread={(threadId) => router.push(`/threads/${threadId}`)}
                />
              </aside>
            </div>
          </>
        ) : null}
      </main>

      <NameDialog
        open={renameWorkspaceOpen}
        onOpenChange={setRenameWorkspaceOpen}
        title="Rename workspace"
        description="Perbarui nama dan deskripsi."
        submitLabel="Simpan"
        initialName={data.workspace?.name}
        initialDescription={data.workspace?.description}
        descriptionField
        onSubmit={async (value) => {
          await data.renameWorkspace({ workspaceId: workspaceId as never, ...value });
        }}
      />
      <NameDialog
        open={createFolderOpen}
        onOpenChange={setCreateFolderOpen}
        title="Folder baru"
        description="Buat folder satu level."
        submitLabel="Buat"
        onSubmit={async ({ name }) => {
          await data.createFolder({ workspaceId: workspaceId as never, name });
        }}
      />
      <NameDialog
        open={createDocumentOpen}
        onOpenChange={setCreateDocumentOpen}
        title="Dokumen baru"
        description="Buat placeholder dokumen."
        submitLabel="Buat"
        onSubmit={async ({ name }) => {
          const artifactId = await data.createDocument({
            workspaceId: workspaceId as never,
            title: name,
          });
          router.push(`/workspaces/${workspaceId}/artifacts/${String(artifactId)}`);
        }}
      />
      <UrlDialog
        open={createUrlOpen}
        onOpenChange={setCreateUrlOpen}
        onSubmit={async ({ url, title }) => {
          const artifactId = await data.createUrl({
            workspaceId: workspaceId as never,
            url,
            title,
          });
          router.push(`/workspaces/${workspaceId}/artifacts/${String(artifactId)}`);
        }}
      />
      <NameDialog
        open={Boolean(renameFolder)}
        onOpenChange={(open) => !open && setRenameFolder(null)}
        title="Rename folder"
        description="Perbarui nama folder."
        submitLabel="Simpan"
        initialName={renameFolder?.name}
        onSubmit={async ({ name }) => {
          if (renameFolder) {
            await data.renameFolder({ folderId: renameFolder._id as never, name });
          }
        }}
      />
      <NameDialog
        open={Boolean(renameArtifact)}
        onOpenChange={(open) => !open && setRenameArtifact(null)}
        title="Rename artifact"
        description="Perbarui judul artifact."
        submitLabel="Simpan"
        initialName={renameArtifact?.title}
        onSubmit={async ({ name }) => {
          if (renameArtifact) {
            await data.renameArtifact({ artifactId: renameArtifact._id as never, title: name });
          }
        }}
      />
      <ConfirmDialog
        open={archiveWorkspaceOpen}
        onOpenChange={setArchiveWorkspaceOpen}
        title="Archive workspace"
        description="Workspace ini disembunyikan dari daftar aktif."
        confirmLabel="Archive"
        onConfirm={async () => {
          await data.archiveWorkspace({ workspaceId: workspaceId as never });
          router.push("/workspaces");
        }}
      />
      <ConfirmDialog
        open={Boolean(deleteFolder)}
        onOpenChange={(open) => !open && setDeleteFolder(null)}
        title="Delete folder"
        description="Artifact aktif di folder ini akan kembali ke workspace root."
        confirmLabel="Delete"
        onConfirm={async () => {
          if (deleteFolder) {
            await data.removeFolder({ folderId: deleteFolder._id as never });
          }
        }}
      />
      <ConfirmDialog
        open={Boolean(deleteArtifact)}
        onOpenChange={(open) => !open && setDeleteArtifact(null)}
        title="Delete artifact"
        description="Artifact ini disembunyikan dari library."
        confirmLabel="Delete"
        onConfirm={async () => {
          if (deleteArtifact) {
            await data.removeArtifact({ artifactId: deleteArtifact._id as never });
          }
        }}
      />
    </WorkspaceShell>
  );
}

function WorkspaceLibrary({
  groups,
  moveTargets,
  onRenameFolder,
  onDeleteFolder,
  onRenameArtifact,
  onDeleteArtifact,
  onOpenArtifact,
  onMoveArtifact,
}: {
  groups: ReturnType<typeof groupArtifactsByFolder>;
  moveTargets: Array<{ value: string; label: string }>;
  onRenameFolder: (folder: WorkspaceFolder) => void;
  onDeleteFolder: (folder: WorkspaceFolder) => void;
  onRenameArtifact: (artifact: WorkspaceArtifact) => void;
  onDeleteArtifact: (artifact: WorkspaceArtifact) => void;
  onOpenArtifact: (artifactId: string) => void;
  onMoveArtifact: (artifactId: string, target: string) => Promise<unknown>;
}) {
  const hasArtifacts = groups.some((group) => group.artifacts.length > 0);

  return (
    <div className="grid gap-4">
      {!hasArtifacts && groups.length <= 1 ? (
        <div className="grid min-h-[36svh] place-items-center rounded-[8px] border border-dashed border-border bg-muted/20 p-8 text-center">
          <div className="grid gap-2">
            <FileTextIcon className="mx-auto size-8 text-muted-foreground" />
            <h2 className="font-heading text-xl font-semibold">Library kosong.</h2>
          </div>
        </div>
      ) : null}
      {groups.map((group) => (
        <section key={group.id} className="grid gap-2">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              {group.folder ? (
                <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
              )}
              <h2 className="truncate text-[13px] font-semibold">
                {group.folder?.name ?? "Workspace root"}
              </h2>
              <Badge variant="secondary">{group.artifacts.length}</Badge>
            </div>
            {group.folder ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Folder actions">
                    <MoreHorizontalIcon className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-36">
                  <DropdownMenuItem onClick={() => onRenameFolder(group.folder!)}>
                    <PenLineIcon className="size-4" />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => onDeleteFolder(group.folder!)}
                  >
                    <Trash2Icon className="size-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
          <div className="overflow-hidden rounded-[8px] border border-border">
            {group.artifacts.length === 0 ? (
              <div className="px-3 py-3 text-[12px] font-medium text-muted-foreground">
                Kosong
              </div>
            ) : (
              group.artifacts.map((artifact) => (
                <ArtifactRow
                  key={artifact._id}
                  artifact={artifact}
                  moveTargets={moveTargets}
                  onRename={() => onRenameArtifact(artifact)}
                  onDelete={() => onDeleteArtifact(artifact)}
                  onOpen={() => onOpenArtifact(artifact._id)}
                  onMove={onMoveArtifact}
                />
              ))
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

function ArtifactRow({
  artifact,
  moveTargets,
  onRename,
  onDelete,
  onOpen,
  onMove,
}: {
  artifact: WorkspaceArtifact;
  moveTargets: Array<{ value: string; label: string }>;
  onRename: () => void;
  onDelete: () => void;
  onOpen: () => void;
  onMove: (artifactId: string, target: string) => Promise<unknown>;
}) {
  return (
    <div className="grid min-w-0 grid-cols-[1fr_auto] items-center gap-3 border-b border-border/70 px-3 py-2.5 last:border-b-0">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 items-center gap-3 rounded-[6px] text-left outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
      >
        {artifact.kind === "url" ? (
          <LinkIcon className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold">{artifact.title}</div>
          <div className="truncate text-[11px] font-medium text-muted-foreground">
            {artifact.kind ?? artifact.type ?? "artifact"}
            {artifact.plainTextPreview ? ` / ${artifact.plainTextPreview}` : ""}
          </div>
        </div>
      </button>
      <div className="flex items-center gap-1.5">
        <Select
          value={artifact.folderId ?? "root"}
          onValueChange={(value) => {
            void onMove(artifact._id, value);
          }}
        >
          <SelectTrigger size="sm" className="hidden w-36 sm:flex">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {moveTargets.map((target) => (
              <SelectItem key={target.value} value={target.value}>
                {target.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Artifact actions">
              <MoreHorizontalIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel>Artifact</DropdownMenuLabel>
            <DropdownMenuItem onClick={onRename}>
              <PenLineIcon className="size-4" />
              Rename
            </DropdownMenuItem>
            {moveTargets.map((target) => (
              <DropdownMenuItem
                key={target.value}
                onClick={() => void onMove(artifact._id, target.value)}
              >
                <FolderIcon className="size-4" />
                {target.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash2Icon className="size-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function WorkspaceChat({
  workspaceId,
  threads,
  rateStatus,
  startThread,
  onOpenThread,
}: {
  workspaceId: string;
  threads: Array<{
    threadId: string;
    title: string;
    lastActivityAt: number;
    status: "idle" | "streaming" | "failed";
  }>;
  rateStatus: Parameters<typeof Composer>[0]["rateStatus"];
  startThread: Parameters<typeof Composer>[0]["onStartThread"];
  onOpenThread: (threadId: string) => void;
}) {
  return (
    <div className="grid min-h-0 gap-4 p-4">
      <div className="grid gap-2">
        <div className="flex items-center gap-2">
          <MessageSquarePlusIcon className="size-4 text-muted-foreground" />
          <h2 className="text-[13px] font-semibold">Workspace chat</h2>
        </div>
        <Composer
          disabled={false}
          rateStatus={rateStatus}
          onStartThread={(args) => startThread({ ...args, workspaceId: workspaceId as never })}
          onSend={async () => ({ ok: true, messageId: "" })}
        />
      </div>
      <div className="grid gap-2">
        {threads.map((thread) => (
          <button
            key={thread.threadId}
            type="button"
            onClick={() => onOpenThread(thread.threadId)}
            className="grid min-w-0 gap-1 rounded-[8px] border border-border bg-background px-3 py-2 text-left hover:bg-muted/40"
          >
            <span className="truncate text-[12px] font-semibold">{thread.title}</span>
            <span className="text-[11px] font-medium text-muted-foreground">{thread.status}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function WorkspaceLoading() {
  return (
    <div className="grid gap-4 px-4 py-5 sm:px-6">
      <p className="text-[12px] font-medium text-muted-foreground">Memuat workspace...</p>
      <Skeleton className="h-12 rounded-[8px]" />
      <Skeleton className="h-48 rounded-[8px]" />
      <Skeleton className="h-48 rounded-[8px]" />
    </div>
  );
}

function WorkspaceMissing() {
  return (
    <div className="grid min-h-svh place-items-center px-4 text-center">
      <div className="grid gap-3">
        <h1 className="font-heading text-2xl font-semibold">Workspace tidak tersedia.</h1>
        <p className="text-[13px] font-medium text-muted-foreground">
          Workspace ini tidak ditemukan untuk akun yang sedang masuk.
        </p>
      </div>
    </div>
  );
}
