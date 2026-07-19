"use client";

import {
  m,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "motion/react";
import type { ReactNode } from "react";

type ScrollParallaxProps = {
  /** Window `scrollY` from a shared `useScroll()` at the parent. */
  scrollY: MotionValue<number>;
  /** Multiplier of `scrollY` → `translateY` (px). Negative drifts opposite. */
  speed: number;
  className?: string;
  children: ReactNode;
};

/**
 * ScrollParallax — decorative drift via Motion. Parent owns `useScroll` so
 * sibling layers share one source (same stack as FeatureFrame / chrome).
 */
export function ScrollParallax({
  scrollY,
  speed,
  className,
  children,
}: ScrollParallaxProps) {
  const reduce = useReducedMotion();
  const y = useTransform(scrollY, (value) => value * speed);

  return (
    <m.div className={className} style={reduce ? undefined : { y }}>
      {children}
    </m.div>
  );
}
