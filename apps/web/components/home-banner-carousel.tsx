"use client";

// Banner kecil di landing /app (pindahan kartu usage sidebar) — carousel autoslide
// ala Manus: satu kartu lebar sejajar composer, konten kiri + thumbnail kanan, dots
// di bawah. Slide = ringkasan usage billing + house-ads (reuse HOUSE_ADS Explore).
// Autoslide jeda saat hover/focus dan mati total bila prefers-reduced-motion.

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";

import { HOUSE_ADS, type HouseAdAccent } from "@/features/discovery/house-ads";
import { useBillingCurrent } from "@/features/settings/api";
import {
  deepRunsQuota,
  isCreditsLow,
} from "@/features/settings/lib/billing-derived";
import { cn } from "@/lib/utils";

const BILLING_HREF = "/app/settings/usage-billing";
const NUM = new Intl.NumberFormat("id-ID");
const DAY_MS = 86_400_000;
const SLIDE_INTERVAL_MS = 6_000;

const ACCENT_SOFT: Record<HouseAdAccent, string> = {
  mint: "bg-mint-soft",
  lavender: "bg-lavender-soft",
  coral: "bg-coral-soft",
};

function resetLabel(resetAt: number): string {
  const days = Math.max(0, Math.ceil((resetAt - Date.now()) / DAY_MS));
  if (days <= 0) return "reset hari ini";
  if (days === 1) return "reset besok";
  return `reset ${days} hari lagi`;
}

type BannerSlide = {
  id: string;
  href: string;
  external?: boolean;
  title: string;
  subtitle: string;
  image?: string;
  imageBgClass: string;
  /** Bar kredit mini — hanya di slide usage berpaket terbatas. */
  meter?: { pct: number; low: boolean };
};

/** Slide usage dari snapshot billing (null selagi memuat/gagal → carousel jalan tanpa slide ini). */
function useUsageSlide(): BannerSlide | null {
  const billing = useBillingCurrent();
  if (!billing.data) return null;

  const {
    planLabel,
    planKey,
    creditsUsed,
    creditsLimit,
    creditsRemaining,
    resetAt,
    isUnlimitedCredits,
  } = billing.data;
  const deep = deepRunsQuota(billing.data);
  const deepLabel = deep.unlimited
    ? "riset mendalam tanpa batas"
    : `${NUM.format(deep.remaining)} riset mendalam tersisa`;

  if (isUnlimitedCredits) {
    return {
      id: "usage",
      href: BILLING_HREF,
      title: `Paket ${planLabel} — kredit tak terbatas ∞`,
      subtitle: `${deepLabel} · kelola langganan`,
      image: "/pro-card.png",
      imageBgClass: "bg-white",
    };
  }

  const pct =
    creditsLimit <= 0
      ? 0
      : Math.min(100, Math.round((creditsUsed / creditsLimit) * 100));
  return {
    id: "usage",
    href: BILLING_HREF,
    title: `Sisa ${NUM.format(creditsRemaining)} dari ${NUM.format(creditsLimit)} kredit`,
    subtitle: `Paket ${planLabel} · ${resetLabel(resetAt)} · ${deepLabel}${
      planKey === "free" ? " · upgrade untuk kuota lebih besar" : ""
    }`,
    image: "/pro-card.png",
    imageBgClass: "bg-white",
    meter: { pct, low: isCreditsLow(billing.data) },
  };
}

