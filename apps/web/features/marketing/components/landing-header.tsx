"use client";

import { m, useReducedMotion, useScroll, useTransform } from "motion/react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

// Absolute (/#...) supaya tetap jalan saat header dipakai di luar landing (mis. /blog).
const navItems = [
  { href: "/#bandingin", label: "Bandingin" },
  { href: "/#cara-kerja", label: "Cara kerja" },
  { href: "/#fitur", label: "Fitur" },
  { href: "/#buat-siapa", label: "Buat siapa" },
  { href: "/#pricing", label: "Harga" },
  { href: "/changelog", label: "Apa yang baru" },
  { href: "/blog", label: "Blog" },
] as const;

/**
 * LandingHeader — sticky blur, simplified motion (single fade, no per-item
 * stagger) to break homogeneity with the animated sections below.
 *
 * Signature: logo letter-spacing subtly widens as the user scrolls past the
 * hero (useScroll + useTransform on window scrollY, 0 → 0.06em over 300px).
 * Nav and buttons are static — the header feels still and grounded.
 */
export function LandingHeader() {
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const logoSpacing = useTransform(scrollY, [0, 300], ["0em", "0.06em"]);

  return (
    <m.header
      className="sticky top-0 z-30 bg-background/90 backdrop-blur"
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduce ? 0 : 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="mx-auto flex h-[72px] w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <m.div style={reduce ? undefined : { letterSpacing: logoSpacing }}>
          <Link
            href="/"
            className="text-xl font-semibold tracking-normal text-foreground"
          >
            Aqsha
          </Link>
        </m.div>
        <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              className="inline-block transition-colors hover:text-foreground"
              href={item.href}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="hidden h-9 rounded-full px-4 text-muted-foreground hover:bg-muted hover:text-foreground sm:inline-flex"
          >
            <Link href="/sign-in">Masuk</Link>
          </Button>
          <Button asChild size="sm" className="h-9 rounded-full">
            <Link href="/sign-up">Coba gratis</Link>
          </Button>
        </div>
      </div>
    </m.header>
  );
}
