"use client";
import { type JournalRecord } from "@/features/journal/lib/journals";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  LoaderIcon,
  RefreshCwIcon,
} from "lucide-react";
import { useJournalAutosave } from "./use-journal-autosave";

type AutosaveStatus = "saved" | "dirty" | "saving" | "error" | "conflict";

export function SaveStatusBadge({ journal }: { journal: JournalRecord }) {
  const iconMap: Record<AutosaveStatus, React.ReactNode> = {
    saved: (
      <CheckCircle2Icon
        className="h-3 w-3 text-notion-green shrink-0"
        aria-hidden
      />
    ),
    saving: (
      <LoaderIcon className="h-3 w-3 animate-spin shrink-0" aria-hidden />
    ),
    dirty: null,
    error: (
      <AlertCircleIcon
        className="h-3 w-3 text-destructive shrink-0"
        aria-hidden
      />
    ),
    conflict: (
      <RefreshCwIcon
        className="h-3 w-3 text-destructive shrink-0"
        aria-hidden
      />
    ),
  };

  const colorMap: Record<AutosaveStatus, string> = {
    saved: "text-notion-green",
    saving: "text-muted-foreground",
    dirty: "text-muted-foreground",
    error: "text-destructive",
    conflict: "text-destructive",
  };

  const { saveStatus, saveStatusLabel } = useJournalAutosave({ journal });

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-border/50 bg-muted/60 px-2 py-0.5 text-[11px] font-medium ${colorMap[saveStatus]}`}
      data-status={saveStatus}
      aria-live="polite"
      aria-label={`Save status: ${saveStatusLabel}`}
    >
      {iconMap[saveStatus]}
      {saveStatusLabel}
    </span>
  );
}
