"use client";

import { m, useReducedMotion } from "motion/react";

import {
  DrawnArrow,
  drawAnimate,
  drawInitial,
  drawTransition,
  HandNote,
  Starburst,
} from "@/components/marketing/doodles";
import { MotionProvider } from "@/components/motion-provider";
import { EASE_OUT } from "@/lib/motion";

const REASONS = [
  {
    lead: "Nyari jurnal yang beneran relevan",
    rest: ", bukan sekadar banyak hasil yang nggak kebaca.",
  },
  {
    lead: "Nulis bareng AI yang nunjukin sumbernya",
    rest: " — kamu tetap yang mikir dan ngarahin.",
  },
  {
    lead: "Tiap kutipan dicek ke paper aslinya",
    rest: ", jadi aman pas sidang atau direview dosen.",
  },
] as const;

/**
 * FounderStorySection — DataFast-style personal letter from the maker. The
 * badge card sits beside the intro paragraphs only; the rest of the letter
 * flows full-width beneath, then a large hero-style window frame plays the
 * product tour video.
 */
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
            {/* Badge card + intro paragraphs side by side, like the reference. */}
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
                  Halo, pejuang{" "}
                  <span className="relative inline-block">
                    skripsi
                    {/* Squiggle underline — draws itself in, like the doodles. */}
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
                  Aku Vito, pembuat Aqsha. Aku pernah ada di posisimu: 30 tab
                  jurnal kebuka, catatan tercecer di mana-mana, dan daftar
                  pustaka yang nggak yakin bener.
                </m.p>
                <m.p className="mt-3 text-pretty" variants={rise}>
                  Yang paling bikin deg-degan bukan nulisnya —{" "}
                  <span className="font-medium text-foreground">
                    tapi ditanya dosen "sumbernya dari mana?"
                  </span>{" "}
                  dan kamu nggak bisa jawab.
                </m.p>
              </div>
            </div>

            {/* The rest of the letter flows full-width, like the reference. */}
            <m.p className="mt-8 text-pretty" variants={rise}>
              Makanya aku bikin Aqsha, buat tiga hal:
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
              Aqsha masih terus aku rapikan bareng masukan dari penggunanya.
              Yuk, selesaikan tulisanmu. 🎓
            </m.p>
          </m.div>
        </div>

        {/* Product tour video — frameless, with a hand note pointing at it. */}
        <m.div
          className="mx-auto mt-14 w-full max-w-7xl px-4 sm:mt-20 sm:px-6 lg:px-8"
          initial={reduce ? false : { opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.6, ease: EASE_OUT }}
        >
          <div
            aria-hidden
            className="pointer-events-none mb-4 hidden select-none items-start justify-start gap-2 pl-6 sm:flex"
          >
            <HandNote className="-rotate-2" delay={0.3}>
              intip cara kerjanya
            </HandNote>
            {/* Idle nudge toward the video once the stroke finishes drawing. */}
            <m.div
              animate={
                reduce
                  ? undefined
                  : {
                      transform: [
                        "translateY(0px)",
                        "translateY(5px)",
                        "translateY(0px)",
                      ],
                    }
              }
              transition={{
                duration: 1.4,
                ease: "easeInOut",
                repeat: Infinity,
                repeatDelay: 0.4,
                delay: 1.4,
              }}
            >
              <DrawnArrow
                className="mt-2 text-primary"
                curve="M10 10 C 30 14, 48 26, 56 52"
                head="M46 42 L56 55 L66 43"
                delay={0.45}
                headDelay={0.9}
              />
            </m.div>
          </div>
          <div className="relative overflow-hidden rounded-2xl">
            <div className="relative aspect-video w-full">
              <video
                className="absolute inset-0 h-full w-full object-cover"
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                poster="/landing/hero-poster.webp"
                aria-label="Video tur produk Aqsha"
              >
                <source src="/landing/hero-loop.webm" type="video/webm" />
                <source src="/landing/hero-loop.mp4" type="video/mp4" />
              </video>
              <span aria-hidden className="paper-grain absolute inset-0" />
            </div>
          </div>
        </m.div>
      </section>
    </MotionProvider>
  );
}
