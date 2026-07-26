"use client";

import { m, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";

import { ProductPreviewPlaceholder } from "@/components/marketing/product-preview-placeholder";
import type { ProductPreview } from "@/data/features";
import { cn } from "@/lib/utils";

/**
 * FrameChrome — shared editorial dressing for large image frames: paper-grain
 * turbulence overlay + four corner crosshair marks. Used by the hero frame and
 * every FeatureFrame so the whole page speaks one visual language.
 */
export function FrameChrome() {
  return (
    <>
      <div className="paper-grain pointer-events-none absolute inset-0" />
      {(
        ["left-3 top-3", "right-3 top-3", "bottom-3 left-3", "bottom-3 right-3"] as const
      ).map((pos) => (
        <span
          key={pos}
          aria-hidden
          className={cn("pointer-events-none absolute size-[3px] bg-foreground/50", pos)}
        />
      ))}
    </>
  );
}

type FeatureFrameProps = {
  preview: ProductPreview;
  /** Aspect utility, e.g. "aspect-[16/10]". Varies per feature block. */
  aspectClassName: string;
  /** Starting tilt in degrees; the frame straightens to 0 as it scrolls in. */
  initialRotate?: number;
  className?: string;
};

/**
 * FeatureFrame — big editorial product-preview frame below each feature's copy.
 *
 * Signature micro-interaction: the frame enters slightly tilted and
 * scroll-linked straightens (rotate → 0) while rising (y 32 → 0), with a slow
 * internal parallax. Its placeholder can later be replaced by a screenshot
 * without changing the frame's layout.
 */
export function FeatureFrame({
  preview,
  aspectClassName,
  initialRotate = 0,
  className,
}: FeatureFrameProps) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  // Straighten + rise while the frame travels from viewport bottom to 40%.
  const { scrollYProgress: settle } = useScroll({
    target: ref,
    offset: ["start end", "start 0.4"],
  });
  const rotate = useTransform(settle, [0, 1], [initialRotate, 0]);
  const y = useTransform(settle, [0, 1], [32, 0]);

  // Slow internal parallax across the frame's whole viewport journey.
  const { scrollYProgress: journey } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const parallaxY = useTransform(journey, [0, 1], ["-6%", "6%"]);

  return (
    <m.div
      ref={ref}
      className={cn(
        "group relative w-full overflow-hidden rounded-2xl border-2 border-border",
        aspectClassName,
        className,
      )}
      style={reduce ? undefined : { rotate, y }}
    >
      <m.div
        className="absolute inset-[-8%]"
        style={reduce ? undefined : { y: parallaxY }}
      >
        <ProductPreviewPlaceholder preview={preview} />
      </m.div>
      <FrameChrome />
    </m.div>
  );
}
