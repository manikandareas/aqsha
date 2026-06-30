"use client";

import { MessageResponse } from "@/components/ai-elements/message";
import { useSmoothText } from "@/features/threads/lib/use-smooth-text";
import { cn } from "@/lib/utils";

/**
 * Extended-thinking ("reasoning") sebagai item di dalam blok "Proses" (urutan natural, ter-interleave
 * dengan tool-call) — dirender PARAGRAF biasa (bukan collapsible) lewat `MessageResponse` (Streamdown),
 * gaya prose SAMA dengan jawaban akhir (`aqsha-prose aqsha-prose-message`) → wrap & format konsisten.
 * Selagi berpikir di-reveal mulus via `useSmoothText`. Tanpa pill sitasi (penalaran internal, bukan
 * klaim tercitasi); pembedanya = containment di blok Proses.
 */
export function Reasoning({
  text,
  isThinking,
  className,
}: {
  text: string;
  /** True selagi reasoning masih streaming dan jawaban belum mulai. */
  isThinking: boolean;
  className?: string;
}) {
  const shown = useSmoothText(text, { enabled: isThinking });
  if (!shown.trim()) {
    return null;
  }
  return (
    <MessageResponse className={cn("aqsha-prose aqsha-prose-message", className)}>
      {shown}
    </MessageResponse>
  );
}
