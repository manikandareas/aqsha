"use client";

import { Loader2Icon } from "@aqsha/ui/icons";
import { cn } from "@/lib/utils";
import { useWorkspacesList } from "../api";

/**
 * Picker workspace aktif reusable (mis. target pindah folder). Mengecualikan
 * `excludeId` (workspace asal). Dipakai ulang di Fase 3+ (pindah artifact).
 */
export function WorkspacePicker({
  excludeId,
  onSelect,
  disabled = false,
}: {
  excludeId?: string;
  onSelect: (workspaceId: string) => void;
  disabled?: boolean;
}) {
  const { data, isPending } = useWorkspacesList(false);
  const items = (data?.pages.flatMap((p) => p.items) ?? []).filter((w) => w.id !== excludeId);

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-6 text-muted-foreground">
        <Loader2Icon className="animate-spin" />
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Tidak ada workspace lain yang aktif.
      </p>
    );
  }

  return (
    <div className="grid max-h-64 gap-1 overflow-y-auto">
      {items.map((w) => (
        <button
          key={w.id}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(w.id)}
          className={cn(
            "flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent disabled:opacity-50",
          )}
        >
          <span className="text-lg">{w.emoji ?? "📁"}</span>
          <span className="truncate">{w.name}</span>
        </button>
      ))}
    </div>
  );
}
