"use client";

import { useSmoothText } from "@/features/threads/lib/use-smooth-text";
import { cn } from "@/lib/utils";

/**
 * Teks jawaban asisten. Selagi streaming, di-reveal mulus via `useSmoothText`
 * (in-house) + kursor kedip; saat selesai tampil utuh. Tanpa markdown (web-v2 tak
 * punya renderer) → `whitespace-pre-wrap`, konsisten dengan bubble 6.1.
 */
export function Response({
  text,
  streaming,
  className,
}: {
  text: string;
  streaming?: boolean;
  className?: string;
}) {
  const shown = useSmoothText(text, { enabled: streaming ?? false });
  return (
    <div
      className={cn(
        "min-w-0 whitespace-pre-wrap break-words text-foreground text-sm leading-relaxed",
        className,
      )}
    >
      {shown}
      {streaming ? (
        <span className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 animate-pulse bg-foreground/60 align-middle" />
      ) : null}
    </div>
  );
}
