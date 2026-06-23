"use client";

import { m, useReducedMotion } from "motion/react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { DemoFeatureGrid } from "@/features/marketing/components/demo-feature-grid";

const DEMO_TITLE = "See the path from question to cited answer";
const demoWords = DEMO_TITLE.split(" ");

export function LandingDemoSection() {
  const reduce = useReducedMotion();

  const gridVariants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: reduce ? 0 : 0.1,
        delayChildren: reduce ? 0 : 0.04,
      },
    },
  } as const;

  const colLeftVariants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: reduce ? 0 : 0.055,
        delayChildren: reduce ? 0 : 0.06,
      },
    },
  } as const;

  const wordRowVariants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: reduce ? 0 : 0.038,
      },
    },
  } as const;

  const eyebrowVariants = {
    hidden: reduce ? { opacity: 1, scaleX: 1 } : { opacity: 0, scaleX: 0.2 },
    visible: {
      opacity: 1,
      scaleX: 1,
      transition: { duration: 0.42, ease: [0.22, 1, 0.36, 1] },
    },
  } as const;

  const wordVariants = {
    hidden: reduce
      ? { opacity: 1, y: 0, rotate: 0 }
      : { opacity: 0, y: "0.32em", rotate: -1.2 },
    visible: {
      opacity: 1,
      y: 0,
      rotate: 0,
      transition: { type: "spring" as const, stiffness: 380, damping: 26 },
    },
  } as const;

  const ctaWrapVariants = {
    hidden: reduce ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { type: "spring" as const, stiffness: 280, damping: 24 },
    },
  } as const;

  const rightColVariants = {
    hidden: reduce ? { opacity: 1, x: 0, y: 0 } : { opacity: 0, x: 14, y: 10 },
    visible: {
      opacity: 1,
      x: 0,
      y: 0,
      transition: { duration: 0.55, ease: [0.19, 1, 0.35, 1] },
    },
  } as const;

  return (
    <section
      id="demo"
      className="w-full bg-background py-20 sm:py-24 lg:py-28"
    >
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <m.div
          className="mb-12 grid gap-10 sm:mb-14 sm:gap-12 lg:grid-cols-2 lg:items-start lg:gap-x-14 xl:gap-x-20"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.12, margin: "0px 0px -12% 0px" }}
          variants={gridVariants}
        >
          <m.div
            className="min-w-0 max-w-xl lg:max-w-none"
            variants={colLeftVariants}
          >
            <m.p
              className="text-[15px] leading-snug text-muted-foreground sm:text-base"
              variants={eyebrowVariants}
              style={{ transformOrigin: "0% 50%" }}
            >
              Product preview
            </m.p>
            <m.h2
              className="font-heading mt-3 max-w-[min(100%,30rem)] text-[2.75rem] font-normal leading-[1.08] tracking-normal text-foreground sm:mt-4 sm:text-5xl sm:leading-[1.06] lg:text-[3.25rem] lg:leading-[1.05] xl:max-w-[min(100%,34rem)] xl:text-[3.5rem]"
              variants={wordRowVariants}
            >
              {demoWords.map((word, i) => (
                <m.span
                  key={`${word}-${i}`}
                  className="inline-block"
                  variants={wordVariants}
                >
                  {word}
                  {i < demoWords.length - 1 ? " " : null}
                </m.span>
              ))}
            </m.h2>
            <m.div
              className="mt-8 sm:mt-10"
              variants={ctaWrapVariants}
              whileHover={reduce ? undefined : { scale: 1.02 }}
              whileTap={reduce ? undefined : { scale: 0.98 }}
            >
              <Button asChild className="h-14 rounded-full px-7 text-base">
                <Link href="/app">Open the research workspace</Link>
              </Button>
            </m.div>
          </m.div>
          <m.div className="min-w-0" variants={rightColVariants}>
            <p className="text-pretty text-lg leading-snug text-foreground/85 sm:text-xl sm:leading-snug lg:max-w-[26rem]">
              Aqsha makes the work behind an answer visible: the question that
              started it, the sources you trusted, the notes you made, and the
              evidence behind the final draft.
            </p>
          </m.div>
        </m.div>
        <DemoFeatureGrid />
      </div>
    </section>
  );
}
