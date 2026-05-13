"use client";

import { Loader2Icon } from "lucide-react";

export function CenteredLoading({ label }: { label: string }) {
  return (
    <div className="grid flex-1 place-items-center py-12">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" />
        {label}
      </div>
    </div>
  );
}

export function applySuggestion(suggestion: string) {
  window.dispatchEvent(new CustomEvent("aqsha:suggestion", { detail: suggestion }));
}
