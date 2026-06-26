"use client";

import { m, useReducedMotion } from "motion/react";

import { LandingSectionHeader } from "@/features/marketing/components/landing-section-header";
import {
  TechnicalCrosshairFrame,
} from "@/features/marketing/components/technical-crosshair-frame";

const comparisonRows = [
  {
    problem: "Ngasih sumber yang ternyata nggak ada",
    others: "Perplexity, ChatGPT: sering ngarang referensi",
    aqsha: "Tiap sumber dicek ke paper aslinya",
  },
  {
    problem: "Kutipan nggak nyambung sama isi paper",
    others: "AI lain: asal tempel kutipan",
    aqsha: "Kalimatnya dicocokin ke isi aslinya",
  },
  {
    problem: "Tiba-tiba ditagih, susah berhenti langganan",
    others: "SciSpace: dikeluhkan auto-perpanjang & tagihan kejutan",
    aqsha: "Harga jelas, batal kapan aja",
  },
  {
    problem: "Limit dipangkas diam-diam",
    others: "Perplexity: deep research dipotong dari 600/hari jadi 20/bulan",
    aqsha: "Batas pemakaian jelas di depan",
  },
  {
    problem: "Jawabannya dangkal, cuma permukaan",
    others: "AI lain: rangkuman cepat tapi seadanya",
    aqsha: "Bantu gali lebih dalam, kamu tetap yang mikir",
  },
  {
    problem: 'Tulisan jujurmu malah dicap "buatan AI"',
    others: "Tanpa Aqsha: nggak ada bukti buat membela diri",
    aqsha: "Nyimpen jejak proses nulismu sebagai bukti",
  },
] as const;

const inView = { once: true as const, amount: 0.12 as const };

export function ComparisonTableSection() {
  const reduce = useReducedMotion();

  return (
    <section
      id="bandingin"
      className="w-full scroll-mt-[72px] bg-background py-12 sm:py-16 lg:py-20"
    >
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <LandingSectionHeader
          className="mb-10 max-w-2xl sm:mb-12"
          eyebrow="Bandingin sendiri"
          title="Hal yang bikin pusing di tool lain — beres di Aqsha."
          titleParts={[
            "Hal yang bikin pusing",
            "di tool lain —",
            "beres di Aqsha.",
          ]}
          description="Ini bukan kami yang ngomong. Ini keluhan yang paling sering muncul dari pengguna tool riset AI."
        />

        <div className="relative -mx-4 w-[calc(100%+2rem)] overflow-visible sm:-mx-6 sm:w-[calc(100%+3rem)] lg:-mx-8 lg:w-[calc(100%+4rem)]">
          <TechnicalCrosshairFrame contentClassName="px-4 sm:px-6 lg:px-8">
            <m.div
              className="overflow-hidden rounded-2xl border border-border bg-card/50"
              initial={reduce ? false : { opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={inView}
              transition={{ type: "spring", stiffness: 160, damping: 24 }}
            >
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[640px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-border bg-muted/60">
                      <th className="px-5 py-4 text-sm font-medium text-muted-foreground sm:px-6 sm:text-[15px]">
                        Masalah
                      </th>
                      <th className="px-5 py-4 text-sm font-medium text-muted-foreground sm:px-6 sm:text-[15px]">
                        Tool lain
                      </th>
                      <th className="px-5 py-4 text-sm font-medium text-foreground sm:px-6 sm:text-[15px]">
                        Aqsha
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonRows.map((row, index) => (
                      <m.tr
                        key={row.problem}
                        className={
                          index < comparisonRows.length - 1
                            ? "border-b border-border transition-colors hover:bg-muted/30"
                            : "transition-colors hover:bg-muted/30"
                        }
                        initial={reduce ? false : { opacity: 0, x: -12 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={inView}
                        transition={{
                          delay: reduce ? 0 : index * 0.04,
                          duration: 0.4,
                        }}
                      >
                        <td className="px-5 py-4 text-sm leading-snug text-foreground sm:px-6 sm:text-[15px]">
                          {row.problem}
                        </td>
                        <td className="px-5 py-4 text-sm leading-snug text-muted-foreground sm:px-6 sm:text-[15px]">
                          {row.others}
                        </td>
                        <td className="px-5 py-4 text-sm font-medium leading-snug text-foreground sm:px-6 sm:text-[15px]">
                          {row.aqsha}
                        </td>
                      </m.tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="divide-y divide-border md:hidden">
                {comparisonRows.map((row, index) => (
                  <m.article
                    key={row.problem}
                    className="space-y-3 p-5"
                    initial={reduce ? false : { opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={inView}
                    transition={{ delay: reduce ? 0 : index * 0.05 }}
                  >
                    <p className="text-sm font-medium leading-snug text-foreground">
                      {row.problem}
                    </p>
                    <div className="rounded-xl border border-border bg-muted/40 p-3.5">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Tool lain
                      </p>
                      <p className="mt-1 text-sm leading-snug text-muted-foreground">
                        {row.others}
                      </p>
                    </div>
                    <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3.5">
                      <p className="text-xs font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                        Aqsha
                      </p>
                      <p className="mt-1 text-sm font-medium leading-snug text-foreground">
                        {row.aqsha}
                      </p>
                    </div>
                  </m.article>
                ))}
              </div>
            </m.div>

            <m.p
              className="mt-8 max-w-3xl text-xs leading-relaxed text-muted-foreground sm:text-sm"
              initial={reduce ? false : { opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={inView}
              transition={{ delay: 0.15, duration: 0.5 }}
            >
              Berdasarkan keluhan publik pengguna riset di komunitas seperti Reddit
              (2024–2025), dari 880 sinyal pada 80 thread. Nama produk lain adalah milik
              masing-masing pemiliknya; perbandingan dibuat untuk menggambarkan keluhan
              umum, bukan klaim mutlak.
            </m.p>
          </TechnicalCrosshairFrame>
        </div>
      </div>
    </section>
  );
}
