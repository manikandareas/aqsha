"use client";

import { m, useReducedMotion } from "motion/react";

import { MotionProvider } from "@/components/motion-provider";
import { appUrl } from "@/lib/app-url";

const footerColumns = [
  {
    heading: "Produk",
    links: [
      { label: "Bandingin", href: "/#bandingin" },
      { label: "Cara kerja", href: "/#cara-kerja" },
      { label: "Fitur", href: "/#fitur" },
      { label: "Buat siapa", href: "/#buat-siapa" },
      { label: "Harga", href: "/#pricing" },
      { label: "Apa yang baru", href: "/changelog" },
      { label: "Blog", href: "/blog" },
    ],
  },
  {
    heading: "Akun",
    links: [
      { label: "Masuk", href: appUrl("/sign-in") },
      { label: "Coba gratis", href: appUrl("/sign-up") },
    ],
  },
] as const;

/**
 * LandingFooter — structure kept, motion reduced to a single fade-in (no
 * per-column / per-link stagger). Handwritten Caveat tagline accent under
 * the brand line. Spacious py-16/20/24.
 */
export function LandingFooter() {
  const reduce = useReducedMotion();

  return (
    <MotionProvider>
      <footer className="w-full border-t border-border bg-background">
        <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
          <m.div
            className="grid grid-cols-1 gap-10 sm:grid-cols-2 sm:gap-x-10 sm:gap-y-12 lg:grid-cols-[1fr_auto_auto] lg:gap-x-16"
            initial={reduce ? false : { opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="sm:col-span-2 lg:col-span-1">
              <a
                href="/"
                className="font-heading inline-block text-xl font-semibold tracking-normal text-foreground"
              >
                Aqsha
              </a>
              <p className="mt-4 max-w-sm text-sm leading-6 text-muted-foreground">
                Asisten AI buat riset — sumbernya beneran ada.
              </p>
              <p className="font-hand mt-4 text-lg text-foreground/60 sm:text-xl">
                dicek, baru dipercaya
              </p>
            </div>

            {footerColumns.map((column) => (
              <div key={column.heading} className="min-w-0">
                <h3 className="text-sm font-medium leading-snug text-muted-foreground">
                  {column.heading}
                </h3>
                <ul className="mt-4 space-y-2.5 sm:mt-5 sm:space-y-3">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        className="text-sm leading-snug text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </m.div>
        </div>
      </footer>
    </MotionProvider>
  );
}
