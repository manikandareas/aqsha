"use client";

import { useEffect, useState } from "react";
import {
  AnimatePresence,
  m,
  useReducedMotion,
  useScroll,
  useTransform,
} from "motion/react";

import { MenuIcon, XIcon } from "@/components/icons";
import { MegaNav } from "@/components/marketing/mega-nav";
import { MobileNavTree } from "@/components/marketing/mobile-nav-tree";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { NAV_DESKTOP_MQ } from "@/lib/marketing/nav";
import { EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";

export type MarketingChromeVariant = "hero" | "solid";

type MarketingChromeProps = {
  variant: MarketingChromeVariant;
};

function useScrolledSolid(enabled: boolean, thresholdVh = 0.05) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const onScroll = () =>
      setScrolled(window.scrollY > window.innerHeight * thresholdVh);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [enabled, thresholdVh]);

  return scrolled;
}

/**
 * MarketingChrome — satu chrome untuk landing + inner pages: logo | MegaNav |
 * aksi, plus mobile accordion dari `navTree`. `hero` = fixed transparan→solid
 * on scroll; `solid` = sticky bar krem.
 */
export function MarketingChrome({ variant }: MarketingChromeProps) {
  const reduce = useReducedMotion();
  const isHero = variant === "hero";
  const scrolled = useScrolledSolid(isHero);
  const solidFace = !isHero || scrolled;
  const [menuOpen, setMenuOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const waitlistLabel = "Gabung waitlist";

  const { scrollY } = useScroll();
  const logoSpacing = useTransform(scrollY, [0, 300], ["0em", "0.06em"]);

  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    const query = window.matchMedia(NAV_DESKTOP_MQ);
    const onChange = () => {
      if (query.matches) setMenuOpen(false);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return (
    <m.header
      className={cn(
        "inset-x-0 top-0 transition-colors duration-300",
        isHero ? "fixed z-50" : "sticky z-30",
        solidFace
          ? "border-b border-border/60 bg-background/90 backdrop-blur"
          : "border-b border-transparent bg-transparent",
      )}
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduce ? 0 : 0.4, ease: EASE_OUT }}
    >
      {/* 3 zona ala Tines: logo kiri — kapsul nav persis di tengah — aksi kanan. */}
      <div
        className={cn(
          "mx-auto grid h-16 w-full max-w-7xl grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 transition-transform duration-300 sm:h-[72px] sm:px-6 lg:px-8",
          isHero && !scrolled
            ? "translate-y-1.5 sm:translate-y-2"
            : "translate-y-0",
        )}
      >
        <m.div
          className="justify-self-start"
          style={
            !isHero && !reduce ? { letterSpacing: logoSpacing } : undefined
          }
        >
          <a
            href="/"
            className="font-heading text-xl font-semibold tracking-normal text-foreground"
          >
            Aqsha
          </a>
        </m.div>

        <nav
          className="hidden items-center justify-center lg:flex"
          aria-label="Navigasi utama"
        >
          <MegaNav />
        </nav>

        <div className="col-start-3 flex items-center justify-self-end gap-2 sm:gap-3">
          <ThemeToggle />
          <a
            href="/waitlist"
            className="hidden rounded-full px-2 py-1.5 text-sm font-medium text-foreground/75 transition-colors hover:text-foreground sm:inline-block"
          >
            Dapatkan kabar saat rilis
          </a>
          <span aria-hidden className="hidden h-5 w-px bg-border sm:block" />
          <Button asChild size="sm" className="h-9 rounded-full px-4">
            <a href="/waitlist">{waitlistLabel}</a>
          </Button>
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-foreground/[0.05] text-foreground transition-colors hover:bg-foreground/[0.08] lg:hidden"
            aria-expanded={menuOpen}
            aria-controls="marketing-mobile-nav"
            aria-label={menuOpen ? "Tutup menu navigasi" : "Buka menu navigasi"}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <XIcon size={20} /> : <MenuIcon size={20} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <>
            <m.div
              className="fixed inset-0 -z-10 bg-black/40 lg:hidden"
              initial={reduce ? { opacity: 1 } : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.18 } }}
              transition={{ duration: 0.25, ease: EASE_OUT }}
              onClick={() => setMenuOpen(false)}
              aria-hidden
            />
            <m.nav
              id="marketing-mobile-nav"
              aria-label="Navigasi utama"
              className="absolute inset-x-0 top-full px-4 pt-2 sm:px-6 lg:hidden"
              initial={reduce ? { opacity: 1 } : { opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={
                reduce
                  ? { opacity: 0 }
                  : { opacity: 0, y: -8, transition: { duration: 0.18 } }
              }
              transition={{ duration: 0.28, ease: EASE_OUT }}
            >
              <MobileNavTree
                openGroup={openGroup}
                onOpenGroupChange={setOpenGroup}
                onNavigate={() => setMenuOpen(false)}
                waitlistLabel={waitlistLabel}
              />
            </m.nav>
          </>
        )}
      </AnimatePresence>
    </m.header>
  );
}
