"use client";

import { api } from "@aqsha/convex/api";
import { FolderIcon } from "@aqsha/ui/icons";
import { useState } from "react";
import { useConvexMutationState } from "@/lib/convex-query";
import { cn } from "@/lib/utils";
import { saveUrlToWorkspace } from "../lib/save-to-workspace";
import { WorkspacePickerPopover } from "./workspace-picker-popover";

/**
 * The single, app-wide Save-to-Workspace control (Isu 8). Bundles the canonical
 * `FolderIcon`, the workspace picker popover, the `artifacts.createUrl`
 * ingestion call, and success/error toasts so every standalone save surface
 * (paper/news/fact readers) stays consistent. The discovery feed wires the same
 * `WorkspacePickerPopover` directly into its cards, reusing this same icon + copy.
 *
 * `onSaved` lets the caller record a positive interest signal (the +1 bump the
 * old bookmark provided) — it fires only after a successful save.
 */
export function SaveToWorkspaceButton({
  url,
  title,
  onSaved,
  label = "Simpan ke workspace",
  savedLabel = "Tersimpan",
  className,
  iconClassName = "size-4",
  popoverTitle = "Simpan ke workspace",
  popoverDescription = "Pilih workspace tujuan. Tautan akan otomatis diunduh dan metadatanya diekstrak.",
}: {
  url: string;
  title: string;
  onSaved?: () => void;
  label?: string;
  savedLabel?: string;
  className?: string;
  iconClassName?: string;
  popoverTitle?: string;
  popoverDescription?: string;
}) {
  const createUrl = useConvexMutationState(api.artifacts.createUrl);
  const [saved, setSaved] = useState(false);

  const handleSelect = async (workspaceId: string) => {
    // Re-throws on failure (the helper toasts) so the picker stays open.
    await saveUrlToWorkspace(createUrl.mutateAsync, { workspaceId, url, title });
    setSaved(true);
    onSaved?.();
  };

  return (
    <WorkspacePickerPopover
      title={popoverTitle}
      description={popoverDescription}
      onSelect={handleSelect}
      trigger={
        <button
          type="button"
          disabled={!url || saved}
          className={cn(
            "inline-flex items-center gap-1.5 disabled:opacity-60",
            className,
          )}
        >
          <FolderIcon className={iconClassName} />
          {saved ? savedLabel : label}
        </button>
      }
    />
  );
}
