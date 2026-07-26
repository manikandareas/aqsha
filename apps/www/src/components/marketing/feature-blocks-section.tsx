"use client";

import { m, useReducedMotion } from "motion/react";
import { useState } from "react";

import { CtaHandArrow } from "@/components/marketing/doodles";
import {
  ExpandableFeatureFrame,
  useCanExpand,
} from "@/components/marketing/expandable-feature-frame";
import { FeatureFrame } from "@/components/marketing/feature-frame";
import { MotionProvider } from "@/components/motion-provider";
import { Button } from "@/components/ui/button";
import {
  WORKFLOW_STEPS,
  type WorkflowStep,
} from "@/data/features";
import { WAITLIST_PATH } from "@/lib/marketing/cta";
import { EASE_OUT } from "@/lib/motion";

type Feature = WorkflowStep;

/**
 * Cells pair up left-to-right, so an odd number of steps leaves the last one
 * without a partner. It still expands — it just anchors to the opposite side.
 */
const UNPAIRED_INDEX =
  WORKFLOW_STEPS.length % 2 === 1 ? WORKFLOW_STEPS.length - 1 : null;

/**
 * StepBadge — keycap-style number chip. Steps alternate: even steps ink
 * themselves in with the secondary (Deep Pine) face once in view, odd steps
 * stay as outlined chips.
 */
function StepBadge({
  num,
  filled,
  reduce,
  delay,
}: {
  num: string;
  filled: boolean;
  reduce: boolean | null;
  delay: number;
}) {
  if (!filled) {
    return (
      <span className="relative z-10 grid size-11 shrink-0 place-items-center rounded-md border-2 border-border bg-card font-mono text-sm font-bold text-foreground">
        {num}
      </span>
    );
  }
  return (
    <span className="relative z-10 grid size-11 shrink-0 place-items-center overflow-hidden rounded-md border-2 border-primary bg-card font-mono text-sm font-bold text-foreground">
      {num}
      <m.span
        aria-hidden
        className="btn-filled-gradient absolute inset-0 grid place-items-center bg-primary text-primary-foreground [--btn-face:var(--primary)]"
        initial={reduce ? false : { opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, amount: 1 }}
        transition={{ delay, duration: 0.45, ease: "easeOut" }}
      >
        {num}
      </m.span>
    </span>
  );
}

/**
 * StepBlock — one cell of the steps grid: number badge over a full-bleed rail,
 * then title, body, points, and a portrait FeatureFrame rising as one block.
 * Paired cells own one continuous rail; the final unpaired workflow step stays
 * deliberately self-contained.
 */
function StepBlock({
  feature,
  index,
  active,
  leanFrom,
  hasPartner,
  isFinalStep,
  canExpand,
  onHoverChange,
}: {
  feature: Feature;
  index: number;
  active: boolean;
  /** Index of the neighbour currently expanding over this cell, if any. */
  leanFrom: number | null;
  hasPartner: boolean;
  isFinalStep: boolean;
  canExpand: boolean;
  onHoverChange: (index: number | null) => void;
}) {
  const reduce = useReducedMotion();
  const colDelay = (index % 2) * 0.18;
  const ownsRail = index % 2 === 0 && (hasPartner || isFinalStep);
  // Paired cells expand toward their partner. The unpaired final step sits in
  // the grid's last column, so it anchors right and expands leftward like the
  // odd cells do — anchoring left would push it past the container edge.
  const anchorLeft = hasPartner ? index % 2 === 0 : false;
  // Expansion is not partner-gated: every card grows on hover, including the
  // unpaired one. A cell leans away from whichever neighbour is covering it,
  // so the direction follows that neighbour's side rather than this cell's.
  const grow = canExpand && active;
  const lean = canExpand && leanFrom !== null;
  const leanDirection = lean
    ? ((-Math.sign(leanFrom! - index) as -1 | 1))
    : (0 as const);

  return (
    <m.div
      id={feature.id}
      className="relative scroll-mt-24"
      style={{ zIndex: grow ? 30 : lean ? 5 : undefined }}
      initial={reduce ? false : { opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.6, ease: EASE_OUT, delay: colDelay }}
    >
      {/* In-view on the stable badge row — not the rail (scaleX 0 collapses IO). */}
      <m.div
        className="relative flex h-11 items-center"
        initial={reduce ? false : "hidden"}
        whileInView="show"
        viewport={{ once: true, amount: "all" }}
      >
        {ownsRail && (
          <span
            aria-hidden
            className={
              index === 0
                ? "feature-step-rail feature-step-rail--first"
                : isFinalStep
                  ? "feature-step-rail feature-step-rail--last"
                  : "feature-step-rail feature-step-rail--pair"
            }
          >
            <m.span
              className="feature-step-rail-line"
              variants={{
                hidden: { scaleX: 0 },
                show: {
                  scaleX: 1,
                  transition: { duration: 0.9, ease: EASE_OUT },
                },
              }}
            />
          </span>
        )}
        <StepBadge
          num={feature.num}
          filled={index % 2 === 0}
          reduce={reduce}
          delay={colDelay + 0.4}
        />
        <span aria-hidden className="ml-4 h-px flex-1 bg-border sm:hidden" />
      </m.div>
      <m.div
        initial={reduce ? false : { y: 24 }}
        whileInView={{ y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.6, ease: EASE_OUT, delay: colDelay }}
      >
        <h3 className="font-heading mt-5 text-2xl font-medium leading-[1.15] text-foreground sm:text-[1.65rem]">
          {feature.title}
        </h3>
        <p className="mt-2.5 max-w-md text-pretty text-[15px] leading-snug text-muted-foreground">
          {feature.body}
        </p>
        <p className="mt-3 text-sm leading-snug text-foreground/70">
          {feature.points.join(" · ")}
        </p>
        {/* Hover on the stable footprint, not the expanding overlay — avoids enter/leave flicker. */}
        <div
          className="relative mt-7 aspect-[4/3] sm:aspect-[4/5]"
          onPointerEnter={(e) => {
            if (canExpand && e.pointerType !== "touch") onHoverChange(index);
          }}
          onPointerLeave={(e) => {
            if (canExpand && e.pointerType !== "touch") onHoverChange(null);
          }}
        >
          {canExpand ? (
            <ExpandableFeatureFrame
              grow={grow}
              leanDirection={leanDirection}
              anchorLeft={anchorLeft}
            >
              <FeatureFrame
                preview={feature.preview}
                aspectClassName="h-full w-full"
                initialRotate={index % 2 === 0 ? -1.1 : 1.1}
              />
            </ExpandableFeatureFrame>
          ) : (
            <div className="absolute inset-0">
              <FeatureFrame
                preview={feature.preview}
                aspectClassName="h-full w-full"
                initialRotate={index % 2 === 0 ? -1.1 : 1.1}
              />
            </div>
          )}
        </div>
      </m.div>
    </m.div>
  );
}

