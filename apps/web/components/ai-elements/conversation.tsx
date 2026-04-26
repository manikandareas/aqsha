"use client";

import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export type ConversationProps = ComponentProps<"div">;

export function Conversation({ className, ...props }: ConversationProps) {
  return (
    <div
      role="log"
      className={cn("relative flex min-h-0 flex-1 overflow-y-auto", className)}
      {...props}
    />
  );
}

export type ConversationContentProps = ComponentProps<"div">;

export function ConversationContent({
  className,
  ...props
}: ConversationContentProps) {
  return <div className={cn("flex flex-col gap-8 p-4", className)} {...props} />;
}
