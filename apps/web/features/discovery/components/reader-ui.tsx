"use client";

// Primitives bersama untuk halaman detail Explore (paper & berita). Estetika editorial
// brand Aqsha: serif heading, hairline + tint lembut (TANPA gradien lebay / shadow tebal),
// framing bersarang (outer tray + inner core) untuk media, dan CTA pill dengan ikon
// bersarang. Motion hanya pada interaksi (hover/expand/reveal) — bukan scroll-reveal.

import { useState, type ReactNode } from "react";
import {
  ArrowUpRightIcon,
  ChevronDownIcon,
  ImageIcon,
  Loader2Icon,
} from "@aqsha/ui/icons";
import { cn } from "@/lib/utils";

// Easing fisik (spring-out) dipakai konsisten untuk semua transisi interaktif.
const EASE = "ease-[cubic-bezier(0.32,0.72,0,1)]";

const SHELL_WIDTH = {
  prose: "max-w-[44rem]",
  news: "max-w-4xl",
  wide: "max-w-5xl",
} as const;

export function ReaderShell({
  children,
  width = "prose",
}: {
  children: ReactNode;
  width?: keyof typeof SHELL_WIDTH;
}) {
  return (
    <main className={cn("mx-auto w-full px-5 pb-24 pt-8 sm:px-6 sm:pt-10", SHELL_WIDTH[width])}>
      {children}
    </main>
  );
}

export function ReaderLoader() {
  return (
    <div className="flex flex-col items-center gap-3 py-24 text-muted-foreground">
      <Loader2Icon className="size-5 animate-spin" />
      <p className="text-[13px]">Menyiapkan bacaan…</p>
    </div>
  );
}

export function ReaderEmpty({ title, message }: { title: string; message: string }) {
  return (
    <div className="mx-auto mt-12 max-w-sm rounded-3xl border border-border/70 bg-muted/20 px-6 py-12 text-center">
      <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <ImageIcon className="size-5" />
      </div>
      <h2 className="font-serif text-xl text-foreground">{title}</h2>
      <p className="mx-auto mt-2 max-w-xs text-[13px] leading-relaxed text-muted-foreground">{message}</p>
    </div>
  );
}

type EyebrowTone = "neutral" | "mint" | "lemon";
const EYEBROW_TONE: Record<EyebrowTone, string> = {
  neutral: "border-border/70 bg-muted/50 text-foreground/80",
  mint: "border-mint-soft-border bg-mint-soft text-mint-foreground",
  lemon: "border-lemon-soft-border bg-lemon-soft text-lemon-foreground",
};

/** Tag eyebrow — sentence case (TIDAK uppercase, sesuai aturan brand). */
export function Eyebrow({
  children,
  tone = "neutral",
  icon,
}: {
  children: ReactNode;
  tone?: EyebrowTone;
  icon?: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-tight",
        EYEBROW_TONE[tone],
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/**
 * CTA pill dengan ikon bersarang (button-in-button). `solid` = high-contrast ink,
 * `outline` = hairline. Hover: ikon menggeser diagonal + press scale — kinetik halus.
 */
export function PillCta({
  href,
  onClick,
  children,
  variant = "solid",
  icon,
}: {
  href?: string;
  onClick?: () => void;
  children: ReactNode;
  variant?: "solid" | "outline";
  icon?: ReactNode;
}) {
  const solid = variant === "solid";
  const base = cn(
    "group inline-flex items-center gap-2.5 rounded-full py-1.5 pl-5 pr-1.5 text-[13px] font-semibold transition-[transform,background-color,color] duration-300 active:scale-[0.98]",
    EASE,
    solid
      ? "bg-foreground text-background hover:bg-foreground/90"
      : "border border-border/80 bg-card text-foreground hover:border-foreground/30 hover:bg-muted/40",
  );
  const iconWrap = cn(
    "flex size-7 items-center justify-center rounded-full transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-px",
    EASE,
    solid ? "bg-background/15" : "bg-muted",
  );
  const inner = (
    <>
      <span>{children}</span>
      <span className={iconWrap}>{icon ?? <ArrowUpRightIcon className="size-4" />}</span>
    </>
  );
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={base}>
        {inner}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={base}>
      {inner}
    </button>
  );
}

/**
 * Teks panjang yang bisa dilipat ("Baca selengkapnya"). Clamp via inline style supaya
 * jumlah baris dinamis tetap ke-render (Tailwind JIT tak menangkap class dinamis).
 */
export function ExpandableText({
  text,
  clampLines = 8,
  expandLabel = "Baca selengkapnya",
  collapseLabel = "Tampilkan ringkas",
  className,
}: {
  text: string;
  clampLines?: number;
  expandLabel?: string;
  collapseLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  // Heuristik: hanya tampilkan toggle bila teks cukup panjang untuk terpotong.
  const isLong = text.length > clampLines * 64;
  return (
    <div>
      <p
        className={cn("whitespace-pre-line text-[15px] leading-[1.75] text-ink-soft", className)}
        style={
          !open && isLong
            ? { display: "-webkit-box", WebkitLineClamp: clampLines, WebkitBoxOrient: "vertical", overflow: "hidden" }
            : undefined
        }
      >
        {text}
      </p>
      {isLong ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-foreground/90 transition-colors duration-300 hover:text-foreground",
            EASE,
          )}
        >
          {open ? collapseLabel : expandLabel}
          <ChevronDownIcon
            className={cn("size-3.5 transition-transform duration-300", EASE, open && "rotate-180")}
          />
        </button>
      ) : null}
    </div>
  );
}

/** Sel statistik (sitasi / persentil / FWCI) — angka serif besar + label tenang. */
export function StatCell({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0">
      <p className="font-serif text-[26px] leading-none tracking-tight text-foreground">{value}</p>
      <p className="mt-1.5 text-[11px] font-medium text-muted-foreground">{label}</p>
    </div>
  );
}

/** Baris meta key→value untuk panel "Tentang paper". */
export function MetaItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] font-medium text-muted-foreground">{label}</dt>
      <dd className="text-[13px] leading-snug text-foreground">{children}</dd>
    </div>
  );
}

/** Judul seksi reader (serif) + opsional hitung. */
export function ReaderSection({
  title,
  count,
  children,
  className,
}: {
  title: string;
  count?: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mt-9", className)}>
      <h2 className="mb-3 flex items-baseline gap-2 font-serif text-lg leading-tight text-foreground">
        {title}
        {count != null ? <span className="text-[13px] font-sans font-normal text-muted-foreground">{count}</span> : null}
      </h2>
      {children}
    </section>
  );
}
