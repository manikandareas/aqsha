"use client";

import { MessageResponse } from "@/components/ai-elements/message";
import { useSmoothText } from "@/features/threads/lib/use-smooth-text";
import { cn } from "@/lib/utils";

/**
 * Teks jawaban asisten. Selagi streaming, di-reveal mulus via `useSmoothText`
 * (in-house) lalu dirender markdown lewat `MessageResponse` (Streamdown) → efek
 * "stream down" identik V1 (list/code/bold/tabel tumbuh progresif). Streamdown
 * menelan markdown setengah-jadi saat streaming; saat selesai teks tampil utuh.
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
    <MessageResponse className={cn("aqsha-prose aqsha-prose-message", className)}>
      {shown}
    </MessageResponse>
  );
}
