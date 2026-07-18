"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";

import { MenuIcon, XIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { appUrl } from "@/lib/app-url";
import { primaryNav, secondaryNav } from "@/lib/marketing/nav";

/**
 * LandingHeroHeader — fixed page-level header dengan dua wajah:
 * di atas hero memakai chrome glass gelap (kapsul translucent + wordmark
 * putih ber-text-shadow); begitu hero terlewat (IntersectionObserver pada
 * `[data-hero]`) bertransisi ke bar solid krem ala `landing-header.tsx`
 * supaya tetap terbaca di section terang mana pun.
 */
export function LandingHeroHeader({
  forceSolid = false,
}: {
  /** Paksa treatment solid dari awal — buat hero terang (mis. split hero
   *  krem) di mana chrome glass-gelap default jadi kontras rendah. */
  forceSolid?: boolean;
} = {}) {
  const reduce = useReducedMotion();
  const [scrolled, setScrolled] = useState(forceSolid);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (forceSolid) return;
    const hero = document.querySelector("[data-hero]");
    if (!hero) return;
    // Flip saat tepi bawah hero melewati tinggi header (~88px).
    const observer = new IntersectionObserver(
      ([entry]) => setScrolled(!(entry?.isIntersecting ?? true)),
      { rootMargin: "-88px 0px 0px 0px", threshold: 0 },
    );
    observer.observe(hero);
    return () => observer.disconnect();
  }, [forceSolid]);

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

  // Tutup panel begitu viewport mencapai lebar desktop (nav kapsul muncul).
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      if (query.matches) setMenuOpen(false);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const capsuleClass = scrolled
    ? "border-border/70 bg-background/80 shadow-sm"
    : "border-white/15 bg-black/35 shadow-lg backdrop-blur-md";
  const capsuleLinkClass = scrolled
    ? "text-foreground/75 hover:bg-muted hover:text-foreground"
    : "text-white/90 hover:bg-white/10 hover:text-white";

  return (
    <m.header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-colors duration-300",
        scrolled
          ? "border-b border-border/60 bg-background/90 backdrop-blur"
          : "border-b border-transparent bg-transparent",
      )}
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduce ? 0 : 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <div
        className={cn(
          "mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-3 px-4 transition-transform duration-300 sm:h-[72px] sm:px-6 lg:px-8",
          scrolled ? "translate-y-0" : "translate-y-1.5 sm:translate-y-2",
        )}
      >
        <a
          href="/"
          className={cn(
            "font-heading text-xl font-semibold tracking-normal transition-colors",
            scrolled
              ? "text-foreground"
              : "text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.85),0_1px_14px_rgb(0_0_0/0.45)]",
          )}
        >
          Aqsha
        </a>

        <div className="flex items-center gap-2">
          <nav className="hidden items-center lg:flex" aria-label="Navigasi utama">
            <div
              className={cn(
                "flex items-center rounded-full border px-1 py-1 transition-colors",
                scrolled ? "divide-border/60" : "divide-white/10",
                "divide-x",
                capsuleClass,
              )}
            >
              {primaryNav.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "rounded-full px-3.5 py-1.5 text-sm transition-colors",
                    capsuleLinkClass,
                  )}
                >
                  {item.label}
                </a>
              ))}
            </div>
          </nav>
          {secondaryNav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={cn(
                "hidden rounded-full border px-3.5 py-1.5 text-sm transition-colors md:inline-flex",
                capsuleClass,
                capsuleLinkClass,
              )}
            >
              {item.label}
            </a>
          ))}
          <Button
            asChild
            size="sm"
            className={cn(
              "h-9 rounded-full px-4",
              !scrolled &&
                "border-transparent bg-white text-foreground shadow-lg hover:bg-white/90 [--btn-face:#ffffff]",
            )}
          >
            <a href={appUrl("/sign-up")}>Mulai gratis</a>
          </Button>
          <button
            type="button"
            className={cn(
              "inline-flex h-11 w-11 items-center justify-center rounded-full border transition-colors lg:hidden",
              capsuleClass,
              scrolled
                ? "text-foreground hover:bg-muted"
                : "text-white hover:bg-white/10",
            )}
            aria-expanded={menuOpen}
            aria-controls="landing-mobile-nav"
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
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              onClick={() => setMenuOpen(false)}
              aria-hidden
            />
            <m.nav
              id="landing-mobile-nav"
              aria-label="Navigasi utama"
              className="absolute inset-x-0 top-full px-4 pt-2 sm:px-6 lg:hidden"
              initial={reduce ? { opacity: 1 } : { opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={
                reduce
                  ? { opacity: 0 }
                  : { opacity: 0, y: -8, transition: { duration: 0.18 } }
              }
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              <div
                className={cn(
                  "overflow-hidden rounded-2xl border shadow-xl",
                  scrolled
                    ? "border-border bg-background/95 backdrop-blur"
                    : "border-white/15 bg-black/75 backdrop-blur-xl",
                )}
              >
                <ul className="p-2">
                  {[...primaryNav, ...secondaryNav].map((item) => (
                    <li key={item.href}>
                      <a
                        href={item.href}
                        onClick={() => setMenuOpen(false)}
                        className={cn(
                          "block rounded-xl px-4 py-3 text-base transition-colors",
                          scrolled
                            ? "text-foreground/85 hover:bg-muted hover:text-foreground"
                            : "text-white/90 hover:bg-white/10 hover:text-white",
                        )}
                      >
                        {item.label}
                      </a>
                    </li>
                  ))}
                </ul>
                <div
                  className={cn(
                    "flex items-center gap-2 border-t p-3",
                    scrolled ? "border-border/70" : "border-white/10",
                  )}
                >
                  <Button
                    asChild
                    variant="ghost"
                    className={cn(
                      "h-11 flex-1 rounded-xl text-sm",
                      scrolled
                        ? "text-foreground/80 hover:bg-muted hover:text-foreground"
                        : "text-white/90 hover:bg-white/10 hover:text-white",
                    )}
                  >
                    <a href={appUrl("/sign-in")}>Masuk</a>
                  </Button>
                  <Button
                    asChild
                    className={cn(
                      "h-11 flex-1 rounded-xl text-sm",
                      !scrolled &&
                        "border-transparent bg-white text-foreground hover:bg-white/90 [--btn-face:#ffffff]",
                    )}
                  >
                    <a href={appUrl("/sign-up")}>Mulai gratis</a>
                  </Button>
                </div>
              </div>
            </m.nav>
          </>
        )}
      </AnimatePresence>
    </m.header>
  );
}
