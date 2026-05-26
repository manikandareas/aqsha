"use client";

import { api } from "@aqsha/convex/api";
import { useQuery } from "convex/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function WorkspacePickerDialog({
  open,
  onOpenChange,
  onSelect,
  title = "Simpan ke workspace",
  description = "Pilih workspace tujuan untuk menyimpan dokumen ini.",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (workspaceId: string) => void | Promise<void>;
  title?: string;
  description?: string;
}) {
  const workspacePage = useQuery(api.workspaces.list, {
    paginationOpts: { cursor: null, numItems: 50 },
  });
  const workspaces = workspacePage?.page ?? [];
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSave = async () => {
    if (!selectedWorkspaceId) {
      return;
    }
    setIsSubmitting(true);
    try {
      await onSelect(selectedWorkspaceId);
      onOpenChange(false);
      setSelectedWorkspaceId(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid max-h-64 gap-2 overflow-y-auto py-1">
          {workspaces.map((workspace) => (
            <button
              key={workspace._id}
              type="button"
              onClick={() => setSelectedWorkspaceId(workspace._id)}
              className={cn(
                "rounded-[10px] border px-3 py-2.5 text-left text-[13px] font-semibold transition-colors",
                selectedWorkspaceId === workspace._id
                  ? "border-mint-soft-border bg-mint-soft text-mint-foreground"
                  : "border-border/80 bg-card text-foreground hover:bg-muted/35",
              )}
            >
              {workspace.name}
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button
            type="button"
            disabled={!selectedWorkspaceId || isSubmitting}
            onClick={() => void handleSave()}
          >
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
