"use client";

import { cn } from "@/lib/utils";
import { Shimmer } from "./shimmer";

/**
 * The first paragraph (everything up to the first blank line) of the reasoning
 * trace — a glimpse of the model's thinking rather than the full transcript. A
 * single-paragraph trace is returned whole; a long, multi-paragraph one is cut
 * to its opening paragraph. Pure.
 */
export function firstReasoningParagraph(text: string): string {
  return text.trim().split(/\r?\n\s*\r?\n/)[0]?.trim() ?? "";
}

/**
 * Extended-thinking ("reasoning") preview rendered above an assistant answer.
 * Shown as muted inline text — not a collapsible, no rule — and trimmed to the
 * first paragraph so a long trace stays a glimpse. While the model is still
 * thinking (streaming, no answer yet) the preview shimmers.
 */
export function Reasoning({
  text,
  isThinking,
  className,
}: {
  text: string;
  /** True while reasoning is still streaming and the answer hasn't started. */
  isThinking: boolean;
  className?: string;
}) {
  const preview = firstReasoningParagraph(text);
  if (!preview) {
    return null;
  }

  return (
    <div
      className={cn(
        "w-full min-w-0 whitespace-pre-wrap break-words text-[12px] leading-[1.6] text-muted-foreground",
        className,
      )}
    >
      {isThinking ? <Shimmer as="span">{preview}</Shimmer> : preview}
    </div>
  );
}
