"use client";

import type { ComponentProps } from "react";
import { BrainIcon, ChevronDownIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type ReasoningProps = ComponentProps<"details"> & {
  isStreaming?: boolean;
};

export function Reasoning({
  className,
  isStreaming: _isStreaming,
  open = true,
  ...props
}: ReasoningProps) {
  void _isStreaming;

  return <details className={cn("group not-prose", className)} open={open} {...props} />;
}

export type ReasoningTriggerProps = ComponentProps<"summary"> & {
  isStreaming?: boolean;
};

export function ReasoningTrigger({
  className,
  children,
  isStreaming,
  ...props
}: ReasoningTriggerProps) {
  return (
    <summary
      className={cn(
        "flex cursor-pointer list-none items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground",
        className,
      )}
      {...props}
    >
      {children ?? (
        <>
          <BrainIcon className="size-4" />
          <span>{isStreaming ? "Thinking..." : "Thought process"}</span>
          <ChevronDownIcon className="size-4 transition-transform group-open:rotate-180" />
        </>
      )}
    </summary>
  );
}

export type ReasoningContentProps = ComponentProps<"div">;

export function ReasoningContent({ className, ...props }: ReasoningContentProps) {
  return <div className={cn("mt-3 text-sm text-muted-foreground", className)} {...props} />;
}
