"use client";

import { m, useReducedMotion } from "motion/react";

import { MotionProvider } from "@/components/motion-provider";
import { EASE_OUT } from "@/lib/motion";

const TESTIMONIAL = {
  name: "Nadia Putri",
  role: "Mahasiswa tingkat akhir",
  affiliation: "Universitas Brawijaya",
  rating: 5,
} as const;

const POINTS = [
  "1. jurnal relevan ketemu lebih cepat",
  "2. draf selalu nyambung ke sumber",
] as const;

/**
 * TestimonialSection — compact social proof between the feature journey
 * and audience section. The fictional persona is labelled explicitly so it
 * cannot be mistaken for a verified endorsement.
 */
export function TestimonialSection() {
  const reduce = useReducedMotion();

  const rise = reduce
    ? { hidden: { opacity: 0 }, shown: { opacity: 1 } }
    : {
        hidden: { opacity: 0, y: 14 },
        shown: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.55, ease: EASE_OUT },
        },
      };

  const starPop = reduce
    ? rise
    : {
        hidden: { opacity: 0, scale: 0.5, rotate: -18 },
        shown: {
          opacity: 1,
          scale: 1,
          rotate: 0,
          transition: { type: "spring" as const, stiffness: 420, damping: 22 },
        },
      };

  return (
    <MotionProvider>
      <section
        aria-label="Cerita pengguna Aqsha"
        className="w-full overflow-x-clip bg-background pb-24 text-foreground sm:pb-32 lg:pb-40"
      >
        <m.div
          className="mx-auto flex w-full max-w-md flex-col items-center px-4 text-center"
          initial="hidden"
          whileInView="shown"
          viewport={{ once: true, amount: 0.35 }}
          transition={{ staggerChildren: 0.08 }}
        >
          <m.p
            aria-label="Dinilai 5 dari 5"
            className="flex gap-1 text-lg leading-none text-lemon sm:text-xl"
            transition={{ staggerChildren: 0.06 }}
            variants={rise}
          >
            {Array.from({ length: TESTIMONIAL.rating }, (_, index) => (
              <m.span
                aria-hidden
                className="inline-block"
                key={index}
                variants={starPop}
              >
                ★
              </m.span>
            ))}
          </m.p>

          <blockquote className="mt-5 text-pretty text-base leading-relaxed sm:text-lg">
            <m.p variants={rise}>Aku pakai Aqsha sebulan terakhir buat skripsi.</m.p>
            <ol className="mt-4 space-y-1">
              {POINTS.map((point) => (
                <m.li key={point} variants={rise}>
                  {point}
                </m.li>
              ))}
              <m.li variants={rise}>
                3.{" "}
                <m.span
                  className="box-decoration-clone rounded-sm px-1.5 font-medium text-lemon-chip-ink"
                  style={{
                    backgroundImage:
                      "linear-gradient(var(--color-lemon), var(--color-lemon))",
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "0 0",
                  }}
                  variants={
                    reduce
                      ? {
                          hidden: { backgroundSize: "100% 100%" },
                          shown: { backgroundSize: "100% 100%" },
                        }
                      : {
                          hidden: { backgroundSize: "0% 100%" },
                          shown: {
                            backgroundSize: "100% 100%",
                            transition: {
                              duration: 0.7,
                              ease: EASE_OUT,
                              delay: 0.15,
                            },
                          },
                        }
                  }
                >
                  setiap kutipan kecek sebelum bimbingan
                </m.span>
              </m.li>
            </ol>
            <m.p className="mt-4" variants={rise}>
              Revisi jadi jauh lebih tenang.
            </m.p>
          </blockquote>

          <m.footer
            className="mt-6 flex items-center gap-3 text-left"
            variants={rise}
          >
            <m.span
              aria-hidden
              className="grid size-10 shrink-0 place-items-center rounded-full border-2 border-lemon-soft-border bg-lemon-soft font-heading text-xs font-black text-lemon-chip-ink"
              variants={
                reduce
                  ? rise
                  : {
                      hidden: { opacity: 0, scale: 0.8, rotate: -8 },
                      shown: {
                        opacity: 1,
                        scale: 1,
                        rotate: 0,
                        transition: {
                          type: "spring" as const,
                          stiffness: 360,
                          damping: 24,
                        },
                      },
                    }
              }
            >
              NP
            </m.span>
            <div>
              <cite className="font-heading text-sm font-bold not-italic text-foreground sm:text-base">
                {TESTIMONIAL.name}
              </cite>
              <p className="text-xs leading-snug text-muted-foreground">
                {TESTIMONIAL.role} · {TESTIMONIAL.affiliation} ·{" "}
                <span className="text-muted-foreground/75">Persona pengguna</span>
              </p>
            </div>
          </m.footer>
        </m.div>
      </section>
    </MotionProvider>
  );
}
