"use client";

import { FileTextIcon, Loader2Icon, XIcon } from "@aqsha/ui/icons";
import { cn } from "@/lib/utils";

/** Lampiran yang dirender sebagai kartu file (composer + message row). */
export type FileChipData = {
  id: string;
  title: string;
  mimeType?: string | null;
  /** `pending` (index async) → ikon spinner pada blok ikon. */
  indexingStatus?: string | null;
};

/**
 * Kartu file tunggal — ikon dokumen di blok biku biru + nama berkas (tebal). `onRemove` →
 * tombol X bundar (composer, staged). Tanpa `onRemove` = read-only (message row). `pending`
 * (index async) → spinner di blok ikon.
 */
export function FileChip({
  title,
  indexingStatus,
  onRemove,
  className,
}: FileChipData & { onRemove?: () => void; className?: string }) {
  const pending = indexingStatus === "pending";

  return (
    <div
      className={cn(
        "inline-flex max-w-[13rem] items-center gap-2 rounded-xl border border-border bg-card p-1.5 pr-2.5",
        className,
      )}
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
        {pending ? (
          <Loader2Icon className="size-4 animate-spin" />
        ) : (
          <FileTextIcon className="size-4" />
        )}
      </span>
      <span className="min-w-0 truncate text-xs font-semibold text-foreground">{title}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Hapus ${title}`}
          className="ml-0.5 grid size-[18px] shrink-0 place-items-center rounded-full bg-foreground/10 text-foreground/70 transition-colors hover:bg-foreground/20 hover:text-foreground"
        >
          <XIcon className="size-3" />
        </button>
      ) : null}
    </div>
  );
}
