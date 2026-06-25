"use client";

import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";
import { StickToBottom } from "use-stick-to-bottom";

export type ConversationContentProps = ComponentProps<
  typeof StickToBottom.Content
>;

export const ConversationContent = ({
  className,
  ...props
}: ConversationContentProps) => (
  <StickToBottom.Content
    className={cn(
      "mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-8 overflow-x-hidden p-4",
      className
    )}
    {...props}
  />
);