export function HomeBannerCarousel() {
  const shouldReduceMotion = useReducedMotion();
  const usageSlide = useUsageSlide();
  const [index, setIndex] = useState(0);
  // `paused` sengaja state (bukan ref): perubahan harus me-restart effect interval
  // di bawah supaya slide diam penuh SLIDE_INTERVAL_MS lagi sesudah unhover.
  const [paused, setPaused] = useState(false);

  const slides: BannerSlide[] = [
    ...(usageSlide ? [usageSlide] : []),
    ...HOUSE_ADS.map((ad) => ({
      id: ad.id,
      href: ad.href,
      external: ad.external,
      title: ad.title,
      subtitle: ad.body,
      image: ad.image,
      imageBgClass: ACCENT_SOFT[ad.accent],
    })),
  ];
  // Jumlah slide bisa berubah saat billing selesai memuat → index modulo agar tak out-of-range.
  const active = slides.length > 0 ? index % slides.length : 0;

  useEffect(() => {
    if (paused || shouldReduceMotion || slides.length < 2) return;
    const timer = setInterval(() => setIndex((i) => i + 1), SLIDE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [paused, shouldReduceMotion, slides.length]);

  if (slides.length === 0) return null;

  return (
    <section aria-label="Info paket dan fitur" className="grid w-full gap-2.5">
      <div
        className="overflow-hidden rounded-[14px] border border-border bg-card transition-shadow duration-200 hover:shadow-sm"
        onPointerEnter={() => setPaused(true)}
        onPointerLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={() => setPaused(false)}
      >
        <div
          className={cn(
            "flex",
            shouldReduceMotion
              ? null
              : "transition-transform duration-500 ease-out",
          )}
          style={{ transform: `translateX(-${active * 100}%)` }}
        >
          {slides.map((slide, slideIndex) => (
            <BannerSlideCard
              key={slide.id}
              slide={slide}
              hidden={slideIndex !== active}
            />
          ))}
        </div>
      </div>

      {slides.length > 1 ? (
        <div className="flex items-center justify-center gap-1.5">
          {slides.map((slide, slideIndex) => (
            <button
              key={slide.id}
              type="button"
              onClick={() => setIndex(slideIndex)}
              aria-label={`Tampilkan slide ${slideIndex + 1} dari ${slides.length}`}
              aria-current={slideIndex === active}
              className={cn(
                "size-1.5 rounded-full transition-[background-color,transform] duration-200 ease-out",
                slideIndex === active
                  ? "scale-110 bg-foreground/70"
                  : "bg-muted-foreground/30 hover:bg-muted-foreground/55",
              )}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function BannerSlideCard({
  slide,
  hidden,
}: {
  slide: BannerSlide;
  hidden: boolean;
}) {
  const body = (
    <>
      <div className="grid min-w-0 flex-1 gap-1">
        <p className="truncate text-[13.5px] font-semibold leading-snug text-card-foreground">
          {slide.title}
        </p>
        {slide.meter ? (
          <div className="h-1 max-w-[240px] overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-500 ease-out",
                slide.meter.low ? "bg-amber-500" : "bg-primary",
              )}
              style={{ width: `${slide.meter.pct}%` }}
            />
          </div>
        ) : null}
        <p className="line-clamp-1 text-[12px] leading-snug text-muted-foreground">
          {slide.subtitle}
        </p>
      </div>
      <div
        className={cn(
          "relative h-12 w-20 shrink-0 overflow-hidden rounded-[8px] sm:h-14 sm:w-24",
          slide.imageBgClass,
        )}
      >
        {slide.image ? (
          <Image
            src={slide.image}
            alt=""
            fill
            unoptimized
            sizes="96px"
            className="object-cover"
          />
        ) : null}
      </div>
    </>
  );
  const slideClass =
    "flex w-full shrink-0 items-center gap-3 px-4 py-3 sm:gap-4 sm:px-5 focus-visible:outline-none";

  // Slide non-aktif disembunyikan dari tab-order & a11y tree (masih di DOM demi animasi geser).
  if (slide.external) {
    return (
      <a
        href={slide.href}
        target="_blank"
        rel="noreferrer"
        className={slideClass}
        tabIndex={hidden ? -1 : undefined}
        aria-hidden={hidden || undefined}
      >
        {body}
      </a>
    );
  }
  return (
    <Link
      href={slide.href}
      className={slideClass}
      tabIndex={hidden ? -1 : undefined}
      aria-hidden={hidden || undefined}
    >
      {body}
    </Link>
  );
}
