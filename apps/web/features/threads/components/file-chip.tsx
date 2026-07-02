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
 * tombol X bundar (composer, staged). `onOpen` (message row, mutually exclusive dengan
 * `onRemove`) → seluruh chip jadi tombol yang membuka reader artifact di panel. Tanpa keduanya
 * = read-only. `pending` (index async) → spinner di blok ikon.
 */
export function FileChip({
  title,
  indexingStatus,
  onRemove,
  onOpen,
  className,
}: FileChipData & { onRemove?: () => void; onOpen?: () => void; className?: string }) {
  const pending = indexingStatus === "pending";
  const base =
    "inline-flex max-w-[13rem] items-center gap-2 rounded-xl border border-border bg-card p-1.5 pr-2.5";
  const icon = (
    <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
      {pending ? (
        <Loader2Icon className="size-4 animate-spin" />
      ) : (
        <FileTextIcon className="size-4" />
      )}
    </span>
  );
  const label = (
    <span className="min-w-0 truncate text-xs font-semibold text-foreground">{title}</span>
  );

  if (onOpen) {
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Buka ${title}`}
        className={cn(
          base,
          "text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        {icon}
        {label}
      </button>
    );
  }

  return (
    <div className={cn(base, className)}>
      {icon}
      {label}
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
