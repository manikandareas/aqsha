"use client";

import { m, useReducedMotion } from "motion/react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { LandingDemoSessionPreview } from "@/features/marketing/components/landing-demo-session-preview";

function HeroResearchShowcase() {
  const reduce = useReducedMotion();

  return (
    <div
      className="mt-24 w-full [perspective:1400px] sm:mt-28"
      style={{ perspectiveOrigin: "50% 0%" }}
    >
      <m.div
        className="w-full overflow-hidden rounded-2xl border border-border bg-muted shadow-sm"
        initial={
          reduce
            ? false
            : {
                opacity: 0,
                rotateX: 9,
                y: 52,
                scale: 0.96,
                transformOrigin: "50% 0%",
              }
        }
        animate={{ opacity: 1, rotateX: 0, y: 0, scale: 1 }}
        transition={{
          type: "spring",
          stiffness: 95,
          damping: 20,
          mass: 0.85,
        }}
        style={{ transformStyle: "preserve-3d" }}
      >
        <div className="aspect-[16/10] w-full p-2 sm:p-3 lg:aspect-[16/9]">
          <LandingDemoSessionPreview
            variant="hero"
            className="h-full rounded-[12px] sm:rounded-[14px]"
          />
        </div>
      </m.div>
    </div>
  );
}

const buttonContainer = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.09, delayChildren: 0.12 },
  },
} as const;

const buttonItem = (reduce: boolean | null) =>
  reduce
    ? { hidden: { opacity: 1 }, show: { opacity: 1 } }
    : {
        hidden: { opacity: 0, y: 22, filter: "blur(6px)" },
        show: {
          opacity: 1,
          y: 0,
          filter: "blur(0px)",
          transition: { type: "spring" as const, stiffness: 320, damping: 26 },
        },
      };

export function LandingHeroSection() {
  const reduce = useReducedMotion();

  return (
    <section className="w-full">
      <div className="mx-auto w-full max-w-7xl px-4 pb-20 pt-24 sm:px-6 sm:pb-24 sm:pt-32 lg:px-8 lg:pb-28 lg:pt-40">
        <div className="space-y-6 sm:space-y-8">
          <m.p
            className="text-[15px] leading-snug text-muted-foreground sm:text-base"
            initial={reduce ? false : { opacity: 0, y: 10, letterSpacing: "0.12em" }}
            animate={{ opacity: 1, y: 0, letterSpacing: "0em" }}
            transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          >
            Research workspace for source-backed answers
          </m.p>
          <div className="grid gap-10 sm:gap-12 lg:grid-cols-2 lg:items-start lg:gap-x-14 xl:gap-x-20">
            <div className="min-w-0 max-w-xl lg:max-w-none">
              <m.h1
                className="font-heading max-w-[20rem] text-[2.75rem] font-normal leading-[1.08] tracking-normal text-foreground sm:max-w-[22rem] sm:text-5xl sm:leading-[1.06] lg:max-w-[min(100%,26rem)] lg:text-[3.25rem] lg:leading-[1.05] xl:text-[3.5rem]"
                initial={reduce ? false : { clipPath: "inset(0 100% 0 0)", opacity: 0.2 }}
                animate={{ clipPath: "inset(0 0% 0 0)", opacity: 1 }}
                transition={{ duration: 0.95, ease: [0.22, 1, 0.36, 1] }}
              >
                Build answers you can trace back to the source
              </m.h1>
              <m.div
                className="mt-8 flex flex-wrap gap-3 sm:mt-10"
                variants={buttonContainer}
                initial="hidden"
                animate="show"
              >
                <m.div variants={buttonItem(reduce)}>
                  <Button asChild className="h-14 rounded-full px-7 text-base">
                    <Link href="/sign-up">Start a research workspace</Link>
                  </Button>
                </m.div>
                <m.div variants={buttonItem(reduce)}>
                  <Button
                    asChild
                    variant="outline"
                    className="h-14 rounded-full border-border/80 bg-card px-7 text-base text-card-foreground shadow-sm hover:bg-muted"
                  >
                    <Link href="/app">Open the app</Link>
                  </Button>
                </m.div>
              </m.div>
            </div>
            <m.div
              className="min-w-0"
              initial={
                reduce
                  ? false
                  : { opacity: 0, x: 28, skewY: 1.2, filter: "blur(8px)" }
              }
              animate={{ opacity: 1, x: 0, skewY: 0, filter: "blur(0px)" }}
              transition={{
                delay: 0.18,
                duration: 0.75,
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              <p className="text-pretty text-lg leading-snug text-foreground/85 sm:text-xl sm:leading-snug lg:max-w-[26rem]">
                Aqsha keeps your threads, papers, notes, and citations in one
                workspace, so every answer carries the context and evidence that
                shaped it.
              </p>
            </m.div>
          </div>
        </div>

        <HeroResearchShowcase />
      </div>
    </section>
  );
}
