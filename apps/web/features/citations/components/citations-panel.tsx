"use client";

import {
  BookmarkIcon,
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  FilterIcon,
  LayersIcon,
  LinkIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PenLineIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  Trash2Icon,
  UploadIcon,
} from "@aqsha/ui/icons";
import { type FormEvent, useMemo, useState } from "react";
import { PanelCardToolbar } from "@/components/layout/side-panel-frame";
import { PanelTitleLabel } from "@/components/panel-title-dropdown-trigger";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { panelBodyPaddingClass } from "@/lib/panel-surface";
import { cn } from "@/lib/utils";
import {
  type CitationListFilters,
  EMPTY_CITATION_FILTERS,
  useBulkDeleteCitations,
  useBulkTagCitations,
  useCitationDetail,
  useCitationsList,
  useCitationTags,
  useCopyCitation,
  useCreateCitation,
  useDeleteCitation,
  useMergeManyCitations,
  useUpdateCitation,
} from "../api";
import {
  CITATION_SOURCE_LABELS,
  CITATION_STATUS_LABELS,
  type CitationListItem,
  citationMetaLine,
} from "../types";
import { CitationDetailView } from "./citation-detail-view";
import { CitationDoiDialog } from "./citation-doi-dialog";
import { CitationDuplicatesDialog } from "./citation-duplicates-dialog";
import { CitationEmptyState } from "./citation-empty-state";
import { CitationFormDialog } from "./citation-form-dialog";
import { CitationImportWizard } from "./citation-import-wizard";
import { CitationSettingsDialog } from "./citation-settings-dialog";
import { CitationExportMenu } from "./citation-export-menu";

/**
 * Konten tab Sitasi pada panel kanan workspace detail. List mode (default) ↔
 * sub-view detail (`citationId` dari mode panel). Search/filter = state lokal
 * React (BUKAN nuqs — jangan bentrok dengan `q` milik board). Responsivitas
 * internal memakai container variants (`@3xl:`) karena kolom panel = @container.
 */
export function CitationsPanel({
  workspaceId,
  citationId,
  onOpenCitation,
  onBackToList,
}: {
  workspaceId: string;
  citationId: string | null;
  onOpenCitation: (citationId: string) => void;
  onBackToList: () => void;
}) {
  if (citationId) {
    return (
      <CitationDetailView
        workspaceId={workspaceId}
        citationId={citationId}
        onBack={onBackToList}
      />
    );
  }
  return (
    <CitationListView workspaceId={workspaceId} onOpenCitation={onOpenCitation} />
  );
}

type DialogKind = "import" | "doi" | "manual" | "settings" | "duplicates" | null;

