"use client";

import { LayersIcon } from "@aqsha/ui/icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useDuplicateGroups, useMergeManyCitations } from "../api";
import {
  CITATION_STATUS_LABELS,
  type CitationDuplicateGroup,
  citationMetaLine,
} from "../types";

/**
 * "Kelola duplikat" — grup kandidat duplikat (canonical key sama). Tiap grup bisa
 * digabungkan menjadi satu (target = paling lengkap, dipilih server); sisanya
 * di-soft-delete. Fallback judul hanya KANDIDAT, jadi keputusan gabung tetap manual.
 */
export function CitationDuplicatesDialog({
  workspaceId,
  open,
  onOpenChange,
}: {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const groups = useDuplicateGroups(workspaceId, open);
  const mergeMany = useMergeManyCitations(workspaceId);
  const data = groups.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Kelola duplikat</DialogTitle>
          <DialogDescription>
            Referensi dengan identitas serupa (DOI/ISBN, atau judul + tahun + penulis).
            Gabungkan untuk menyisakan satu — field yang kosong akan dilengkapi.
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[60vh] gap-3 overflow-y-auto">
          {groups.isLoading ? (
            <p className="py-6 text-center text-[13px] font-medium text-muted-foreground">
              Memeriksa duplikat…
            </p>
          ) : data.length === 0 ? (
            <p className="py-6 text-center text-[13px] font-medium text-muted-foreground">
              Tidak ada kandidat duplikat di library ini.
            </p>
          ) : (
            data.map((group) => (
              <DuplicateGroupCard
                key={group.canonicalKey}
                group={group}
                pending={mergeMany.isPending}
                onMerge={() => mergeMany.mutate({ ids: group.members.map((m) => m.id) })}
              />
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DuplicateGroupCard({
  group,
  pending,
  onMerge,
}: {
  group: CitationDuplicateGroup;
  pending: boolean;
  onMerge: () => void;
}) {
  return (
    <div className="grid gap-2 rounded-lg border border-border/70 p-3">
      <ul className="grid gap-1.5">
        {group.members.map((member) => (
          <li key={member.id} className="grid gap-0.5">
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden
                title={CITATION_STATUS_LABELS[member.metadataStatus]}
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  member.metadataStatus === "verified"
                    ? "bg-mint"
                    : member.metadataStatus === "needs_review"
                      ? "bg-amber-400"
                      : "bg-destructive/70",
                )}
              />
              <span className="truncate text-[13px] font-semibold text-foreground">
                {member.title}
              </span>
            </span>
            <span className="truncate pl-3 text-[12px] font-medium text-muted-foreground">
              {citationMetaLine(member)}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex justify-end">
        <Button
          type="button"
          variant="secondary"
          className="h-8 rounded-full px-3"
          disabled={pending}
          onClick={onMerge}
        >
          <LayersIcon className="size-3.5" />
          Gabungkan {group.members.length}
        </Button>
      </div>
    </div>
  );
}
