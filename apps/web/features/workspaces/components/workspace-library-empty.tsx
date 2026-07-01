"use client";

import { FileTextIcon, FolderIcon, UploadIcon } from "@aqsha/ui/icons";
import { Button } from "@/components/ui/button";

// Centered empty-state for the Pustaka / Artifact tabs: a category pill (icon +
// context label) on top, a short message, a hairline connector, then the create
// actions stacked below. Vertically + horizontally centered inside the tab body.
export function WorkspaceLibraryEmpty({
  variant,
  badgeLabel,
  badgeEmoji,
  title,
  description,
  icon: Icon = FileTextIcon,
  showActions = true,
  onCreateFolder,
  onCreateDocument,
  onCreateUrl,
}: {
  variant: "root" | "folder";
  badgeLabel?: string;
  badgeEmoji?: string;
  title?: string;
  description?: string;
  icon?: typeof FileTextIcon;
  showActions?: boolean;
  onCreateFolder?: () => void;
  onCreateDocument?: () => void;
  onCreateUrl?: () => void;
}) {
  const isRoot = variant === "root";
  const resolvedBadge = badgeLabel ?? (isRoot ? "Pustaka" : "Folder");
  const resolvedTitle =
    title ??
    (isRoot ? "Kumpulkan paper-mu di sini" : "Folder ini masih kosong");
  const resolvedDescription =
    description ??
    (isRoot
      ? "Simpan dokumen, file, atau URL untuk mulai membangun perpustakaan risetmu."
      : "Tambahkan dokumen atau URL ke folder ini.");

  const showDocument = showActions && Boolean(onCreateDocument);
  const showUpload = showActions && Boolean(onCreateUrl);
  const showFolder = showActions && isRoot && Boolean(onCreateFolder);
  const hasActions = showDocument || showUpload || showFolder;

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-6 py-12 text-center">
      {/* Category pill — echoes the active context. When the workspace has an
          emoji it renders bare (no tinted chip); otherwise a lavender-tinted
          icon chip stands in for the reference's colour dot. */}
      <div className="inline-flex items-center gap-2.5 rounded-full border border-border/70 bg-background/70 py-2 pl-3.5 pr-5 shadow-[0_1px_2px_rgb(0_0_0/0.04)] backdrop-blur-sm">
        {badgeEmoji ? (
          <span className="text-xl leading-none">{badgeEmoji}</span>
        ) : (
          <span className="grid size-7 place-items-center rounded-full bg-lavender-soft text-lavender-foreground ring-1 ring-inset ring-lavender-soft-border">
            <Icon className="size-4" />
          </span>
        )}
        <span className="font-heading text-base font-semibold text-foreground">
          {resolvedBadge}
        </span>
      </div>

      <div className="mt-5 grid max-w-[17rem] gap-1.5">
        <p className="text-[15px] font-semibold text-foreground">
          {resolvedTitle}
        </p>
        <p className="text-[13px] font-medium leading-relaxed text-muted-foreground">
          {resolvedDescription}
        </p>
      </div>

      {hasActions ? (
        <>
          {/* Hairline connector linking the message to the actions below. */}
          <div
            aria-hidden
            className="my-6 h-14 w-px bg-gradient-to-b from-transparent via-border to-transparent"
          />
          <div className="flex flex-col items-center gap-2">
            {showDocument ? (
              <Button
                type="button"
                className="rounded-full px-4"
                onClick={onCreateDocument}
              >
                <FileTextIcon className="size-4" />
                Dokumen
              </Button>
            ) : null}
            {showUpload ? (
              <Button
                type="button"
                variant="secondary"
                className="rounded-full px-4"
                onClick={onCreateUrl}
              >
                <UploadIcon className="size-4" />
                Upload
              </Button>
            ) : null}
            {showFolder ? (
              <Button
                type="button"
                variant="secondary"
                className="rounded-full px-4"
                onClick={onCreateFolder}
              >
                <FolderIcon className="size-4" />
                Folder
              </Button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
