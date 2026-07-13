"use client";

import { m, useReducedMotion } from "motion/react";
import Link from "next/link";

import { formatDateId } from "@/lib/dates";

/** Ringkasan rilis terbaru untuk teaser landing (serializable — tanpa MDX). */
export type TeaserLatest = {
  href: string;
  title: string;
  publishedAt: string;
  summary?: string;
};

/**
 * WhatsNewTeaserSection — momen "rilis terbaru" terpusat & compact di landing,
 * tepat sebelum CTA penutup. Aksen tanggal pakai token app `text-chart-1`.
 */
export function WhatsNewTeaserSection({ latest }: { latest: TeaserLatest | null }) {
  const reduce = useReducedMotion();
  if (!latest) return null;

  return (
    <section className="w-full bg-background py-14 sm:py-16">
      <m.div
        className="mx-auto w-full max-w-2xl px-4 text-center sm:px-6"
        initial={reduce ? false : { opacity: 0, y: 14 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <p className="text-sm font-medium text-chart-1">
          <time dateTime={latest.publishedAt}>
            {formatDateId(latest.publishedAt)}
          </time>{" "}
          · Rilis terbaru
        </p>

        <h2 className="mt-2 text-xl font-semibold leading-tight text-balance text-foreground sm:text-2xl">
          <Link
            href={latest.href}
            className="transition-colors hover:text-foreground/70"
          >
            {latest.title}
          </Link>
        </h2>

        {latest.summary && (
          <p className="mx-auto mt-2 max-w-xl text-pretty text-sm leading-6 text-muted-foreground">
            {latest.summary}
          </p>
        )}

        <div className="mt-4">
          <Link
            href="/changelog"
            className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            Lihat semua pembaruan
          </Link>
        </div>
      </m.div>
    </section>
  );
}
