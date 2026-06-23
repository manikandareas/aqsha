"use client";

import { m, useReducedMotion } from "motion/react";

import { LandingSectionHeader } from "@/features/marketing/components/landing-section-header";

const quotes = [
  {
    text: "When using Perplexity, I am finding that almost all of the sources are not true. It will give me a quote from a source, I click on the source and the quote is not part of it.",
    attribution: "pengguna, komunitas riset",
    size: "large" as const,
  },
  {
    text: "Out of ten sources, four led nowhere — dead links, nonexistent books, actual scholars authoring papers they never wrote.",
    attribution: "pengguna, komunitas riset",
    size: "medium" as const,
  },
] as const;

const inView = { once: true as const, amount: 0.2 as const };

export function ProofQuotesSection() {
  const reduce = useReducedMotion();

  return (
    <section className="relative w-full overflow-hidden bg-muted/40 py-20 sm:py-24 lg:py-28">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(32deg,transparent_49.85%,color-mix(in_oklch,var(--border)_55%,transparent)_50%,transparent_50.15%),linear-gradient(148deg,transparent_49.85%,color-mix(in_oklch,var(--border)_55%,transparent)_50%,transparent_50.15%)] opacity-40"
      />
      <div className="relative mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <LandingSectionHeader
          className="mb-12 max-w-2xl sm:mb-16"
          eyebrow="Kenapa ini penting"
          title="Satu sumber palsu, kredibilitasmu langsung jatuh."
          titleParts={["Satu sumber palsu,", "kredibilitasmu", "langsung jatuh."]}
          description="Ini kata pengguna sungguhan soal AI yang ngarang referensi:"
        />

        <div className="space-y-10 sm:space-y-14">
          {quotes.map((quote, index) => {
            const isLarge = quote.size === "large";

            return (
              <m.blockquote
                key={quote.text.slice(0, 40)}
                className={
                  isLarge
                    ? "max-w-4xl border-l-2 border-foreground pl-6 sm:pl-8"
                    : "max-w-3xl border-l border-border pl-6 sm:ml-12 sm:pl-8"
                }
                initial={
                  reduce
                    ? false
                    : { opacity: 0, x: isLarge ? -24 : 20, filter: "blur(4px)" }
                }
                whileInView={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                viewport={inView}
                transition={{
                  type: "spring",
                  stiffness: 140,
                  damping: 24,
                  delay: reduce ? 0 : index * 0.1,
                }}
              >
                <p
                  className={
                    isLarge
                      ? "font-heading text-pretty text-2xl font-normal leading-[1.2] tracking-normal text-foreground sm:text-3xl sm:leading-[1.15] lg:text-4xl"
                      : "text-pretty text-lg leading-relaxed text-foreground/85 sm:text-xl sm:leading-relaxed"
                  }
                >
                  &ldquo;{quote.text}&rdquo;
                </p>
                <footer className="mt-5 text-sm text-muted-foreground sm:mt-6">
                  — {quote.attribution}
                </footer>
              </m.blockquote>
            );
          })}
        </div>
      </div>
    </section>
  );
}