function CitationListView({
  workspaceId,
  onOpenCitation,
}: {
  workspaceId: string;
  onOpenCitation: (citationId: string) => void;
}) {
  const [filters, setFilters] = useState<CitationListFilters>(EMPTY_CITATION_FILTERS);
  const [searchDraft, setSearchDraft] = useState("");
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [deleteTarget, setDeleteTarget] = useState<CitationListItem | null>(null);
  const [editTargetId, setEditTargetId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const list = useCitationsList(workspaceId, filters);
  const tags = useCitationTags(workspaceId);
  const createCitation = useCreateCitation(workspaceId);
  const deleteCitation = useDeleteCitation(workspaceId);

  const items = useMemo(
    () => (list.data?.pages ?? []).flatMap((page) => page.items),
    [list.data],
  );
  const total = list.data?.pages[0]?.total ?? 0;
  const filtersActive =
    Boolean(filters.q) || filters.status !== null || filters.source !== null || filters.tag !== null;
  const showEmptyState = !list.isLoading && total === 0 && !filtersActive;

  const applySearch = (value: string) => {
    setSearchDraft(value);
    setFilters((prev) => ({ ...prev, q: value.trim() }));
  };

  const exitSelection = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };
  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <PanelCardToolbar
        title={
          <PanelTitleLabel>
            {selectionMode ? `${selectedIds.size} dipilih` : "Sitasi"}
          </PanelTitleLabel>
        }
        eyebrow={!selectionMode && total > 0 ? `· ${total}` : undefined}
        actions={
          selectionMode ? (
            <Button
              type="button"
              variant="ghost"
              className="h-7 shrink-0 rounded-full px-3 text-[12px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={exitSelection}
            >
              Selesai
            </Button>
          ) : (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="Tambah referensi"
                  >
                    <PlusIcon className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setDialog("import")}>
                    <UploadIcon className="size-3.5" />
                    Import file (.bib/.ris)
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setDialog("doi")}>
                    <LinkIcon className="size-3.5" />
                    Dari DOI
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setDialog("manual")}>
                    <PenLineIcon className="size-3.5" />
                    Manual
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <CitationExportMenu workspaceId={workspaceId} disabled={total === 0} />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="Opsi lain"
                  >
                    <MoreHorizontalIcon className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    disabled={total === 0}
                    onSelect={() => setSelectionMode(true)}
                  >
                    <CheckIcon className="size-3.5" />
                    Pilih beberapa
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setDialog("duplicates")}>
                    <LayersIcon className="size-3.5" />
                    Kelola duplikat
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setDialog("settings")}>
                    <SettingsIcon className="size-3.5" />
                    Gaya sitasi & urutan
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )
        }
      />

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {showEmptyState ? (
          <div className={cn("min-h-0 flex-1 overflow-y-auto", panelBodyPaddingClass)}>
            <CitationEmptyState
              onImportFile={() => setDialog("import")}
              onAddByDoi={() => setDialog("doi")}
              onAddManual={() => setDialog("manual")}
            />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 px-5 pb-2 pt-3 @2xl:px-6">
              <div className="relative min-w-0 flex-1">
                <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchDraft}
                  onInput={(event) => applySearch((event.target as HTMLInputElement).value)}
                  placeholder="Cari judul, penulis, DOI…"
                  className="h-8 pl-8 text-[13px]"
                />
              </div>
              <FilterMenu
                filters={filters}
                tags={tags.data ?? []}
                onChange={setFilters}
                active={filtersActive}
              />
            </div>

            <div className={cn("min-h-0 flex-1 overflow-y-auto", panelBodyPaddingClass, "pt-1")}>
              {list.isLoading ? (
                <p className="py-8 text-center text-[13px] font-medium text-muted-foreground">
                  Memuat referensi…
                </p>
              ) : items.length === 0 ? (
                <p className="py-8 text-center text-[13px] font-medium text-muted-foreground">
                  Tidak ada referensi yang cocok dengan filter.
                </p>
              ) : (
                <ul className="grid gap-1">
                  {items.map((item) => (
                    <CitationRow
                      key={item.id}
                      workspaceId={workspaceId}
                      item={item}
                      selectionMode={selectionMode}
                      selected={selectedIds.has(item.id)}
                      onToggleSelect={() => toggleSelect(item.id)}
                      onOpen={() => onOpenCitation(item.id)}
                      onEdit={() => setEditTargetId(item.id)}
                      onDelete={() => setDeleteTarget(item)}
                    />
                  ))}
                </ul>
              )}
              {list.hasNextPage ? (
                <div className="flex justify-center py-3">
                  <Button
                    type="button"
                    variant="secondary"
                    className="rounded-full px-4"
                    disabled={list.isFetchingNextPage}
                    onClick={() => void list.fetchNextPage()}
                  >
                    {list.isFetchingNextPage ? "Memuat…" : "Muat lagi"}
                  </Button>
                </div>
              ) : null}
            </div>
          </>
        )}

        {selectionMode && selectedIds.size > 0 ? (
          <BulkActionBar
            workspaceId={workspaceId}
            ids={[...selectedIds]}
            onDone={exitSelection}
          />
        ) : null}
      </div>

      <CitationImportWizard
        workspaceId={workspaceId}
        open={dialog === "import"}
        onOpenChange={(open) => setDialog(open ? "import" : null)}
        onDone={() => setDialog(null)}
      />
      <CitationDoiDialog
        open={dialog === "doi"}
        onOpenChange={(open) => setDialog(open ? "doi" : null)}
        onSubmit={(value) => createCitation.mutateAsync(value)}
      />
      <CitationFormDialog
        open={dialog === "manual"}
        citation={null}
        onOpenChange={(open) => setDialog(open ? "manual" : null)}
        onSubmit={(value) =>
          createCitation.mutateAsync({ fields: value.fields, tags: value.tags })
        }
      />
      <CitationSettingsDialog
        workspaceId={workspaceId}
        open={dialog === "settings"}
        onOpenChange={(open) => setDialog(open ? "settings" : null)}
      />
      <CitationDuplicatesDialog
        workspaceId={workspaceId}
        open={dialog === "duplicates"}
        onOpenChange={(open) => setDialog(open ? "duplicates" : null)}
      />
      {editTargetId ? (
        <EditCitationDialog
          workspaceId={workspaceId}
          citationId={editTargetId}
          onClose={() => setEditTargetId(null)}
        />
      ) : null}
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Hapus referensi?"
        description={
          deleteTarget
            ? `"${deleteTarget.title}" dihapus dari library workspace ini.`
            : ""
        }
        confirmLabel="Hapus"
        onConfirm={async () => {
          if (!deleteTarget) return;
          await deleteCitation.mutateAsync(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </>
  );
}

/**
 * Bulk bar melayang di bawah list saat mode seleksi. Aksi massal: beri tag,
 * export terpilih, gabungkan (≥2), hapus. Gabung/hapus keluar dari mode seleksi.
 */
function BulkActionBar({
  workspaceId,
  ids,
  onDone,
}: {
  workspaceId: string;
  ids: string[];
  onDone: () => void;
}) {
  const bulkTag = useBulkTagCitations(workspaceId);
  const bulkDelete = useBulkDeleteCitations(workspaceId);
  const mergeMany = useMergeManyCitations(workspaceId);
  const [tagOpen, setTagOpen] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const submitTag = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = tagDraft.trim();
    if (!value) return;
    bulkTag.mutate(
      { ids, tags: [value] },
      {
        onSuccess: () => {
          setTagOpen(false);
          setTagDraft("");
        },
      },
    );
  };

  return (
    <div className="flex items-center gap-1 border-t border-border/70 bg-background/95 px-4 py-2 backdrop-blur @2xl:px-6">
      <span className="mr-auto text-[12px] font-semibold text-muted-foreground">
        {ids.length} dipilih
      </span>
      <Popover open={tagOpen} onOpenChange={setTagOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Beri tag terpilih"
          >
            <BookmarkIcon className="size-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-60">
          <form className="grid gap-2" onSubmit={submitTag}>
            <p className="text-[12px] font-semibold text-foreground">Beri tag</p>
            <Input
              autoFocus
              value={tagDraft}
              onInput={(event) => setTagDraft((event.target as HTMLInputElement).value)}
              placeholder="mis. bab-2"
              className="h-8 text-[13px]"
            />
            <Button
              type="submit"
              variant="secondary"
              className="h-8 rounded-full"
              disabled={!tagDraft.trim() || bulkTag.isPending}
            >
              Tambah tag
            </Button>
          </form>
        </PopoverContent>
      </Popover>
      <CitationExportMenu workspaceId={workspaceId} ids={ids} />
      <Button
        type="button"
        variant="ghost"
        className="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
        aria-label="Gabungkan terpilih"
        disabled={ids.length < 2 || mergeMany.isPending}
        onClick={() => mergeMany.mutate({ ids }, { onSuccess: onDone })}
      >
        <LayersIcon className="size-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="size-7 shrink-0 rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive"
        aria-label="Hapus terpilih"
        onClick={() => setConfirmDelete(true)}
      >
        <Trash2Icon className="size-3.5" />
      </Button>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Hapus referensi terpilih?"
        description={`${ids.length} referensi dihapus dari library workspace ini.`}
        confirmLabel="Hapus"
        onConfirm={async () => {
          await bulkDelete.mutateAsync(ids);
          setConfirmDelete(false);
          onDone();
        }}
      />
    </div>
  );
}

function FilterMenu({
  filters,
  tags,
  onChange,
  active,
}: {
  filters: CitationListFilters;
  tags: string[];
  onChange: (filters: CitationListFilters) => void;
  active: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className={cn(
            "size-8 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground",
            active && "text-primary",
          )}
          aria-label="Filter referensi"
        >
          <FilterIcon className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {(
          [
            { id: "verified", label: "Terverifikasi" },
            { id: "needs_review", label: "Perlu review" },
            { id: "incomplete", label: "Belum lengkap" },
          ] as const
        ).map((status) => (
          <DropdownMenuItem
            key={status.id}
            onSelect={() =>
              onChange({
                ...filters,
                status: filters.status === status.id ? null : status.id,
              })
            }
            className={cn(filters.status === status.id && "text-primary")}
          >
            {status.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        {(
          [
            { id: "import", label: "Sumber: import" },
            { id: "doi", label: "Sumber: DOI" },
            { id: "manual", label: "Sumber: manual" },
          ] as const
        ).map((source) => (
          <DropdownMenuItem
            key={source.id}
            onSelect={() =>
              onChange({
                ...filters,
                source: filters.source === source.id ? null : source.id,
              })
            }
            className={cn(filters.source === source.id && "text-primary")}
          >
            {source.label}
          </DropdownMenuItem>
        ))}
        {tags.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            {tags.slice(0, 12).map((tag) => (
              <DropdownMenuItem
                key={tag}
                onSelect={() =>
                  onChange({ ...filters, tag: filters.tag === tag ? null : tag })
                }
                className={cn(filters.tag === tag && "text-primary")}
              >
                Tag: {tag}
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
        {active ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange(EMPTY_CITATION_FILTERS)}>
              Hapus semua filter
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Baris referensi. Density mengikuti lebar panel: normal = blok dua baris;
 * `@3xl:` (panel expanded 70%) = grid multi-kolom — DOM sama, satu komponen.
 */
function CitationRow({
  workspaceId,
  item,
  selectionMode,
  selected,
  onToggleSelect,
  onOpen,
  onEdit,
  onDelete,
}: {
  workspaceId: string;
  item: CitationListItem;
  selectionMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const copyCitation = useCopyCitation(workspaceId);
  const externalHref = item.doi ? `https://doi.org/${item.doi}` : item.url;

  return (
    <li className="group relative">
      <button
        type="button"
        onClick={selectionMode ? onToggleSelect : onOpen}
        aria-pressed={selectionMode ? selected : undefined}
        className={cn(
          "grid w-full gap-0.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted/50 @3xl:grid-cols-[minmax(0,2.2fr)_minmax(0,1.6fr)_minmax(0,0.5fr)_minmax(0,1fr)] @3xl:items-center @3xl:gap-3",
          selectionMode ? "pr-2.5" : "pr-16",
          selected && "bg-muted/60",
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {selectionMode ? (
            <span
              aria-hidden
              className={cn(
                "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background",
              )}
            >
              {selected ? <CheckIcon className="size-3" /> : null}
            </span>
          ) : (
            <span
              aria-hidden
              title={CITATION_STATUS_LABELS[item.metadataStatus]}
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                item.metadataStatus === "verified"
                  ? "bg-mint"
                  : item.metadataStatus === "needs_review"
                    ? "bg-amber-400"
                    : "bg-destructive/70",
              )}
            />
          )}
          <span className="truncate text-[13px] font-semibold text-foreground [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] @3xl:[-webkit-line-clamp:1]">
            {item.title}
          </span>
        </span>
        <span className="truncate text-[12px] font-medium text-muted-foreground">
          {citationMetaLine(item)}
        </span>
        <span className="hidden truncate text-[11px] font-semibold text-muted-foreground @3xl:block">
          {CITATION_SOURCE_LABELS[item.source]}
        </span>
        <span className="flex min-w-0 flex-wrap gap-1">
          {item.tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="truncate rounded-full bg-lavender-soft px-1.5 py-0.5 text-[10px] font-semibold text-lavender-foreground"
            >
              {tag}
            </span>
          ))}
          {item.tags.length > 2 ? (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
              +{item.tags.length - 2}
            </span>
          ) : null}
        </span>
      </button>
      {selectionMode ? null : (
        <span className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <Button
            type="button"
            variant="ghost"
            className="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Salin sitasi"
            onClick={() => copyCitation.mutate(item.id)}
          >
            <CopyIcon className="size-3.5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Aksi referensi"
              >
                <MoreHorizontalIcon className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onOpen}>Detail</DropdownMenuItem>
              <DropdownMenuItem onSelect={onEdit}>
                <PencilIcon className="size-3.5" />
                Edit
              </DropdownMenuItem>
              {externalHref ? (
                <DropdownMenuItem asChild>
                  <a href={externalHref} target="_blank" rel="noreferrer">
                    <ExternalLinkIcon className="size-3.5" />
                    Buka {item.doi ? "DOI" : "URL"}
                  </a>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                <Trash2Icon className="size-3.5" />
                Hapus
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      )}
    </li>
  );
}

/** Edit dari list: fetch detail dulu supaya form terisi CSL terbaru. */
function EditCitationDialog({
  workspaceId,
  citationId,
  onClose,
}: {
  workspaceId: string;
  citationId: string;
  onClose: () => void;
}) {
  const detail = useCitationDetail(workspaceId, citationId);
  const updateCitation = useUpdateCitation(workspaceId);
  if (!detail.data) return null;
  return (
    <CitationFormDialog
      open
      citation={detail.data}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      onSubmit={(value) =>
        updateCitation.mutateAsync({
          citationId,
          fields: value.fields,
          tags: value.tags,
        })
      }
    />
  );
}

