"use client";

import { DownloadIcon } from "@aqsha/ui/icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useExportCitations } from "../api";

/** Export seluruh library workspace ke BibTeX / RIS / CSL-JSON (unduh file). */
export function CitationExportMenu({
  workspaceId,
  disabled,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const exportCitations = useExportCitations(workspaceId);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Export referensi"
          disabled={disabled || exportCitations.isPending}
        >
          <DownloadIcon className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => exportCitations.mutate({ format: "bibtex" })}>
          BibTeX (.bib)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => exportCitations.mutate({ format: "ris" })}>
          RIS (.ris)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => exportCitations.mutate({ format: "csl-json" })}>
          CSL-JSON (.json)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
