"use client";

import { useState } from "react";
import { m, useReducedMotion } from "motion/react";

import { ArrowDownIcon } from "@/components/icons";
import { HeroDoodles } from "@/components/marketing/hero-doodles";
import { MagneticButton } from "@/components/marketing/magnetic-button";
import { Button } from "@/components/ui/button";
import { FEATURES, featureHash } from "@/data/features";
import { WAITLIST_PATH } from "@/lib/marketing/cta";
import { EASE_OUT, FRAME_SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";

const buttonContainer = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.09, delayChildren: 0.22 },
  },
} as const;

const buttonItem = (reduce: boolean | null) =>
  reduce
    ? { hidden: { opacity: 1 }, show: { opacity: 1 } }
    : {
        hidden: { opacity: 0, y: 18 },
        show: {
          opacity: 1,
          y: 0,
          transition: { type: "spring" as const, stiffness: 320, damping: 26 },
        },
      };

/**
 * Two device frames instead of a four-window collage: a browser window with the
 * phone leaning against its lower-right corner. Identity (title, hash target)
 * still comes from `data/features.ts`; everything else here is collage layout.
 *
 * `media` is a still for now — swapping it for the hero loop later only means
 * pointing `HeroFrameMedia` at a `<video>` source; the geometry stays put.
 */
const HERO_FRAMES = [
  {
    key: "desktop",
    chrome: "desktop",
    feature: FEATURES.document,
    label: "aqshara.com/app",
    chipLabel: "Lihat fitur",
    media: "/landing/hero-poster.webp",
    mediaClass: "object-center",
    aspectClass: "aspect-[16/10]",
    positionClass: "bottom-0 left-[4%] w-[76%] sm:left-[8%] sm:w-[70%]",
    rotate: -1.2,
    zBase: 10,
  },
  {
    key: "mobile",
    chrome: "phone",
    feature: FEATURES.astra,
    label: "Aqsha di HP",
    chipLabel: "Lihat",
    // 560px variant, not the 1122px original the footer uses: this frame renders
    // at ~22% of the hero (≈264 CSS px), and React's float machinery preloads
    // both hero media, so the full-size file would have competed with the LCP
    // image for four times the pixels it can show.
    media: "/landing/workspace-view-phone.webp",
    mediaClass: "object-[50%_30%]",
    aspectClass: "aspect-[9/19.5]",
    positionClass: "bottom-[2%] left-[72%] w-[24%] sm:left-[70%] sm:w-[22%]",
    rotate: 2.6,
    zBase: 20,
  },
] as const;

type HeroFrame = (typeof HERO_FRAMES)[number];

/**
 * SafariChrome — Safari-style toolbar for the desktop frame: traffic lights in
 * the brand accents, muted back/forward chevrons, a centered address pill, and
 * two placeholder controls on the right. Purely decorative — the link's
 * `aria-label` carries the accessible name.
 */
function SafariChrome({ label }: { label: string }) {
  return (
    <span
      aria-hidden
      className="flex items-center gap-2 border-b-2 border-border bg-card px-2 py-1.5 sm:px-2.5 sm:py-2"
    >
      <span className="flex shrink-0 items-center gap-1 sm:gap-1.5">
        <span className="size-1.5 rounded-full bg-coral sm:size-2" />
        <span className="size-1.5 rounded-full bg-lemon sm:size-2" />
        <span className="size-1.5 rounded-full bg-mint sm:size-2" />
      </span>

      <span className="hidden shrink-0 items-center gap-1.5 text-muted-foreground/60 sm:flex">
        <ChevronGlyph />
        <ChevronGlyph className="rotate-180" />
      </span>

      <span className="mx-auto flex min-w-0 max-w-[68%] items-center gap-1 rounded-full border border-border bg-background px-2 py-[3px] sm:gap-1.5 sm:px-2.5">
        <LockGlyph />
        <span className="truncate text-[9px] font-medium leading-none text-muted-foreground sm:text-[11px]">
          {label}
        </span>
      </span>

      <span className="hidden shrink-0 items-center gap-1.5 sm:flex">
        <span className="size-2 rounded-[3px] border border-muted-foreground/45" />
        <span className="size-2 rounded-[3px] border border-muted-foreground/45" />
      </span>
    </span>
  );
}

function ChevronGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 12 12"
      fill="none"
      className={cn("size-2.5", className)}
      aria-hidden
    >
      <path
        d="M7.5 2.5 L3.5 6 L7.5 9.5"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LockGlyph() {
  return (
    <svg
      viewBox="0 0 12 12"
      fill="none"
      className="size-2 shrink-0 text-muted-foreground/70 sm:size-2.5"
      aria-hidden
    >
      <path
        d="M4 5.2V3.9a2 2 0 0 1 4 0v1.3"
        stroke="currentColor"
        strokeWidth={1.3}
        strokeLinecap="round"
      />
      <rect x="2.6" y="5.2" width="6.8" height="4.9" rx="1.4" fill="currentColor" />
    </svg>
  );
}

