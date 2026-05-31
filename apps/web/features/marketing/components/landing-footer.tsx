"use client";

import { m, useReducedMotion } from "motion/react";
import Link from "next/link";

const footerColumns = [
  {
    heading: "Product",
    links: [
      { label: "Demo", href: "/#demo" },
      { label: "Features", href: "/#features" },
      { label: "Workflow", href: "/#workflow" },
      { label: "Open app", href: "/app" },
    ],
  },
  {
    heading: "Account",
    links: [
      { label: "Sign in", href: "/sign-in" },
      { label: "Create workspace", href: "/sign-up" },
    ],
  },
] as const;

export function LandingFooter() {
  const reduce = useReducedMotion();

  return (
    <footer className="w-full bg-background">
      <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 sm:gap-x-10 sm:gap-y-12 lg:grid-cols-[1fr_auto_auto] lg:gap-x-16">
          <m.div
            className="sm:col-span-2 lg:col-span-1"
            initial={reduce ? false : { opacity: 0, y: 20, filter: "blur(6px)" }}
            whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ type: "spring", stiffness: 200, damping: 26 }}
          >
            <m.div
              whileHover={reduce ? undefined : { y: -2, transition: { duration: 0.35 } }}
            >
              <Link
                href="/"
                className="inline-block text-xl font-semibold tracking-normal text-foreground"
              >
                Aqsha
              </Link>
            </m.div>
            <p className="mt-4 max-w-sm text-sm leading-6 text-muted-foreground">
              A research workspace for keeping questions, sources, and cited
              answers connected.
            </p>
          </m.div>

          {footerColumns.map((column, columnIndex) => {
            const drift = columnIndex % 2 === 0 ? 1 : -1;

            return (
              <m.div
                key={column.heading}
                className="min-w-0"
                initial={reduce ? false : { opacity: 0, y: 28 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.25, margin: "0px 0px -8% 0px" }}
                transition={{
                  type: "spring",
                  stiffness: 180,
                  damping: 24,
                  delay: reduce ? 0 : 0.08 + columnIndex * 0.07,
                }}
              >
                <m.h3
                  className="text-sm font-medium leading-snug text-muted-foreground"
                  initial={reduce ? false : { opacity: 0, x: drift * -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, amount: 0.9 }}
                  transition={{
                    delay: reduce ? 0 : 0.05 + columnIndex * 0.04,
                    duration: 0.45,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                >
                  {column.heading}
                </m.h3>
                <ul className="mt-4 space-y-2.5 sm:mt-5 sm:space-y-3">
                  {column.links.map((link, linkIndex) => (
                    <m.li
                      key={link.label}
                      initial={reduce ? false : { opacity: 0, x: drift * 8 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true, amount: 0.2 }}
                      transition={{
                        delay: reduce ? 0 : linkIndex * 0.028 + columnIndex * 0.04,
                        duration: 0.4,
                        ease: [0.16, 1, 0.3, 1],
                      }}
                    >
                      <m.div
                        whileHover={
                          reduce
                            ? undefined
                            : {
                                x: drift * 5,
                                transition: {
                                  type: "spring",
                                  stiffness: 420,
                                  damping: 22,
                                },
                              }
                        }
                        className="w-fit"
                      >
                        <Link
                          href={link.href}
                          className="text-sm leading-snug text-muted-foreground transition-colors hover:text-foreground"
                        >
                          {link.label}
                        </Link>
                      </m.div>
                    </m.li>
                  ))}
                </ul>
              </m.div>
            );
          })}
        </div>
      </div>
    </footer>
  );
}
