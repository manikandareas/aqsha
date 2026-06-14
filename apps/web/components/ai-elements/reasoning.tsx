"use client";

import { ChevronDownIcon, SparklesIcon } from "@aqsha/ui/icons";
import { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { MessageResponse } from "./message";
import { Shimmer } from "./shimmer";

/**
 * Collapsible extended-thinking ("reasoning") block rendered above an assistant
 * answer. It auto-expands while the model is still thinking (streaming, no
 * answer text yet) and auto-collapses once the answer begins, mirroring the
 * thinking affordance in Claude/ChatGPT. A manual toggle wins over the
 * auto behavior for the rest of the message's life.
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
  // null = auto mode (follows isThinking prop), non-null = user override
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const open = manualOpen !== null ? manualOpen : isThinking;

  const handleOpenChange = (next: boolean) => {
    setManualOpen(next);
  };

  if (!text.trim()) {
    return null;
  }

  return (
    <Collapsible
      open={open}
      onOpenChange={handleOpenChange}
      className={cn("w-full min-w-0", className)}
    >
      <CollapsibleTrigger
        className={cn(
          "group/reasoning flex w-fit items-center gap-1.5 rounded-[8px] px-1.5 py-1 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground",
        )}
      >
        <SparklesIcon className="size-3.5 shrink-0" />
        {isThinking ? (
          <Shimmer as="span" className="text-[12px]">
            Sedang berpikir...
          </Shimmer>
        ) : (
          <span>Penalaran</span>
        )}
        <ChevronDownIcon
          className={cn(
            "size-3.5 shrink-0 transition-transform duration-200",
            open ? "rotate-180" : "rotate-0",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden">
        <div className="mt-1.5 border-l-2 border-border/70 pl-3 text-[12px] leading-[1.6] text-muted-foreground">
          <MessageResponse className="aqsha-prose aqsha-prose-message text-muted-foreground [&_*]:text-muted-foreground">
            {text}
          </MessageResponse>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
