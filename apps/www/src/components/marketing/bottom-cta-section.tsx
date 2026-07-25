"use client";

import {
  m,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "motion/react";
import { useRef } from "react";

import { MotionProvider } from "@/components/motion-provider";
import { Button } from "@/components/ui/button";
import { EASE_OUT } from "@/lib/motion";

const HEADLINE = "Nulis riset yang bisa kamu pertahanin.";

function RevealWord({
  word,
  progress,
  range,
  reduce,
}: {
  word: string;
  progress: MotionValue<number>;
  range: [number, number];
  reduce: boolean | null;
}) {
  const opacity = useTransform(progress, range, [0.18, 1]);
  return (
    <m.span
      className="inline-block"
      style={reduce ? undefined : { opacity }}
    >
      {word}&nbsp;
    </m.span>
  );
}

/**
 * BottomCtaSection — dark inversion finale. The `dark` class re-resolves all
 * color tokens to the charcoal palette for this section only (no hardcoded
 * colors), breaking the cream rhythm right before the footer.
 *
 * Signature micro-interaction: "reading reveal" — the headline's words fade
 * from 0.18 → 1 opacity one after another, scroll-linked, as if the sentence
 * is being read while it enters the viewport. Magnetic primary CTA stays as
 * the pointer interaction.
 */
export function BottomCtaSection() {
  const reduce = useReducedMotion();
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const { scrollYProgress } = useScroll({
    target: headlineRef,
    offset: ["start 0.85", "start 0.35"],
  });
  const words = HEADLINE.split(" ");

  return (
    <MotionProvider>
    <section className="dark w-full bg-background py-32 text-foreground sm:py-40 lg:py-48">
      <div className="mx-auto w-full max-w-4xl px-4 text-center sm:px-6 lg:px-8">
        <m.p
          className="text-[15px] leading-snug text-muted-foreground sm:text-base"
          initial={reduce ? false : { opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.85 }}
          transition={{ duration: 0.5, ease: EASE_OUT }}
        >
          Mulai sekarang
        </m.p>
        <h2
          ref={headlineRef}
          className="font-heading mx-auto mt-5 max-w-[16ch] text-balance text-5xl font-medium leading-[1.06] tracking-normal text-foreground sm:mt-6 sm:text-6xl sm:leading-[1.05] lg:text-[4.25rem] lg:leading-[1.04]"
        >
          {words.map((word, index) => (
            <RevealWord
              key={`${word}-${index}`}
              word={word}
              progress={scrollYProgress}
              range={[index / words.length, (index + 1) / words.length]}
              reduce={reduce}
            />
          ))}
        </h2>
        <m.p
          className="mx-auto mt-6 max-w-xl text-pretty text-lg leading-snug text-foreground/85 sm:mt-8 sm:text-xl sm:leading-snug"
          initial={reduce ? false : { opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.75 }}
          transition={{ delay: 0.1, duration: 0.55 }}
        >
          Daftar gratis, buka satu tempat buat semua risetmu, dan biarin tiap
          sumber kecek bener — langsung dari browser.
        </m.p>
        <m.div
          className="mt-10 flex flex-col items-center justify-center gap-3 sm:mt-12 sm:flex-row"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.75 }}
          variants={{
            hidden: {},
            show: {
              transition: {
                staggerChildren: reduce ? 0 : 0.12,
                delayChildren: reduce ? 0 : 0.15,
              },
            },
          }}
        >
          <m.div
            variants={{
              hidden: { opacity: reduce ? 1 : 0, y: reduce ? 0 : 24 },
              show: {
                opacity: 1,
                y: 0,
                transition: { type: "spring", stiffness: 260, damping: 22 },
              },
            }}
          >
            <Button
              asChild
              variant="outline"
              className="h-14 rounded-full px-7 text-base font-medium"
            >
              <a href="#cara-kerja">Lihat cara kerjanya</a>
            </Button>
          </m.div>
          <m.div
            variants={{
              hidden: { opacity: reduce ? 1 : 0, y: reduce ? 0 : 28 },
              show: {
                opacity: 1,
                y: 0,
                transition: { type: "spring", stiffness: 240, damping: 20 },
              },
            }}
          >
            <Button
              disabled
              className="h-14 rounded-full px-7 text-base font-medium"
            >
              Gabung waitlist →
            </Button>
          </m.div>
        </m.div>
      </div>
    </section>
    </MotionProvider>
  );
}
