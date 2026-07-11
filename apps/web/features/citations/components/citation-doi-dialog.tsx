"use client";

import { type FormEvent, useState } from "react";
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
import { apiErrorCode, readableApiErrorMessage } from "@/lib/api-error";

/**
 * Tambah referensi dari DOI — resolver metadata berjalan di API. Duplikat (409)
 * ditawarkan "tambah tetap" (allowDuplicate) alih-alih buntu.
 */
export function CitationDoiDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: { doi: string; allowDuplicate?: boolean }) => Promise<unknown>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? <CitationDoiContent onOpenChange={onOpenChange} onSubmit={onSubmit} /> : null}
    </Dialog>
  );
}

function CitationDoiContent({
  onOpenChange,
  onSubmit,
}: {
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: { doi: string; allowDuplicate?: boolean }) => Promise<unknown>;
}) {
  const [doi, setDoi] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateBlocked, setDuplicateBlocked] = useState(false);

  const submit = async (allowDuplicate: boolean) => {
    if (!doi.trim() || pending) return;
    setPending(true);
    setError(null);
    try {
      await onSubmit({ doi: doi.trim(), ...(allowDuplicate ? { allowDuplicate } : {}) });
      onOpenChange(false);
    } catch (err) {
      if (apiErrorCode(err) === "citation_duplicate") setDuplicateBlocked(true);
      setError(readableApiErrorMessage(err, "Gagal menambahkan referensi dari DOI"));
    } finally {
      setPending(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submit(false);
  };

  return (
    <DialogContent className="sm:max-w-sm">
      <DialogHeader>
        <DialogTitle>Tambah dari DOI</DialogTitle>
        <DialogDescription>
          Tempel DOI (mis. 10.1038/nature14539) — metadata diambil otomatis dari Crossref/OpenAlex.
        </DialogDescription>
      </DialogHeader>
      <form className="grid gap-3" onSubmit={handleSubmit}>
        <Input
          autoFocus
          placeholder="10.xxxx/xxxxx atau https://doi.org/…"
          value={doi}
          onInput={(event) => {
            setDoi((event.target as HTMLInputElement).value);
            setDuplicateBlocked(false);
          }}
        />
        {error ? <p className="text-[12px] font-medium text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Batal
          </Button>
          {duplicateBlocked ? (
            <Button type="button" variant="secondary" disabled={pending} onClick={() => submit(true)}>
              Tambah tetap
            </Button>
          ) : null}
          <Button type="submit" disabled={!doi.trim() || pending}>
            {pending ? "Mencari…" : "Tambah"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
