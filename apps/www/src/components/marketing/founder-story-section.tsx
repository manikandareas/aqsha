"use client";

import { useState } from "react";
import { m, useReducedMotion } from "motion/react";

import { HandUnderline, Starburst } from "@/components/marketing/doodles";
import { MotionProvider } from "@/components/motion-provider";
import { EASE_OUT, FRAME_SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";

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
        <div className="mx-auto w-full max-w-[50rem] px-4 sm:px-6">
          <m.div
            className="text-sm leading-relaxed text-muted-foreground sm:text-[15px]"
            initial="hidden"
            whileInView="shown"
            viewport={{ once: true, amount: 0.2 }}
            transition={{ staggerChildren: 0.07 }}
          >
            <div className="grid grid-cols-1 gap-8 md:grid-cols-[22rem_1fr]">
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

              <div className="relative flex flex-col gap-5">
                <Starburst
                  className="absolute -right-4 -top-8 hidden -rotate-12 sm:block"
                  delay={0.4}
                />
                <m.h2
                  className="font-heading text-pretty font-medium leading-[1.15] text-foreground sm:text-xl text-lg"
                  variants={rise}
                >
                  Halo, para periset dan{" "}
                  <span className="relative inline-block">
                    penulis
                    <HandUnderline />
                  </span>{" "}
                  👋
                </m.h2>
                <m.p className="text-pretty" variants={rise}>
                  Saat ini kita berada di era perkembangan AI Agent yang melesat begitu cepat. Berbagai sektor kini mulai terotomatisasi.{" "}
                  <span className="font-medium text-foreground">Kami percaya ini adalah momen yang tepat untuk beradaptasi</span>
                  , bukan dengan mencoba mengalahkan AI, melainkan dengan menjadikannya rekan kerja sehari-hari.
                </m.p>
              </div>
            </div>

            <div className="mt-8 flex flex-col gap-5">
              <m.p className="text-pretty" variants={rise}>
                Kami membangun Aqsha dari sebuah keyakinan sederhana.{" "}
                <span className="font-medium text-foreground">
                  Kehadiran AI seharusnya mampu mengeskalasi penelitian menjadi jauh lebih canggih.
                </span>
                {" "}
                   Energi dan waktumu terlalu berharga jika hanya dihabiskan untuk mengurus format penulisan, merangkai draf, atau merapikan kutipan. Lewat Aqsha, kami ingin mengubah cara kerja tersebut.
              </m.p>
              <m.p className="text-pretty" variants={rise}>
                Kini, biarkan AI mengambil alih beban teknis penulisan. Tujuannya agar kamu bisa memusatkan seluruh fokusmu pada <span className="font-medium text-foreground">substansi, kedalaman ide, serta esensi</span> dari penelitian itu sendiri.
              </m.p>
              <m.p className="text-pretty font-medium text-foreground sm:text-lg" variants={rise}>
                Mari tingkatkan standar karyamu bersama Aqsha.
              </m.p>
            </div>
          </m.div>
        </div>
      </section>
    </MotionProvider>
  );
}
