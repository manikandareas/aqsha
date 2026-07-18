"use client";

import { useState } from "react";
import { m, useReducedMotion } from "motion/react";

import { ArrowDownIcon } from "@/components/icons";
import { HeroDoodles } from "@/components/marketing/hero-doodles";
import { MagneticButton } from "@/components/marketing/magnetic-button";
import { Button } from "@/components/ui/button";
import { appUrl } from "@/lib/app-url";
import { cn } from "@/lib/utils";
import type { LatestUpdate } from "@/lib/marketing/latest";

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
 * HERO_FRAMES — the frame stack at the hero's base: the four feature frames
 * from FeatureBlocksSection restaged as overlapping app windows, fully
 * visible (no bottom clipping). Each is a link that scrolls to its feature
 * block. Positions are % of the collage container per breakpoint; rotation
 * is animated by motion so it composes with the hover transform.
 */
const HERO_FRAMES = [
  {
    key: "workspace",
    image: "/landing/frame-workspace.webp",
    label: "Workspace",
    title: "Semua sumber di satu tempat",
    href: "#fitur-workspace",
    dotClass: "bg-mint",
    aspectClass: "aspect-[4/3]",
    positionClass: "left-[-4%] bottom-0 w-[40%] sm:left-[1%] sm:w-[27%]",
    rotate: -2,
    zBase: 20,
  },
  {
    key: "astra",
    image: "/landing/frame-astra.webp",
    label: "Nulis bareng Astra",
    title: "Nulis bareng Astra",
    href: "#fitur-astra",
    dotClass: "bg-lavender",
    aspectClass: "aspect-[16/11]",
    positionClass:
      "left-[34%] bottom-[6%] w-[50%] sm:left-[21.5%] sm:bottom-[8%] sm:w-[36%]",
    rotate: 0.8,
    zBase: 10,
  },
  {
    key: "citations",
    image: "/landing/frame-citations.webp",
    label: "Cek sitasi",
    title: "Tiap sumber dicek ke aslinya",
    href: "#fitur-citations",
    dotClass: "bg-coral",
    aspectClass: "aspect-[4/3]",
    positionClass:
      "left-[68%] bottom-[2%] w-[42%] sm:left-[46.5%] sm:bottom-[2%] sm:w-[32%]",
    rotate: 1.6,
    zBase: 30,
  },
  {
    key: "provenance",
    image: "/landing/frame-provenance.webp",
    label: "Jejak proses",
    title: "Jejak prosesmu tersimpan",
    href: "#fitur-provenance",
    dotClass: "bg-lemon",
    aspectClass: "aspect-[4/3]",
    positionClass: "hidden sm:block sm:left-[73%] sm:bottom-0 sm:w-[27%]",
    rotate: -1.6,
    zBase: 20,
  },
] as const;

type HeroFrame = (typeof HERO_FRAMES)[number];

