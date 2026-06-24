"use client";

import { type DragEvent, useState } from "react";

/**
 * Shared file-drag dropzone behaviour: highlight on drag, clear on leave/drop,
 * and hand dropped files off. Used by both the workspace board surface and the
 * add-item dialog so the "only react to Files, copy effect, contains-based
 * dragLeave" policy lives in one place instead of being hand-rolled per site.
 */
export function useFileDropzone(onFiles: (files: FileList) => void) {
  const [isDragOver, setIsDragOver] = useState(false);

  const show = (event: DragEvent) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDragOver(true);
  };

  return {
    isDragOver,
    dropzoneProps: {
      onDragEnter: show,
      onDragOver: show,
      onDragLeave: (event: DragEvent) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsDragOver(false);
        }
      },
      onDrop: (event: DragEvent) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        setIsDragOver(false);
        onFiles(event.dataTransfer.files);
      },
    },
  };
}
