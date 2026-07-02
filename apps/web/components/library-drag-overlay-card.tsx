"use client";

import { m, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

const MAX_VISIBLE_PILLS = 3;

/**
 * macOS-Finder-style drag preview: a compact capsule showing just the filename
 * that follows the pointer. Dragging a multi-selection fans the capsules into a
 * short diagonal cascade — the grabbed item on top, the rest peeking below —
 * with a count badge for the true total. Reduced-motion users get static pills.
 * The board centers this on the cursor, so it stays compact and pointer-anchored.
 */
export function LibraryDragOverlayCard({ titles }: { titles: string[] }) {
  const shouldReduceMotion = useReducedMotion();
  const total = titles.length;
  if (total === 0) return null;

  const [primaryTitle, ...restTitles] = titles;
  const cascade = restTitles.slice(0, MAX_VISIBLE_PILLS - 1);
  const pillBase =
    "max-w-[13rem] truncate rounded-full border border-border bg-card px-3 py-1.5 text-[12px] leading-none text-foreground";

  return (
    <m.div
      initial={shouldReduceMotion ? false : { scale: 0.9, opacity: 0.5 }}
      animate={{ scale: 1, opacity: 1, rotate: shouldReduceMotion ? 0 : -3 }}
      transition={{ type: "spring", stiffness: 520, damping: 30, mass: 0.6 }}
      className="pointer-events-none relative w-fit cursor-grabbing select-none"
    >
      {cascade.map((title, index) => {
        // Fan each trailing pill a fixed step further down-right and dimmer, so
        // the cascade scales with MAX_VISIBLE_PILLS instead of hardcoding offsets
        // per index (Tailwind can't take a computed translate as a static class).
        const depth = index + 1;
        return (
          <span
            key={`${index}-${title}`}
            className={cn("absolute left-0 top-0 block font-medium shadow-lg", pillBase)}
            style={{
              transform: `translate(${depth * 8}px, ${depth * 22}px)`,
              opacity: 0.9 - index * 0.2,
              zIndex: -depth * 10,
            }}
          >
            {title}
          </span>
        );
      })}
      <span
        className={cn(
          "relative z-0 block font-semibold shadow-2xl shadow-foreground/25 ring-1 ring-foreground/5",
          pillBase,
        )}
      >
        {primaryTitle}
      </span>
      {total > 1 ? (
        <span className="absolute -right-2 -top-2 z-10 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-[12px] font-semibold leading-none text-primary-foreground shadow-md ring-2 ring-background">
          {total}
        </span>
      ) : null}
    </m.div>
  );
}
