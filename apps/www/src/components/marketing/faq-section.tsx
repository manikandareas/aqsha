"use client";

import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { useState } from "react";

import { faqItems } from "@/components/marketing/faq-data";
import { cn } from "@/lib/utils";

/**
 * FAQ landing — konten yang sama dengan FAQPage JSON-LD (lihat
 * structured-data.tsx). Wajib visible agar rich result FAQ Google valid:
 * markup harus mencerminkan konten di halaman. Answer selalu di DOM
 * (height 0 saat tutup, bukan unmount) supaya crawler tetap baca. Sumber
 * tunggal: faq-data.ts.
 *
 * Identitas section: satu kolom sempit (max-w-3xl) — kebalikan dari split
 * dua kolom di section lain. Signature micro-interaction: "ghost index" —
 * angka serif raksasa di margin kiri luar (lg) menampilkan nomor pertanyaan
 * yang sedang terbuka, crossfade saat berganti. Toggle pakai morph plus→cross
 * (dua garis 1px, rotate 45°) — tanpa icon.
 */
export function FaqSection() {
  const reduce = useReducedMotion();
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section
      id="faq"
      className="w-full scroll-mt-[72px] bg-background py-28 sm:py-36 lg:py-44"
    >
      <div className="relative mx-auto w-full max-w-3xl px-4 sm:px-6">
        {/* Header */}
        <div className="mb-12 sm:mb-16">
          <m.p
            className="text-[15px] leading-snug text-muted-foreground sm:text-base"
            initial={
              reduce ? false : { opacity: 0, clipPath: "inset(100% 0 0 0)", y: 6 }
            }
            whileInView={{ opacity: 1, clipPath: "inset(0% 0 0 0)", y: 0 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          >
            Masih ada yang ganjel?
          </m.p>
          <m.h2
            className="font-heading mt-3 text-[2.5rem] font-medium leading-[1.08] tracking-normal text-foreground sm:mt-4 sm:text-[2.75rem] sm:leading-[1.06] lg:text-[3rem] lg:leading-[1.05]"
            initial={reduce ? false : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            Pertanyaan yang sering muncul.
          </m.h2>
          <p className="font-hand mt-6 text-lg text-foreground/60 sm:text-xl">
            masih ada yang mau ditanya?
          </p>
        </div>

        {/* Ghost index — giant number of the open question, outside the column */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-full hidden w-28 lg:block"
        >
          <div className="sticky top-32 pr-8 text-right">
            <AnimatePresence mode="wait" initial={false}>
              {openIndex !== null ? (
                <m.span
                  key={openIndex}
                  className="font-heading block text-8xl leading-none text-foreground/10"
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, y: -12 }}
                  transition={{ duration: reduce ? 0.1 : 0.3, ease: [0.22, 1, 0.36, 1] }}
                >
                  {String(openIndex + 1).padStart(2, "0")}
                </m.span>
              ) : null}
            </AnimatePresence>
          </div>
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
                transition={{ delay: reduce ? 0 : index * 0.04, duration: 0.4 }}
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
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
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
    </section>
  );
}
