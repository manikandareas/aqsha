"use client";

import { ExpandIcon } from "@aqsha/ui/icons";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Shell tunggal untuk semua tool card di atas composer (Klarifikasi, Rencana riset, notice `/deep`,
 * persetujuan alat). Satu class = padding & kartu konsisten dan kompak. Dipakai `ToolCard` maupun
 * kartu yang menyusun heading-nya sendiri (mis. `DeepRunNoticeCard`).
 */
export const toolCardShellClass = "rounded-xl border border-border bg-card p-3.5";

/**
 * Tool card interaktif kompak di atas composer. Heading satu baris yang tegas: ikon tool + judul
 * (+ meta opsional). Bila `onOpenPanel` diberi, SELURUH baris header jadi tombol buka-panel dengan
 * ikon expand (⤢) di kanan sebagai afordans yang jelas; jika tidak, header statis. Body (form / baris
 * aksi) menyusul di bawah heading.
 */
export function ToolCard({
  icon,
  title,
  meta,
  onOpenPanel,
  children,
  className,
}: {
  /** Glyph tool (sudah diberi ukuran, mis. `size-4`). */
  icon: ReactNode;
  title: string;
  /** Ringkasan singkat di samping judul ("3 pertanyaan", "5 sub-pertanyaan"). */
  meta?: string;
  /** Bila ada → header jadi tombol buka panel detail (ikon ⤢). */
  onOpenPanel?: () => void;
  children: ReactNode;
  className?: string;
}) {
  const heading = (
    <>
      {icon}
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
        {title}
        {meta ? (
          <span className="ml-1.5 font-normal text-muted-foreground">· {meta}</span>
        ) : null}
      </span>
    </>
  );

  return (
    <div className={cn(toolCardShellClass, className)}>
      {onOpenPanel ? (
        <button
          type="button"
          onClick={onOpenPanel}
          title="Buka panel detail"
          className="group -m-1 flex w-full items-center gap-2 rounded-lg p-1 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {heading}
          <ExpandIcon className="size-4 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-muted-foreground" />
        </button>
      ) : (
        <div className="flex items-center gap-2">{heading}</div>
      )}
      <div className="mt-4">{children}</div>
    </div>
  );
}
