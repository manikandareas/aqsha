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
import { readableApiErrorMessage } from "@/lib/api-error";

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
  folderName,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  folderName?: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: { url: string; title?: string }) => Promise<unknown>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <UrlDialogContent
          folderName={folderName}
          onOpenChange={onOpenChange}
          onSubmit={onSubmit}
        />
      ) : null}
    </Dialog>
  );
}

function UrlDialogContent({
  folderName,
  onOpenChange,
  onSubmit,
}: {
  folderName?: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: { url: string; title?: string }) => Promise<unknown>;
}) {
  const [url, setUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const destination = folderName?.trim() || "Uncategorized";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!url.trim()) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit({ url: url.trim() });
      setUrl("");
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
        <DialogTitle>Adds item to {destination}</DialogTitle>
        <DialogDescription>
          At the moment you can add research as .PDFs or webpages. Links from
          popular research sharing sites are automatically downloaded as PDFs.
        </DialogDescription>
      </DialogHeader>
      <form className="grid gap-3" onSubmit={handleSubmit}>
        <div className="flex items-center gap-2">
          <Input
            autoFocus
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://arxiv.org/abs/1304.0445"
            type="url"
            inputMode="url"
            className="flex-1"
          />
          <Button type="submit" disabled={!url.trim() || isSubmitting}>
            {isSubmitting ? "Adding…" : "Add link"}
          </Button>
        </div>
        {error ? (
          <p className="text-[12px] font-medium text-destructive">{error}</p>
        ) : null}
      </form>
    </DialogContent>
  );
}

function errorMessage(error: unknown) {
  return readableApiErrorMessage(error, "Aksi gagal.");
}
