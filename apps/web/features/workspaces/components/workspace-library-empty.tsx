"use client";

import { FileTextIcon, FolderIcon, LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function WorkspaceLibraryEmpty({
  variant,
  title,
  description,
  showActions = true,
  onCreateFolder,
  onCreateDocument,
  onCreateUrl,
}: {
  variant: "root" | "folder";
  title?: string;
  description?: string;
  showActions?: boolean;
  onCreateFolder?: () => void;
  onCreateDocument?: () => void;
  onCreateUrl?: () => void;
}) {
  const isRoot = variant === "root";
  const resolvedTitle = title ?? (isRoot ? "Library kosong" : "Folder ini kosong");
  const resolvedDescription =
    description ??
    (isRoot
      ? "Buat folder, dokumen, atau simpan URL untuk mulai."
      : "Tambahkan dokumen atau URL ke folder ini.");

  return (
    <div className="grid min-h-[32svh] place-items-center rounded-xl border border-dashed border-border bg-muted/20 p-12 text-center sm:min-h-[36svh]">
      <div className="grid max-w-sm gap-5">
        <FileTextIcon className="mx-auto size-8 text-muted-foreground" />
        <h2 className="font-heading text-xl font-semibold">{resolvedTitle}</h2>
        <p className="text-[13px] font-medium text-muted-foreground">{resolvedDescription}</p>
        {showActions ? (
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            {isRoot && onCreateFolder ? (
              <Button type="button" variant="outline" size="sm" onClick={onCreateFolder}>
                <FolderIcon className="size-4" />
                Folder
              </Button>
            ) : null}
            {onCreateDocument ? (
              <Button type="button" size="sm" onClick={onCreateDocument}>
                <FileTextIcon className="size-4" />
                Dokumen
              </Button>
            ) : null}
            {onCreateUrl ? (
              <Button type="button" variant="outline" size="sm" onClick={onCreateUrl}>
                <LinkIcon className="size-4" />
                URL
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
