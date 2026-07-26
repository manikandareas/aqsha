"use client";

import { m, useReducedMotion, type Transition } from "motion/react";
import type { ReactNode } from "react";

import { EASE_OUT, IN_VIEW_ONCE } from "@/lib/motion";
import { cn } from "@/lib/utils";

type RevealMode = "animate" | "inView";

type DoodleBaseProps = {
  className?: string;
  delay?: number;
  /** Hero uses mount `animate`; below-fold sections use `whileInView`. */
  mode?: RevealMode;
};

export function drawInitial(reduce: boolean | null) {
  return reduce ? false : { pathLength: 0, opacity: 0 };
}

export const drawAnimate = { pathLength: 1, opacity: 1 };

export function drawTransition(
  delay: number,
  duration = 0.62,
): Transition {
  return { delay, duration, ease: EASE_OUT };
}

function revealProps(
  reduce: boolean | null,
  mode: RevealMode,
  initial: false | Record<string, number>,
  shown: Record<string, number>,
  transition: Transition,
) {
  if (mode === "animate") {
    return {
      initial: reduce ? false : initial,
      animate: shown,
      transition,
    };
  }
  return {
    initial: reduce ? false : initial,
    whileInView: shown,
    viewport: IN_VIEW_ONCE,
    transition,
  };
}

/** Radial pencil starburst — shared by hero + why headline. */
export function Starburst({
  className,
  delay = 0,
  mode = "inView",
}: DoodleBaseProps) {
  const reduce = useReducedMotion();
  return (
    <m.svg
      aria-hidden
      viewBox="0 0 40 40"
      fill="none"
      className={cn("size-9 text-coral", className)}
      {...revealProps(
        reduce,
        mode,
        { opacity: 0, scale: 0.6 },
        { opacity: 1, scale: 1 },
        { delay, duration: 0.4, ease: EASE_OUT },
      )}
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
  );
}

/** Filled 8-point spark — shared by hero + teaser CSS twin. */
export function Spark({
  className,
  delay = 0,
  mode = "inView",
}: DoodleBaseProps) {
  const reduce = useReducedMotion();
  return (
    <m.svg
      aria-hidden
      viewBox="0 0 32 32"
      fill="none"
      className={cn("size-6 text-lemon", className)}
      {...revealProps(
        reduce,
        mode,
        { opacity: 0, scale: 0.5 },
        { opacity: 1, scale: 1 },
        { delay, duration: 0.3, ease: EASE_OUT },
      )}
    >
      <path
        d="M16 4 L18.4 13.6 L28 16 L18.4 18.4 L16 28 L13.6 18.4 L4 16 L13.6 13.6 Z"
        fill="currentColor"
        strokeLinejoin="round"
      />
    </m.svg>
  );
}

/** Caveat hand note with a soft rise entrance. */
export function HandNote({
  children,
  className,
  delay = 0,
  mode = "inView",
}: DoodleBaseProps & { children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <m.p
      aria-hidden
      className={cn(
        "font-hand text-xl leading-tight text-muted-foreground sm:text-2xl",
        className,
      )}
      {...revealProps(
        reduce,
        mode,
        { opacity: 0, y: 6 },
        { opacity: 1, y: 0 },
        { delay, duration: 0.45, ease: EASE_OUT },
      )}
    >
      {children}
    </m.p>
  );
}

/**
 * Squiggle underline for one highlighted word. Sits absolutely inside a
 * `relative inline-block` wrapper around the word it underlines.
 */
export function HandUnderline({
  className,
  delay = 0.35,
  duration = 0.55,
  mode = "inView",
}: DoodleBaseProps & { duration?: number }) {
  const reduce = useReducedMotion();
  const pathReveal =
    mode === "animate"
      ? { initial: drawInitial(reduce), animate: drawAnimate }
      : {
          initial: drawInitial(reduce),
          whileInView: drawAnimate,
          viewport: IN_VIEW_ONCE,
        };

  return (
    <svg
      aria-hidden
      viewBox="0 0 120 12"
      fill="none"
      preserveAspectRatio="none"
      className={cn("absolute -bottom-1 left-0 h-2 w-full text-primary", className)}
    >
      <m.path
        d="M3 8 C 7 3, 11 3, 15 8 S 23 13, 27 8 S 35 3, 39 8 S 47 13, 51 8 S 59 3, 63 8 S 71 13, 75 8 S 83 3, 87 8 S 95 13, 99 8 S 107 3, 111 8 L 117 8"
        stroke="currentColor"
        strokeWidth={3.5}
        strokeLinecap="round"
        {...pathReveal}
        transition={drawTransition(delay, duration)}
      />
    </svg>
  );
}

type DrawnArrowProps = DoodleBaseProps & {
  /** Curve path in the local viewBox. */
  curve: string;
  /** Arrowhead path that draws after the curve. */
  head: string;
  viewBox?: string;
  headDelay?: number;
};

/** Pencil curve + arrowhead that draw themselves in. */
export function DrawnArrow({
  className,
  curve,
  head,
  viewBox = "0 0 90 60",
  delay = 0.5,
  headDelay,
  mode = "inView",
}: DrawnArrowProps) {
  const reduce = useReducedMotion();
  const headStart = headDelay ?? delay + 0.45;
  const pathReveal =
    mode === "animate"
      ? {
          initial: drawInitial(reduce),
          animate: drawAnimate,
        }
      : {
          initial: drawInitial(reduce),
          whileInView: drawAnimate,
          viewport: IN_VIEW_ONCE,
        };

  return (
    <svg
      aria-hidden
      viewBox={viewBox}
      fill="none"
      className={cn("h-12 w-[4.6rem] text-coral", className)}
    >
      <m.path
        d={curve}
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        {...pathReveal}
        transition={drawTransition(delay, 0.5)}
      />
      <m.path
        d={head}
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...pathReveal}
        transition={drawTransition(headStart, 0.2)}
      />
    </svg>
  );
}

/**
 * Hand note + arrow sitting beside a primary CTA (flex sibling — no magic
 * pixel offset against button width).
 */
export function CtaHandArrow({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none hidden select-none sm:block",
        className,
      )}
    >
      <HandNote className="rotate-2" delay={0.35}>
        mulai dari sini
      </HandNote>
      <DrawnArrow
        className="mt-1"
        curve="M74 8 C 66 32, 46 44, 18 47"
        head="M34 36 L16 47 L35 56"
        delay={0.5}
        headDelay={0.95}
      />
    </div>
  );
}
