"use client";

import { useEffect, useRef } from "react";
import { useMotionValue, useSpring, useReducedMotion } from "motion/react";

/** Shared editorial ease — hero, steps, section reveals. */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** Default scroll-reveal viewport — override `amount` per section when needed. */
export const IN_VIEW_ONCE = { once: true, amount: 0.4 } as const;

/** Shared spring for hero shelf + feature-block frame expand/lean. */
export const FRAME_SPRING = {
  type: "spring",
  stiffness: 400,
  damping: 30,
  mass: 0.8,
} as const;

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

    // The pointer handler only records coordinates — measuring the element
    // there would put a layout read on a listener that fires per mouse event
    // (up to 1000Hz on a high-polling mouse) and interleave it with Motion's
    // style writes. Collapsing the read into one rAF tick keeps the geometry
    // exact while it can only ever cost one measurement per rendered frame.
    // The springs smooth the input either way, so the feel is unchanged.
    let pointerX = 0;
    let pointerY = 0;
    let scheduled = 0;

    const apply = () => {
      scheduled = 0;
      const rect = el.getBoundingClientRect();
      const dx = pointerX - (rect.left + rect.width / 2);
      const dy = pointerY - (rect.top + rect.height / 2);

      if (Math.hypot(dx, dy) > radius) {
        mx.set(0);
        my.set(0);
        return;
      }

      mx.set(dx * strength);
      my.set(dy * strength);
    };

    const handleMove = (event: MouseEvent) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (scheduled === 0) scheduled = requestAnimationFrame(apply);
    };

    const handleLeave = () => {
      // Drop the queued tick too, so it can't re-apply an offset after reset.
      if (scheduled !== 0) {
        cancelAnimationFrame(scheduled);
        scheduled = 0;
      }
      mx.set(0);
      my.set(0);
    };

    window.addEventListener("mousemove", handleMove, { passive: true });
    el.addEventListener("mouseleave", handleLeave);
    return () => {
      if (scheduled !== 0) cancelAnimationFrame(scheduled);
      window.removeEventListener("mousemove", handleMove);
      el.removeEventListener("mouseleave", handleLeave);
    };
  }, [radius, strength, mx, my, reduceMotion]);

  return { ref, x, y };
}
