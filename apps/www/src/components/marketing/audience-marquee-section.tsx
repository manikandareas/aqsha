"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useInView, useReducedMotion } from "motion/react";

import { MotionProvider } from "@/components/motion-provider";

const LITERATURE_COUNT = 322_000_000;
const countFormatter = new Intl.NumberFormat("id-ID");

const UNIVERSITY_MARKS = [
  {
    name: "Universitas Indonesia",
    mark: "UI",
    styleClass: "font-heading text-2xl font-black tracking-tight sm:text-3xl",
  },
  {
    name: "Universitas Gadjah Mada",
    mark: "UGM",
    styleClass: "text-xl font-black tracking-[0.18em] sm:text-2xl",
  },
  {
    name: "Institut Teknologi Bandung",
    mark: "ITB",
    styleClass: "font-heading text-2xl font-bold tracking-widest sm:text-3xl",
  },
  {
    name: "National University of Singapore",
    mark: "NUS",
    styleClass: "text-xl font-black tracking-[0.16em] sm:text-2xl",
  },
  {
    name: "The University of Tokyo",
    mark: "UTokyo",
    styleClass: "font-heading text-2xl font-bold tracking-tight sm:text-3xl",
  },
  {
    name: "Tsinghua University",
    mark: "Tsinghua",
    styleClass: "text-xl font-black tracking-tight sm:text-2xl",
  },
  {
    name: "University of Melbourne",
    mark: "Melbourne",
    styleClass: "font-heading text-xl font-bold tracking-tight sm:text-2xl",
  },
  {
    name: "University of Oxford",
    mark: "Oxford",
    styleClass: "font-heading text-2xl font-bold sm:text-3xl",
  },
  {
    name: "University of Cambridge",
    mark: "Cambridge",
    styleClass: "text-xl font-black tracking-tight sm:text-2xl",
  },
  {
    name: "Harvard University",
    mark: "Harvard",
    styleClass: "font-heading text-2xl font-black tracking-tight sm:text-3xl",
  },
  {
    name: "Massachusetts Institute of Technology",
    mark: "MIT",
    styleClass: "text-2xl font-black tracking-[0.14em] sm:text-3xl",
  },
  {
    name: "Stanford University",
    mark: "Stanford",
    styleClass: "font-heading text-2xl font-bold tracking-tight sm:text-3xl",
  },
] as const;

/** Counts up when the section enters the viewport; reduced motion snaps. */
function LiveLiteratureCount() {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (reduce) {
      setValue(LITERATURE_COUNT);
      return;
    }
    if (!inView) return;

    const controls = animate(0, LITERATURE_COUNT, {
      duration: 2,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (nextValue) => setValue(Math.round(nextValue)),
    });

    return () => controls.stop();
  }, [inView, reduce]);

  const formattedCount = countFormatter.format(LITERATURE_COUNT);

  return (
    <>
      <span
        ref={ref}
        aria-hidden
        className="font-heading font-black tabular-nums text-primary"
      >
        {countFormatter.format(value)}+
      </span>
      <span className="sr-only">lebih dari {formattedCount}</span>
    </>
  );
}

function MarqueeRow({ ariaHidden = false }: { ariaHidden?: boolean }) {
  return (
    <ul
      aria-hidden={ariaHidden || undefined}
      className="flex shrink-0 items-stretch"
    >
      {UNIVERSITY_MARKS.map((university) => (
        <li
          key={university.mark}
          className="flex items-center border-l-2 border-primary-foreground/15 px-8 py-7 first:border-l-0 sm:px-12 sm:py-9"
          title={university.name}
        >
          <span
            className={`whitespace-nowrap leading-none text-primary-foreground ${university.styleClass}`}
          >
            {university.mark}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Global literature marquee directly below the hero. The moving university
 * marks show the worldwide scope of Aqsha's connected academic literature,
 * not customer or institutional endorsements.
 */
export function AudienceMarqueeSection() {
  return (
    <MotionProvider>
      <section
        aria-label="Aqsha terhubung ke 322 juta lebih literatur ilmiah dari seluruh dunia"
        className="pt-16 sm:pt-24"
      >
        <div className="mx-auto max-w-7xl px-4 pb-7 text-center sm:px-6 sm:pb-8">
          <p className="mx-auto max-w-3xl text-pretty text-lg leading-snug text-foreground/75 sm:text-xl">
            <span className="block">
              Aqsha terhubung ke <LiveLiteratureCount /> literatur ilmiah.
            </span>
            <span className="mt-1 block">
              Dari kampus dan peneliti di seluruh dunia, langsung ke skripsimu.
            </span>
          </p>
        </div>
        <div className="marquee-group overflow-hidden border-y-2 border-border bg-primary">
          <div className="marquee-track flex w-max">
            <MarqueeRow />
            <MarqueeRow ariaHidden />
          </div>
        </div>
      </section>
    </MotionProvider>
  );
}
