"use client";

import {
  CheckIcon,
  ExternalLinkIcon,
  FolderIcon,
  LinkIcon,
  PenLineIcon,
  Trash2Icon,
} from "lucide-react";
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import type { MoveTargetOption } from "../utils/workspace-library-model";

type WorkspaceMoveTarget = {
  _id: string;
  name: string;
};

export function FolderContextMenuContent({
  workspaces,
  onOpen,
  onRename,
  onDelete,
  onMoveToWorkspace,
}: {
  workspaces: WorkspaceMoveTarget[];
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
  onMoveToWorkspace: (targetWorkspaceId: string) => void;
}) {
  return (
    <ContextMenuContent className="w-52">
      <ContextMenuLabel>Folder</ContextMenuLabel>
      <ContextMenuItem onSelect={onOpen}>
        <ExternalLinkIcon className="size-4" />
        Buka folder
      </ContextMenuItem>
      <ContextMenuItem onSelect={onRename}>
        <PenLineIcon className="size-4" />
        Rename
      </ContextMenuItem>
      <MoveToWorkspaceContextSubmenu
        workspaces={workspaces}
        onMove={onMoveToWorkspace}
      />
      <ContextMenuSeparator />
      <ContextMenuItem variant="destructive" onSelect={onDelete}>
        <Trash2Icon className="size-4" />
        Delete
      </ContextMenuItem>
    </ContextMenuContent>
  );
}

export function ArtifactContextMenuContent({
  moveTargets,
  workspaces,
  artifactHref,
  isSelected,
  onSelect,
  onOpen,
  onRename,
  onDelete,
  onMove,
  onMoveToWorkspace,
}: {
  moveTargets: MoveTargetOption[];
  workspaces: WorkspaceMoveTarget[];
  artifactHref: string;
  isSelected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
  onMove: (target: string) => void;
  onMoveToWorkspace: (targetWorkspaceId: string) => void;
}) {
  return (
    <ContextMenuContent className="w-56">
      <ContextMenuLabel>Artifact</ContextMenuLabel>
      <ContextMenuItem onSelect={onOpen}>
        <ExternalLinkIcon className="size-4" />
        Buka
      </ContextMenuItem>
      <ContextMenuItem onSelect={onSelect}>
        {isSelected ? <CheckIcon className="size-4" /> : <LinkIcon className="size-4" />}
        {isSelected ? "Hapus dari konteks" : "Tambah ke konteks"}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={onRename}>
        <PenLineIcon className="size-4" />
        Rename
      </ContextMenuItem>
      <MoveToFolderContextSubmenu moveTargets={moveTargets} onMove={onMove} />
      <MoveToWorkspaceContextSubmenu
        workspaces={workspaces}
        onMove={onMoveToWorkspace}
      />
      <ContextMenuItem
        onSelect={() => {
          void copyTextToClipboard(
            new URL(artifactHref, window.location.origin).toString(),
          ).catch(() => {});
        }}
      >
        <LinkIcon className="size-4" />
        Salin link
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem variant="destructive" onSelect={onDelete}>
        <Trash2Icon className="size-4" />
        Delete
      </ContextMenuItem>
    </ContextMenuContent>
  );
}

function MoveToWorkspaceContextSubmenu({
  workspaces,
  onMove,
}: {
  workspaces: WorkspaceMoveTarget[];
  onMove: (targetWorkspaceId: string) => void;
}) {
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>
        <FolderIcon className="size-4" />
        Pindahkan ke workspace
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className="w-56">
        {workspaces.length === 0 ? (
          <ContextMenuItem disabled>Tidak ada workspace lain</ContextMenuItem>
        ) : (
          workspaces.map((workspace) => (
            <ContextMenuItem
              key={workspace._id}
              onSelect={() => onMove(workspace._id)}
            >
              <span className="truncate">{workspace.name}</span>
            </ContextMenuItem>
          ))
        )}
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}

function MoveToFolderContextSubmenu({
  moveTargets,
  onMove,
}: {
  moveTargets: MoveTargetOption[];
  onMove: (target: string) => void;
}) {
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>
        <FolderIcon className="size-4" />
        Pindah ke folder
      </ContextMenuSubTrigger>
      <ContextMenuSubContent>
        {moveTargets.map((target) => (
          <ContextMenuItem key={target.value} onSelect={() => onMove(target.value)}>
            {target.label}
          </ContextMenuItem>
        ))}
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      copyTextWithSelection(text);
      return;
    }
  }

  copyTextWithSelection(text);
}

function copyTextWithSelection(text: string) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-1000px";
  textarea.style.left = "-1000px";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    document.execCommand("copy");
  } finally {
    textarea.remove();
  }
}
