"use client";

import type { ReactNode } from "react";
import { InfoIcon } from "@aqsha/ui/icons";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { WorkspaceLibraryTab } from "./workspace-library-surface";

// Footnote tenang yang menempel di dasar board (selalu terlihat di kedua tab).
// Tujuannya: mengajarkan gesture (1× konteks, 2× buka) tanpa terasa seperti
// toolbar. Saat ada item terpilih, sisi kanan berubah jadi konfirmasi + aksi
// bersihkan — jadi bar yang sama mengajar lalu memberi umpan balik.
//
// Responsif terhadap container (bukan viewport): `<footer>` menandai dirinya
// sebagai `@container` sehingga anak-anaknya bisa sembunyi/tampil berdasarkan
// lebar panel. Hint ke-3 + pesan suplementer didelegasikan ke tooltip pada
// InfoIcon agar tetap accesible tanpa memakan ruang saat container sempit.

function GestureChip({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-[18px] items-center rounded-[5px] border border-border/80 bg-muted/50 px-1.5 font-mono text-[10px] font-medium leading-none text-foreground/65">
      {children}
    </kbd>
  );
}

type Hint = { chip: string; label: string };

// `li` inside the inline `<ul>`, `span` inside the tooltip column — same chip +
// label markup either way, so the row lives once and the caller picks the tag.
function HintItem({
  chip,
  label,
  className,
  as: As = "li",
}: Hint & {
  className?: string;
  as?: "li" | "span";
}) {
  return (
    <As className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", className)}>
      <GestureChip>{chip}</GestureChip>
      <span>{label}</span>
    </As>
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
  const tabHint: Hint =
    activeTab === "pustaka"
      ? { chip: "Seret", label: "Pilih banyak" }
      : { chip: "Klik kanan", label: "Aksi lain" };
  // Single source for the three hints — rendered inline (wide) and inside the
  // tooltip (narrow), so the copy lives once.
  const hints: Hint[] = [
    { chip: "1×", label: "Jadikan konteks" },
    { chip: "2×", label: "Buka" },
    tabHint,
  ];
  const hasContext = contextCount > 0;

  return (
    <footer
      aria-label="Panduan interaksi"
      className="@container flex shrink-0 items-center justify-between gap-3 border-t border-border/60 bg-background/85 px-5 py-2 backdrop-blur-sm sm:px-6"
    >
      <ul className="flex min-w-0 items-center gap-x-2.5 text-[11px] leading-none text-muted-foreground">
        <li className="inline-flex items-center text-muted-foreground/60">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Lihat panduan interaksi"
                className="inline-flex items-center rounded-md outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <InfoIcon className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              align="start"
              className="flex max-w-[17rem] flex-col items-start gap-2 py-2"
            >
              <p className="text-[11px] leading-snug text-background/80">
                Item konteks ikut terkirim saat kamu bertanya ke Astra.
              </p>
              <div className="flex flex-col gap-1.5">
                {hints.map((hint) => (
                  <HintItem key={hint.label} as="span" chip={hint.chip} label={hint.label} />
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        </li>
        <HintItem chip={hints[0].chip} label={hints[0].label} />
        <HintDivider />
        <HintItem chip={hints[1].chip} label={hints[1].label} />
        <HintDivider className="hidden @lg:inline" />
        <HintItem
          chip={hints[2].chip}
          label={hints[2].label}
          className="hidden @lg:inline-flex"
        />
      </ul>

      {hasContext ? (
        <div className="inline-flex shrink-0 items-center gap-2 text-[11px] leading-none">
          <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
            <span className="size-1.5 rounded-full bg-primary" />
            {contextCount} konteks
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
      ) : null}
    </footer>
  );
}
