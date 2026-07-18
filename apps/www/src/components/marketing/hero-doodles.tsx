"use client";

import { m, useReducedMotion, useScroll } from "motion/react";

import {
  DrawnArrow,
  HandNote,
  Spark,
  Starburst,
  drawAnimate,
  drawInitial,
  drawTransition,
} from "@/components/marketing/doodles";
import { ScrollParallax } from "@/components/marketing/scroll-parallax";
import { EASE_OUT } from "@/lib/motion";

/**
 * HeroDoodles — margin doodles around the centered hero, mirroring the
 * onboarding JourneyOrnaments language: pencil strokes (stroke-3, round caps),
 * starbursts, a tangle-to-spark arrow, a swoosh pointing at the frame stack,
 * and one hand note in Caveat. Fully decorative (aria-hidden,
 * pointer-events-none) and hidden below lg where the margins are too narrow.
 * Strokes draw themselves in after the headline; reduced motion renders them
 * static. Scroll drift uses Motion (same stack as FeatureFrame).
 */
export function HeroDoodles() {
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();

  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 hidden select-none lg:block"
      aria-hidden
    >
      {/* Top-left: starburst + hand note beside the headline. */}
      <ScrollParallax
        scrollY={scrollY}
        speed={0.08}
        className="absolute left-[4%] top-[26%] w-48 xl:left-[7%]"
      >
        <Starburst className="ml-8 rotate-6" delay={0.75} mode="animate" />
        <HandNote className="mt-2 -rotate-3" delay={0.85} mode="animate">
          tiap klaim ada sumbernya
        </HandNote>
      </ScrollParallax>

      {/* Top-right: tangle-to-spark — the messy idea resolving into a direction.
          Spark path stays in-viewBox so it sits at the tip of the tangle. */}
      <ScrollParallax
        scrollY={scrollY}
        speed={-0.05}
        className="absolute right-[3%] top-[22%] w-40 xl:right-[6%]"
      >
        <svg viewBox="0 0 130 96" fill="none" className="h-24 w-32 text-lavender">
          <m.path
            d="M122 78 C 112 52, 86 46, 90 64 C 93 78, 114 76, 106 58 C 96 36, 66 32, 40 27"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            initial={drawInitial(reduce)}
            animate={drawAnimate}
            transition={drawTransition(0.8)}
          />
          <m.path
            d="M51 17 L37 26 L49 37"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={drawInitial(reduce)}
            animate={drawAnimate}
            transition={drawTransition(1.35, 0.2)}
          />
          <m.path
            d="M14 4 L16.8 12.2 L25 15 L16.8 17.8 L14 26 L11.2 17.8 L3 15 L11.2 12.2 Z"
            fill="currentColor"
            strokeLinejoin="round"
            initial={reduce ? false : { opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 1.45, duration: 0.3, ease: EASE_OUT }}
          />
        </svg>
      </ScrollParallax>

      {/* Mid-left: swoosh diving toward the frame stack below. Gentlest speed
          so it keeps roughly pointing at the frame stack while drifting. */}
      <ScrollParallax
        scrollY={scrollY}
        speed={0.04}
        className="absolute bottom-[40%] left-[3%] xl:left-[5%]"
      >
        <DrawnArrow
          className="h-20 w-40 text-mint"
          viewBox="0 0 160 90"
          curve="M8 12 C 40 10, 104 24, 138 66"
          head="M118 62 L140 68 L136 46"
          delay={1.0}
          headDelay={1.55}
          mode="animate"
        />
      </ScrollParallax>

      {/* Mid-right: pencil cloud + tiny spark, echoing the reference's sky props. */}
      <ScrollParallax
        scrollY={scrollY}
        speed={0.1}
        className="absolute bottom-[32%] right-[4%] xl:right-[7%]"
      >
        <m.svg
          viewBox="0 0 64 44"
          fill="none"
          className="h-11 w-16 -rotate-2 text-muted-foreground/70"
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2, duration: 0.45, ease: EASE_OUT }}
        >
          <path
            d="M12 32 C 6 30, 6 21, 13 20 C 13 12, 24 9, 29 14 C 32 8, 43 8, 45 15 C 53 14, 57 22, 52 27 C 56 32, 51 37, 46 36 L 16 36 C 13 36, 11 34, 12 32 Z"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </m.svg>
        <Spark className="ml-[-14px] mt-1" delay={1.35} mode="animate" />
      </ScrollParallax>
    </div>
  );
}