/**
 * HeroFrameMedia — decorative fill for a device screen. `paper-grain` rides the
 * screen element itself (as a child span it would collapse: the unlayered
 * `.paper-grain` rule wins over Tailwind's `absolute`).
 */
function HeroFrameMedia({ frame }: { frame: HeroFrame }) {
  return (
    <img
      src={frame.media}
      alt=""
      aria-hidden
      decoding="async"
      className={cn(
        "absolute inset-0 h-full w-full object-cover",
        frame.mediaClass,
      )}
    />
  );
}

/**
 * HeroFrameCard — one window in the stack. Hover / keyboard focus lifts it
 * with a spring while its neighbours lean away (state-driven so the whole
 * shelf reacts together), a static shadow layer fades in (never animate
 * box-shadow), and a "Lihat fitur" chip appears; activating it scrolls to
 * the matching feature block (CSS smooth scroll, reduced-motion aware via
 * globals.css). The lifted card keeps its z-index until another card takes
 * over so it never pops under a neighbour mid-settle.
 */
function HeroFrameCard({
  frame,
  index,
  reduce,
  activeIndex,
  lastActiveIndex,
  onActiveChange,
}: {
  frame: HeroFrame;
  index: number;
  reduce: boolean | null;
  activeIndex: number | null;
  lastActiveIndex: number | null;
  onActiveChange: (index: number | null) => void;
}) {
  const isActive = activeIndex === index;

  // Neighbours lean away from the lifted card; further cards move less.
  const distance = activeIndex === null ? 0 : index - activeIndex;
  const shiftX =
    reduce || distance === 0
      ? 0
      : Math.sign(distance) * (Math.abs(distance) === 1 ? 14 : 6);
  const liftY = !reduce && isActive ? -14 : 0;
  // The lifted card straightens a little, like it's been picked up.
  const rotate = isActive ? frame.rotate * 0.35 : frame.rotate;

  const zIndex = isActive
    ? 40
    : lastActiveIndex === index
      ? 35
      : frame.zBase;

  const isPhone = frame.chrome === "phone";

  return (
    <m.a
      href={featureHash(frame.feature.id)}
      aria-label={`Lihat fitur: ${frame.feature.title}`}
      className={cn(
        "group absolute block outline-none",
        frame.positionClass,
      )}
      style={{ zIndex }}
      initial={reduce ? false : { opacity: 0, y: 64 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: reduce ? 0 : 0.55 + index * 0.09,
        type: "spring",
        stiffness: 170,
        damping: 21,
      }}
      onHoverStart={() => onActiveChange(index)}
      onHoverEnd={() => onActiveChange(null)}
      onFocus={(event) => {
        if (event.currentTarget.matches(":focus-visible")) {
          onActiveChange(index);
        }
      }}
      onBlur={() => onActiveChange(null)}
    >
      <m.span
        className="relative block"
        animate={{ x: shiftX, y: liftY, rotate }}
        transition={FRAME_SPRING}
      >
        {/* Static shadow layer, faded in — animating box-shadow itself janks. */}
        <m.span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 [box-shadow:0_3px_0_0_var(--border),var(--shadow-soft-card)]",
            isPhone ? "rounded-[1.9rem] sm:rounded-[2.2rem]" : "rounded-xl",
          )}
          initial={false}
          animate={{ opacity: isActive ? 1 : 0 }}
          transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
        />

        <span
          className={cn(
            "relative block overflow-hidden border-2 border-border bg-card group-focus-visible:border-ring group-focus-visible:ring-3 group-focus-visible:ring-ring/50",
            isPhone
              ? "rounded-[1.9rem] p-1 sm:rounded-[2.2rem] sm:p-1.5"
              : "rounded-xl",
          )}
        >
          {/* Browser chrome; the phone wears a bezel instead of a toolbar. */}
          {isPhone ? null : <SafariChrome label={frame.label} />}

          <span
            className={cn(
              "paper-grain relative block overflow-hidden",
              frame.aspectClass,
              isPhone && "rounded-[1.5rem] sm:rounded-[1.7rem]",
            )}
          >
            <HeroFrameMedia frame={frame} />

            {/* Dynamic island, sized in % so it scales with the frame width. */}
            {isPhone ? (
              <span
                aria-hidden
                className="absolute left-1/2 top-[1.6%] z-1 h-[3.2%] w-[36%] -translate-x-1/2 rounded-full bg-foreground"
              />
            ) : null}

            {/* Hover/focus CTA — asymmetric timing: enter 180ms, exit faster. */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-3 z-1 flex justify-center"
            >
              <m.span
                className={cn(
                  "lip-static inline-flex items-center gap-1 rounded-full border-2 border-border bg-background font-bold text-foreground",
                  isPhone
                    ? "px-2 py-0.5 text-[10px]"
                    : "px-3 py-1 text-xs",
                )}
                initial={false}
                animate={
                  isActive
                    ? { opacity: 1, y: 0 }
                    : { opacity: 0, y: reduce ? 0 : 6 }
                }
                transition={{
                  duration: isActive ? 0.18 : 0.13,
                  ease: [0.23, 1, 0.32, 1],
                }}
              >
                {frame.chipLabel}
                <ArrowDownIcon size={isPhone ? 11 : 14} />
              </m.span>
            </span>
          </span>
        </span>
      </m.span>
    </m.a>
  );
}

