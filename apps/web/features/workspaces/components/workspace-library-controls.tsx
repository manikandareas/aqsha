"use client";

import { useState } from "react";
import { ArrowDownAZIcon, FilterIcon, SearchIcon, XIcon } from "@aqsha/ui/icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { cn } from "@/lib/utils";
import type {
  WorkspaceArtifactSort,
  WorkspaceArtifactType,
} from "../utils/workspace-library-model";

const workspaceArtifactTypeOptions = [
  { value: "pdf", label: "PDF" },
  { value: "plain_text", label: "TXT" },
  { value: "docx", label: "DOCX" },
  { value: "mermaid", label: "Diagram" },
  { value: "svg", label: "SVG" },
  { value: "markdown", label: "Markdown" },
  { value: "url", label: "URL" },
  { value: "csv", label: "CSV" },
  { value: "json", label: "JSON" },
  { value: "code", label: "Code" },
  { value: "html", label: "HTML" },
] as const satisfies Array<{ value: WorkspaceArtifactType; label: string }>;

const workspaceArtifactSortOptions = [
  { value: "updated-desc", label: "Terbaru" },
  { value: "updated-asc", label: "Terlama" },
  { value: "created-desc", label: "Baru dibuat" },
  { value: "created-asc", label: "Paling lama dibuat" },
  { value: "title-asc", label: "Judul A-Z" },
  { value: "title-desc", label: "Judul Z-A" },
] as const satisfies Array<{ value: WorkspaceArtifactSort; label: string }>;

// Shared ghost icon-button shell for the compact toolbar controls. Active state is
// carried by a primary tint (no heavy border), keeping the header row light.
const controlButtonClass =
  "size-7 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground";
const controlButtonActiveClass = "bg-primary/10 text-primary hover:text-primary";

export function WorkspaceLibraryControls({
  query,
  selectedTypes,
  sort,
  onQueryChange,
  onToggleType,
  onSortChange,
}: {
  query: string;
  selectedTypes: WorkspaceArtifactType[];
  sort: WorkspaceArtifactSort;
  onQueryChange: (query: string) => void;
  onToggleType: (type: WorkspaceArtifactType) => void;
  onSortChange: (sort: WorkspaceArtifactSort) => void;
}) {
  const selectedTypeSet = new Set(selectedTypes);
  const selectedTypeCount = selectedTypes.length;
  const activeSortLabel =
    workspaceArtifactSortOptions.find((option) => option.value === sort)?.label ?? "Terbaru";
  const hasActiveTypeFilter = selectedTypeCount > 0;
  const hasActiveSort = sort !== "updated-desc";
  const hasQuery = query.trim().length > 0;

  // Search collapses to a lone ghost icon; clicking it expands an inline field in
  // place. It re-collapses on Escape (clears) or on blur when empty — a lingering
  // query keeps a dot on the icon so the active filter stays visible even collapsed.
  const [searchExpanded, setSearchExpanded] = useState(false);

  const collapseSearch = () => setSearchExpanded(false);

  return (
    <div className="flex min-w-0 items-center gap-1">
      {searchExpanded ? (
        <InputGroup className="h-7 w-[168px] min-w-0 max-w-[55vw] rounded-full border-border/70 bg-muted/20 shadow-none transition-colors focus-within:border-ring focus-within:bg-background sm:w-[200px] sm:max-w-none">
          <InputGroupAddon>
            <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" />
          </InputGroupAddon>
          <InputGroupInput
            autoFocus
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                onQueryChange("");
                collapseSearch();
              }
            }}
            onBlur={() => {
              if (!hasQuery) collapseSearch();
            }}
            placeholder="Cari dokumen…"
            className="h-7 min-w-0 text-[12px]"
            aria-label="Cari dokumen"
          />
          <InputGroupAddon align="inline-end">
            <button
              type="button"
              onClick={() => {
                onQueryChange("");
                collapseSearch();
              }}
              aria-label="Bersihkan pencarian"
              className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
            >
              <XIcon className="size-3" />
            </button>
          </InputGroupAddon>
        </InputGroup>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => setSearchExpanded(true)}
          className={cn("relative", controlButtonClass, hasQuery && controlButtonActiveClass)}
          aria-label={hasQuery ? `Pencarian aktif: ${query.trim()}` : "Cari dokumen"}
        >
          <SearchIcon className="size-3.5" />
          {hasQuery ? (
            <span
              aria-hidden
              className="absolute right-1 top-1 size-1.5 rounded-full bg-primary"
            />
          ) : null}
        </Button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={cn(controlButtonClass, hasActiveTypeFilter && controlButtonActiveClass)}
            aria-label={
              hasActiveTypeFilter
                ? `Filter tipe dokumen aktif: ${selectedTypeCount}`
                : "Filter tipe dokumen"
            }
          >
            <FilterIcon className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Tipe dokumen</DropdownMenuLabel>
            {workspaceArtifactTypeOptions.map((option) => (
              <DropdownMenuCheckboxItem
                key={option.value}
                checked={selectedTypeSet.has(option.value)}
                onCheckedChange={() => onToggleType(option.value)}
              >
                {option.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={cn(controlButtonClass, hasActiveSort && controlButtonActiveClass)}
            aria-label={`Urutkan dokumen: ${activeSortLabel}`}
          >
            <ArrowDownAZIcon className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>Urutkan</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={sort}
            onValueChange={(value) => onSortChange(value as WorkspaceArtifactSort)}
          >
            {workspaceArtifactSortOptions.map((option) => (
              <DropdownMenuRadioItem key={option.value} value={option.value}>
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
