"use client";

import { ChevronDownIcon } from "@aqsha/ui/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const panelTitleTriggerClass =
  "h-auto min-w-0 max-w-[min(100%,18rem)] gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-normal leading-snug text-foreground hover:bg-transparent hover:text-foreground active:bg-transparent aria-expanded:bg-transparent aria-expanded:text-foreground";

export function PanelTitleLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("truncate text-[12px] font-normal leading-snug text-foreground", className)}>
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
      <span className="flex min-w-0 items-center gap-1.5 overflow-hidden">{children}</span>
      {showChevron ? (
        <ChevronDownIcon className="size-3 shrink-0 text-muted-foreground" />
      ) : null}
    </Button>
  );
}
