"use client";

import { m, useReducedMotion } from "motion/react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

const navItems = [
  { href: "#demo", label: "Demo" },
  { href: "#features", label: "Features" },
  { href: "#workflow", label: "Workflow" },
  { href: "#pricing", label: "Pricing" },
  { href: "/app", label: "App" },
] as const;

export function LandingHeader() {
  const reduce = useReducedMotion();

  return (
    <m.header
      className="sticky top-0 z-30 bg-background/90 backdrop-blur"
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduce ? 0 : 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="mx-auto flex h-[72px] w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <m.div
          initial={reduce ? false : { opacity: 0, scale: 0.94, y: -8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{
            type: "spring",
            stiffness: 420,
            damping: 30,
            mass: 0.55,
          }}
        >
          <Link href="/" className="text-xl font-semibold tracking-normal text-foreground">
            Aqsha
          </Link>
        </m.div>
        <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
          {navItems.map((item, index) => (
            <m.div
              key={item.href}
              initial={reduce ? false : { opacity: 0, y: -18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: 0.04 + index * 0.07,
                duration: 0.5,
                ease: [0.16, 1, 0.3, 1],
              }}
              whileHover={
                reduce
                  ? undefined
                  : { y: -2, transition: { type: "spring", stiffness: 520, damping: 22 } }
              }
            >
              <Link
                className="inline-block transition-colors hover:text-foreground"
                href={item.href}
              >
                {item.label}
              </Link>
            </m.div>
          ))}
        </nav>
        <m.div
          className="flex items-center gap-2"
          initial={reduce ? false : { opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{
            type: "spring",
            stiffness: 280,
            damping: 26,
            delay: reduce ? 0 : 0.22,
          }}
        >
          <m.div
            whileHover={reduce ? undefined : { scale: 1.02 }}
            whileTap={reduce ? undefined : { scale: 0.97 }}
            transition={{ type: "spring", stiffness: 500, damping: 28 }}
          >
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="h-9 rounded-full px-4 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Link href="/sign-in">Sign in</Link>
            </Button>
          </m.div>
          <m.div
            whileHover={reduce ? undefined : { scale: 1.03, rotate: -0.4 }}
            whileTap={reduce ? undefined : { scale: 0.97 }}
            transition={{ type: "spring", stiffness: 400, damping: 18 }}
          >
            <Button asChild size="sm" className="h-9 rounded-full">
              <Link href="/sign-up">Start free</Link>
            </Button>
          </m.div>
        </m.div>
      </div>
    </m.header>
  );
}
