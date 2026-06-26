"use client";

import type { ReactNode } from "react";
import { m, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

type LibraryCardFrameProps = {
  as?: "article" | "div";
  selected?: boolean;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

export function LibraryCardFrame({
  as = "div",
  selected = false,
  children,
  className,
  contentClassName,
}: LibraryCardFrameProps) {
  const shouldReduceMotion = useReducedMotion();
  const Component = as;

  return (
    <Component
      className={cn(
        "group relative aspect-[8/9] w-full min-w-0 min-h-[240px] sm:min-h-[300px] rounded-[20px] [perspective:900px]",
        selected && "ring-2 ring-primary/25",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-y-1 left-2 right-0 rounded-[18px] border border-border/85 bg-background opacity-0 motion-safe:transition-[opacity,transform] motion-safe:duration-200 motion-safe:ease-out motion-safe:group-hover:translate-x-2 motion-safe:group-hover:opacity-100" />
      <div className="pointer-events-none absolute inset-y-2 left-3 right-0 rounded-[17px] border border-border/75 bg-card opacity-0 motion-safe:transition-[opacity,transform] motion-safe:duration-200 motion-safe:ease-out motion-safe:group-hover:translate-x-3 motion-safe:group-hover:opacity-100" />
      <div className="pointer-events-none absolute inset-y-3 left-4 right-0 rounded-[16px] border border-border/65 bg-background opacity-0 motion-safe:transition-[opacity,transform] motion-safe:duration-200 motion-safe:ease-out motion-safe:group-hover:translate-x-4 motion-safe:group-hover:opacity-100" />
      <m.div
        className={cn(
          "relative z-[1] flex size-full min-h-0 flex-col overflow-hidden rounded-[20px] border bg-card shadow-none transition-[border-color,box-shadow] duration-150 ease-out",
          selected ? "border-primary/50" : "border-border",
          contentClassName,
        )}
        whileHover={
          shouldReduceMotion
            ? undefined
            : {
                rotateY: -5,
                rotateX: 0.75,
                y: -2,
              }
        }
        transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.7 }}
      >
        <span className="pointer-events-none absolute inset-y-0 right-0 w-1.5 bg-border/60 opacity-0 motion-safe:transition-opacity motion-safe:duration-150 motion-safe:group-hover:opacity-100" />
        {children}
      </m.div>
    </Component>
  );
}
