"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@aqsha/ui/components/button";
import { FolderIcon } from "@aqsha/ui/icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WorkspacePicker } from "@/features/workspaces/components/workspace-picker";
import { useSaveUrl } from "../api";

type ButtonVariant = "default" | "outline" | "ghost" | "secondary" | "destructive";
type ButtonSize = "default" | "sm" | "icon";

/**
 * Tombol Save-to-Workspace reusable (createUrl). Pilih workspace via picker → saveUrl.
 * Dipakai reader explore (P4) + mana pun yang punya URL+judul untuk disimpan.
 */
export function SaveToWorkspaceButton({
  url,
  title,
  label = "Simpan",
  variant = "outline",
  size = "sm",
  className,
}: {
  url: string;
  title?: string;
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  const save = useSaveUrl();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={() => setOpen(true)}>
        <FolderIcon />
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Simpan ke workspace</DialogTitle>
            <DialogDescription>Pilih workspace untuk menyimpan tautan ini.</DialogDescription>
          </DialogHeader>
          <WorkspacePicker
            disabled={save.isPending}
            onSelect={(workspaceId) =>
              save.mutate(
                { workspaceId, url, title },
                {
                  onSuccess: () => {
                    toast.success("Disimpan ke workspace");
                    setOpen(false);
                  },
                },
              )
            }
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
