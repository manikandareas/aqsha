"use client";

import { Loader2Icon } from "lucide-react";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { cn } from "@/lib/utils";

export function ThreadActivityIndicator({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex min-w-0 items-center gap-2 text-[13px] leading-5 text-muted-foreground",
        className,
      )}
    >
      <Loader2Icon
        className="size-3.5 shrink-0 animate-spin text-muted-foreground"
        aria-hidden
      />
      <Shimmer className="font-medium">{label}</Shimmer>
    </div>
  );
}

export function CenteredLoading({ label }: { label: string }) {
  return (
    <div className="flex w-full min-w-0 items-start py-6 sm:py-8">
      <ThreadActivityIndicator label={label} />
    </div>
  );
}

export function applySuggestion(suggestion: string) {
  window.dispatchEvent(new CustomEvent("aqsha:suggestion", { detail: suggestion }));
}
