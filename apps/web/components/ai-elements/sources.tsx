"use client";

import type { ComponentProps } from "react";
import { ChevronDownIcon, LinkIcon } from "lucide-react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export type SourcesProps = ComponentProps<typeof Collapsible>;

export function Sources({ className, ...props }: SourcesProps) {
  return <Collapsible className={cn("not-prose w-full", className)} {...props} />;
}

export type SourcesTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
  count: number;
};

export function SourcesTrigger({ className, count, ...props }: SourcesTriggerProps) {
  return (
    <CollapsibleTrigger
      className={cn(
        "flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground",
        className,
      )}
      {...props}
    >
      <LinkIcon className="size-4" />
      <span>{count} source{count === 1 ? "" : "s"}</span>
      <ChevronDownIcon className="size-4 transition-transform group-data-[panel-open]:rotate-180" />
    </CollapsibleTrigger>
  );
}

export type SourcesContentProps = ComponentProps<typeof CollapsibleContent>;

export function SourcesContent({ className, ...props }: SourcesContentProps) {
  return <CollapsibleContent className={cn("mt-2 flex flex-wrap gap-2", className)} {...props} />;
}

export type SourceProps = ComponentProps<"a"> & {
  title: string;
  href: string;
};

export function Source({ className, title, href, ...props }: SourceProps) {
  return (
    <a
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground",
        className,
      )}
      href={href}
      rel="noreferrer"
      target="_blank"
      {...props}
    >
      <span className="truncate">{title || href}</span>
    </a>
  );
}
