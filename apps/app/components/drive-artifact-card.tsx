"use client";

import {
  BracesIcon,
  Code2Icon,
  FileIcon,
  FileTextIcon,
  GitBranchIcon,
  ImageIcon,
  LinkIcon,
  TableIcon,
} from "lucide-react";
import { memo, useMemo } from "react";
import { cn } from "@/lib/utils";

function DriveArtifactCardComponent({
  title,
  artifactType,
  plainTextPreview,
  isSelected,
  onClick,
  onDoubleClick,
}: {
  title: string;
  artifactType?: string;
  plainTextPreview?: string;
  isSelected: boolean;
  onClick: () => void;
  onDoubleClick?: () => void;
}) {
  const preview = useMemo(
    () => formatArtifactPreview(plainTextPreview),
    [plainTextPreview],
  );
  const presentation = getArtifactCardPresentation(artifactType);
  const Icon = presentation.Icon;

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
            presentation.surfaceClass,
          )}
        >
          <div className="flex flex-1 flex-col px-4 pt-4 pb-2">
            <div className="mb-2 flex items-center gap-1.5">
              <span className="inline-flex size-6 items-center justify-center rounded-[7px] border border-background/50 bg-background/50">
                <Icon className={cn("size-3.5", presentation.iconClass)} />
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {presentation.label}
              </span>
            </div>
            <p
              className={cn(
                "line-clamp-6 flex-1 text-[12px] leading-[1.55] text-foreground/85",
                !preview && "text-muted-foreground italic",
              )}
            >
              {preview ?? presentation.emptyLabel}
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

function getArtifactCardPresentation(artifactType: string | undefined) {
  switch (artifactType) {
    case "url":
      return {
        Icon: LinkIcon,
        label: "URL",
        emptyLabel: "Tautan tersimpan",
        surfaceClass: "bg-sky-soft",
        iconClass: "text-sky-foreground",
      };
    case "pdf":
      return {
        Icon: FileTextIcon,
        label: "PDF",
        emptyLabel: "PDF tersimpan",
        surfaceClass: "bg-lavender-soft",
        iconClass: "text-lavender-foreground",
      };
    case "docx":
      return {
        Icon: FileIcon,
        label: "DOCX",
        emptyLabel: "Dokumen Word tersimpan",
        surfaceClass: "bg-mint-soft",
        iconClass: "text-mint-foreground",
      };
    case "html":
      return {
        Icon: Code2Icon,
        label: "HTML",
        emptyLabel: "HTML artifact",
        surfaceClass: "bg-lemon-soft",
        iconClass: "text-lemon-foreground",
      };
    case "svg":
      return {
        Icon: ImageIcon,
        label: "SVG",
        emptyLabel: "SVG artifact",
        surfaceClass: "bg-lavender-soft",
        iconClass: "text-lavender-foreground",
      };
    case "mermaid":
      return {
        Icon: GitBranchIcon,
        label: "Mermaid",
        emptyLabel: "Diagram Mermaid",
        surfaceClass: "bg-sky-soft",
        iconClass: "text-sky-foreground",
      };
    case "json":
      return {
        Icon: BracesIcon,
        label: "JSON",
        emptyLabel: "JSON artifact",
        surfaceClass: "bg-muted/45",
        iconClass: "text-muted-foreground",
      };
    case "csv":
      return {
        Icon: TableIcon,
        label: "CSV",
        emptyLabel: "CSV artifact",
        surfaceClass: "bg-muted/45",
        iconClass: "text-muted-foreground",
      };
    case "code":
      return {
        Icon: Code2Icon,
        label: "Code",
        emptyLabel: "Code artifact",
        surfaceClass: "bg-muted/45",
        iconClass: "text-muted-foreground",
      };
    case "plain_text":
      return {
        Icon: FileTextIcon,
        label: "Text",
        emptyLabel: "Plain text artifact",
        surfaceClass: "bg-mint-soft",
        iconClass: "text-mint-foreground",
      };
    default:
      return {
        Icon: FileTextIcon,
        label: "Markdown",
        emptyLabel: "Dokumen riset",
        surfaceClass: "bg-mint-soft",
        iconClass: "text-mint-foreground",
      };
  }
}
