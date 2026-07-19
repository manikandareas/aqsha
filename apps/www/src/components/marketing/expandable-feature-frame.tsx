"use client";

import { m, useReducedMotion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";

import { FRAME_SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";

const PORTRAIT_RATIO = 4 / 5;
const LANDSCAPE_RATIO = 16 / 10;

/**
 * Hover expand only on 2-up layouts with a real pointer —
 * below lg (or touch) the static footprint fills via aspect classes.
 */
export function useCanExpand() {
  const [canExpand, setCanExpand] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(
      "(min-width: 1024px) and (hover: hover) and (pointer: fine)",
    );
    const update = () => setCanExpand(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return canExpand;
}

type ExpandableFeatureFrameProps = {
  grow: boolean;
  lean: boolean;
  /** Even cells expand right; odd cells expand left toward their partner. */
  anchorLeft: boolean;
  children: ReactNode;
};

/**
 * ExpandableFeatureFrame — portrait footprint overlay that grows to landscape
 * on hover and leans away when the partner cell is active. Same spring language
 * as the hero shelf (`FRAME_SPRING`).
 */
export function ExpandableFeatureFrame({
  grow,
  lean,
  anchorLeft,
  children,
}: ExpandableFeatureFrameProps) {
  const reduce = useReducedMotion();

  return (
    <m.div
      className={cn("absolute top-0", anchorLeft ? "left-0" : "right-0")}
      initial={false}
      animate={{
        width: grow ? "150%" : "100%",
        aspectRatio: grow ? LANDSCAPE_RATIO : PORTRAIT_RATIO,
        y: grow ? -10 : 0,
        x: lean ? (anchorLeft ? -12 : 12) : 0,
        rotate: lean ? (anchorLeft ? -2 : 2) : 0,
        scale: lean ? 0.97 : 1,
      }}
      transition={reduce ? { duration: 0 } : FRAME_SPRING}
    >
      {/* Static shadow layer faded in — never animate box-shadow. */}
      <m.div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-2xl shadow-2xl"
        initial={false}
        animate={{ opacity: grow ? 1 : 0 }}
        transition={reduce ? { duration: 0 } : FRAME_SPRING}
      />
      {children}
    </m.div>
  );
}
