"use client";

import { Loader2Icon } from "@aqsha/ui/icons";
import { Button } from "@/components/ui/button";

/** UI for agent `deleteArtifact` tool — inline confirm prompt */
export function HitlConfirmCard({
  title,
  message,
  destructive = true,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  disabled,
  submitting,
  onReject,
  onConfirm,
}: {
  title: string;
  message: string;
  destructive?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Non-interactive (a submit is in flight OR the run is terminal). */
  disabled?: boolean;
  /** A response submit is actually in flight — drives the button spinner only. */
  submitting?: boolean;
  onReject: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      data-hitl-tool="deleteArtifact"
      className="flex w-full min-w-0 flex-col text-[13px] leading-[1.55]"
    >
      <p className="text-[13px] font-medium leading-snug text-foreground">{title}</p>
      <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{message}</p>
      <div className="mt-2 flex flex-row items-center justify-end gap-1">
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
          {submitting ? <Loader2Icon className="size-3 animate-spin" /> : null}
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}
