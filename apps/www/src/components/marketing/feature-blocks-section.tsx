"use client";

import { m, useReducedMotion } from "motion/react";

import { FeatureFrame } from "@/components/marketing/feature-frame";
import { cn } from "@/lib/utils";

/** Editorial frame art per feature block — sketchbook landscapes, satu gambar per blok. */
const FRAME_IMAGES = {
  workspace: "/landing/frame-workspace.webp",
  astra: "/landing/frame-astra.webp",
  citations: "/landing/frame-citations.webp",
  provenance: "/landing/frame-provenance.webp",
} as const;

const blocks = {
  workspace: {
    num: "01",
    phase: "Pas mulai",
    title: "Semua sumber di satu tempat",
    body: "Cari referensi dan simpan semuanya di satu workspace — nggak ada lagi 30 tab kebuka dan bingung mana yang penting.",
    points: ["Cari jurnal dari workspace", "PDF, DOI, dan catatan jadi satu"],
    alt: "Workspace riset Aqsha dengan sumber, PDF, dan catatan terkumpul",
  },
  astra: {
    num: "02",
    phase: "Pas nyusun & nulis",
    title: "Nulis bareng Astra",
    body: "Astra bantu nyari dan nyusun bahan dari jurnal. Kamu yang ngarahin dan mikir, dia yang bantu beresin — bukan ngerjain semuanya.",
    points: ["Arah riset tetap di tanganmu", "Tiap poin nunjuk sumbernya"],
    alt: "Menulis draf riset bersama asisten Astra",
  },
  citations: {
    num: "03",
    phase: "Sebelum submit",
    title: "Tiap sumber dicek ke aslinya",
    body: "Sebelum dikirim, Aqsha mastiin tiap kutipan beneran ada di sumbernya — dicocokin ke isi paper aslinya, bukan cuma judulnya.",
    points: ["Yang aman ditandai", "Yang meragukan diflag biar kamu cek dulu"],
    alt: "Pengecekan kutipan ke paper asli sebelum submit",
  },
  provenance: {
    num: "04",
    phase: "Kalau ditanya",
    title: "Jejak prosesmu tersimpan",
    body: "Setiap langkah nulismu direkam. Kalau tulisan jujurmu salah dicap buatan AI, kamu punya bukti prosesnya.",
    points: ["Kapan nulis, kapan pakai AI, kapan sitasi", "Bukti proses, bukan cuma hasil akhir"],
    alt: "Jejak proses penulisan yang terekam per langkah",
  },
} as const;

type BlockCopy = (typeof blocks)[keyof typeof blocks];

function BlockNumber({ num, className }: { num: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "font-heading block text-7xl leading-none text-foreground/15 lg:text-8xl",
        className,
      )}
    >
      {num}
    </span>
  );
}

