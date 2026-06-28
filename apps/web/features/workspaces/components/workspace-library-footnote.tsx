"use client";

import type { ReactNode } from "react";
import { InfoIcon, MessageSquareIcon } from "@aqsha/ui/icons";
import { cn } from "@/lib/utils";
import type { WorkspaceLibraryTab } from "./workspace-library-surface";

// Footnote tenang yang menempel di dasar board (selalu terlihat di kedua tab).
// Tujuannya: mengajarkan gesture (1× konteks, 2× buka) tanpa terasa seperti
// toolbar. Saat ada item terpilih, sisi kanan berubah jadi konfirmasi + aksi
// bersihkan — jadi bar yang sama mengajar lalu memberi umpan balik.

function GestureChip({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-[18px] items-center rounded-[5px] border border-border/80 bg-muted/50 px-1.5 font-mono text-[10px] font-medium leading-none text-foreground/65">
      {children}
    </kbd>
  );
}

function HintItem({
  chip,
  label,
  className,
}: {
  chip: string;
  label: string;
  className?: string;
}) {
  return (
    <li className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", className)}>
      <GestureChip>{chip}</GestureChip>
      <span>{label}</span>
    </li>
  );
}

function HintDivider({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("text-muted-foreground/30", className)}>
      ·
    </span>
  );
}

export function WorkspaceLibraryFootnote({
  activeTab,
  contextCount = 0,
  onClearContext,
}: {
  activeTab: WorkspaceLibraryTab;
  contextCount?: number;
  onClearContext?: () => void;
}) {
  // Hint ke-3 mengikuti kemampuan nyata tiap tab: Pustaka punya marquee
  // (seret area kosong), Artifact timeline pakai menu klik-kanan.
  const tabHint =
    activeTab === "pustaka"
      ? { chip: "Seret", label: "Pilih banyak" }
      : { chip: "Klik kanan", label: "Aksi lain" };
  const hasContext = contextCount > 0;

  return (
    <footer
      aria-label="Panduan interaksi"
      className="flex shrink-0 items-center justify-between gap-3 border-t border-border/60 bg-background/85 px-5 py-2 backdrop-blur-sm sm:px-6"
    >
      <ul className="flex min-w-0 items-center gap-x-2.5 text-[11px] leading-none text-muted-foreground">
        <li aria-hidden className="inline-flex items-center text-muted-foreground/60">
          <InfoIcon className="size-3.5" />
        </li>
        <HintItem chip="1×" label="Jadikan konteks" />
        <HintDivider />
        <HintItem chip="2×" label="Buka" />
        <HintDivider className="hidden sm:inline" />
        <HintItem
          chip={tabHint.chip}
          label={tabHint.label}
          className="hidden sm:inline-flex"
        />
      </ul>

      {hasContext ? (
        <div className="inline-flex shrink-0 items-center gap-2 text-[11px] leading-none">
          <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
            <span className="size-1.5 rounded-full bg-primary" />
            {contextCount} item jadi konteks
          </span>
          {onClearContext ? (
            <button
              type="button"
              onClick={onClearContext}
              className="rounded-md px-1.5 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Bersihkan
            </button>
          ) : null}
        </div>
      ) : (
        <p className="hidden shrink-0 items-center gap-1.5 text-[11px] leading-none text-muted-foreground/70 md:inline-flex">
          <MessageSquareIcon className="size-3.5" />
          Item konteks ikut terkirim saat kamu bertanya ke Astra.
        </p>
      )}
    </footer>
  );
}