/**
 * FeatureBlocksSection — workflow-led numbered grid. The five steps explain
 * how a student moves from a new project to an approved Aqsha proposal,
 * instead of presenting disconnected product cards.
 */
export function FeatureBlocksSection() {
  const reduce = useReducedMotion();
  const [activeFrame, setActiveFrame] = useState<number | null>(null);
  const canExpand = useCanExpand();

  return (
    <MotionProvider>
      <section
        id="cara-kerja"
        className="w-full scroll-mt-[72px] overflow-x-clip py-24 sm:py-32 lg:py-40"
      >
        <div
          id="fitur"
          className="mx-auto grid w-full max-w-6xl scroll-mt-[72px] grid-cols-1 gap-x-8 gap-y-16 px-4 sm:grid-cols-2 sm:gap-y-20 sm:px-6 lg:grid-cols-3 lg:gap-x-12 lg:gap-y-24 lg:px-8"
        >
          <m.div
            className="sm:col-span-2 lg:col-span-1 lg:pr-4"
            initial={reduce ? false : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.6, ease: EASE_OUT }}
          >
            <h2 className="font-heading text-balance text-4xl font-medium leading-[1.1] tracking-normal sm:text-[2.75rem] sm:leading-[1.08] lg:text-[2.9rem]">
              <span className="block text-foreground">
                Riset sampai draf siap review.
              </span>
              <span className="mt-2 block text-muted-foreground">
                Satu alur untuk karya tulismu.
              </span>
            </h2>
          </m.div>

          {WORKFLOW_STEPS.map((feature, index) => {
            const partnerIndex = index % 2 === 0 ? index + 1 : index - 1;
            const hasPartner = index % 2 === 1 || partnerIndex < WORKFLOW_STEPS.length;

            // Two cells can expand over this one: its partner, and — for the
            // cell just left of an odd-length grid's unpaired last step — that
            // last step, which anchors right and grows leftward.
            const coveredBy = [
              hasPartner ? partnerIndex : null,
              UNPAIRED_INDEX !== null && index === UNPAIRED_INDEX - 1
                ? UNPAIRED_INDEX
                : null,
            ];
            const leanFrom =
              coveredBy.find((i) => i !== null && activeFrame === i) ?? null;

            return (
              <StepBlock
                key={feature.id}
                feature={feature}
                index={index}
                active={activeFrame === index}
                leanFrom={leanFrom}
                hasPartner={hasPartner}
                isFinalStep={index === WORKFLOW_STEPS.length - 1}
                canExpand={canExpand}
                onHoverChange={setActiveFrame}
              />
            );
          })}

          <m.div
            className="self-start sm:col-span-2 lg:col-span-2 lg:pt-16"
            initial={reduce ? false : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.6, ease: EASE_OUT }}
          >
            <h3 className="font-heading text-2xl font-medium leading-[1.15] sm:text-[1.65rem]">
              <span className="block text-foreground">
                Siap skripsian bersama Aqsha?
              </span>
              <span className="mt-1 block text-muted-foreground">
                Gabung waitlist untuk akses awal Aqsha. {" "}
                <span className="font-bold text-primary">Gratis.</span>
              </span>
            </h3>
            <div className="mt-7 flex items-start gap-4">
              <div className="flex flex-col items-start gap-3">
                <Button asChild variant="outline" className="h-11 px-5">
                  <a href="#faq">Tanya-tanya dulu</a>
                </Button>
                <Button asChild className="h-11 px-5">
                  <a href={WAITLIST_PATH}>Gabung waitlist →</a>
                </Button>
              </div>
              <CtaHandArrow className="pt-1" />
            </div>
          </m.div>
        </div>
      </section>
    </MotionProvider>
  );
}
