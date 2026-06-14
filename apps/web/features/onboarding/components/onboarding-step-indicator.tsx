"use client";

import { AnimatePresence, m, useReducedMotion } from "motion/react";

const pad = (n: number) => String(n).padStart(2, "0");

// Deliberately not a progress bar. A quiet monospace counter ("01 / 03") with
// the active number lit and the current section named — minimal and
// typographic rather than the usual filled bar or dots.
export function OnboardingStepIndicator({
  index,
  total,
  label,
}: {
  index: number;
  total: number;
  label: string;
}) {
  const reduce = useReducedMotion();
  return (
    <div className="mb-8 flex items-center gap-3 font-mono text-xs tracking-[0.2em] text-muted-foreground">
      <span className="relative inline-block w-[1.4em] text-center text-foreground">
        <AnimatePresence mode="wait" initial={false}>
          <m.span
            key={pad(index)}
            className="inline-block"
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            {pad(index)}
          </m.span>
        </AnimatePresence>
      </span>
      <span aria-hidden className="text-muted-foreground/40">
        /
      </span>
      <span>{pad(total)}</span>
      <span aria-hidden className="h-3 w-px bg-border" />
      <span className="tracking-normal">{label}</span>
    </div>
  );
}
