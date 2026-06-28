"use client";

import { ArrowDownAZIcon, FilterIcon, SearchIcon } from "@aqsha/ui/icons";
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

export function WorkspaceLibraryControls({
  query,
  selectedTypes,
  sort,
  className,
  showSort = true,
  onQueryChange,
  onToggleType,
  onSortChange,
}: {
  query: string;
  selectedTypes: WorkspaceArtifactType[];
  sort: WorkspaceArtifactSort;
  className?: string;
  // Linimasa Artifact selalu urut per-tanggal, jadi kontrol sort disembunyikan di sana.
  showSort?: boolean;
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

  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-1.5", className)}>
      <InputGroup className="h-8 w-[180px] min-w-0 border-border/70 bg-muted/20 shadow-none transition-[border-color,box-shadow,background-color] duration-150 ease-out focus-within:border-ring focus-within:bg-background sm:w-[220px] xl:w-[240px]">
        <InputGroupAddon>
          <SearchIcon className="size-3.5" />
        </InputGroupAddon>
        <InputGroupInput
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Cari dokumen…"
          className="h-8 text-[12px]"
          aria-label="Cari dokumen"
        />
      </InputGroup>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className={cn(
              "size-8 border-border/70 bg-muted/20 text-muted-foreground shadow-none transition-transform duration-150 ease-out hover:text-foreground active:scale-[0.97]",
              hasActiveTypeFilter && "border-primary/45 bg-primary/10 text-primary hover:text-primary",
            )}
            aria-label={
              hasActiveTypeFilter
                ? `Filter tipe dokumen aktif: ${selectedTypeCount}`
                : "Filter tipe dokumen"
            }
          >
            <FilterIcon className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
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

      {showSort ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className={cn(
                "size-8 border-border/70 bg-muted/20 text-muted-foreground shadow-none transition-transform duration-150 ease-out hover:text-foreground active:scale-[0.97]",
                hasActiveSort && "border-primary/45 bg-primary/10 text-primary hover:text-primary",
              )}
              aria-label={`Urutkan dokumen: ${activeSortLabel}`}
            >
              <ArrowDownAZIcon className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
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
      ) : null}
    </div>
  );
}
