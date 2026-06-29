"use client";

import type { ReactNode } from "react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

/**
 * Kartu pratinjau tautan gaya Aceternity (Radix HoverCard): screenshot halaman via `api.microlink.io`
 * + judul/domain, plus slot `extra` (mis. ringkasan sumber lain). Screenshot dirender sebagai CSS
 * `background-image` (bukan `next/image`) → URL eksternal sembarang aman tanpa `remotePatterns`, dan
 * kegagalan muat luruh anggun ke latar muted. `HoverCardContent` Radix hanya termount saat terbuka →
 * panggilan microlink baru terjadi saat hover (tanpa efek eksternal eager). Animasi masuk/keluar pakai
 * kelas bawaan `HoverCardContent`.
 */
export function LinkPreview({
  url,
  title,
  subtitle,
  extra,
  children,
}: {
  /** Tautan yang dipratinjau (di-screenshot + tujuan klik kartu). */
  url: string;
  title: string;
  subtitle?: string;
  /** Konten tambahan di bawah kartu (mis. daftar ringkas sumber lain). */
  extra?: ReactNode;
  /** Trigger inline (pill sitasi) — dirender via `asChild`. */
  children: ReactNode;
}) {
  return (
    <HoverCard openDelay={80} closeDelay={120}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-72 overflow-hidden p-0"
      >
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="block focus-visible:outline-none"
        >
          <span
            aria-hidden
            className="block h-[140px] w-full bg-muted bg-cover bg-center"
            style={{ backgroundImage: `url("${microlinkScreenshot(url)}")` }}
          />
          <span className="flex flex-col gap-0.5 px-3 py-2">
            <span className="line-clamp-2 font-medium text-[13px] text-foreground leading-snug">
              {title}
            </span>
            {subtitle ? (
              <span className="truncate text-[11px] text-muted-foreground">{subtitle}</span>
            ) : null}
          </span>
        </a>
        {extra ? <div className="border-t px-3 py-2">{extra}</div> : null}
      </HoverCardContent>
    </HoverCard>
  );
}

/** URL screenshot microlink (free tier) untuk sebuah tautan. */
function microlinkScreenshot(url: string): string {
  const params = new URLSearchParams({
    url,
    screenshot: "true",
    meta: "false",
    embed: "screenshot.url",
    "viewport.width": "1200",
    "viewport.height": "750",
  });
  return `https://api.microlink.io/?${params.toString()}`;
}
