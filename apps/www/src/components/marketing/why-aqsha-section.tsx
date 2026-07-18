"use client";

import { m, useReducedMotion } from "motion/react";
import type { ComponentType } from "react";

import {
  ArchiveIcon,
  BookOpenIcon,
  CheckCircleIcon,
  FileExportedIcon,
  FileSearchIcon,
  FlagIcon,
  HistoryIcon,
  PenIcon,
  SearchIcon,
  SparklesIcon,
} from "@/components/icons";
import { MotionProvider } from "@/components/motion-provider";

type IconComponent = ComponentType<{ size?: number; className?: string }>;

type StepIconKey =
  | "search"
  | "file-search"
  | "archive"
  | "book-open"
  | "check-circle"
  | "flag"
  | "history"
  | "pen"
  | "file-exported";

type CompareRowData = {
  prompt: string;
  competitor: string;
  competitorReply: string;
  competitorNote: string;
  steps: { icon: StepIconKey; text: string }[];
  result: string;
};

const STEP_ICONS: Record<StepIconKey, IconComponent> = {
  search: SearchIcon,
  "file-search": FileSearchIcon,
  archive: ArchiveIcon,
  "book-open": BookOpenIcon,
  "check-circle": CheckCircleIcon,
  flag: FlagIcon,
  history: HistoryIcon,
  pen: PenIcon,
  "file-exported": FileExportedIcon,
};

const rows: CompareRowData[] = [
  {
    prompt: "Cariin aku jurnal buat bab 2 skripsiku tentang stunting",
    competitor: "ChatGPT",
    competitorReply:
      "Tentu! Berikut 10 jurnal yang relevan: “Determinan Stunting di Indonesia” (2021), “Analisis Faktor Gizi Balita” (2019)…",
    competitorNote: "judulnya meyakinkan — sebagian nggak pernah ada",
    steps: [
      { icon: "search", text: "Nyari di OpenAlex, arXiv, dan Crossref" },
      { icon: "file-search", text: "Ngecek tiap judul dan DOI ke paper aslinya" },
      { icon: "archive", text: "Nyimpen PDF dan metadata ke workspace-mu" },
    ],
    result:
      "Beres. 10 paper masuk workspace — semuanya beneran ada dan siap dikutip.",
  },
  {
    prompt: "Cek kutipan di draf ini masih nyambung sama sumbernya nggak",
    competitor: "Perplexity",
    competitorReply:
      "Kutipan Anda tampak sudah sesuai dengan sumber yang dirujuk.",
    competitorNote: "padahal paper aslinya nggak pernah dibuka",
    steps: [
      { icon: "book-open", text: "Buka isi asli tiap paper yang kamu kutip" },
      { icon: "check-circle", text: "Cocokin kalimatmu ke bagian yang dirujuk" },
      { icon: "flag", text: "Nandain kutipan yang meragukan" },
    ],
    result:
      "12 kutipan aman, 2 diflag — lengkap sama letak halamannya biar kamu cek sendiri.",
  },
  {
    prompt: "Tulisan jujurku dicap buatan AI — gimana cara buktiinnya?",
    competitor: "ChatGPT",
    competitorReply:
      "Maaf, saya tidak dapat memverifikasi siapa yang menulis teks tersebut.",
    competitorNote: "nggak ada jejak, nggak ada yang bisa dibuktiin",
    steps: [
      { icon: "history", text: "Ngerekam tiap langkah nulismu dari awal" },
      {
        icon: "pen",
        text: "Nyatet kapan kamu nulis, kapan pakai AI, kapan nyitasi",
      },
      { icon: "file-exported", text: "Nyiapin jejak proses buat ditunjukkin" },
    ],
    result:
      "Kamu pegang bukti proses dari draf pertama sampai final — bukan cuma hasil akhir.",
  },
];

const inView = { once: true as const, amount: 0.25 as const };
const ease = [0.22, 1, 0.36, 1] as const;

function ToolChip({
  name,
  variant,
}: {
  name: string;
  variant: "competitor" | "aqsha";
}) {
  return (
    <span
      className={
        variant === "aqsha"
          ? "inline-flex items-center gap-1.5 rounded-full border-2 bg-[var(--mint-soft)] px-3.5 py-1 text-xs font-medium text-[var(--mint-foreground)] [border-color:var(--mint-soft-border)] lg:absolute lg:-top-[15px] lg:left-1/2 lg:-translate-x-1/2"
          : "inline-flex items-center gap-1.5 rounded-full border-2 border-border bg-background px-3.5 py-1 text-xs font-medium text-muted-foreground lg:absolute lg:-top-[15px] lg:left-1/2 lg:-translate-x-1/2"
      }
    >
      {variant === "aqsha" && <SparklesIcon size={13} aria-hidden />}
      {name}
    </span>
  );
}

function VsBadge({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`h-10 w-10 rotate-[-8deg] items-center justify-center rounded-full border-2 border-border bg-background font-hand text-xl leading-none text-[var(--coral)] ${className ?? ""}`}
    >
      vs
    </span>
  );
}

/**
 * CompareRow — satu baris perbandingan bergaya "side-by-side transcript":
 * kiri prompt yang sama, tengah balasan generik tool lain (bubble + anotasi
 * tulisan tangan), kanan langkah nyata yang Aqsha jalankan plus hasil
 * akhirnya. Kolom dipisah rule dashed; chip nama tool duduk di atas rule
 * horizontal, badge "vs" duduk di rule vertikal pemisah kedua jawaban.
 */