/** One shared spring for lift + neighbour shifts: fast settle, no bounce. */
const STACK_SPRING = {
  type: "spring",
  stiffness: 400,
  damping: 30,
  mass: 0.8,
} as const;

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

  return (
    <m.a
      href={frame.href}
      aria-label={`Lihat fitur: ${frame.title}`}
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
        transition={STACK_SPRING}
      >
        {/* Static shadow layer, faded in — animating box-shadow itself janks. */}
        <m.span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-xl [box-shadow:0_3px_0_0_var(--border),var(--shadow-soft-card)]"
          initial={false}
          animate={{ opacity: isActive ? 1 : 0 }}
          transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
        />

        <span className="relative block overflow-hidden rounded-xl border-2 border-border bg-card group-focus-visible:border-ring group-focus-visible:ring-3 group-focus-visible:ring-ring/50">
          {/* Window title bar */}
          <span className="flex items-center gap-1.5 border-b-2 border-border bg-card px-2.5 py-1.5 sm:gap-2 sm:px-3 sm:py-2">
            <span
              aria-hidden
              className={cn("size-2 shrink-0 rounded-full", frame.dotClass)}
            />
            <span className="truncate text-[11px] font-bold leading-none text-foreground sm:text-xs">
              {frame.label}
            </span>
          </span>

          <span className={cn("relative block", frame.aspectClass)}>
            <img
              src={frame.image}
              alt=""
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <span aria-hidden className="paper-grain absolute inset-0" />

            {/* Hover/focus CTA — asymmetric timing: enter 180ms, exit faster. */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center"
            >
              <m.span
                className="lip-static inline-flex items-center gap-1 rounded-full border-2 border-border bg-background px-3 py-1 text-xs font-bold text-foreground"
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
                Lihat fitur
                <ArrowDownIcon size={14} />
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
 * blueprint grid, pencil doodles in the margins, big centered heading, two
 * design-system CTAs, and an overlapping stack of feature frames clipped by
 * the hero's bottom edge (each one a shortcut into its feature block).
 */
export function LandingHeroSection({
  latestUpdate,
}: {
  latestUpdate: LatestUpdate | null;
}) {
  const reduce = useReducedMotion();
  // Frame stack hover state lives here so neighbours can react together.
  const [activeFrame, setActiveFrame] = useState<number | null>(null);
  const [lastActiveFrame, setLastActiveFrame] = useState<number | null>(null);

  const handleActiveFrameChange = (index: number | null) => {
    setActiveFrame(index);
    if (index !== null) setLastActiveFrame(index);
  };

  const showLatestBadge = true;

  return (
    <section
      data-hero
      className="relative isolate w-full overflow-hidden bg-background"
      aria-label="Perkenalan Astra, asisten riset Aqsha"
    >
      <div aria-hidden className="hero-grid pointer-events-none absolute inset-0" />
      <HeroDoodles />

      {/* Mobile: sedikit lebih pendek dari viewport (88svh) supaya frame stack
          utuh dan marquee di bawahnya ikut mengintip, tapi konten tetap
          seimbang di tengah; desktop tetap full viewport. */}
      <div className="relative z-20 mx-auto flex min-h-[88svh] w-full max-w-7xl flex-col sm:min-h-svh">
        <div className="flex flex-1 flex-col items-center justify-center px-4 pb-8 pt-24 text-center sm:px-6 sm:pb-10 sm:pt-40">
          {showLatestBadge && latestUpdate && (
            <m.a
              href={latestUpdate.href}
              className="lip-static mb-6 inline-flex max-w-full items-center gap-2 rounded-full border-2 border-border bg-card py-1 pl-1.5 pr-3.5 text-sm text-foreground transition-colors hover:bg-muted"
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className="shrink-0 rounded-full border-2 border-coral-soft-border bg-coral-soft px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-coral-foreground">
                {latestUpdate.tag}
              </span>
              <span className="min-w-0 truncate">{latestUpdate.title}</span>
            </m.a>
          )}

          <m.h1
            className="font-heading max-w-3xl text-balance text-[2.6rem] font-medium leading-[1.08] tracking-normal text-foreground sm:text-6xl sm:leading-[1.05] lg:text-[4.25rem]"
            initial={
              reduce ? false : { clipPath: "inset(0 100% 0 0)", opacity: 0.25 }
            }
            animate={{ clipPath: "inset(0 0% 0 0)", opacity: 1 }}
            transition={{ duration: 0.95, ease: [0.22, 1, 0.36, 1] }}
          >
            Kenalan sama Astra, asisten risetmu
          </m.h1>

          <m.p
            className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-foreground/80 sm:mt-6 sm:text-lg sm:leading-relaxed"
            initial={reduce ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          >
            Aqsha itu ruang kerja AI tempat kamu baca, nulis, dan sitasi — tiap
            klaim tetap bisa dilacak balik ke paper aslinya.
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
                  <a href={appUrl("/sign-up")}>Mulai gratis</a>
                </Button>
              </MagneticButton>
            </m.div>
            <m.div variants={buttonItem(reduce)}>
              <Button asChild variant="outline" size="lg">
                <a href="#bandingin">Bandingin sama yang lain</a>
              </Button>
            </m.div>
          </m.div>
        </div>

        {/* Frame stack — fully visible above the hero's bottom edge. The
            container's aspect tracks the tallest frame (widths are % of the
            container, so heights scale with it); bottom margin leaves room
            for the tilted corners and the hover shadow. */}
        <div className="relative mx-auto mb-6 aspect-[7/3] w-full max-w-7xl sm:mb-8 sm:aspect-[3/1]">
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
