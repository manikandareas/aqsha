"use client";

import { m, useReducedMotion, useScroll, useTransform } from "motion/react";

import { MotionProvider } from "@/components/motion-provider";
import { Button } from "@/components/ui/button";
import { appUrl } from "@/lib/app-url";
import { innerNav } from "@/lib/marketing/nav";

/**
 * LandingHeader — sticky solid bar for inner marketing pages (blog, changelog).
 * Hero chrome lives in `landing-hero-header.tsx`.
 */
export function LandingHeader() {
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const logoSpacing = useTransform(scrollY, [0, 300], ["0em", "0.06em"]);

  return (
    <MotionProvider>
      <m.header
        className="sticky top-0 z-30 border-b border-border/60 bg-background/90 backdrop-blur"
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduce ? 0 : 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="mx-auto flex h-[72px] w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <m.div style={reduce ? undefined : { letterSpacing: logoSpacing }}>
            <a
              href="/"
              className="font-heading text-xl font-semibold tracking-normal text-foreground"
            >
              Aqsha
            </a>
          </m.div>

          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            {innerNav.map((item) => (
              <a
                key={item.href}
                className="inline-block transition-colors hover:text-foreground"
                href={item.href}
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="hidden h-9 rounded-full px-4 text-muted-foreground hover:bg-muted hover:text-foreground sm:inline-flex"
            >
              <a href={appUrl("/sign-in")}>Masuk</a>
            </Button>
            <Button asChild size="sm" className="h-9 rounded-full">
              <a href={appUrl("/sign-up")}>Coba gratis</a>
            </Button>
          </div>
        </div>
      </m.header>
    </MotionProvider>
  );
}
