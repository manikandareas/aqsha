"use client";

import { m } from "motion/react";

import { HOME_EXPLORE_SECTION_ID } from "@/features/discovery/components/home-explore-bento";

const HOME_EASE_OUT = [0.23, 1, 0.32, 1] as const;

/**
 * Cue tulisan tangan "scroll ke bawah, yuk" — duduk di kanan-atas landing /app,
 * diagonal di antara action buka panel Workspace dan hero title. Klik → gulir
 * mulus ke section Jelajahi yang ada di bawah fold. Disembunyikan di bawah `sm`:
 * di layar sempit tak ada celah antara header dan hero, cue menabrak keduanya.
 */
export function ExploreHandwrittenCue({
  shouldReduceMotion,
}: {
  shouldReduceMotion: boolean;
}) {
  const scrollToExplore = () => {
    document.getElementById(HOME_EXPLORE_SECTION_ID)?.scrollIntoView({
      behavior: shouldReduceMotion ? "auto" : "smooth",
      block: "start",
    });
  };

  return (
    <m.button
      type="button"
      onClick={scrollToExplore}
      aria-label="Gulir ke section Jelajahi"
      className="group absolute right-8 top-12 z-10 hidden flex-row-reverse items-center gap-1.5 @2xl:flex"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, ease: HOME_EASE_OUT, delay: 0.5 }}
    >
      <span className="font-hand text-[17px] text-muted-foreground rotate-[5deg] transition-colors duration-150 ease-out group-hover:text-foreground">
        scroll ke bawah, yuk
      </span>
      {/* Catatan: JANGAN tambahkan `fill="none"` di sini. Di Tailwind v4 utility
          (`fill-*`) tinggal di CSS `@layer`, sedang presentation attribute `fill`
          menang atas deklarasi berlapis → arrow ikut ter-`fill: none` (tak terlihat).
          Warna diatur via class `fill-muted-foreground`; path mewarisi fill dari svg. */}
      <m.svg
        viewBox="0 0 219 41"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0 fill-muted-foreground transition-colors duration-150 ease-out group-hover:fill-foreground"
        style={{ width: 42 }}
        initial={{ opacity: 0.4, scale: 1 }}
        animate={
          shouldReduceMotion
            ? { opacity: 0.4 }
            : { opacity: [0.4, 0.65, 0.4], scale: [1, 1.08, 1] }
        }
        transition={{
          duration: 2.4,
          ease: "easeInOut",
          repeat: Infinity,
          repeatDelay: 0.4,
        }}
      >
        <g clipPath="url(#clip0_home_cue)">
          <path d="M21.5 29.4C36.9 31.3 51.3 33.1 65.7 35C66.8 35.2 67.6 36.5 69.9 38.4C63.2 39.2 57.9 40.3 52.6 40.5C38.6 40.9 24.9 40.9 10.9 40.9C9.2 40.9 7.5 41.2 5.8 40.7C0.3 39.7 -1.6 36 1.4 31.1C2.9 28.8 4.6 26.7 6.5 24.7C13.7 17.5 21.1 10.4 28.5 3.4C29.7 2.1 31.6 1.5 34.2 0C34.6 10.9 23.8 13.9 21.5 22.4C23.4 22 25.1 21.8 26.6 21.3C83.7 5.5 140.6 7.3 197.3 22.6C203.2 24.1 208.9 26.4 214.6 28.6C217.6 29.6 220.1 32 218.5 35.6C217 39.2 214 39.2 210.6 37.7C172.8 20.7 132.6 18.8 91.9 19.4C70.8 19.6 50.1 22 29.5 26.9C27 27.5 24.5 28.4 21.5 29.4Z" />
        </g>
        <defs>
          <clipPath id="clip0_home_cue">
            <rect width="219" height="41" />
          </clipPath>
        </defs>
      </m.svg>
    </m.button>
  );
}
