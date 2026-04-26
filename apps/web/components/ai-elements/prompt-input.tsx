"use client";

import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export type PromptInputProps = ComponentProps<"form">;

export function PromptInput({ className, ...props }: PromptInputProps) {
  return <form className={cn("flex flex-col gap-3", className)} {...props} />;
}

export type PromptInputTextareaProps = ComponentProps<"textarea">;

export function PromptInputTextarea({
  className,
  ...props
}: PromptInputTextareaProps) {
  return (
    <textarea
      className={cn(
        "min-h-20 w-full resize-none bg-transparent px-3 py-2 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground/70",
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
      className={cn("flex items-center justify-between gap-3 px-1", className)}
      {...props}
    />
  );
}

export type PromptInputToolsProps = ComponentProps<"div">;

export function PromptInputTools({
  className,
  ...props
}: PromptInputToolsProps) {
  return <div className={cn("flex items-center gap-2", className)} {...props} />;
}

export type PromptInputSubmitProps = ComponentProps<"button">;

export function PromptInputSubmit({
  className,
  ...props
}: PromptInputSubmitProps) {
  return (
    <button
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-notion-active-blue disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      type="submit"
      {...props}
    />
  );
}
