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
import { memo } from "react";
import { cn } from "@/lib/utils";

function LibraryArtifactCardComponent({
  title,
  artifactType,
  createdAt,
  isSelected,
  onClick,
  onDoubleClick,
}: {
  title: string;
  artifactType?: string;
  createdAt: number;
  isSelected: boolean;
  onClick: () => void;
  onDoubleClick?: () => void;
}) {
  const presentation = getArtifactCardPresentation(artifactType);
  const Icon = presentation.Icon;
  const year = formatYear(createdAt);

  return (
    <div
      className={cn(
        "group relative flex aspect-[8/9] min-h-[300px] flex-col overflow-hidden rounded-[20px] border bg-card shadow-aqsha transition-[border-color,box-shadow,transform] duration-150 ease-out hover:-translate-y-0.5 hover:shadow-[var(--shadow-soft-card)]",
        isSelected ? "border-primary/50 ring-2 ring-primary/25" : "border-border",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        aria-pressed={isSelected}
        aria-label={`${title}. Klik untuk ${isSelected ? "hapus dari" : "tambah ke"} konteks.`}
        className="flex min-h-0 flex-1 flex-col px-5 py-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <div className="flex items-center">
          <span className="inline-flex h-7 shrink-0 items-center justify-center rounded-[8px] bg-muted px-2 text-[12px] font-semibold leading-none text-muted-foreground">
            {year}
          </span>
        </div>
        <h3 className="mt-5 line-clamp-7 text-[20px] font-semibold leading-[1.22] text-foreground">
          {title}
        </h3>
        <div className="mt-auto flex items-center gap-1.5 pt-8 text-muted-foreground">
          <span className="relative inline-flex size-4 shrink-0 items-end justify-end">
            <span className="absolute left-0 top-0.5 size-3 rotate-[-14deg] rounded-[4px] bg-muted-foreground/45" />
            <span className="relative size-3.5 rounded-[4px] border border-card bg-muted-foreground/70" />
          </span>
          <span className="text-[12px] font-semibold leading-none">{presentation.label}</span>
          <Icon className="ml-auto size-3.5 text-muted-foreground" />
        </div>
      </button>
    </div>
  );
}

export const LibraryArtifactCard = memo(LibraryArtifactCardComponent);

function formatYear(timestamp: number) {
  const year = new Date(timestamp).getFullYear();
  return Number.isFinite(year) ? String(year) : "----";
}

function getArtifactCardPresentation(artifactType: string | undefined) {
  switch (artifactType) {
    case "url":
      return {
        Icon: LinkIcon,
        label: "URL",
      };
    case "pdf":
      return {
        Icon: FileTextIcon,
        label: "PDF",
      };
    case "docx":
      return {
        Icon: FileIcon,
        label: "DOCX",
      };
    case "html":
      return {
        Icon: Code2Icon,
        label: "HTML",
      };
    case "svg":
      return {
        Icon: ImageIcon,
        label: "SVG",
      };
    case "mermaid":
      return {
        Icon: GitBranchIcon,
        label: "Mermaid",
      };
    case "json":
      return {
        Icon: BracesIcon,
        label: "JSON",
      };
    case "csv":
      return {
        Icon: TableIcon,
        label: "CSV",
      };
    case "code":
      return {
        Icon: Code2Icon,
        label: "Code",
      };
    case "plain_text":
      return {
        Icon: FileTextIcon,
        label: "Text",
      };
    default:
      return {
        Icon: FileTextIcon,
        label: "Markdown",
      };
  }
}
