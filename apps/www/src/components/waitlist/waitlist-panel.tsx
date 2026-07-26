"use client";

import { m, useReducedMotion } from "motion/react";

import { BookOpenIcon, FlagIcon, SparklesIcon } from "@/components/icons";
import {
  DrawnArrow,
  HandNote,
  HandUnderline,
  Spark,
  Starburst,
} from "@/components/marketing/doodles";
import { MotionProvider } from "@/components/motion-provider";
import { WaitlistForm } from "@/components/waitlist/waitlist-form";
import { EASE_OUT } from "@/lib/motion";

const PERKS = [
  {
    icon: FlagIcon,
    text: "Kabar duluan begitu akses awal dibuka.",
    chipClass:
      "bg-[var(--mint-soft)] [border-color:var(--mint-soft-border)] text-[var(--mint-foreground)]",
  },
  {
    icon: BookOpenIcon,
    text: "Proyek, dokumen Typst, dan referensi duduk di satu ruang kerja.",
    chipClass:
      "bg-[var(--lavender-soft)] [border-color:var(--lavender-soft-border)] text-[var(--lavender-foreground)]",
  },
  {
    icon: SparklesIcon,
    text: "Astra bantu cari sumber dan menyusun draf—kamu tetap yang review.",
    chipClass:
      "bg-[var(--lemon-soft)] [border-color:var(--lemon-soft-border)] text-[var(--lemon-foreground)]",
  },
] as const;

const rise = (reduce: boolean | null) =>
  reduce
    ? { hidden: { opacity: 1 }, show: { opacity: 1 } }
    : {
        hidden: { opacity: 0, y: 16 },
        show: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.5, ease: EASE_OUT },
        },
      };

/**
 * WaitlistPanel — halaman waitlist dengan bahasa landing: judul bergaris
 * tangan, tiga alasan bertanda warna, dan form yang berdiri langsung di atas
 * halaman (tanpa kartu) di kolom kanan. Entrances di-stagger dari atas ke
 * bawah karena semuanya above the fold; doodle margin hanya muncul di lg.
 */
export function WaitlistPanel() {
  const reduce = useReducedMotion();
  const item = rise(reduce);

  return (
    <MotionProvider>
      {/* Mobile menaruh form tepat setelah judul; lg memindahkannya ke kolom
          kanan dan menurunkan daftar alasan ke baris kedua kolom kiri. */}
      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-x-20 lg:gap-y-12">
        <m.div
          className="lg:col-start-1 lg:row-start-1"
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: reduce ? 0 : 0.08 } } }}
        >
          <m.h1
            className="font-heading max-w-[16ch] text-balance text-[2.4rem] font-medium leading-[1.08] tracking-normal text-foreground sm:text-5xl sm:leading-[1.06]"
            variants={item}
          >
            Masuk daftar{" "}
            <span className="relative inline-block">
              akses awal
              <HandUnderline mode="animate" delay={0.45} />
            </span>{" "}
            Aqsha
            <Starburst
              className="ml-3 inline-block size-6 -translate-y-3 rotate-12 sm:size-7"
              delay={0.65}
              mode="animate"
            />
          </m.h1>

          <m.p
            className="mt-4 max-w-md text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base"
            variants={item}
          >
            Tinggalkan email untuk mengonfirmasi pendaftaran. Kami akan
            mengabarimu saat Aqsha siap dibuka—bukan untuk mengirim newsletter
            marketing.
          </m.p>
        </m.div>

        <m.div
          className="relative lg:col-start-2 lg:row-span-2 lg:row-start-1"
          initial={reduce ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            delay: reduce ? 0 : 0.15,
            type: "spring",
            stiffness: 180,
            damping: 22,
          }}
        >
          <Spark
            className="absolute -right-2 -top-6 hidden rotate-6 lg:block"
            delay={0.85}
            mode="animate"
          />
          <WaitlistForm />
          <p className="mt-5 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
            Kami simpan emailmu hanya untuk kabar peluncuran.
          </p>
        </m.div>

        <m.div
          className="lg:col-start-1 lg:row-start-2"
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: reduce ? 0 : 0.09 } } }}
        >
          <m.ul
            className="space-y-4"
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: reduce ? 0 : 0.09 } },
            }}
          >
            {PERKS.map((perk) => {
              const Icon = perk.icon;
              return (
                <m.li
                  key={perk.text}
                  className="flex items-start gap-3 text-sm leading-relaxed text-foreground/85 sm:text-[15px]"
                  variants={item}
                >
                  <span
                    aria-hidden
                    className={`mt-px inline-flex size-8 shrink-0 items-center justify-center rounded-full border-2 ${perk.chipClass}`}
                  >
                    <Icon size={16} />
                  </span>
                  <span className="pt-1.5">{perk.text}</span>
                </m.li>
              );
            })}
          </m.ul>

          {/* Catatan tulisan tangan + panah yang menunjuk ke form di kolom kanan. */}
          <div
            aria-hidden
            className="pointer-events-none mt-10 hidden select-none lg:flex lg:items-end lg:gap-2"
          >
            <HandNote className="-rotate-2" delay={0.8} mode="animate">
              cuma satu email konfirmasi
            </HandNote>
            <DrawnArrow
              className="h-14 w-24 shrink-0 text-mint"
              viewBox="0 0 160 90"
              curve="M8 70 C 46 74, 106 60, 138 24"
              head="M116 20 L140 20 L138 44"
              delay={0.9}
              headDelay={1.4}
              mode="animate"
            />
          </div>
        </m.div>
      </div>
    </MotionProvider>
  );
}
