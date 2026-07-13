"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CheckIcon, Search } from "@aqsha/ui/icons";
import { EMPTY_CITATION_FILTERS, useCitationsList } from "@/features/citations/api";
import { citationMetaLine } from "@/features/citations/types";
import { cn } from "@/lib/utils";

/**
 * Picker sitasi untuk editor BlockNote (perintah /sitasi). Cari Citation Library workspace,
 * pilih ≥1 referensi (multi-select = satu cluster sitasi), lalu sisipkan sebagai inline node.
 * Search = state lokal (bukan nuqs) supaya tak bentrok dengan filter board.
 */
export function CitationPickerDialog({
  workspaceId,
  open,
  onOpenChange,
  onInsert,
}: {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInsert: (citationIds: string[]) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <CitationPickerContent
          workspaceId={workspaceId}
          onOpenChange={onOpenChange}
          onInsert={onInsert}
        />
      ) : null}
    </Dialog>
  );
}

function CitationPickerContent({
  workspaceId,
  onOpenChange,
  onInsert,
}: {
  workspaceId: string;
  onOpenChange: (open: boolean) => void;
  onInsert: (citationIds: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const list = useCitationsList(workspaceId, { ...EMPTY_CITATION_FILTERS, q: search });
  // React Compiler memoizes this; no manual useMemo needed (konvensi repo).
  const items = (list.data?.pages ?? []).flatMap((page) => page.items);
  const selectedSet = new Set(selected);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const insert = () => {
    if (selected.length === 0) return;
    onInsert(selected);
    onOpenChange(false);
  };

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Sisipkan sitasi</DialogTitle>
        <DialogDescription>
          Pilih satu atau beberapa referensi dari Citation Library workspace ini.
        </DialogDescription>
      </DialogHeader>

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari judul, penulis, atau DOI…"
          className="pl-8"
        />
      </div>

      <div className="max-h-[46vh] min-h-[8rem] overflow-y-auto rounded-[8px] border border-border/60">
        {list.isLoading ? (
          <p className="p-4 text-[13px] text-muted-foreground">Memuat referensi…</p>
        ) : items.length === 0 ? (
          <p className="p-4 text-[13px] text-muted-foreground">
            {search ? "Tidak ada referensi yang cocok." : "Citation Library masih kosong."}
          </p>
        ) : (
          <ul className="divide-y divide-border/50">
            {items.map((item) => {
              const isSelected = selectedSet.has(item.id);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => toggle(item.id)}
                    className={cn(
                      "flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-muted/50",
                      isSelected && "bg-[color:var(--accent-lavender,#efeafe)]/60",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[4px] border",
                        isSelected
                          ? "border-transparent bg-primary text-primary-foreground"
                          : "border-border",
                      )}
                    >
                      {isSelected ? <CheckIcon className="size-3" /> : null}
                    </span>
                    <span className="grid min-w-0 gap-0.5">
                      <span className="truncate text-[13px] font-medium text-foreground">
                        {item.title}
                      </span>
                      <span className="truncate text-[12px] text-muted-foreground">
                        {citationMetaLine(item) || "Tanpa metadata"}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Batal
        </Button>
        <Button onClick={insert} disabled={selected.length === 0}>
          Sisipkan{selected.length > 0 ? ` (${selected.length})` : ""}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
