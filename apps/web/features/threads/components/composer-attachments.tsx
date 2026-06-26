"use client";

import { Button } from "@aqsha/ui/components/button";
import {
  CheckIcon,
  FileTextIcon,
  FolderIcon,
  Loader2Icon,
  PaperclipIcon,
  XIcon,
} from "@aqsha/ui/icons";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLinkArtifactToWorkspace } from "@/features/artifacts/api";
import { UPLOAD_ACCEPT } from "@/features/artifacts/types";
import { WorkspacePicker } from "@/features/workspaces/components/workspace-picker";
import { useThreadAttachments } from "../api";

/** Lampiran yang sudah ter-finalize pada thread (Slice 6.7). */
export type ComposerAttachment = { artifactId: string; title: string };

/** Satu chip lampiran — promote ke workspace (FolderIcon → picker → linkToWorkspace 6.5) + hapus. */
function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: ComposerAttachment;
  onRemove: () => void;
}) {
  const link = useLinkArtifactToWorkspace();
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  return (
    <span className="inline-flex max-w-[14rem] items-center gap-1 rounded-md border bg-muted/40 py-1 pr-1 pl-2 text-[12px]">
      <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{attachment.title}</span>
      {saved ? (
        <CheckIcon className="size-3.5 shrink-0 text-muted-foreground" aria-label="Tersimpan" />
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-5 shrink-0"
              aria-label="Simpan ke workspace"
            >
              <FolderIcon className="size-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-2">
            <p className="px-1 pb-1.5 font-medium text-[12px] text-foreground">Simpan ke workspace</p>
            <WorkspacePicker
              disabled={link.isPending}
              onSelect={(workspaceId) =>
                link.mutate(
                  { id: attachment.artifactId, workspaceId },
                  {
                    onSuccess: () => {
                      toast.success("Disimpan ke workspace");
                      setSaved(true);
                      setOpen(false);
                    },
                  },
                )
              }
            />
          </PopoverContent>
        </Popover>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-5 shrink-0"
        onClick={onRemove}
        aria-label="Hapus lampiran"
      >
        <XIcon className="size-3.5" />
      </Button>
    </span>
  );
}

/**
 * Lampiran composer (Slice 6.7) — picker file → presign/PUT/finalize (headless,
 * scope thread) → chip. `threadId` null (chat baru sebelum turn pertama) → attach
 * dinonaktifkan: eve mint session id baru saat turn pertama selesai, jadi belum ada
 * thread untuk dilampiri (kirim pesan dulu).
 */
export function ComposerAttachments({
  threadId,
  attachments,
  onAdd,
  onRemove,
  disabled,
}: {
  threadId: string | null;
  attachments: ComposerAttachment[];
  onAdd: (a: ComposerAttachment) => void;
  onRemove: (artifactId: string) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useThreadAttachments(threadId ?? "");
  const canAttach = Boolean(threadId) && !disabled && !upload.isPending;

  async function onPick(file: File | undefined) {
    if (!file || !threadId) return;
    const res = await upload.mutateAsync({ file }).catch(() => null);
    if (res) onAdd({ artifactId: res.artifactId, title: res.title });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-2">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-7 shrink-0"
        disabled={!canAttach}
        onClick={() => inputRef.current?.click()}
        aria-label="Lampirkan berkas"
        title={threadId ? "Lampirkan berkas" : "Kirim pesan dulu untuk melampirkan berkas"}
      >
        {upload.isPending ? (
          <Loader2Icon className="size-4 animate-spin" />
        ) : (
          <PaperclipIcon className="size-4" />
        )}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept={UPLOAD_ACCEPT}
        className="hidden"
        onChange={(e) => {
          void onPick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {attachments.map((a) => (
        <AttachmentChip key={a.artifactId} attachment={a} onRemove={() => onRemove(a.artifactId)} />
      ))}
    </div>
  );
}
