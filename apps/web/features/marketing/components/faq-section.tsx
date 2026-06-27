"use client";

import { ChevronDown } from "@aqsha/ui/icons";

import { faqItems } from "@/features/marketing/faq-data";
import { LandingSectionHeader } from "@/features/marketing/components/landing-section-header";

/**
 * FAQ landing — konten yang sama dengan FAQPage JSON-LD (lihat structured-data.tsx).
 * Wajib visible agar rich result FAQ Google valid: markup harus mencerminkan
 * konten di halaman. Native `<details>` → konten selalu di DOM, tanpa client JS
 * untuk buka-tutup. Sumber tunggal: faq-data.ts.
 */
export function FaqSection() {
  return (
    <section
      id="faq"
      className="w-full scroll-mt-[72px] bg-background py-12 sm:py-16 lg:py-20"
    >
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:gap-x-16">
          <LandingSectionHeader
            className="min-w-0"
            eyebrow="Masih ada yang ganjel?"
            title="Pertanyaan yang sering muncul."
            description="Hal-hal yang biasanya ditanyain sebelum mulai pakai Aqsha."
          />
          <div className="min-w-0">
            {faqItems.map((item) => (
              <details
                key={item.q}
                className="group border-b border-border first:border-t"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-left text-base font-medium text-foreground transition-colors hover:text-foreground/80 [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
                </summary>
                <p className="pb-5 pr-8 text-[15px] leading-relaxed text-muted-foreground sm:text-base">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
