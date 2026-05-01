"use client";

import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export type PromptInputProps = ComponentProps<"form">;

export function PromptInput({ className, ...props }: PromptInputProps) {
  return (
    <form
      className={cn(
        "rounded-2xl border border-border bg-card shadow-sm transition-shadow focus-within:shadow-md",
        className,
      )}
      {...props}
    />
  );
}

export type PromptInputTextareaProps = ComponentProps<"textarea">;

export function PromptInputTextarea({
  className,
  ...props
}: PromptInputTextareaProps) {
  return (
    <textarea
      className={cn(
        "min-h-24 w-full resize-none bg-transparent px-3.5 py-3 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground/70 disabled:opacity-50",
        className,
      )}
      rows={3}
      {...props}
    />
  );
}

export type PromptInputToolbarProps = ComponentProps<"div">;

export function PromptInputToolbar({
  className,
  ...props
}: PromptInputToolbarProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2.5 px-3.5 pb-3",
        className,
      )}
      {...props}
    />
  );
}

export type PromptInputToolsProps = ComponentProps<"div">;

export function PromptInputTools({
  className,
  ...props
}: PromptInputToolsProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)} {...props} />
  );
}

export type PromptInputSubmitProps = ComponentProps<"button">;

export function PromptInputSubmit({
  className,
  ...props
}: PromptInputSubmitProps) {
  return (
    <button
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-full bg-foreground text-background shadow-sm transition-transform hover:scale-105 active:scale-95 disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      type="submit"
      {...props}
    />
  );
}
