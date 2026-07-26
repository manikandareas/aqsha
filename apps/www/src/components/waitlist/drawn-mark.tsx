"use client";

import { m, useReducedMotion } from "motion/react";

import { drawAnimate, drawInitial, drawTransition } from "@/components/marketing/doodles";
import { cn } from "@/lib/utils";

type Tone = "success" | "error";

const TONE: Record<Tone, { ring: string; ink: string }> = {
  success: {
    ring: "bg-[var(--mint-soft)] [border-color:var(--mint-soft-border)]",
    ink: "text-[var(--mint-foreground)]",
  },
  error: {
    ring: "bg-[var(--coral-soft)] [border-color:var(--coral-soft-border)]",
    ink: "text-[var(--coral-foreground)]",
  },
};

/**
 * DrawnMark — centang atau silang bergaya pensil yang menggambar dirinya
 * sendiri di dalam lingkaran bertepi 2px. Stroke pakai bahasa doodle landing
 * (stroke-3, round cap); reduced motion langsung menampilkan hasil akhirnya.
 */
export function DrawnMark({
  tone,
  className,
}: {
  tone: Tone;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const palette = TONE[tone];

  return (
    <m.span
      aria-hidden
      className={cn(
        "inline-flex size-14 items-center justify-center rounded-full border-2",
        palette.ring,
        className,
      )}
      initial={reduce ? false : { scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 380, damping: 18 }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className={cn("size-7", palette.ink)}
      >
        {tone === "success" ? (
          <m.path
            d="M5.5 12.5 L10 17 L18.5 7.5"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={drawInitial(reduce)}
            animate={drawAnimate}
            transition={drawTransition(0.12, 0.4)}
          />
        ) : (
          <>
            <m.path
              d="M7 7 L17 17"
              stroke="currentColor"
              strokeWidth={3}
              strokeLinecap="round"
              initial={drawInitial(reduce)}
              animate={drawAnimate}
              transition={drawTransition(0.12, 0.24)}
            />
            <m.path
              d="M17 7 L7 17"
              stroke="currentColor"
              strokeWidth={3}
              strokeLinecap="round"
              initial={drawInitial(reduce)}
              animate={drawAnimate}
              transition={drawTransition(0.3, 0.24)}
            />
          </>
        )}
      </svg>
    </m.span>
  );
}
