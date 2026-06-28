"use client";

import { Shimmer } from "@/components/ai-elements/shimmer";
import { FlickerSpinner } from "@/components/ui/flicker-spinner";
import { threadTranscriptColumnClass } from "@/lib/panel-surface";
import { cn } from "@/lib/utils";

export function ThreadActivityIndicator({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <output
      aria-live="polite"
      className={cn(
        "flex min-w-0 items-center gap-2 text-[13px] leading-5 text-muted-foreground",
        className,
      )}
    >
      <FlickerSpinner className="size-3.5 shrink-0 text-muted-foreground" />
      <Shimmer className="font-medium">{label}</Shimmer>
    </output>
  );
}

export function CenteredLoading({ label }: { label: string }) {
  return (
    <div className={cn(threadTranscriptColumnClass, "flex items-start py-6 sm:py-8")}>
      <ThreadActivityIndicator label={label} />
    </div>
  );
}
