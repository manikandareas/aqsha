"use client"

import * as React from "react"
import { ScrollArea as ScrollAreaPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

// Vignette sebagai OVERLAY (bukan mask) supaya bisa di-FADE saat hover dengan halus: dua gradient
// warna `--background` (vertikal + horizontal) menutup konten di keempat tepi (atas/bawah/kiri/kanan)
// sementara tengah transparan (konten terlihat). Dipasang di Root (frame tetap, tak ikut menggulir),
// `pointer-events-none`. Saat Root di-hover → `opacity` overlay transisi ke 0 (vignette hilang).
const VIGNETTE_OVERLAY =
  "linear-gradient(to bottom, var(--background), transparent 56px, transparent calc(100% - 56px), var(--background)), linear-gradient(to right, var(--background), transparent 56px, transparent calc(100% - 56px), var(--background))"

function ScrollArea({
  className,
  viewportClassName,
  vignette,
  children,
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root> & {
  // Diteruskan ke Viewport (elemen yang benar-benar scroll). WAJIB untuk `max-h-*`:
  // `max-height` di Root tak mengikat Viewport (`height:100%`) → konten meluber tanpa scroll.
  viewportClassName?: string
  // Fade tepi 4-sisi (overlay `--background`) — tengah tetap terlihat, hilang halus saat hover.
  vignette?: boolean
}) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      // Group BERNAMA: isolasi dari `group` tanpa nama milik konten (mis. SourceCard) → hover di
      // area scroll hanya memengaruhi overlay vignette, bukan afordans hover kartu di dalamnya.
      className={cn("relative", vignette && "group/scroll-vignette", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        className={cn(
          "size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1",
          viewportClassName,
        )}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      {vignette ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-100 transition-opacity duration-300 ease-out group-hover/scroll-vignette:opacity-0"
          style={{ background: VIGNETTE_OVERLAY }}
        />
      ) : null}
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
}

function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      data-slot="scroll-area-scrollbar"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        "flex touch-none p-px transition-colors select-none data-horizontal:h-2.5 data-horizontal:flex-col data-horizontal:border-t data-horizontal:border-t-transparent data-vertical:h-full data-vertical:w-2.5 data-vertical:border-l data-vertical:border-l-transparent",
        className
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb
        data-slot="scroll-area-thumb"
        className="relative flex-1 rounded-full bg-border"
      />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  )
}

export { ScrollArea, ScrollBar }
