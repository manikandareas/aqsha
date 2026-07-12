"use client";

import { m, useReducedMotion } from "motion/react";
import Image from "next/image";
import Link from "next/link";

import { ArrowUpRightIcon } from "@aqsha/ui/icons";

import {
  Announcement,
  AnnouncementTag,
  AnnouncementTitle,
} from "@/components/ui/announcement";
import { Button } from "@/components/ui/button";
import { FrameChrome } from "@/features/marketing/components/feature-frame";
import { MagneticButton } from "@/features/marketing/components/magnetic-button";
import { useScrollProgress, useScrollTransform } from "@/lib/motion";

const buttonContainer = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.09, delayChildren: 0.12 },
  },
} as const;

const buttonItem = (reduce: boolean | null) =>
  reduce
    ? { hidden: { opacity: 1 }, show: { opacity: 1 } }
    : {
        hidden: { opacity: 0, y: 22, filter: "blur(6px)" },
        show: {
          opacity: 1,
          y: 0,
          filter: "blur(0px)",
          transition: { type: "spring" as const, stiffness: 320, damping: 26 },
        },
      };

/**
 * HeroImageFrame — the near-full-bleed editorial image that anchors the hero.
 *
 * Entrance: 3D drop-in (rotateX + y, perspective 1400px). Signature scroll
 * interaction: "frame settles" — a subtle scale 0.965 → 1 as the frame enters,
 * plus internal parallax (image moves slower than scroll) and a Ken Burns slow
 * zoom. Paper-grain + corner crosshairs come from the shared FrameChrome.
 */
function HeroImageFrame() {
  const reduce = useReducedMotion();
  const { ref, scrollYProgress } = useScrollProgress<HTMLDivElement>({
    offset: ["start end", "end start"],
  });
  const scale = useScrollTransform(scrollYProgress, [0, 0.35], [0.965, 1]);
  const parallaxY = useScrollTransform(scrollYProgress, [0, 1], ["-8%", "8%"]);

  return (
    <div
      className="mx-auto mt-12 w-full max-w-[88rem] px-3 sm:mt-14 sm:px-5 lg:mt-16"
      style={{ perspective: "1400px", perspectiveOrigin: "50% 0%" }}
    >
      <m.div
        initial={
          reduce
            ? false
            : { opacity: 0, y: 64, rotateX: 6, transformOrigin: "50% 0%" }
        }
        animate={{ opacity: 1, y: 0, rotateX: 0 }}
        transition={{
          type: "spring",
          stiffness: 95,
          damping: 20,
          mass: 0.85,
          delay: 0.25,
        }}
        style={{ transformStyle: "preserve-3d" }}
      >
        <m.div
          ref={ref}
          className="relative w-full overflow-hidden rounded-2xl border border-border"
          style={reduce ? undefined : { scale }}
        >
          <div className="relative aspect-[4/3] w-full sm:aspect-[16/10] lg:aspect-[21/10]">
            <m.div
              className="absolute inset-[-12%]"
              style={reduce ? undefined : { y: parallaxY }}
            >
              <Image
                src="/landing/hero-frame.png"
                alt="Hand-drawn panoramic landscape with woven research journal elements"
                fill
                priority
                sizes="(min-width: 1408px) 1408px, 100vw"
                className="ken-burns object-cover"
              />
            </m.div>
            <FrameChrome />
          </div>
        </m.div>
      </m.div>

      {/* Caption line: editorial note + handwritten accent */}
      <m.div
        className="mt-5 flex items-end justify-between gap-6 sm:mt-6"
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6, duration: 0.5 }}
      >
        <p className="max-w-md text-pretty text-sm leading-snug text-muted-foreground sm:text-base sm:leading-snug">
          Setiap sumber dicek ke aslinya. Setiap klaim punya jejak. Setiap kata
          berasal dari baca, bukan karang.
        </p>
        <p className="font-hand shrink-0 text-lg leading-none text-foreground/70 sm:text-2xl sm:leading-none">
          field notes
        </p>
      </m.div>
    </div>
  );
}

