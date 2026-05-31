"use client";

import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";
import { StickToBottom } from "use-stick-to-bottom";

export type ConversationProps = ComponentProps<typeof StickToBottom>;

export const Conversation = ({ className, ...props }: ConversationProps) => (
  <StickToBottom
    className={cn(
      "relative min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-hidden",
      className
    )}
    initial="smooth"
    resize="smooth"
    role="log"
    {...props}
  />
);