function BlockCopyContent({
  block,
  align = "left",
}: {
  block: BlockCopy;
  align?: "left" | "center";
}) {
  const reduce = useReducedMotion();
  return (
    <m.div
      className={align === "center" ? "text-center" : undefined}
      initial={reduce ? false : { opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true, amount: 0.5 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
    >
      <p className="text-sm font-medium text-muted-foreground sm:text-[15px]">
        {block.phase}
      </p>
      <h3 className="font-heading mt-3 text-3xl font-medium leading-[1.08] tracking-normal text-foreground sm:text-4xl sm:leading-[1.06] lg:text-[2.75rem]">
        {block.title}
      </h3>
      <p
        className={cn(
          "mt-4 max-w-xl text-pretty text-base leading-snug text-muted-foreground sm:mt-5 sm:text-lg sm:leading-snug",
          align === "center" && "mx-auto",
        )}
      >
        {block.body}
      </p>
      <p className="mt-4 text-sm leading-snug text-foreground/70 sm:text-[15px]">
        {block.points.join(" · ")}
      </p>
    </m.div>
  );
}

/**
 * FeatureBlocksSection — replaces the old 300vh scroll theatre. Every flagship
 * feature is its own editorial block: copy on top, one BIG image frame below,
 * separated by very generous space. Each block gets a different layout (left,
 * shifted-right, full-bleed, portrait split) so the section never repeats
 * itself. Giant serif numbers replace icons.
 *
 * Signature micro-interaction lives in FeatureFrame: frames enter slightly
 * tilted and straighten as they scroll in, like photos being squared on a desk.
 */
export function FeatureBlocksSection() {
  const reduce = useReducedMotion();

  return (
    <section id="cara-kerja" className="w-full scroll-mt-[72px] py-24 sm:py-32 lg:py-40">
      {/* Header */}
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <m.div
          className="mb-20 sm:mb-28 lg:mb-36"
          initial={reduce ? false : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="text-[15px] leading-snug text-muted-foreground sm:text-base">
            Gimana cara pakainya
          </p>
          <h2 className="font-heading mt-3 max-w-[min(100%,44rem)] text-[2.5rem] font-medium leading-[1.08] tracking-normal text-foreground sm:mt-4 sm:text-[2.75rem] sm:leading-[1.06] lg:text-[3.25rem] lg:leading-[1.05]">
            Dari nyari jurnal sampai siap dikirim.
          </h2>
          <p className="mt-5 max-w-xl text-pretty text-base leading-snug text-foreground/85 sm:text-lg sm:leading-snug">
            Ngikutin cara kamu riset beneran — dari kumpulin bahan sampai bukti
            proses.
          </p>
        </m.div>
      </div>

      <div id="fitur" className="scroll-mt-[72px] space-y-28 sm:space-y-40 lg:space-y-52">
        {/* 01 — copy kiri, frame contained */}
        <div
          id="fitur-workspace"
          className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 sm:px-6 lg:px-8"
        >
          <div className="flex items-start gap-6 sm:gap-10">
            <BlockNumber num={blocks.workspace.num} className="mt-1 shrink-0" />
            <div className="max-w-2xl">
              <BlockCopyContent block={blocks.workspace} />
            </div>
          </div>
          <FeatureFrame
            className="mt-10 sm:mt-12 lg:mt-14"
            image={FRAME_IMAGES.workspace}
            alt={blocks.workspace.alt}
            aspectClassName="aspect-[4/3] sm:aspect-[16/10]"
            initialRotate={-1.2}
          />
        </div>

        {/* 02 — copy digeser kanan, frame menjorok kanan */}
        <div
          id="fitur-astra"
          className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 sm:px-6 lg:px-8"
        >
          <div className="grid gap-6 lg:grid-cols-12 lg:gap-10">
            <div className="lg:col-span-5">
              <BlockNumber num={blocks.astra.num} />
            </div>
            <div className="max-w-2xl lg:col-span-7">
              <BlockCopyContent block={blocks.astra} />
            </div>
          </div>
          <FeatureFrame
            className="mt-10 sm:mt-12 lg:-mr-10 lg:mt-14 lg:w-[calc(100%+2.5rem)]"
            image={FRAME_IMAGES.astra}
            alt={blocks.astra.alt}
            aspectClassName="aspect-[4/3] sm:aspect-[16/10]"
            initialRotate={1.2}
          />
        </div>

        {/* 03 — flagship: copy centered, frame full-bleed */}
        <div id="fitur-citations" className="w-full scroll-mt-24">
          <div className="mx-auto w-full max-w-2xl px-4 sm:px-6">
            <BlockNumber num={blocks.citations.num} className="mx-auto w-fit" />
            <div className="mt-6">
              <BlockCopyContent block={blocks.citations} align="center" />
            </div>
          </div>
          <FeatureFrame
            className="mt-10 rounded-none border-x-0 sm:mt-12 lg:mt-16"
            image={FRAME_IMAGES.citations}
            alt={blocks.citations.alt}
            aspectClassName="aspect-[4/3] sm:aspect-[16/9] lg:aspect-[21/9]"
            initialRotate={0}
          />
        </div>

        {/* 04 — split: copy kiri sticky ringan, frame portrait kanan */}
        <div
          id="fitur-provenance"
          className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 sm:px-6 lg:px-8"
        >
          <div className="grid gap-10 lg:grid-cols-2 lg:gap-x-16">
            <div className="lg:sticky lg:top-28 lg:self-start">
              <BlockNumber num={blocks.provenance.num} />
              <div className="mt-6">
                <BlockCopyContent block={blocks.provenance} />
              </div>
            </div>
            <FeatureFrame
              image={FRAME_IMAGES.provenance}
              alt={blocks.provenance.alt}
              aspectClassName="aspect-[4/3] sm:aspect-[4/5]"
              initialRotate={-1}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
