"use client";

import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  hitlCardBodyClass,
  hitlCardFooterClass,
  hitlCardHeaderClass,
  hitlCardShellClass,
} from "./hitl-card-layout";

/** UI for agent `confirmAction` tool — Confirm card */
export function HitlConfirmCard({
  title,
  message,
  destructive = true,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  disabled,
  onReject,
  onConfirm,
}: {
  title: string;
  message: string;
  destructive?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
  disabled?: boolean;
  onReject: () => void;
  onConfirm: () => void;
}) {
  return (
    <Card
      size="sm"
      data-hitl-tool="confirmAction"
      className={cn("border-coral-soft-border/60", hitlCardShellClass)}
    >
      <CardHeader className={hitlCardHeaderClass}>
        <span className="text-[10px] font-medium text-muted-foreground">Confirm</span>
      </CardHeader>
      <CardContent className={hitlCardBodyClass}>
        <h3 className="text-[12px] font-semibold leading-snug text-foreground">{title}</h3>
        <p className="mt-0.5 text-[11px] leading-relaxed text-coral-foreground/90">{message}</p>
      </CardContent>
      <CardFooter className={cn("justify-end", hitlCardFooterClass)}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[11px]"
          disabled={disabled}
          onClick={onReject}
        >
          {cancelLabel}
        </Button>
        <Button
          type="button"
          variant={destructive ? "destructive" : "default"}
          size="sm"
          className="h-6 px-2.5 text-[11px]"
          disabled={disabled}
          onClick={onConfirm}
        >
          {disabled ? <Loader2Icon className="size-3 animate-spin" /> : null}
          {confirmLabel}
        </Button>
      </CardFooter>
    </Card>
  );
}
