"use client";

import { m, useReducedMotion } from "motion/react";

import {
  drawAnimate,
  drawInitial,
  drawTransition,
  Starburst,
} from "@/components/marketing/doodles";
import { MotionProvider } from "@/components/motion-provider";
import { EASE_OUT } from "@/lib/motion";

const REASONS = [
  {
    lead: "Mulai dari karya tulis yang ingin diselesaikan",
    rest: ", bukan dari percakapan kosong yang cepat kehilangan konteks.",
  },
  {
    lead: "Menjaga sumber dekat dengan draf",
    rest: ", supaya ide, catatan, dan referensi tidak tercerai-berai.",
  },
  {
    lead: "Memberi Astra ruang untuk membantu tanpa mengambil alih",
    rest: ", lewat usulan yang tetap kamu review sendiri.",
  },
] as const;

/** FounderStorySection — surat singkat dari pembuat Aqsha. */
export function FounderStorySection() {
  const reduce = useReducedMotion();

  const rise = reduce
    ? { hidden: { opacity: 0 }, shown: { opacity: 1 } }
    : {
        hidden: { opacity: 0, y: 18 },
        shown: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.55, ease: EASE_OUT },
        },
      };

  return (
    <MotionProvider>
      <section
        id="cerita-pembuat"
        aria-label="Cerita di balik Aqsha"
        className="w-full scroll-mt-[72px] overflow-x-clip bg-background pb-24 sm:pb-32 lg:pb-40"
      >
        <div className="mx-auto w-full max-w-2xl px-4 sm:px-6">
          <m.div
            className="text-sm leading-relaxed text-muted-foreground sm:text-[15px]"
            initial="hidden"
            whileInView="shown"
            viewport={{ once: true, amount: 0.2 }}
            transition={{ staggerChildren: 0.07 }}
          >
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-[10.5rem_1fr] sm:gap-8">
              <m.div
                className="relative mx-auto aspect-square w-full max-w-[10.5rem] self-start overflow-hidden rounded-2xl border-2 border-border"
                variants={
                  reduce
                    ? rise
                    : {
                        hidden: { opacity: 0, scale: 0.92, rotate: -2 },
                        shown: {
                          opacity: 1,
                          scale: 1,
                          rotate: 0,
                          transition: {
                            type: "spring" as const,
                            stiffness: 260,
                            damping: 24,
                          },
                        },
                      }
                }
              >
                <img
                  src="/landing/me.jpeg"
                  alt="Vito, pembuat Aqsha"
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-cover"
                />
              </m.div>

              <div className="relative">
                <Starburst
                  className="absolute -top-6 right-0 hidden -rotate-12 sm:block"
                  delay={0.4}
                />
                <m.h2
                  className="font-heading text-xl font-medium leading-[1.15] text-foreground sm:text-2xl"
                  variants={rise}
                >
                  Halo, penulis{" "}
                  <span className="relative inline-block">
                    karya tulis
                    <svg
                      aria-hidden
                      viewBox="0 0 120 12"
                      fill="none"
                      preserveAspectRatio="none"
                      className="absolute -bottom-1 left-0 h-2 w-full text-primary"
                    >
                      <m.path
                        d="M3 8 C 7 3, 11 3, 15 8 S 23 13, 27 8 S 35 3, 39 8 S 47 13, 51 8 S 59 3, 63 8 S 71 13, 75 8 S 83 3, 87 8 S 95 13, 99 8 S 107 3, 111 8 L 117 8"
                        stroke="currentColor"
                        strokeWidth={3.5}
                        strokeLinecap="round"
                        initial={drawInitial(reduce)}
                        whileInView={drawAnimate}
                        viewport={{ once: true }}
                        transition={drawTransition(0.35, 0.55)}
                      />
                    </svg>
                  </span>{" "}
                  👋
                </m.h2>
                <m.p className="mt-3 text-pretty" variants={rise}>
                  Aqsha dimulai dari masalah yang sederhana: riset dan tulisan
                  sering hidup di tempat yang berbeda.
                </m.p>
                <m.p className="mt-3 text-pretty" variants={rise}>
                  Aku Vito, pembuat Aqsha. Saat mengerjakan karya tulis, aku
                  sering berpindah antara catatan, dokumen, dan sumber yang sama.
                </m.p>
              </div>
            </div>

            <m.p className="mt-8 text-pretty" variants={rise}>
              Itu sebabnya Aqsha dibuat untuk tiga hal:
            </m.p>
            <ol className="mt-4 space-y-2">
              {REASONS.map((reason, index) => (
                <m.li key={reason.lead} className="text-pretty" variants={rise}>
                  {index + 1}.{" "}
                  <span className="font-medium text-foreground">
                    {reason.lead}
                  </span>
                  {reason.rest}
                </m.li>
              ))}
            </ol>
            <m.p className="mt-5 text-pretty" variants={rise}>
              Aqsha terus aku rapikan pelan-pelan. Semoga ia membantu kamu
              kembali ke karya yang ingin kamu selesaikan. 🎓
            </m.p>
          </m.div>
        </div>
      </section>
    </MotionProvider>
  );
}
