"use client";

import { ChevronDownIcon } from "@aqsha/ui/icons";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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

const previewClass =
  "w-full min-w-0 whitespace-pre-wrap break-words text-[12px] leading-[1.6] text-muted-foreground";

/**
 * Extended-thinking ("reasoning") preview rendered above an assistant answer
 * (AI-Elements collapse-after-stream pattern). While the model is still thinking
 * (streaming, no answer yet) the first-paragraph glimpse shimmers inline. Once
 * the trace is done AND there is more than the glimpse, it collapses to that
 * glimpse as a clickable trigger that expands to the full trace; a
 * single-paragraph trace stays plain muted text.
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

  const full = text.trim();
  const hasMore = full !== preview;

  if (isThinking || !hasMore) {
    return (
      <div className={cn(previewClass, className)}>
        {isThinking ? <Shimmer as="span">{preview}</Shimmer> : preview}
      </div>
    );
  }

  return (
    <Collapsible className={cn("w-full min-w-0", className)}>
      <CollapsibleTrigger className="group flex w-full min-w-0 items-start gap-1 text-left">
        <span className={cn(previewClass, "line-clamp-2 hover:text-foreground")}>
          {preview}
        </span>
        <ChevronDownIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 group-focus-visible:opacity-100 group-data-[state=open]:rotate-180 group-data-[state=open]:opacity-100" />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden">
        <div className={cn(previewClass, "mt-1.5")}>{full}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
