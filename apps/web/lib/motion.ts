"use client";

import { useEffect, useRef } from "react";
import {
  useMotionValue,
  useSpring,
  useScroll,
  useTransform,
  useReducedMotion,
  type MotionValue,
} from "motion/react";

type MagneticOptions = {
  /** Radius (px) within which the element reacts to the cursor. Default 120. */
  radius?: number;
  /** How strongly the element follows the cursor (0–1). Default 0.35. */
  strength?: number;
  /** Spring stiffness. Default 200. */
  stiffness?: number;
  /** Spring damping. Default 18. */
  damping?: number;
};

/**
 * useMagneticButton — element translates toward the cursor while it's within
 * `radius`, and springs back to rest when the cursor leaves. Returns a ref to
 * attach to the target plus `x`/`y` MotionValues to bind to `style`.
 *
 * Respects `prefers-reduced-motion`: returns zero MotionValues and no-ops.
 */
export function useMagneticButton<T extends HTMLElement = HTMLDivElement>(
  options: MagneticOptions = {},
) {
  const {
    radius = 120,
    strength = 0.35,
    stiffness = 200,
    damping = 18,
  } = options;
  const ref = useRef<T>(null);
  const reduceMotion = useReducedMotion();

  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const x = useSpring(mx, { stiffness, damping, mass: 0.4 });
  const y = useSpring(my, { stiffness, damping, mass: 0.4 });

  useEffect(() => {
    if (reduceMotion) return;
    const el = ref.current;
    if (!el) return;

    const handleMove = (event: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = event.clientX - centerX;
      const dy = event.clientY - centerY;
      const distance = Math.hypot(dx, dy);
      if (distance > radius) {
        mx.set(0);
        my.set(0);
        return;
      }
      mx.set(dx * strength);
      my.set(dy * strength);
    };

    const handleLeave = () => {
      mx.set(0);
      my.set(0);
    };

    window.addEventListener("mousemove", handleMove, { passive: true });
    el.addEventListener("mouseleave", handleLeave);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      el.removeEventListener("mouseleave", handleLeave);
    };
  }, [radius, strength, mx, my, reduceMotion]);

  return { ref, x, y };
}

type ScrollOffset =
  | "start end"
  | "end start"
  | "start start"
  | "end end"
  | "center center";

type ScrollProgressOptions = {
  offset?: [ScrollOffset, ScrollOffset];
};

/**
 * useScrollProgress — wraps `useScroll` for a target ref so callers don't have
 * to repeat the `target`/`offset` boilerplate. Returns the ref + the
 * `scrollYProgress` MotionValue (0–1 across the element's scroll journey).
 */
export function useScrollProgress<T extends HTMLElement = HTMLDivElement>(
  options: ScrollProgressOptions = {},
) {
  const ref = useRef<T>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: options.offset ?? ["start end", "end start"],
  });
  return { ref, scrollYProgress };
}

/**
 * useScrollTransform — maps a `scrollYProgress` MotionValue to an output range.
 * Thin wrapper over `useTransform` so the import surface stays small.
 */
export function useScrollTransform<TOutput extends number | string>(
  scrollYProgress: MotionValue<number>,
  input: [number, number],
  output: [TOutput, TOutput],
) {
  return useTransform(scrollYProgress, input, output);
}
