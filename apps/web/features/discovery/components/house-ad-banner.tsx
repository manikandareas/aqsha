"use client";

// Banner house-ad (slot promo produk) untuk feed Explore. Layout split editorial:
// panel gambar (kiri) + panel konten (kanan), surface card solid + border (TANPA
// gradient) → tegas tapi tetap menyatu dgn feed. Gambar dari house-ads.ts; bila
// kosong, panel ikon accent jadi penggantinya. CTA punya feedback tekan.

import { ArrowUpRightIcon, SparklesIcon } from "@aqsha/ui/icons";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { HouseAd, HouseAdAccent } from "../house-ads";

const ACCENT_SOFT: Record<HouseAdAccent, string> = {
  mint: "bg-mint-soft",
  lavender: "bg-lavender-soft",
  coral: "bg-coral-soft",
};
const ACCENT_FG: Record<HouseAdAccent, string> = {
  mint: "text-mint-foreground",
  lavender: "text-lavender-foreground",
  coral: "text-coral-foreground",
};
const ACCENT_DOT: Record<HouseAdAccent, string> = {
  mint: "bg-mint-foreground",
  lavender: "bg-lavender-foreground",
  coral: "bg-coral-foreground",
};

export function HouseAdBanner({ ad }: { ad: HouseAd }) {
  const cta = (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-[13px] font-bold text-primary-foreground transition-[transform,background-color] duration-150 ease-out hover:bg-primary/90 active:scale-[0.97]">
      {ad.ctaLabel}
      <ArrowUpRightIcon className="size-3.5" />
    </span>
  );

  return (
    <aside className="group grid overflow-hidden rounded-2xl border border-border bg-card transition-shadow duration-200 hover:shadow-md @md/feed:grid-cols-[minmax(0,40%)_minmax(0,1fr)]">
      {/* Panel gambar — flush ke tepi card. Latar accent-soft solid (terlihat bila PNG transparan). */}
      <div
        className={cn(
          "relative aspect-[16/10] w-full overflow-hidden @md/feed:aspect-auto @md/feed:h-full",
          ACCENT_SOFT[ad.accent],
        )}
      >
        {ad.image ? (
          <Image
            src={ad.image}
            alt=""
            fill
            unoptimized
            sizes="(max-width: 768px) 100vw, 460px"
            className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <SparklesIcon className={cn("size-10", ACCENT_FG[ad.accent])} />
          </div>
        )}
      </div>

      {/* Panel konten */}
      <div className="relative flex flex-col justify-center gap-2.5 px-6 py-7 @2xl:px-8">
        <span className="absolute right-4 top-4 font-mono text-[9.5px] tracking-[0.12em] text-muted-foreground/70">
          dari aqsha
        </span>
        <div className="flex items-center gap-2">
          <span className={cn("size-1.5 shrink-0 rounded-full", ACCENT_DOT[ad.accent])} />
          <p className={cn("font-mono text-[11px] font-medium tracking-wide", ACCENT_FG[ad.accent])}>
            {ad.eyebrow}
          </p>
        </div>
        <h3 className="font-heading text-[21px] font-bold leading-tight tracking-tight text-foreground">
          {ad.title}
        </h3>
        <p className="max-w-[460px] text-[13.5px] leading-relaxed text-muted-foreground">
          {ad.body}
        </p>
        <div className="mt-2.5">
          {ad.external ? (
            <a href={ad.href} target="_blank" rel="noreferrer">
              {cta}
            </a>
          ) : (
            <Link href={ad.href}>{cta}</Link>
          )}
        </div>
      </div>
    </aside>
  );
}
