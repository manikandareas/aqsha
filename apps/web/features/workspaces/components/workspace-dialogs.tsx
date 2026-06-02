"use client";

import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { readableConvexErrorMessage } from "@/lib/convex-error";

export function NameDialog({
  open,
  title,
  description,
  submitLabel,
  initialName = "",
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  title: string;
  description: string;
  submitLabel: string;
  initialName?: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: { name: string }) => Promise<unknown>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <NameDialogContent
          key={initialName}
          title={title}
          description={description}
          submitLabel={submitLabel}
          initialName={initialName}
          onOpenChange={onOpenChange}
          onSubmit={onSubmit}
        />
      ) : null}
    </Dialog>
  );
}

function NameDialogContent({
  title,
  description,
  submitLabel,
  initialName,
  onOpenChange,
  onSubmit,
}: {
  title: string;
  description: string;
  submitLabel: string;
  initialName: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: { name: string }) => Promise<unknown>;
}) {
  const [name, setName] = useState(initialName);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit({ name: name.trim() });
      onOpenChange(false);
      setIsSubmitting(false);
    } catch (submitError) {
      setError(errorMessage(submitError));
      setIsSubmitting(false);
    }
  };

  return (
    <DialogContent className="gap-4 sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <form className="grid gap-3" onSubmit={handleSubmit}>
        <Input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Nama"
        />
        {error ? (
          <p className="text-[12px] font-medium text-destructive">{error}</p>
        ) : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isSubmitting}>
              Batal
            </Button>
          </DialogClose>
          <Button type="submit" disabled={!name.trim() || isSubmitting}>
            {submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

export function UrlDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: { url: string; title?: string }) => Promise<unknown>;
}) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!url.trim()) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        url: url.trim(),
        title: title.trim() || undefined,
      });
      setUrl("");
      setTitle("");
      onOpenChange(false);
      setIsSubmitting(false);
    } catch (submitError) {
      setError(errorMessage(submitError));
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-4 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Simpan URL</DialogTitle>
          <DialogDescription>
            Tambahkan URL sebagai artifact workspace.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={handleSubmit}>
          <Input
            autoFocus
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://..."
            type="url"
          />
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Judul opsional"
          />
          {error ? (
            <p className="text-[12px] font-medium text-destructive">{error}</p>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isSubmitting}>
                Batal
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!url.trim() || isSubmitting}>
              Simpan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function errorMessage(error: unknown) {
  return readableConvexErrorMessage(error, "Aksi gagal.");
}
