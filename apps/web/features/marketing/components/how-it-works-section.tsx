"use client";

import Link from "next/link";
import { m, useReducedMotion } from "motion/react";

import { Button } from "@/components/ui/button";
import {
  AllInOneVisual,
  AstraAssistantVisual,
  CitationCheckVisual,
} from "@/features/marketing/components/feature-visuals";
import { LandingSectionHeader } from "@/features/marketing/components/landing-section-header";
import {
  TechnicalCrosshairFrame,
  TechnicalFrameHorizontalRule,
} from "@/features/marketing/components/technical-crosshair-frame";
import { WorkflowCopyBlock } from "@/features/marketing/components/workflow-copy-block";

const workflowTitleParts = [
  "Tiga langkah,",
  "dari nyari",
  "sampai siap dikirim.",
] as const;

const steps = [
  {
    phase: "Pas mulai",
    title: "Kumpulin & cari jurnal",
    body: "Cari referensi dan simpan semua di satu tempat. Nggak ada lagi 30 tab kebuka dan bingung mana yang penting.",
    items: [
      ["Cari jurnal", "Temukan paper relevan langsung dari workspace"],
      ["Simpan sumber", "PDF, DOI, dan catatan di satu tempat"],
      ["Atur referensi", "Semua siap dipakai pas nulis"],
      ["Tanpa tab berantakan", "Nggak pindah-pindah aplikasi lagi"],
    ] as [string, string][],
    visual: <AllInOneVisual />,
  },
  {
    phase: "Pas nyusun & nulis",
    title: "Nulis bareng Astra",
    body: "Astra bantu nyari dan nyusun bahan dari jurnal. Kamu yang ngarahin dan mikir, dia yang bantu beresin — bukan dia yang ngerjain semuanya.",
    items: [
      ["Kamu yang ngarahin", "Arah riset tetap di tanganmu"],
      ["Sumber selalu kelihatan", "Tiap poin nunjuk asalnya"],
      ["Bukan auto-pilot", "AI bantu beresin, bukan ngerjain semua"],
      ["Tulisan tetap punyamu", "Bukan output generik tanpa konteks"],
    ] as [string, string][],
    visual: <AstraAssistantVisual />,
  },
  {
    phase: "Sebelum submit",
    title: "Tiap sumber dicek otomatis",
    body: "Sebelum dikirim, Aqsha mastiin tiap kutipan beneran ada di sumbernya. Yang aman ditandai hijau, yang meragukan ditandai biar bisa kamu cek dulu.",
    items: [
      ["Cek ke paper asli", "Bukan cuma lihat judulnya"],
      ["Cocokkan kalimat", "Kutipan dicocokin ke isi sumber"],
      ["Hijau = aman", "Siap dipakai di draf"],
      ["Flag = cek dulu", "Yang meragukan ditandai jelas"],
    ] as [string, string][],
    visual: <CitationCheckVisual />,
  },
] as const;

const inView = { once: true as const, amount: 0.22 as const };

export function HowItWorksSection() {
  const reduce = useReducedMotion();

  return (
    <section
      id="cara-kerja"
      className="w-full scroll-mt-[72px] bg-background py-12 sm:py-16 lg:py-20"
    >
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4 sm:py-5">
          <LandingSectionHeader
            className="min-w-0 max-w-2xl flex-1"
            eyebrow="Gimana cara pakainya"
            title="Tiga langkah, dari nyari sampai siap dikirim."
            titleParts={workflowTitleParts}
            description="Ngikutin cara kamu riset beneran — bukan maksa pindah-pindah belasan aplikasi."
          />
          <m.div
            initial={reduce ? false : { opacity: 0, rotate: 4, y: 16 }}
            whileInView={{ opacity: 1, rotate: 0, y: 0 }}
            viewport={{ once: true, amount: 0.85 }}
            transition={{
              type: "spring",
              stiffness: 220,
              damping: 16,
              delay: reduce ? 0 : 0.28,
            }}
            whileHover={reduce ? undefined : { rotate: -0.6, scale: 1.02 }}
            whileTap={reduce ? undefined : { scale: 0.98 }}
          >
            <Button
              asChild
              variant="outline"
              className="h-10 w-fit shrink-0 rounded-full px-5 text-sm shadow-sm sm:h-11 sm:px-6 sm:text-base"
            >
              <Link href="#fitur">Lihat fiturnya</Link>
            </Button>
          </m.div>
        </div>

        <div className="relative -mx-4 mt-10 w-[calc(100%+2rem)] overflow-visible sm:-mx-6 sm:mt-12 sm:w-[calc(100%+3rem)] lg:-mx-8 lg:mt-14 lg:w-[calc(100%+4rem)]">
          <TechnicalCrosshairFrame>
            {steps.map((step, index) => {
              const reverse = index % 2 === 1;
              const isLast = index === steps.length - 1;

              return (
                <div key={step.title}>
                  <div className="px-4 sm:px-6 lg:px-8">
                    <div
                      className={`grid gap-10 lg:grid-cols-2 lg:items-start lg:gap-x-14 xl:gap-x-20 ${
                        isLast ? "pb-8 pt-10 sm:pb-10 sm:pt-12 lg:pb-12 lg:pt-14" : "py-10 sm:py-12 lg:py-14"
                      } ${index === 0 ? "pt-8 sm:pt-10 lg:pt-12" : ""}`}
                    >
                      <m.div
                        className={reverse ? "lg:order-2" : undefined}
                        initial={
                          reduce
                            ? false
                            : {
                                opacity: 0,
                                x: reverse ? 36 : -36,
                                filter: "blur(6px)",
                              }
                        }
                        whileInView={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                        viewport={inView}
                        transition={{
                          type: "spring",
                          stiffness: 150,
                          damping: 24,
                        }}
                      >
                        <WorkflowCopyBlock
                          phase={step.phase}
                          title={step.title}
                          body={step.body}
                          items={step.items}
                        />
                      </m.div>
                      <m.div
                        className={reverse ? "lg:order-1" : undefined}
                        initial={
                          reduce
                            ? false
                            : {
                                opacity: 0,
                                x: reverse ? -40 : 40,
                                y: 12,
                                rotate: reverse ? -1 : 1,
                              }
                        }
                        whileInView={{ opacity: 1, x: 0, y: 0, rotate: 0 }}
                        viewport={inView}
                        transition={{
                          type: "spring",
                          stiffness: 170,
                          damping: 22,
                          delay: reduce ? 0 : 0.08,
                        }}
                      >
                        {step.visual}
                      </m.div>
                    </div>
                  </div>
                  {!isLast ? <TechnicalFrameHorizontalRule /> : null}
                </div>
              );
            })}
          </TechnicalCrosshairFrame>
        </div>
      </div>
    </section>
  );
}