/**
 * LandingHeroSection — centered editorial hero on bg-background: faint
 * blueprint grid, pencil doodles in the margins, a static waitlist badge,
 * big centered heading, two design-system CTAs, and two device frames below —
 * a browser window with the phone leaning on its lower-right corner, each a
 * shortcut into the feature block it stands for.
 */
export function LandingHeroSection() {
  const reduce = useReducedMotion();
  // Frame stack hover state lives here so neighbours can react together.
  const [activeFrame, setActiveFrame] = useState<number | null>(null);
  const [lastActiveFrame, setLastActiveFrame] = useState<number | null>(null);

  const handleActiveFrameChange = (index: number | null) => {
    setActiveFrame(index);
    if (index !== null) setLastActiveFrame(index);
  };

  return (
    <section
      data-hero
      className="relative isolate w-full overflow-hidden bg-background"
      aria-label="Perkenalan Aqsha untuk riset dan karya tulis"
    >
      <div aria-hidden className="hero-grid pointer-events-none absolute inset-0" />
      <HeroDoodles />

      {/* Mobile: sedikit lebih pendek dari viewport (88svh) supaya frame stack
          utuh dan marquee di bawahnya ikut mengintip, tapi konten tetap
          seimbang di tengah; desktop tetap full viewport. */}
      <div className="relative z-20 mx-auto flex min-h-[88svh] w-full max-w-7xl flex-col sm:min-h-svh">
        {/* Mobile keeps a deliberate gap under the fixed header — pt-32 clears
            the 64px bar with room to breathe; desktop keeps its taller pt-40. */}
        <div className="flex flex-1 flex-col items-center justify-center px-4 pb-8 pt-32 text-center sm:px-6 sm:pb-10 sm:pt-40">
          <m.a
            href={WAITLIST_PATH}
            className="lip-static mb-6 inline-flex max-w-full items-center gap-2 rounded-full border-2 border-border bg-card py-1 pl-1.5 pr-3.5 text-sm text-foreground transition-colors hover:bg-muted"
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: EASE_OUT }}
          >
            <span className="shrink-0 rounded-full border-2 border-coral-soft-border bg-coral-soft px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-coral-foreground">
              Waitlist
            </span>
            <span className="min-w-0 truncate">Gabung untuk akses awal</span>
          </m.a>

          <m.h1
            className="font-heading max-w-3xl text-balance text-[2.6rem] font-medium leading-[1.08] tracking-normal text-foreground sm:text-6xl sm:leading-[1.05] lg:text-[4.25rem]"
            initial={
              reduce ? false : { clipPath: "inset(0 100% 0 0)", opacity: 0.25 }
            }
            animate={{ clipPath: "inset(0 0% 0 0)", opacity: 1 }}
            transition={{ duration: 0.95, ease: EASE_OUT }}
          >
            Kenalan sama Astra, AI asisten risetmu.
          </m.h1>

          <m.p
            className="mt-5 max-w-xl text-pretty text-sm leading-relaxed text-foreground/80 sm:mt-6 sm:text-base sm:leading-relaxed"
            initial={reduce ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12, duration: 0.55, ease: EASE_OUT }}
          >
            Cari sumber, susun draf, dan biarkan format tetap tertata. Dengan akses ke 322+ juta literatur ilmiah, Aqsha memberi kamu lebih banyak waktu untuk meneliti—bukan membetulkan layout.
          </m.p>

          <m.div
            className="mt-8 flex flex-wrap items-center justify-center gap-3 sm:mt-9"
            variants={buttonContainer}
            initial="hidden"
            animate="show"
          >
            <m.div variants={buttonItem(reduce)}>
              <MagneticButton radius={140} strength={0.35}>
                <Button asChild size="lg">
                  <a href={WAITLIST_PATH}>Gabung waitlist</a>
                </Button>
              </MagneticButton>
            </m.div>
            <m.div variants={buttonItem(reduce)}>
              <Button asChild variant="outline" size="lg">
                <a href="#cara-kerja">Lihat cara kerjanya</a>
              </Button>
            </m.div>
          </m.div>
        </div>

        {/* Device stack — fully visible above the hero's bottom edge. The
            container's aspect tracks the tallest frame (widths are % of the
            container, so heights scale with it); bottom margin leaves room
            for the tilted corners and the hover shadow. */}
        <div className="relative mx-auto mb-6 aspect-[7/4] w-full max-w-7xl sm:mb-8 sm:aspect-[2/1]">
          {HERO_FRAMES.map((frame, index) => (
            <HeroFrameCard
              key={frame.key}
              frame={frame}
              index={index}
              reduce={reduce}
              activeIndex={activeFrame}
              lastActiveIndex={lastActiveFrame}
              onActiveChange={handleActiveFrameChange}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
