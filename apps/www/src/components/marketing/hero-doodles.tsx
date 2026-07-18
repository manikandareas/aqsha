"use client";

import { m, useReducedMotion } from "motion/react";

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * HeroDoodles — margin doodles around the centered hero, mirroring the
 * onboarding JourneyOrnaments language: pencil strokes (stroke-3, round caps),
 * starbursts, a tangle-to-spark arrow, a swoosh pointing at the frame stack,
 * and one hand note in Caveat. Fully decorative (aria-hidden,
 * pointer-events-none) and hidden below lg where the margins are too narrow.
 * Strokes draw themselves in after the headline; reduced motion renders them
 * static.
 */
export function HeroDoodles() {
  const reduce = useReducedMotion();

  const drawInitial = (reduce: boolean | null) =>
    reduce ? false : { pathLength: 0, opacity: 0 };
  const drawAnimate = { pathLength: 1, opacity: 1 };
  const drawTransition = (delay: number) => ({
    delay,
    duration: 0.62,
    ease: EASE,
  });

  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 hidden select-none lg:block"
      aria-hidden
    >
      {/* Top-left: starburst + hand note beside the headline. */}
      <div className="absolute left-[4%] top-[26%] w-48 xl:left-[7%]">
        <m.svg
          viewBox="0 0 40 40"
          fill="none"
          className="ml-8 size-9 rotate-6 text-coral"
          initial={reduce ? false : { opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.75, duration: 0.4, ease: EASE }}
        >
          <g stroke="currentColor" strokeWidth={3} strokeLinecap="round">
            <path d="M20 3.5 L20 12.5" />
            <path d="M31.5 8.5 L26.4 14.6" />
            <path d="M36.5 20.5 L28 20.2" />
            <path d="M31 31.5 L25.8 26" />
            <path d="M19.6 36.5 L20 28" />
            <path d="M8.6 31.6 L14.2 26.4" />
            <path d="M3.5 19.6 L12 20" />
            <path d="M8.2 8.8 L14 14.4" />
          </g>
        </m.svg>
        <m.p
          className="font-hand mt-2 -rotate-3 text-2xl leading-tight text-muted-foreground"
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.85, duration: 0.45, ease: EASE }}
        >
          tiap klaim ada sumbernya
        </m.p>
      </div>

      {/* Top-right: tangle-to-spark — the messy idea resolving into a direction. */}
      <div className="absolute right-[3%] top-[22%] w-40 xl:right-[6%]">
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
            transition={{ delay: 1.35, duration: 0.2, ease: EASE }}
          />
          <m.path
            d="M14 4 L16.8 12.2 L25 15 L16.8 17.8 L14 26 L11.2 17.8 L3 15 L11.2 12.2 Z"
            fill="currentColor"
            strokeLinejoin="round"
            initial={reduce ? false : { opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 1.45, duration: 0.3, ease: EASE }}
          />
        </svg>
      </div>

      {/* Mid-left: swoosh diving toward the frame stack below. */}
      <svg
        viewBox="0 0 160 90"
        fill="none"
        className="absolute bottom-[40%] left-[3%] h-20 w-40 text-mint xl:left-[5%]"
      >
        <m.path
          d="M8 12 C 40 10, 104 24, 138 66"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          initial={drawInitial(reduce)}
          animate={drawAnimate}
          transition={drawTransition(1.0)}
        />
        <m.path
          d="M118 62 L140 68 L136 46"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={drawInitial(reduce)}
          animate={drawAnimate}
          transition={{ delay: 1.55, duration: 0.2, ease: EASE }}
        />
      </svg>

      {/* Mid-right: pencil cloud + tiny spark, echoing the reference's sky props. */}
      <div className="absolute bottom-[32%] right-[4%] xl:right-[7%]">
        <m.svg
          viewBox="0 0 64 44"
          fill="none"
          className="h-11 w-16 -rotate-2 text-muted-foreground/70"
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2, duration: 0.45, ease: EASE }}
        >
          <path
            d="M12 32 C 6 30, 6 21, 13 20 C 13 12, 24 9, 29 14 C 32 8, 43 8, 45 15 C 53 14, 57 22, 52 27 C 56 32, 51 37, 46 36 L 16 36 C 13 36, 11 34, 12 32 Z"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </m.svg>
        <m.svg
          viewBox="0 0 32 32"
          fill="none"
          className="ml-[-14px] mt-1 size-6 text-lemon"
          initial={reduce ? false : { opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 1.35, duration: 0.3, ease: EASE }}
        >
          <path
            d="M16 4 L18.4 13.6 L28 16 L18.4 18.4 L16 28 L13.6 18.4 L4 16 L13.6 13.6 Z"
            fill="currentColor"
            strokeLinejoin="round"
          />
        </m.svg>
      </div>
    </div>
  );
}
