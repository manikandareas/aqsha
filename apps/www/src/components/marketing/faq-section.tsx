"use client";

import { m, useReducedMotion } from "motion/react";
import { useState } from "react";

import {
  drawAnimate,
  drawInitial,
  drawTransition,
  HandNote,
} from "@/components/marketing/doodles";
import { faqItems } from "@/components/marketing/faq-data";
import { MotionProvider } from "@/components/motion-provider";
import { Button } from "@/components/ui/button";
import { appUrl } from "@/lib/app-url";
import { EASE_OUT, IN_VIEW_ONCE } from "@/lib/motion";
import { contactEmail } from "@/lib/seo-config";
import { cn } from "@/lib/utils";

type FaqDoodleProps = { className?: string; delay?: number };

/** Speech bubble dengan tanda tanya — outline menggambar diri, lalu "?" menyusul. */
function QuestionBubble({ className, delay = 0 }: FaqDoodleProps) {
  const reduce = useReducedMotion();
  return (
    <m.svg
      aria-hidden
      viewBox="0 0 48 48"
      fill="none"
      className={cn("size-12 text-coral", className)}
      initial={reduce ? false : { opacity: 0, scale: 0.6, rotate: -8 }}
      whileInView={{ opacity: 1, scale: 1, rotate: 0 }}
      viewport={IN_VIEW_ONCE}
      transition={{ delay, duration: 0.4, ease: EASE_OUT }}
    >
      <m.path
        d="M24 6 C 34 6, 42 12.5, 42 21.5 C 42 30.5, 34 36.5, 24 36.5 C 21.2 36.5, 18.5 36, 16.2 35 L 9 40.5 L 11.2 32.4 C 8 29.6, 6 25.9, 6 21.5 C 6 12.5, 14 6, 24 6 Z"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={drawInitial(reduce)}
        whileInView={drawAnimate}
        viewport={IN_VIEW_ONCE}
        transition={drawTransition(delay + 0.1, 0.55)}
      />
      <m.path
        d="M20 17.5 C 20 13.8, 28 13.8, 28 18 C 28 21.6, 24 21.4, 24 24.6"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        initial={drawInitial(reduce)}
        whileInView={drawAnimate}
        viewport={IN_VIEW_ONCE}
        transition={drawTransition(delay + 0.55, 0.3)}
      />
      <m.circle
        cx="24"
        cy="30"
        r="1.7"
        fill="currentColor"
        initial={reduce ? false : { opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={IN_VIEW_ONCE}
        transition={{ delay: delay + 0.85, duration: 0.2 }}
      />
    </m.svg>
  );
}

/** Pesawat kertas mint dengan jejak putus-putus — "kirim aja". */
function PaperPlane({ className, delay = 0 }: FaqDoodleProps) {
  const reduce = useReducedMotion();
  return (
    <m.svg
      aria-hidden
      viewBox="0 0 64 44"
      fill="none"
      className={cn("h-11 w-16 text-mint", className)}
      initial={reduce ? false : { opacity: 0, x: -10, y: 8, rotate: -6 }}
      whileInView={{ opacity: 1, x: 0, y: 0, rotate: 0 }}
      viewport={IN_VIEW_ONCE}
      transition={{ delay, duration: 0.5, ease: EASE_OUT }}
    >
      <m.path
        d="M4 41 C 10 43, 17 41, 22 35"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeDasharray="1 6"
        initial={reduce ? false : { opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={IN_VIEW_ONCE}
        transition={{ delay: delay + 0.35, duration: 0.3 }}
      />
      <m.path
        d="M10 32 L58 6 L38 37 L31 27 Z M31 27 L58 6"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={drawInitial(reduce)}
        whileInView={drawAnimate}
        viewport={IN_VIEW_ONCE}
        transition={drawTransition(delay + 0.1, 0.55)}
      />
    </m.svg>
  );
}

/** Muka senyum kedip — lemon, keluar terakhir sebagai penutup kecil. */
function WinkFace({ className, delay = 0 }: FaqDoodleProps) {
  const reduce = useReducedMotion();
  return (
    <m.svg
      aria-hidden
      viewBox="0 0 36 36"
      fill="none"
      className={cn("size-9 text-lemon", className)}
      initial={reduce ? false : { opacity: 0, scale: 0.5, rotate: 10 }}
      whileInView={{ opacity: 1, scale: 1, rotate: 0 }}
      viewport={IN_VIEW_ONCE}
      transition={{ delay, duration: 0.35, ease: EASE_OUT }}
    >
      <g
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M18 4 C 26.8 4, 32 10.8, 32 18 C 32 25.8, 26 32, 18 32 C 10 32, 4 25.8, 4 18 C 4 10.4, 9.6 4, 18 4 Z" />
        <path d="M12.6 15 L12.6 15.2" strokeWidth={3.6} />
        <path d="M21.4 15.2 C 22.8 13.9, 24.8 13.9, 26.2 15.2" strokeWidth={2.6} />
        <path d="M12 21.5 C 14.5 25.8, 21.5 25.8, 24 21.5" />
      </g>
    </m.svg>
  );
}

/**
 * FAQ landing — konten yang sama dengan FAQPage JSON-LD (lihat
 * structured-data.tsx). Wajib visible agar rich result FAQ Google valid:
 * markup harus mencerminkan konten di halaman. Answer selalu di DOM
 * (height 0 saat tutup, bukan unmount) supaya crawler tetap baca. Sumber
 * tunggal: faq-data.ts.
 *
 * Identitas section: split dua kolom — kiri daftar pertanyaan (accordion
 * dengan morph plus→cross, dua garis 1px rotate 45°), kanan kartu kontak
 * sticky dua panel (lip-pop, sedikit miring) ditemani cluster doodle
 * tangan khas FAQ: pesawat kertas, speech bubble "?", hand note, wink face.
 */
export function FaqSection() {
  const reduce = useReducedMotion();
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <MotionProvider>
    <section
      id="faq"
      className="w-full scroll-mt-[72px] bg-background py-28 sm:py-36 lg:py-44"
    >
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-x-24">
          {/* Kolom kiri — header + accordion */}
          <div className="min-w-0">
            <div className="mb-10 sm:mb-14">
              <m.p
                className="text-[15px] leading-snug text-muted-foreground sm:text-base"
                initial={reduce ? false : { opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.5 }}
                transition={{ duration: 0.55, ease: EASE_OUT }}
              >
                Masih ada yang ganjel?
              </m.p>
              <m.h2
                className="font-heading mt-3 text-balance text-[2.5rem] font-medium leading-[1.08] tracking-normal text-foreground sm:mt-4 sm:text-[2.75rem] sm:leading-[1.06] lg:text-[3rem] lg:leading-[1.05]"
                initial={reduce ? false : { opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.5 }}
                transition={{ duration: 0.6, ease: EASE_OUT }}
              >
                Pertanyaan yang sering muncul.
              </m.h2>
            </div>

            {/* Accordion (smooth height, content stays in DOM) */}
            <div className="min-w-0">
              {faqItems.map((item, index) => {
                const isOpen = openIndex === index;
                return (
                  <m.div
                    key={item.q}
                    className="border-b border-border first:border-t"
                    initial={reduce ? false : { opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.4 }}
                    transition={{
                      delay: reduce ? 0 : index * 0.04,
                      duration: 0.4,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setOpenIndex(isOpen ? null : index)}
                      className="flex w-full items-center justify-between gap-4 py-5 text-left text-base font-medium text-foreground transition-colors hover:text-foreground/80 sm:py-6 sm:text-lg"
                      aria-expanded={isOpen}
                    >
                      {item.q}
                      {/* Plus → cross morph */}
                      <span
                        aria-hidden
                        className={cn(
                          "relative block size-4 shrink-0 transition-transform duration-300 motion-reduce:transition-none",
                          isOpen && "rotate-45",
                        )}
                      >
                        <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-muted-foreground" />
                        <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-muted-foreground" />
                      </span>
                    </button>
                    <m.div
                      initial={false}
                      animate={{
                        height: isOpen ? "auto" : 0,
                        opacity: isOpen ? 1 : 0,
                      }}
                      transition={{ duration: 0.3, ease: EASE_OUT }}
                      className="overflow-hidden"
                    >
                      <p className="pb-5 pr-0 text-[15px] leading-relaxed text-muted-foreground sm:pb-6 sm:pr-8 sm:text-base">
                        {item.a}
                      </p>
                    </m.div>
                  </m.div>
                );
              })}
            </div>
          </div>

          {/* Kolom kanan — kartu kontak sticky + cluster doodle */}
          <div className="relative min-w-0">
            <div className="lg:sticky lg:top-28">
              <m.div
                className="rounded-xl border-2 border-border bg-card lip-pop lg:rotate-[0.8deg]"
                initial={reduce ? false : { opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.55, ease: EASE_OUT }}
              >
                <div className="p-5 sm:p-6">
                  <h3 className="font-heading text-lg font-medium leading-snug text-foreground sm:text-xl">
                    Ada pertanyaan buat kami?
                  </h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
                    Kirim aja ke{" "}
                    <a
                      href={`mailto:${contactEmail}`}
                      className="font-medium text-foreground underline decoration-border decoration-dotted decoration-2 underline-offset-4 transition-colors hover:decoration-foreground"
                    >
                      {contactEmail}
                    </a>
                  </p>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-b-[calc(var(--radius-xl)-2px)] border-t-2 border-border bg-muted/40 px-5 py-4 sm:px-6">
                  <p className="text-sm leading-snug text-muted-foreground">
                    Atau coba langsung — gratis.
                  </p>
                  <Button asChild size="sm">
                    <a href={appUrl("/sign-up")}>Coba gratis</a>
                  </Button>
                </div>
              </m.div>

              {/* Cluster doodle di bawah kartu (desktop saja) */}
              <div
                aria-hidden
                className="pointer-events-none relative mt-8 hidden h-40 select-none lg:block"
              >
                <PaperPlane className="absolute left-28 top-0" delay={0.45} />
                <HandNote className="absolute left-0 top-14 -rotate-3" delay={0.3}>
                  tanya aja, nggak digigit
                </HandNote>
                <QuestionBubble
                  className="absolute right-10 top-8 rotate-3"
                  delay={0.65}
                />
                <WinkFace
                  className="absolute bottom-1 right-32 -rotate-6"
                  delay={1}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
    </MotionProvider>
  );
}
