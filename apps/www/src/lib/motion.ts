"use client";

import { useEffect, useRef } from "react";
import { useMotionValue, useSpring, useReducedMotion } from "motion/react";

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
