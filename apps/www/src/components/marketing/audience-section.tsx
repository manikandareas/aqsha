"use client";

import { m, useReducedMotion } from "motion/react";

import { MotionProvider } from "@/components/motion-provider";
import { EASE_OUT } from "@/lib/motion";

const personas = [
  {
    title: "Mahasiswa S1",
    sub: "Anak skripsi",
    body: "Nyusun bab dan daftar pustaka dengan sumber yang beneran ada — aman pas sidang.",
  },
  {
    title: "Pascasarjana",
    sub: "Tesis & disertasi",
    body: "Ngatur ratusan referensi tanpa takut ada kutipan yang salah atau dipelintir.",
  },
  {
    title: "Peneliti",
    sub: "Paper & review jurnal",
    body: "Lebih cepat nyusun tinjauan pustaka, tiap klaim tetap kekunci ke sumbernya.",
  },
] as const;

/**
 * AudienceSection — editorial three-column personas (border-l rules, serif
 * titles — no cards, no icons). Sentence case throughout.
 */
export function AudienceSection() {
  const reduce = useReducedMotion();

  return (
    <MotionProvider>
      <section
        id="buat-siapa"
        className="w-full scroll-mt-[72px] bg-background py-24 sm:py-32 lg:py-40"
      >
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
          <m.div
            className="mb-14 max-w-2xl sm:mb-20"
            initial={reduce ? false : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.6, ease: EASE_OUT }}
          >
            <p className="text-[15px] leading-snug text-muted-foreground sm:text-base">
              Buat siapa
            </p>
            <h2 className="font-heading mt-3 text-[2.5rem] font-medium leading-[1.08] tracking-normal text-foreground sm:mt-4 sm:text-[2.75rem] sm:leading-[1.06] lg:text-[3.25rem] lg:leading-[1.05]">
              Nemenin kamu di tahap yang paling rawan salah.
            </h2>
            <p className="mt-5 max-w-xl text-pretty text-base leading-snug text-foreground/85 sm:text-lg sm:leading-snug">
              Dari kalimat pertama skripsi sampai paper dikirim.
            </p>
          </m.div>

          <div className="grid gap-y-10 sm:gap-x-10 lg:grid-cols-3 lg:gap-x-12">
            {personas.map((persona, index) => (
              <m.div
                key={persona.title}
                className="border-l border-border pl-6"
                initial={reduce ? false : { opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{
                  delay: reduce ? 0 : index * 0.1,
                  type: "spring",
                  stiffness: 200,
                  damping: 24,
                }}
              >
                <p className="text-sm text-muted-foreground sm:text-[15px]">
                  {persona.sub}
                </p>
                <h3 className="font-heading mt-2 text-3xl font-medium leading-tight tracking-normal text-foreground">
                  {persona.title}
                </h3>
                <p className="mt-4 max-w-xs text-pretty text-sm leading-snug text-muted-foreground sm:text-base sm:leading-snug">
                  {persona.body}
                </p>
              </m.div>
            ))}
          </div>
        </div>
      </section>
    </MotionProvider>
  );
}
