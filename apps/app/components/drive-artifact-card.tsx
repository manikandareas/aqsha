"use client";

import { memo, useMemo } from "react";
import { cn } from "@/lib/utils";

function DriveArtifactCardComponent({
  title,
  kind,
  plainTextPreview,
  isSelected,
  onClick,
  onDoubleClick,
}: {
  title: string;
  kind?: "document" | "url";
  plainTextPreview?: string;
  isSelected: boolean;
  onClick: () => void;
  onDoubleClick?: () => void;
}) {
  const preview = useMemo(
    () => formatArtifactPreview(plainTextPreview),
    [plainTextPreview],
  );
  const previewBg = kind === "url" ? "bg-sky-soft" : "bg-mint-soft";
  const previewLabel = kind === "url" ? "Tautan tersimpan" : "Dokumen riset";

  return (
    <div
      className={cn(
        "group relative flex min-h-[220px] flex-col overflow-hidden rounded-xl border bg-card shadow-aqsha transition-shadow hover:shadow-[var(--shadow-soft-card)]",
        isSelected ? "border-primary/50 ring-2 ring-primary/25" : "border-border",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        aria-pressed={isSelected}
        aria-label={`${title}. Klik untuk ${isSelected ? "hapus dari" : "tambah ke"} konteks.`}
        className="flex min-h-0 flex-1 flex-col text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <div
          className={cn(
            "relative flex min-h-[148px] flex-1 flex-col overflow-hidden dark:bg-muted/30",
            previewBg,
          )}
        >
          <div className="flex flex-1 flex-col px-4 pt-4 pb-2">
            <p
              className={cn(
                "line-clamp-6 flex-1 text-[12px] leading-[1.55] text-foreground/85",
                !preview && "text-muted-foreground italic",
              )}
            >
              {preview ?? previewLabel}
            </p>
          </div>
          <div className="shrink-0 px-4 pb-3">
            <span className="line-clamp-2 text-[13px] font-semibold leading-snug text-foreground">
              {title}
            </span>
          </div>
        </div>
      </button>
    </div>
  );
}

export const DriveArtifactCard = memo(DriveArtifactCardComponent);

function formatArtifactPreview(raw: string | undefined) {
  const text = raw?.trim();
  if (!text) return undefined;
  return text
    .replace(/^#+\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