function CompareRow({ row, index }: { row: CompareRowData; index: number }) {
  const reduce = useReducedMotion();

  return (
    <m.div
      className="grid gap-y-6 border-t border-dashed border-foreground/25 py-8 lg:grid-cols-[minmax(0,4fr)_minmax(0,5fr)_minmax(0,6fr)] lg:gap-y-0 lg:py-0"
      initial={reduce ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={inView}
      transition={{ duration: 0.55, ease }}
    >
      {/* Prompt */}
      <div className="lg:py-12 lg:pr-10">
        <p className="text-sm text-muted-foreground">Pas kamu minta</p>
        <p className="font-heading mt-2 max-w-[22rem] text-balance text-2xl font-medium leading-[1.15] text-foreground sm:text-[1.7rem]">
          {row.prompt}
        </p>
      </div>

      {/* Tool lain */}
      <div className="relative lg:border-l lg:border-dashed lg:border-foreground/25 lg:px-8 lg:py-12">
        <div className="mb-4 lg:mb-0">
          <ToolChip name={row.competitor} variant="competitor" />
        </div>
        <div className="rounded-lg rounded-tl-sm border-2 border-border bg-background px-5 py-4 lg:mt-2">
          <p className="text-sm leading-snug text-foreground/75">
            &ldquo;{row.competitorReply}&rdquo;
          </p>
        </div>
        <p className="font-hand mt-3 pl-2 text-lg leading-tight text-muted-foreground">
          ↑ {row.competitorNote}
        </p>
      </div>

      {/* vs — mobile, di antara dua jawaban */}
      <div className="flex justify-center lg:hidden">
        <VsBadge className="flex" />
      </div>

      {/* Aqsha */}
      <div className="relative lg:border-l lg:border-dashed lg:border-foreground/25 lg:px-8 lg:py-12">
        <VsBadge className="hidden lg:absolute lg:-left-5 lg:top-1/2 lg:flex lg:-translate-y-1/2" />
        <div className="mb-4 lg:mb-0">
          <ToolChip name="Aqsha" variant="aqsha" />
        </div>
        <div className="rounded-lg border-2 bg-background p-5 [border-color:var(--mint-soft-border)] lg:mt-2">
          <ul className="space-y-2.5">
            {row.steps.map((step, stepIndex) => {
              const Icon = STEP_ICONS[step.icon];
              return (
                <m.li
                  key={step.text}
                  className="flex items-start gap-2.5 text-[13px] leading-snug text-muted-foreground"
                  initial={reduce ? false : { opacity: 0, x: -8 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={inView}
                  transition={{
                    duration: 0.4,
                    ease,
                    delay: 0.15 + index * 0.05 + stepIndex * 0.12,
                  }}
                >
                  <Icon
                    size={15}
                    className="mt-px shrink-0 text-[var(--mint-foreground)]"
                    aria-hidden
                  />
                  {step.text}
                </m.li>
              );
            })}
          </ul>
          <p className="mt-4 border-t border-border/70 pt-4 text-sm font-medium leading-snug text-foreground">
            {row.result}
          </p>
        </div>
      </div>
    </m.div>
  );
}

/**
 * WhyAqshaSection — perbandingan "minta hal yang sama, lihat bedanya":
 * tiga permintaan riset nyata, jawaban generik tool lain vs langkah-langkah
 * yang Aqsha benar-benar jalankan. Kompak, satu pola per baris, tanpa strip
 * statistik atau kutipan panjang.
 */
export function WhyAqshaSection() {
  const reduce = useReducedMotion();

  return (
    <MotionProvider>
      <section
        id="bandingin"
        className="w-full scroll-mt-[72px] bg-card py-24 sm:py-32 lg:py-40"
      >
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <m.div
            initial={reduce ? false : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={inView}
            transition={{ duration: 0.6, ease }}
          >
            <h2 className="font-heading max-w-[min(100%,40rem)] text-balance text-[2.5rem] font-medium leading-[1.08] tracking-normal text-foreground sm:text-[2.75rem] sm:leading-[1.06] lg:text-[3.25rem] lg:leading-[1.05]">
              Apa bedanya Aqsha?
            </h2>
            <p className="mt-4 max-w-xl text-pretty text-base leading-snug text-muted-foreground sm:text-lg sm:leading-snug">
              Kebanyakan AI cuma ngasih jawaban yang kedengeran benar. Aqsha
              ngerjain langkahnya beneran — dan tiap langkah bisa kamu cek.
            </p>
          </m.div>

          <div className="mt-12 sm:mt-16">
            {rows.map((row, index) => (
              <CompareRow key={row.prompt} row={row} index={index} />
            ))}
            <div
              aria-hidden
              className="border-t border-dashed border-foreground/25"
            />
          </div>

          <m.p
            className="mt-8 max-w-prose text-xs leading-relaxed text-muted-foreground sm:mt-10 sm:text-[13px]"
            initial={reduce ? false : { opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={inView}
            transition={{ delay: 0.1, duration: 0.5 }}
          >
            Data didapat dari hasil riset kami di komunitas Reddit (2025–2026)
            — ratusan cerita pengguna yang keburu percaya referensi karangan AI.
            Mereka udah kena, kamu nggak perlu.
          </m.p>
        </div>
      </section>
    </MotionProvider>
  );
}
