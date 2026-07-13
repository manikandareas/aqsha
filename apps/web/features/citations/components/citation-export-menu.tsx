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

/**
 * Export library ke BibTeX / RIS / CSL-JSON (unduh file). Tanpa `ids` = seluruh
 * workspace (toolbar); dengan `ids` = hanya yang terpilih (bulk bar seleksi).
 */
export function CitationExportMenu({
  workspaceId,
  disabled,
  ids,
}: {
  workspaceId: string;
  disabled?: boolean;
  ids?: string[];
}) {
  const exportCitations = useExportCitations(workspaceId);
  const scoped = ids?.length ? { ids } : {};
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={ids ? "Export referensi terpilih" : "Export referensi"}
          disabled={disabled || exportCitations.isPending}
        >
          <DownloadIcon className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => exportCitations.mutate({ format: "bibtex", ...scoped })}>
          BibTeX (.bib)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => exportCitations.mutate({ format: "ris", ...scoped })}>
          RIS (.ris)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => exportCitations.mutate({ format: "csl-json", ...scoped })}>
          CSL-JSON (.json)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
