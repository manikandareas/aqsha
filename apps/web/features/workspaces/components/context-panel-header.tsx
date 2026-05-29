"use client";

import { PanelLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { panelHeaderPaddingClass } from "@/lib/panel-surface";
import { cn } from "@/lib/utils";

export function ContextPanelHeader({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-between gap-3 border-b border-border bg-background",
        panelHeaderPaddingClass,
      )}
    >
      <h2 className="truncate font-heading text-lg font-semibold leading-tight tracking-tight text-foreground sm:text-xl">
        {title}
      </h2>
      <Button
        type="button"
        variant="ghost"
        className="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={onClose}
        aria-label="Tutup panel"
      >
        <PanelLeftIcon className="size-3.5 rotate-180" />
      </Button>
    </div>
  );
}
