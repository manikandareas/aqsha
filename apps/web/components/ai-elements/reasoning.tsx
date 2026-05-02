"use client";

import type { ComponentProps } from "react";
import { ChevronDownIcon } from "lucide-react";

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
        "flex cursor-pointer list-none items-baseline gap-2 text-left outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
        className,
      )}
      {...props}
    >
      {children ?? (
        <span className="text-[13px] font-medium leading-6 text-muted-foreground">
          {isStreaming ? "Connecting the ideas" : "Working notes"}
        </span>
      )}
      <ChevronDownIcon className="ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
    </summary>
  );
}

export type ReasoningContentProps = ComponentProps<"div">;

export function ReasoningContent({ className, children, ...props }: ReasoningContentProps) {
  return (
    <div className="relative ml-[3px] mt-1.5 pl-5 before:absolute before:left-0 before:top-0 before:h-6 before:w-4 before:rounded-bl-[3px] before:border-b-2 before:border-l-2 before:border-muted-foreground/45">
      <div
        className={cn(
          "text-[13px] leading-6 text-muted-foreground",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </div>
  );
}
