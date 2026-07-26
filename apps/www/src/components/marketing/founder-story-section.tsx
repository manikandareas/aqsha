"use client";

import { useState } from "react";
import { m, useReducedMotion } from "motion/react";

import { HandUnderline, Starburst } from "@/components/marketing/doodles";
import { MotionProvider } from "@/components/motion-provider";
import { EASE_OUT, FRAME_SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";

const REASONS = [
  {
    lead: "Mulai dari karya tulis yang ingin diselesaikan",
    rest: ", bukan dari percakapan kosong yang cepat kehilangan konteks.",
  },
  {
    lead: "Menjaga sumber dekat dengan draf",
    rest: ", supaya ide, catatan, dan referensi tidak tercerai-berai.",
  },
  {
    lead: "Memberi Aqsha ruang untuk membantu tanpa mengambil alih",
    rest: ", lewat usulan yang tetap kamu review sendiri.",
  },
] as const;

const FOUNDERS = [
  {
    name: "Vito",
    src: "/landing/me.jpeg",
    alt: "Vito, pembuat Aqsha",
    rotate: -3,
    zBase: 10,
    imageClassName: "object-center",
  },
  {
    name: "Tegar",
    src: "/landing/tegar.webp",
    alt: "Tegar, pembuat Aqsha",
    rotate: 3,
    zBase: 20,
    imageClassName: "object-[55%_center]",
  },
] as const;

type Founder = (typeof FOUNDERS)[number];

/** Two square cards that overlap, lift, and lean together like the hero frame stack. */
function FounderFrame({
  founder,
  index,
  reduce,
  activeIndex,
  lastActiveIndex,
  onActiveChange,
}: {
  founder: Founder;
  index: number;
  reduce: boolean | null;
  activeIndex: number | null;
  lastActiveIndex: number | null;
  onActiveChange: (index: number | null) => void;
}) {
  const isActive = activeIndex === index;
  const distance = activeIndex === null ? 0 : index - activeIndex;
  const shiftX =
    reduce || distance === 0
      ? 0
      : Math.sign(distance) * (Math.abs(distance) === 1 ? 10 : 5);
  const liftY = !reduce && isActive ? -12 : 0;
  const rotate = isActive ? founder.rotate * 0.35 : founder.rotate;
  const zIndex = isActive
    ? 40
    : lastActiveIndex === index
      ? 35
      : founder.zBase;

  return (
    <m.div
      className={cn("group relative w-[56%]", index > 0 && "-ml-[12%]")}
      style={{ zIndex }}
      initial={reduce ? false : { opacity: 0, y: 48 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.5 }}
      transition={{
        delay: reduce ? 0 : 0.12 + index * 0.1,
        type: "spring",
        stiffness: 170,
        damping: 21,
      }}
      onHoverStart={() => onActiveChange(index)}
      onHoverEnd={() => onActiveChange(null)}
    >
      <m.div
        className="relative"
        animate={{ x: shiftX, y: liftY, rotate }}
        transition={FRAME_SPRING}
      >
        <m.div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-xl [box-shadow:0_3px_0_0_var(--border),var(--shadow-soft-card)]"
          initial={false}
          animate={{ opacity: isActive ? 1 : 0 }}
          transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
        />
        <div className="relative aspect-square overflow-hidden rounded-xl border-2 border-border bg-card">
          <img
            src={founder.src}
            alt={founder.alt}
            loading="lazy"
            decoding="async"
            className={cn(
              "absolute inset-0 h-full w-full object-cover",
              founder.imageClassName,
            )}
          />
          <span aria-hidden className="paper-grain pointer-events-none absolute inset-0" />
        </div>
      </m.div>
    </m.div>
  );
}

/** FounderStorySection — surat singkat dari para pembuat Aqsha. */
export function FounderStorySection() {
  const reduce = useReducedMotion();
  const [activeFrame, setActiveFrame] = useState<number | null>(null);
  const [lastActiveFrame, setLastActiveFrame] = useState<number | null>(null);

  const handleActiveFrameChange = (index: number | null) => {
    setActiveFrame(index);
    if (index !== null) setLastActiveFrame(index);
  };

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
        <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">
          <m.div
            className="text-sm leading-relaxed text-muted-foreground sm:text-[15px]"
            initial="hidden"
            whileInView="shown"
            viewport={{ once: true, amount: 0.2 }}
            transition={{ staggerChildren: 0.07 }}
          >
            <div className="grid grid-cols-1 gap-6 md:grid-cols-[22rem_1fr] md:gap-8">
              <div className="mx-auto flex w-full max-w-[22rem] items-start justify-center self-start">
                {FOUNDERS.map((founder, index) => (
                  <FounderFrame
                    key={founder.name}
                    founder={founder}
                    index={index}
                    reduce={reduce}
                    activeIndex={activeFrame}
                    lastActiveIndex={lastActiveFrame}
                    onActiveChange={handleActiveFrameChange}
                  />
                ))}
              </div>

              <div className="relative">
                <Starburst
                  className="absolute -top-6 right-0 hidden -rotate-12 sm:block"
                  delay={0.4}
                />
                <m.h2
                  className="font-heading text-xl font-medium leading-[1.15] text-foreground sm:text-2xl"
                  variants={rise}
                >
                  Halo, penulis{" "}
                  <span className="relative inline-block">
                    karya tulis
                    <HandUnderline />
                  </span>{" "}
                  👋
                </m.h2>
                <m.p className="mt-3 text-pretty" variants={rise}>
                  Aqsha dimulai dari masalah yang sederhana: riset dan tulisan
                  sering hidup di tempat yang berbeda.
                </m.p>
                <m.p className="mt-3 text-pretty" variants={rise}>
                  Kami Vito dan Tegar, pembuat Aqsha. Saat mengerjakan karya
                  tulis, kami sering berpindah antara catatan, dokumen, dan
                  sumber yang sama.
                </m.p>
              </div>
            </div>

            <m.p className="mt-8 text-pretty" variants={rise}>
              Itu sebabnya Aqsha dibuat untuk tiga hal:
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
              Aqsha terus kami rapikan pelan-pelan. Semoga ia membantu kamu
              kembali ke karya yang ingin kamu selesaikan. 🎓
            </m.p>
          </m.div>
        </div>
      </section>
    </MotionProvider>
  );
}
