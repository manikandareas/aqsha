"use client";

import { BookOpen, GlobeIcon, Library, UserRoundIcon } from "@aqsha/ui/icons";
import { m, useReducedMotion } from "motion/react";
import type { ComponentType } from "react";

import { LandingSectionHeader } from "@/features/marketing/components/landing-section-header";
import { TechnicalCrosshairFrame } from "@/features/marketing/components/technical-crosshair-frame";

const audiences = [
  {
    title: "Mahasiswa S1 — Anak skripsi",
    body: "Nyusun bab dan daftar pustaka dengan sumber yang beneran ada — aman pas sidang.",
    icon: BookOpen,
  },
  {
    title: "Pascasarjana — Tesis & disertasi",
    body: "Ngatur ratusan referensi tanpa takut ada kutipan yang salah atau dipelintir.",
    icon: UserRoundIcon,
  },
  {
    title: "Peneliti — Paper & review jurnal",
    body: "Lebih cepat nyusun tinjauan pustaka, tiap klaim tetap kekunci ke sumbernya.",
    icon: Library,
  },
  {
    title: "Non-native — Nulis pakai Inggris",
    body: "Bahasanya jadi lebih jelas tanpa kehilangan istilah teknis dan maksud aslinya.",
    icon: GlobeIcon,
  },
] as const satisfies ReadonlyArray<{
  title: string;
  body: string;
  icon: ComponentType<{ className?: string }>;
}>;

const inView = { once: true as const, amount: 0.15 as const };

export function AudienceSection() {
  const reduce = useReducedMotion();

  return (
    <section
      id="buat-siapa"
      className="w-full scroll-mt-[72px] bg-background py-12 sm:py-16 lg:py-20"
    >
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <LandingSectionHeader
          className="mb-10 max-w-2xl sm:mb-12"
          eyebrow="Buat siapa"
          title="Nemenin kamu di tahap yang paling rawan salah."
          titleParts={["Nemenin kamu", "di tahap yang", "paling rawan salah."]}
          description="Dari kalimat pertama skripsi sampai paper dikirim."
        />

        <div className="relative -mx-4 w-[calc(100%+2rem)] overflow-visible sm:-mx-6 sm:w-[calc(100%+3rem)] lg:-mx-8 lg:w-[calc(100%+4rem)]">
          <TechnicalCrosshairFrame contentClassName="px-4 sm:px-6 lg:px-8">
            <div className="grid w-full grid-cols-1 gap-x-8 gap-y-8 sm:grid-cols-2 lg:gap-x-12 lg:gap-y-10">
              {audiences.map((item, index) => {
                const Icon = item.icon;
                const col = index % 2;
                const row = Math.floor(index / 2);
                const drift = (col - 0.5) * 8 + (row % 2 === 0 ? -3 : 3);

                return (
                  <m.article
                    key={item.title}
                    className="group flex gap-5 sm:gap-6"
                    initial={
                      reduce
                        ? false
                        : {
                            opacity: 0,
                            y: 24 + row * 6,
                            x: drift,
                          }
                    }
                    whileInView={{ opacity: 1, y: 0, x: 0 }}
                    viewport={{ once: true, amount: 0.35 }}
                    transition={{
                      type: "spring",
                      stiffness: 260 + (index % 3) * 15,
                      damping: 22,
                      delay: index * 0.06,
                    }}
                    whileHover={
                      reduce
                        ? undefined
                        : { y: -2, transition: { type: "spring", stiffness: 400, damping: 20 } }
                    }
                  >
                    <m.div
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-card sm:h-14 sm:w-14"
                      whileHover={
                        reduce
                          ? undefined
                          : { rotate: index % 2 === 0 ? -6 : 6, scale: 1.05 }
                      }
                      transition={{ type: "spring", stiffness: 420, damping: 16 }}
                    >
                      <Icon className="size-5 text-muted-foreground transition-colors group-hover:text-foreground sm:size-6" />
                    </m.div>
                    <div className="min-w-0 pt-0.5">
                      <h3 className="font-heading text-xl font-normal leading-tight text-foreground sm:text-2xl">
                        {item.title}
                      </h3>
                      <p className="mt-2 text-pretty text-sm leading-snug text-muted-foreground sm:mt-3 sm:text-base sm:leading-snug">
                        {item.body}
                      </p>
                    </div>
                  </m.article>
                );
              })}
            </div>
          </TechnicalCrosshairFrame>
        </div>
      </div>
    </section>
  );
}
