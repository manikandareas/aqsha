"use client";

import type { ReactNode } from "react";
import { m } from "motion/react";

import { useMagneticButton } from "@/lib/motion";
import { cn } from "@/lib/utils";

type MagneticButtonProps = {
  children: ReactNode;
  className?: string;
  /** Cursor reaction radius in px. Default 120. */
  radius?: number;
  /** Follow strength (0–1). Default 0.35. */
  strength?: number;
};

/**
 * MagneticButton — wraps a child (usually a `<Button>`) in a motion div that
 * translates toward the cursor while it's within `radius`, then springs back.
 * Respects `prefers-reduced-motion` via the underlying hook.
 */
export function MagneticButton({
  children,
  className,
  radius,
  strength,
}: MagneticButtonProps) {
  const { ref, x, y } = useMagneticButton<HTMLDivElement>({
    radius,
    strength,
  });
  return (
    <m.div ref={ref} style={{ x, y }} className={cn("inline-block", className)}>
      {children}
    </m.div>
  );
}
