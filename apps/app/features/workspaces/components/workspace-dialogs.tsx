"use client";

import { type FormEvent, type ReactNode, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";

export function NameDialog({
  open,
  title,
  description,
  submitLabel,
  initialName = "",
  initialDescription = "",
  descriptionField = false,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  title: string;
  description: string;
  submitLabel: string;
  initialName?: string;
  initialDescription?: string;
  descriptionField?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: { name: string; description?: string }) => Promise<unknown>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <NameDialogContent
          key={`${initialName}:${initialDescription}`}
          title={title}
          description={description}
          submitLabel={submitLabel}
          initialName={initialName}
          initialDescription={initialDescription}
          descriptionField={descriptionField}
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
  initialDescription,
  descriptionField,
  onOpenChange,
  onSubmit,
}: {
  title: string;
  description: string;
  submitLabel: string;
  initialName: string;
  initialDescription: string;
  descriptionField: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: { name: string; description?: string }) => Promise<unknown>;
}) {
  const [name, setName] = useState(initialName);
  const [body, setBody] = useState(initialDescription);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        description: body.trim() || undefined,
      });
      onOpenChange(false);
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
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
        {descriptionField ? (
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Deskripsi"
            className="min-h-20 resize-none"
          />
        ) : null}
        {error ? <p className="text-[12px] font-medium text-destructive">{error}</p> : null}
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

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  children,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  children?: ReactNode;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<unknown>;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        {error ? <p className="text-[12px] font-medium text-destructive">{error}</p> : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isSubmitting}>
              Batal
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            disabled={isSubmitting}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Aksi gagal.";
}
