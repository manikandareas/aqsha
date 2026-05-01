"use client";

import type { ComponentProps } from "react";
import { ChevronDownIcon, SearchIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type TaskProps = ComponentProps<"details">;

export function Task({ className, ...props }: TaskProps) {
  return <details className={cn("group", className)} {...props} />;
}

export type TaskTriggerProps = ComponentProps<"summary"> & {
  title: string;
};

export function TaskTrigger({
  className,
  title,
  children,
  ...props
}: TaskTriggerProps) {
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
          <SearchIcon className="size-4" />
          <span>{title}</span>
          <ChevronDownIcon className="size-4 transition-transform group-open:rotate-180" />
        </>
      )}
    </summary>
  );
}

export type TaskContentProps = ComponentProps<"div">;

export function TaskContent({ className, ...props }: TaskContentProps) {
  return (
    <div
      className={cn("mt-4 space-y-2 border-l-2 border-muted pl-4", className)}
      {...props}
    />
  );
}

export type TaskItemProps = ComponentProps<"div">;

export function TaskItem({ className, ...props }: TaskItemProps) {
  return <div className={cn("text-sm text-muted-foreground", className)} {...props} />;
}
