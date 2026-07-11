"use client";

import { CheckIcon } from "@aqsha/ui/icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useCitationSettings, useUpdateCitationSettings } from "../api";
import { BIBLIOGRAPHY_SORT_OPTIONS, CITATION_STYLE_OPTIONS } from "../types";

/**
 * Pengaturan sitasi workspace: style default (re-render semua preview/copy) +
 * urutan bibliography. Perubahan tersimpan langsung (tanpa tombol simpan).
 */
export function CitationSettingsDialog({
  workspaceId,
  open,
  onOpenChange,
}: {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const settings = useCitationSettings(workspaceId);
  const update = useUpdateCitationSettings(workspaceId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Gaya sitasi workspace</DialogTitle>
          <DialogDescription>
            Style default dipakai untuk aksi salin sitasi, preview, dan bibliography. Mengganti
            style me-render ulang seluruh sitasi dengan aman.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <span className="text-[12px] font-semibold text-foreground">Style</span>
            <div className="grid gap-1">
              {CITATION_STYLE_OPTIONS.map((style) => (
                <OptionRow
                  key={style.id}
                  label={style.label}
                  selected={settings.data?.defaultStyleId === style.id}
                  disabled={update.isPending}
                  onSelect={() => update.mutate({ defaultStyleId: style.id })}
                />
              ))}
            </div>
          </div>
          <div className="grid gap-1.5">
            <span className="text-[12px] font-semibold text-foreground">
              Urutan bibliography
            </span>
            <div className="grid gap-1">
              {BIBLIOGRAPHY_SORT_OPTIONS.map((sort) => (
                <OptionRow
                  key={sort.id}
                  label={sort.label}
                  selected={settings.data?.bibliographySort === sort.id}
                  disabled={update.isPending}
                  onSelect={() => update.mutate({ bibliographySort: sort.id })}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Selesai
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OptionRow({
  label,
  selected,
  disabled,
  onSelect,
}: {
  label: string;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex items-center justify-between rounded-lg border px-3 py-2 text-left text-[13px] font-medium transition-colors",
        selected
          ? "border-primary/40 bg-primary/5 text-foreground"
          : "border-border/70 text-muted-foreground hover:bg-muted/50 hover:text-foreground",
      )}
    >
      {label}
      {selected ? <CheckIcon className="size-3.5 text-primary" /> : null}
    </button>
  );
}
