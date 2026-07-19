"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useInView, useReducedMotion } from "motion/react";

import { MotionProvider } from "@/components/motion-provider";
import {
  STUDENT_COUNT,
  UNIVERSITY_MARKS,
} from "@/lib/marketing/social-proof";
import { cn } from "@/lib/utils";

const countFormatter = new Intl.NumberFormat("id-ID");

/**
 * LiveStudentCount — count-up once when the section enters view.
 * Reduced motion snaps to the final number.
 */
function LiveStudentCount() {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (reduce) {
      setValue(STUDENT_COUNT);
      return;
    }
    if (!inView) return;
    const controls = animate(0, STUDENT_COUNT, {
      duration: 2,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setValue(Math.round(v)),
    });
    return () => controls.stop();
  }, [inView, reduce]);

  return (
    <>
      <span
        ref={ref}
        aria-hidden
        className="font-heading font-black tabular-nums text-primary"
      >
        {countFormatter.format(value)}+
      </span>
      <span className="sr-only">
        {countFormatter.format(STUDENT_COUNT)} lebih
      </span>
    </>
  );
}

function MarqueeRow({ ariaHidden = false }: { ariaHidden?: boolean }) {
  return (
    <ul
      aria-hidden={ariaHidden || undefined}
      className="flex shrink-0 items-stretch"
    >
      {UNIVERSITY_MARKS.map((u) => (
        <li
          key={u.mark}
          className="flex items-center border-l-2 border-primary-foreground/15 px-8 py-7 first:border-l-0 sm:px-12 sm:py-9"
          title={u.name}
        >
          <span
            className={cn(
              "whitespace-nowrap leading-none text-primary-foreground",
              u.styleClass,
            )}
          >
            {u.mark}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * UniversityMarqueeSection — social proof di bawah hero: satu kalimat dengan
 * counter, lalu band solid primary berisi wordmark kampus (marquee CSS;
 * pause on hover; reduced motion di components.css).
 */
export function UniversityMarqueeSection() {
  const formattedCount = countFormatter.format(STUDENT_COUNT);

  return (
    <MotionProvider>
    <section
      aria-label={`Dipakai lebih dari ${formattedCount} mahasiswa dari berbagai kampus di Indonesia`}
      className="pt-16 sm:pt-24"
    >
      <div className="mx-auto max-w-7xl px-4 pb-7 text-center sm:px-6 sm:pb-8">
        <p className="mx-auto max-w-2xl text-pretty text-lg leading-snug text-foreground/75 sm:text-xl">
          Udah dipakai <LiveStudentCount /> mahasiswa buat skripsi, tesis, dan
          paper — dari kampus-kampus di seluruh Indonesia.
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
