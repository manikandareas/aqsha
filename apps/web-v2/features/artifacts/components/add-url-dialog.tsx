"use client";

import { type FormEvent, useState } from "react";
import { Button } from "@aqsha/ui/components/button";
import { Input } from "@aqsha/ui/components/input";
import { Loader2Icon } from "@aqsha/ui/icons";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Dialog tambah tautan (URL + judul opsional) untuk Pustaka. */
export function AddUrlDialog({
  open,
  onOpenChange,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  onSubmit: (input: { url: string; title?: string }) => void;
}) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");

  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setUrl("");
      setTitle("");
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    onSubmit({ url: trimmed, title: title.trim() || undefined });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Tambah tautan</DialogTitle>
          </DialogHeader>
          <div className="grid gap-1.5">
            {/* biome-ignore lint/a11y/noLabelWithoutControl: Input meneruskan id */}
            <label className="text-xs text-muted-foreground" htmlFor="add-url-input">
              URL
            </label>
            <Input
              id="add-url-input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              autoFocus
              disabled={pending}
            />
          </div>
          <div className="grid gap-1.5">
            {/* biome-ignore lint/a11y/noLabelWithoutControl: Input meneruskan id */}
            <label className="text-xs text-muted-foreground" htmlFor="add-url-title">
              Judul (opsional)
            </label>
            <Input
              id="add-url-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              disabled={pending}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Batal
            </Button>
            <Button type="submit" disabled={pending || !url.trim()}>
              {pending ? <Loader2Icon className="animate-spin" /> : null}
              Simpan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
