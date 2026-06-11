"use client";

import {
  AlertCircleIcon,
  BracesIcon,
  Code2Icon,
  FileIcon,
  FileTextIcon,
  GitBranchIcon,
  ImageIcon,
  LinkIcon,
  TableIcon,
} from "@aqsha/ui/icons";
import { LibraryCardFrame } from "@/components/library-card-frame";
import { Skeleton } from "@/components/ui/skeleton";

function LibraryArtifactCardComponent({
  title,
  artifactType,
  source,
  createdAt,
  isSelected,
  isProcessing = false,
  processingFailed = false,
  onClick,
  onDoubleClick,
}: {
  title: string;
  artifactType?: string;
  source?: "manual" | "upload" | "agent" | "url";
  createdAt: number;
  isSelected: boolean;
  isProcessing?: boolean;
  processingFailed?: boolean;
  onClick: () => void;
  onDoubleClick?: () => void;
}) {
  const presentation = getArtifactCardPresentation(artifactType);
  const Icon = presentation.Icon;
  const year = formatYear(createdAt);
  const provenance = provenanceLabel(source);

  const header = (
    <div className="flex items-center gap-2">
      <span className="inline-flex h-7 shrink-0 items-center justify-center rounded-[8px] bg-muted px-2 text-[12px] font-semibold leading-none text-muted-foreground">
        {year}
      </span>
      {provenance ? (
        <span className="inline-flex h-7 shrink-0 items-center justify-center rounded-[8px] border border-border px-2 text-[11px] font-medium leading-none text-muted-foreground">
          {provenance}
        </span>
      ) : null}
    </div>
  );

  if (isProcessing && processingFailed) {
    return (
      <LibraryCardFrame selected={false}>
        <div
          aria-label={`${title}. Gagal memproses.`}
          className="flex size-full min-h-0 cursor-default flex-col p-5 text-left opacity-80"
        >
          {header}
          <h3 className="mt-5 line-clamp-7 text-[20px] font-semibold leading-[1.22] text-muted-foreground">
            {title}
          </h3>
          <div className="mt-auto flex items-center gap-1.5 pt-8 text-destructive">
            <AlertCircleIcon className="size-3.5" />
            <span className="text-[12px] font-semibold leading-none">
              Gagal memproses
            </span>
          </div>
        </div>
      </LibraryCardFrame>
    );
  }

  if (isProcessing) {
    return (
      <LibraryCardFrame selected={false}>
        <div
          aria-busy
          aria-label={`${title}. Sedang diproses…`}
          className="flex size-full min-h-0 cursor-default flex-col p-5"
        >
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-12 rounded-[8px]" />
            <Skeleton className="h-7 w-16 rounded-[8px]" />
          </div>
          <div className="mt-5 space-y-2.5">
            <Skeleton className="h-4 w-[85%]" />
            <Skeleton className="h-4 w-[68%]" />
            <Skeleton className="h-4 w-[52%]" />
          </div>
          <div className="mt-auto flex items-center gap-2 pt-8">
            <Skeleton className="size-3.5 rounded-[4px]" />
            <Skeleton className="h-3 w-16 rounded-md" />
          </div>
        </div>
      </LibraryCardFrame>
    );
  }

  return (
    <LibraryCardFrame selected={isSelected}>
      <button
        type="button"
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        aria-pressed={isSelected}
        aria-label={`${title}. Klik untuk ${isSelected ? "hapus dari" : "tambah ke"} konteks.`}
        className="flex size-full min-h-0 flex-col p-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {header}
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
    </LibraryCardFrame>
  );
}

export const LibraryArtifactCard = LibraryArtifactCardComponent;

function formatYear(timestamp: number) {
  const year = new Date(timestamp).getFullYear();
  return Number.isFinite(year) ? String(year) : "----";
}

// Provenance marker only for outputs, where origin is otherwise ambiguous.
// Sources (upload/url) are already conveyed by the type label (PDF/URL/...).
function provenanceLabel(source?: "manual" | "upload" | "agent" | "url") {
  if (source === "agent") return "Agent";
  if (source === "manual") return "Catatan";
  return null;
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
