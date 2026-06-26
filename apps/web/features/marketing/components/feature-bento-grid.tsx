"use client";

import { m, useReducedMotion } from "motion/react";
import {
  CheckCircle2,
  Library,
  Shield,
} from "@aqsha/ui/icons";

import {
  AllInOneVisual,
  AstraAssistantVisual,
  CitationCheckVisual,
  ProvenanceVisual,
} from "@/features/marketing/components/feature-visuals";
import { LandingSectionHeader } from "@/features/marketing/components/landing-section-header";

const featureTiles = [
  {
    icon: Library,
    title: "Jurnal banyak, limit jelas",
    body: "Akses ke banyak jurnal dengan batas pemakaian transparan — nggak dikurangin diam-diam.",
  },
  {
    icon: Shield,
    title: "Harga jujur",
    body: "Tahu persis yang kamu bayar. Bisa berhenti kapan aja, tanpa perpanjangan diam-diam.",
  },
] as const;

const inView = { once: true as const, amount: 0.15 as const };

export function FeatureBentoGrid() {
  const reduce = useReducedMotion();

  const card1Variants = {
    hidden: reduce
      ? { opacity: 1, x: 0, y: 0, scale: 1 }
      : { opacity: 0, x: -28, y: 20, scale: 0.98 },
    visible: {
      opacity: 1,
      x: 0,
      y: 0,
      scale: 1,
      transition: { type: "spring" as const, stiffness: 140, damping: 24, mass: 0.85 },
    },
  } as const;

  const card1InnerVariants = {
    hidden: reduce ? { opacity: 1, y: 0 } : { opacity: 0, y: 18 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        delay: reduce ? 0 : 0.08,
        type: "spring" as const,
        stiffness: 200,
        damping: 24,
      },
    },
  } as const;

  const card2Variants = {
    hidden: reduce
      ? { opacity: 1, y: 0, scale: 1 }
      : { opacity: 0, y: 36, scale: 0.98 },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        type: "spring" as const,
        stiffness: 150,
        damping: 24,
        mass: 0.82,
        delay: reduce ? 0 : 0.05,
      },
    },
  } as const;

  const tileVariants = {
    hidden: reduce ? { opacity: 1, y: 0 } : { opacity: 0, y: 22 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: {
        type: "spring" as const,
        stiffness: 280,
        damping: 26,
        delay: reduce ? 0 : i * 0.045,
      },
    }),
  };

  return (
    <div id="fitur" className="scroll-mt-[72px]">
      <div className="mx-auto w-full max-w-7xl px-4 pt-12 sm:px-6 sm:pt-16 lg:px-8 lg:pt-20">
        <LandingSectionHeader
          className="mb-10 max-w-2xl sm:mb-12"
          eyebrow="Apa yang kamu dapet"
          title="Fitur yang lahir dari keluhan nyata, bukan teori."
          titleParts={[
            "Fitur yang lahir",
            "dari keluhan nyata,",
            "bukan teori.",
          ]}
        />
      </div>

      <div className="mx-auto w-full max-w-7xl px-4 pb-20 sm:px-6 sm:pb-24 lg:px-8 lg:pb-28">
        <div className="grid gap-3 contain-[layout] sm:gap-4 lg:grid-cols-4">
          <m.article
            className="relative flex min-h-[460px] flex-col overflow-hidden rounded-2xl border border-border bg-muted p-5 sm:min-h-[480px] sm:p-6 lg:col-span-2"
            initial="hidden"
            whileInView="visible"
            viewport={inView}
            variants={card1Variants}
          >
            <div className="absolute inset-x-0 bottom-0 h-[42%] border-t border-border bg-card/80" />
            <m.div
              className="relative z-10"
              variants={card1InnerVariants}
            >
              <CitationCheckVisual />
            </m.div>
            <div className="relative z-10 mt-auto pt-8 text-foreground sm:pt-10">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Yang utama
              </p>
              <h3 className="font-heading mt-2 text-xl font-normal leading-[1.1] tracking-normal sm:text-2xl">
                Sumber dicek otomatis
              </h3>
              <p className="mt-3 max-w-2xl text-pretty text-sm leading-snug text-muted-foreground sm:mt-4 sm:text-base sm:leading-snug">
                Tiap referensi dicek ke paper aslinya. Kalau sumbernya nggak ada atau
                isinya nggak cocok, langsung ditandai — sebelum dosenmu yang nemu duluan.
              </p>
            </div>
          </m.article>

          <m.article
            className="relative flex min-h-[440px] flex-col justify-between overflow-hidden rounded-2xl border border-border bg-muted p-5 sm:min-h-[460px] sm:p-6 lg:col-span-2"
            initial="hidden"
            whileInView="visible"
            viewport={inView}
            variants={card2Variants}
          >
            <m.div
              className="relative z-10"
              initial={reduce ? false : { opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={inView}
              transition={{ type: "spring", stiffness: 190, damping: 24, delay: 0.1 }}
            >
              <AstraAssistantVisual />
            </m.div>
            <div className="relative z-10 mt-8">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Asisten
              </p>
              <h3 className="font-heading mt-2 text-xl font-normal leading-[1.1] tracking-normal text-foreground sm:text-2xl">
                Astra, asisten risetmu
              </h3>
              <p className="mt-3 max-w-2xl text-pretty text-sm leading-snug text-muted-foreground sm:mt-4 sm:text-base sm:leading-snug">
                Bantu nyari dan nyusun jurnal lebih dalam. Tiap poin selalu nunjuk
                asalnya — tulisannya tetap punyamu.
              </p>
            </div>
          </m.article>

          <m.article
            className="relative flex min-h-[380px] flex-col overflow-hidden rounded-2xl border border-border bg-muted p-5 sm:min-h-[400px] sm:p-6 lg:col-span-2"
            initial="hidden"
            whileInView="visible"
            viewport={inView}
            variants={card2Variants}
          >
            <m.div
              className="relative z-10"
              initial={reduce ? false : { opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={inView}
              transition={{ type: "spring", stiffness: 190, damping: 24, delay: 0.08 }}
            >
              <AllInOneVisual />
            </m.div>
            <div className="relative z-10 mt-auto pt-8">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Satu tempat
              </p>
              <h3 className="font-heading mt-2 text-xl font-normal leading-[1.1] tracking-normal sm:text-2xl">
                Semua di satu aplikasi
              </h3>
              <p className="mt-3 text-pretty text-sm leading-snug text-muted-foreground sm:text-base sm:leading-snug">
                Cari jurnal, simpan, atur, dan nulis di satu tempat — nggak ada lagi 30
                tab kebuka.
              </p>
            </div>
          </m.article>

          <m.article
            className="relative flex min-h-[380px] flex-col overflow-hidden rounded-2xl border border-border bg-muted p-5 sm:min-h-[400px] sm:p-6 lg:col-span-2"
            initial="hidden"
            whileInView="visible"
            viewport={inView}
            variants={card2Variants}
          >
            <m.div
              className="relative z-10"
              initial={reduce ? false : { opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={inView}
              transition={{ type: "spring", stiffness: 190, damping: 24, delay: 0.1 }}
            >
              <ProvenanceVisual />
            </m.div>
            <div className="relative z-10 mt-auto pt-8">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Bukti
              </p>
              <h3 className="font-heading mt-2 text-xl font-normal leading-[1.1] tracking-normal sm:text-2xl">
                Bukti kamu yang nulis
              </h3>
              <p className="mt-3 text-pretty text-sm leading-snug text-muted-foreground sm:text-base sm:leading-snug">
                Jejak proses nulismu disimpan — berguna kalau tulisan jujurmu salah dicap
                buatan AI.
              </p>
            </div>
          </m.article>

          <m.article
            className="relative flex min-h-[200px] flex-col justify-center overflow-hidden rounded-2xl border border-border bg-foreground p-6 text-primary-foreground sm:min-h-[220px] sm:p-7 lg:col-span-2"
            initial={reduce ? false : { opacity: 0, scale: 0.98 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={inView}
            transition={{ type: "spring", stiffness: 160, damping: 24 }}
          >
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-foreground/10">
                <CheckCircle2 className="size-5" />
              </div>
              <div>
                <h3 className="font-heading text-xl font-normal leading-tight sm:text-2xl">
                  Mulai dari sini
                </h3>
                <p className="mt-2 text-pretty text-sm leading-snug text-primary-foreground/80 sm:text-base">
                  Daftar gratis, buka workspace risetmu, dan biarin Aqsha yang ngecek
                  sumbernya — langsung dari browser.
                </p>
              </div>
            </div>
          </m.article>

          {featureTiles.map((feature, index) => {
            const Icon = feature.icon;
            const fromLeft = index % 2 === 0;

            return (
              <m.article
                key={feature.title}
                className="flex min-h-0 flex-col rounded-2xl border border-border bg-muted p-5 transition-shadow duration-200 sm:p-6 hover:shadow-lg"
                custom={index}
                initial="hidden"
                whileInView="visible"
                viewport={inView}
                variants={tileVariants}
                whileHover={
                  reduce ? undefined : { y: -3, transition: { duration: 0.2 } }
                }
              >
                <m.div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-foreground sm:h-12 sm:w-12"
                  whileHover={
                    reduce
                      ? undefined
                      : {
                          rotate: fromLeft ? -5 : 5,
                          scale: 1.04,
                          transition: { type: "spring", stiffness: 400, damping: 20 },
                        }
                  }
                >
                  <Icon className="size-5" />
                </m.div>
                <div className="mt-8 flex flex-1 flex-col sm:mt-10">
                  <h3 className="font-heading text-lg font-normal leading-tight tracking-normal text-foreground sm:text-xl">
                    {feature.title}
                  </h3>
                  <p className="mt-3 text-pretty text-sm leading-snug text-muted-foreground sm:mt-4 sm:text-base sm:leading-snug">
                    {feature.body}
                  </p>
                </div>
              </m.article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
