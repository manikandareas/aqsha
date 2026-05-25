"use client";

import { ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const panelTitleTriggerClass =
  "h-auto min-w-0 max-w-[min(100%,12rem)] gap-1 rounded-full px-0 py-0 text-[13px] font-normal leading-none text-foreground hover:bg-transparent hover:text-foreground";

export function PanelTitleLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("truncate text-[13px] font-normal leading-none text-foreground", className)}>
      {children}
    </span>
  );
}

export function PanelTitleDropdownTrigger({
  children,
  showChevron = true,
  className,
  ...props
}: React.ComponentProps<typeof Button> & {
  showChevron?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      className={cn(panelTitleTriggerClass, className)}
      {...props}
    >
      <span className="truncate">{children}</span>
      {showChevron ? (
        <ChevronDownIcon className="size-3 shrink-0 text-muted-foreground" />
      ) : null}
    </Button>
  );
}
