"use client";

import { Button } from "@aqsha/ui/components/button";
import { CheckIcon, FileTextIcon, FolderIcon } from "@aqsha/ui/icons";
import { useState } from "react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLinkArtifactToWorkspace } from "@/features/artifacts/api";
import { WorkspacePicker } from "@/features/workspaces/components/workspace-picker";
import type { ArtifactCardModel } from "../lib/timeline-types";

/**
 * Kartu dokumen yang dibuat agen (Slice 6.5) — `propose_artifact` sukses. Artifact
 * BORN-HEADLESS (`workspaceId=null`): tawarkan Save-to-workspace (FolderIcon → picker →
 * `linkToWorkspace` api). Setelah tersimpan → badge "Tersimpan". Tanpa navigasi reader:
 * artifact headless belum punya rute workspace; deep-link menyusul saat ter-file.
 */
export function ChatArtifactCard({ model }: { model: ArtifactCardModel }) {
  const link = useLinkArtifactToWorkspace();
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  return (
    <div className="flex w-full min-w-0 items-start gap-2 rounded-[10px] border border-border/80 bg-card/40 px-3 py-2.5 text-left text-[13px] leading-5">
      <FileTextIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 break-words font-medium text-foreground">{model.title}</span>
        <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
          Dibuat · Dokumen
        </span>
      </span>
      {saved ? (
        <span className="inline-flex shrink-0 items-center gap-1 self-center px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
          <CheckIcon className="size-3.5" />
          Tersimpan
        </span>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 shrink-0 self-center"
              aria-label="Simpan ke workspace"
            >
              <FolderIcon className="size-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-2">
            <p className="px-1 pb-1.5 text-[12px] font-medium text-foreground">Simpan ke workspace</p>
            <WorkspacePicker
              disabled={link.isPending}
              onSelect={(workspaceId) =>
                link.mutate(
                  { id: model.artifactId, workspaceId },
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
    </div>
  );
}
