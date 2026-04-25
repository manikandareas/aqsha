"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { Toolbar } from "@/components/ui/toolbar";

export function FixedToolbar(props: ComponentProps<typeof Toolbar>) {
  const chrome = cn(
    "md:min-w-4xl max-w-4xl w-full shrink-0 rounded-none bg-background px-6 md:px-12 py-2",
    "min-h-12 text-sidebar-foreground shadow-none supports-backdrop-blur:bg-sidebar/80",
    "[&_button]:text-sidebar-foreground/85 [&_button:hover]:bg-sidebar-accent [&_button:hover]:text-sidebar-foreground",
  );

  return (
    <div
      className={cn(
        chrome,
        "relative z-40 flex w-full items-center justify-start",
      )}
    >
      <Toolbar
        {...props}
        className={cn(
          "scrollbar-hide relative z-40 min-w-0 max-w-full justify-start overflow-x-auto",
          props.className,
        )}
      />
    </div>
  );
}
