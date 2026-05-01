"use client";

import type { ComponentProps, HTMLAttributes } from "react";
import { Streamdown } from "streamdown";

import { cn } from "@/lib/utils";

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: "system" | "user" | "assistant";
};

export function Message({ className, from, ...props }: MessageProps) {
  return (
    <div
      className={cn(
        "group flex w-full max-w-[95%] flex-col gap-2",
        from === "user" ? "is-user ml-auto items-end" : "is-assistant",
        className,
      )}
      {...props}
    />
  );
}

export type MessageContentProps = ComponentProps<"div">;

export function MessageContent({
  className,
  ...props
}: MessageContentProps) {
  return (
    <div
      className={cn(
        "flex w-fit min-w-0 max-w-full flex-col gap-2 overflow-hidden text-sm",
        "group-[.is-user]:rounded-3xl group-[.is-user]:rounded-tr-sm group-[.is-user]:bg-primary group-[.is-user]:px-5 group-[.is-user]:py-3.5 group-[.is-user]:font-medium group-[.is-user]:text-primary-foreground",
        "group-[.is-assistant]:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export type MessageResponseProps = ComponentProps<typeof Streamdown>;

export function MessageResponse({
  className,
  ...props
}: MessageResponseProps) {
  return (
    <Streamdown
      className={cn(
        "prose prose-neutral max-w-none text-[15px] leading-relaxed dark:prose-invert prose-p:my-3 prose-headings:font-bold prose-li:my-1",
        className,
      )}
      {...props}
    />
  );
}