/**
 * LandingHeroSection — pure hero: headline + CTA pair + one big image.
 *
 * Single centered column, oversized serif headline with a clipPath sweep
 * reveal, magnetic primary CTA, then the near-full-bleed HeroImageFrame.
 * No product mockups, no comparison cards — the comparison message lives in
 * WhyAqshaSection (#bandingin).
 */
/** Ringkasan update terbaru untuk pill pembuka hero (dibaca build-time). */
export type LatestUpdate = { title: string; href: string; tag: string };

export function LandingHeroSection({
  latestUpdate,
}: {
  latestUpdate?: LatestUpdate | null;
}) {
  const reduce = useReducedMotion();

  return (
    <section className="w-full pb-16 sm:pb-24 lg:pb-28">
      <div className="mx-auto w-full max-w-4xl px-4 pt-16 text-center sm:px-6 sm:pt-20 lg:pt-24">
        {latestUpdate && (
          <m.div
            className="mb-6 flex justify-center sm:mb-8"
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <Announcement
              asChild
              className="group text-muted-foreground shadow-none hover:shadow-none"
            >
              <Link href={latestUpdate.href}>
                <AnnouncementTag className="bg-lavender-soft text-lavender-foreground">
                  {latestUpdate.tag}
                </AnnouncementTag>
                <AnnouncementTitle className="min-w-0">
                  <span className="min-w-0 truncate">{latestUpdate.title}</span>
                  <ArrowUpRightIcon className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </AnnouncementTitle>
              </Link>
            </Announcement>
          </m.div>
        )}
        <m.h1
          className="font-heading mx-auto max-w-[22ch] text-balance text-5xl font-normal leading-[1.06] tracking-normal text-foreground sm:text-6xl sm:leading-[1.05] lg:text-[4.5rem] lg:leading-[1.04]"
          initial={reduce ? false : { clipPath: "inset(0 100% 0 0)", opacity: 0.2 }}
          animate={{ clipPath: "inset(0 0% 0 0)", opacity: 1 }}
          transition={{ duration: 0.95, ease: [0.22, 1, 0.36, 1] }}
        >
          AI buat nulis riset — yang{" "}
          <em className="not-italic text-foreground/80">nggak ngarang sumber.</em>
        </m.h1>
        <m.p
          className="mx-auto mt-6 max-w-xl text-pretty text-lg leading-snug text-foreground/85 sm:mt-8 sm:text-xl sm:leading-snug"
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          Tool AI lain sering ngasih referensi palsu.{" "}
          <strong className="font-medium text-foreground">
            Aqsha ngecek tiap sumber ke paper aslinya
          </strong>{" "}
          sebelum kamu pakai.
        </m.p>
        <m.div
          className="mt-8 flex flex-wrap justify-center gap-3 sm:mt-10"
          variants={buttonContainer}
          initial="hidden"
          animate="show"
        >
          <m.div variants={buttonItem(reduce)}>
            <MagneticButton radius={140} strength={0.4}>
              <Button asChild className="h-14 rounded-full px-7 text-base">
                <Link href="/sign-up">Mulai gratis →</Link>
              </Button>
            </MagneticButton>
          </m.div>
          <m.div variants={buttonItem(reduce)}>
            <Button
              asChild
              variant="outline"
              className="h-14 rounded-full border-border/80 bg-card px-7 text-base text-card-foreground hover:bg-muted"
            >
              <Link href="#bandingin">Bandingin sama yang lain</Link>
            </Button>
          </m.div>
        </m.div>
        <m.p
          className="mt-6 text-sm text-muted-foreground sm:mt-8"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35, duration: 0.5 }}
        >
          Buat mahasiswa S1 · pascasarjana · peneliti
        </m.p>
      </div>

      <HeroImageFrame />
    </section>
  );
}
