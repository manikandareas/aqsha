"use client";

import {
  ArrowLeftIcon,
  BookOpenIcon,
  CheckCircle2Icon,
  CopyIcon,
  ExternalLinkIcon,
  MoreHorizontalIcon,
  PencilIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "@aqsha/ui/icons";
import Link from "next/link";
import { useState } from "react";
import { PanelCardToolbar } from "@/components/layout/side-panel-frame";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { panelBodyPaddingClass } from "@/lib/panel-surface";
import { cn } from "@/lib/utils";
import {
  useCitationDetail,
  useCitationRender,
  useCopyCitation,
  useDeleteCitation,
  useResolveCitation,
  useUpdateCitation,
} from "../api";
import {
  CITATION_SOURCE_LABELS,
  CITATION_STATUS_LABELS,
  formatCitationAuthor,
} from "../types";
import { CitationFormDialog } from "./citation-form-dialog";

/**
 * Sub-view detail sitasi (`?panel=cite:<id>`): metadata lengkap + preview terformat
 * style default + provenance + status quality. Citation soft-deleted tetap terbuka
 * dengan badge `dihapus` (missing-state — tidak pernah hilang diam-diam).
 */
export function CitationDetailView({
  workspaceId,
  citationId,
  onBack,
}: {
  workspaceId: string;
  citationId: string;
  onBack: () => void;
}) {
  const detail = useCitationDetail(workspaceId, citationId);
  const render = useCitationRender(workspaceId, { styleId: null, ids: [citationId] });
  const copyCitation = useCopyCitation(workspaceId);
  const updateCitation = useUpdateCitation(workspaceId);
  const deleteCitation = useDeleteCitation(workspaceId);
  const resolveCitation = useResolveCitation(workspaceId);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const citation = detail.data;

  return (
    <>
      <PanelCardToolbar
        title={
          <button
            type="button"
            onClick={onBack}
            className="flex min-w-0 items-center gap-1.5 rounded-full px-1.5 py-1 text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeftIcon className="size-3.5 shrink-0" />
            Sitasi
          </button>
        }
        actions={
          citation && !citation.deletedAt ? (
            <>
              <Button
                type="button"
                variant="ghost"
                className="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Salin sitasi"
                onClick={() => copyCitation.mutate(citation.id)}
              >
                <CopyIcon className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Edit referensi"
                onClick={() => setEditOpen(true)}
              >
                <PencilIcon className="size-3.5" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="Aksi lain"
                  >
                    <MoreHorizontalIcon className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {citation.doi || citation.url ? (
                    <DropdownMenuItem asChild>
                      <a
                        href={citation.doi ? `https://doi.org/${citation.doi}` : (citation.url ?? "#")}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLinkIcon className="size-3.5" />
                        Buka {citation.doi ? "DOI" : "URL"}
                      </a>
                    </DropdownMenuItem>
                  ) : null}
                  {citation.doi && citation.metadataStatus !== "verified" ? (
                    <DropdownMenuItem
                      disabled={resolveCitation.isPending}
                      onSelect={() => resolveCitation.mutate(citation.id)}
                    >
                      <RotateCcwIcon className="size-3.5" />
                      Perbarui dari DOI
                    </DropdownMenuItem>
                  ) : null}
                  {citation.metadataStatus !== "verified" ? (
                    <DropdownMenuItem
                      onSelect={() =>
                        updateCitation.mutate({ citationId: citation.id, markReviewed: true })
                      }
                    >
                      <CheckCircle2Icon className="size-3.5" />
                      Tandai sudah direview
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => setConfirmDelete(true)}
                  >
                    <Trash2Icon className="size-3.5" />
                    Hapus
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : null
        }
      />
      <div className={cn("min-h-0 flex-1 overflow-y-auto", panelBodyPaddingClass)}>
        {detail.isLoading ? (
          <p className="py-8 text-center text-[13px] font-medium text-muted-foreground">
            Memuat referensi…
          </p>
        ) : !citation ? (
          <p className="py-8 text-center text-[13px] font-medium text-muted-foreground">
            Referensi tidak ditemukan.
          </p>
        ) : (
          <div className="grid gap-5 pb-4">
            <div className="grid gap-1.5">
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
                <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                  {citation.documentType}
                </span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                  {CITATION_SOURCE_LABELS[citation.source]}
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5",
                    citation.metadataStatus === "verified"
                      ? "bg-mint-soft text-mint-foreground"
                      : "bg-amber-100 text-amber-700",
                  )}
                >
                  {CITATION_STATUS_LABELS[citation.metadataStatus]}
                </span>
                {citation.deletedAt ? (
                  <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">
                    dihapus
                  </span>
                ) : null}
              </div>
              <h2 className="text-[15px] font-semibold leading-snug text-foreground">
                {citation.title}
              </h2>
            </div>

            {render.data?.entries[0]?.text ? (
              <blockquote className="rounded-lg border border-border/70 bg-muted/40 px-3 py-2.5 text-[13px] font-medium leading-relaxed text-foreground">
                {render.data.entries[0].text}
              </blockquote>
            ) : null}

            <dl className="grid gap-2.5 text-[13px]">
              <MetaRow label="Penulis">
                {citation.authors.length > 0
                  ? citation.authors.map(formatCitationAuthor).join("; ")
                  : "—"}
              </MetaRow>
              <MetaRow label="Tahun">{citation.publishedYear ?? "—"}</MetaRow>
              <MetaRow label="Venue">{citation.venue ?? "—"}</MetaRow>
              <MetaRow label="Penerbit">{citation.publisher ?? "—"}</MetaRow>
              <MetaRow label="DOI">
                {citation.doi ? (
                  <a
                    className="text-primary underline-offset-2 hover:underline"
                    href={`https://doi.org/${citation.doi}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {citation.doi}
                  </a>
                ) : (
                  "—"
                )}
              </MetaRow>
              <MetaRow label="URL">
                {citation.url ? (
                  <a
                    className="break-all text-primary underline-offset-2 hover:underline"
                    href={citation.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {citation.url}
                  </a>
                ) : (
                  "—"
                )}
              </MetaRow>
              <MetaRow label="Tag">
                {citation.tags.length > 0 ? citation.tags.join(", ") : "—"}
              </MetaRow>
              {citation.artifactId ? (
                <MetaRow label="Artifact">
                  <span className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/app/workspaces/${workspaceId}/artifacts/${citation.artifactId}`}
                      className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                    >
                      <BookOpenIcon className="size-3.5" />
                      Buka di reader
                    </Link>
                    {citation.deletedAt ? null : (
                      <button
                        type="button"
                        onClick={() =>
                          updateCitation.mutate({ citationId: citation.id, artifactId: null })
                        }
                        className="text-[12px] font-medium text-muted-foreground transition-colors hover:text-destructive"
                      >
                        Lepas tautan
                      </button>
                    )}
                  </span>
                </MetaRow>
              ) : null}
              <MetaRow label="Ditambahkan">
                {new Date(citation.createdAt).toLocaleDateString("id-ID", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </MetaRow>
            </dl>
          </div>
        )}
      </div>

      {citation ? (
        <CitationFormDialog
          open={editOpen}
          citation={citation}
          onOpenChange={setEditOpen}
          onSubmit={(value) =>
            updateCitation.mutateAsync({
              citationId: citation.id,
              fields: value.fields,
              tags: value.tags,
            })
          }
        />
      ) : null}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Hapus referensi?"
        description="Referensi dihapus dari library workspace ini. Dokumen yang memakainya akan menandainya sebagai hilang."
        confirmLabel="Hapus"
        onConfirm={async () => {
          if (!citation) return;
          await deleteCitation.mutateAsync(citation.id);
          onBack();
        }}
      />
    </>
  );
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6rem_1fr] items-baseline gap-2">
      <dt className="text-[12px] font-semibold text-muted-foreground">{label}</dt>
      <dd className="min-w-0 font-medium text-foreground">{children}</dd>
    </div>
  );
}
