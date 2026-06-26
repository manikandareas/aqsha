"use client";

import { type FormEvent, useRef, useState } from "react";
import { UploadIcon } from "@aqsha/ui/icons";
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
import { cn } from "@/lib/utils";
import { useFileDropzone } from "../hooks/use-file-dropzone";
import { WORKSPACE_UPLOAD_ACCEPT } from "../utils/workspace-file-upload";

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

export function AddItemDialog({
  open,
  folderName,
  onOpenChange,
  onSubmit,
  onUploadFiles,
}: {
  open: boolean;
  folderName?: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: { url: string; title?: string }) => Promise<unknown>;
  onUploadFiles: (files: File[]) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <AddItemDialogContent
          folderName={folderName}
          onOpenChange={onOpenChange}
          onSubmit={onSubmit}
          onUploadFiles={onUploadFiles}
        />
      ) : null}
    </Dialog>
  );
}

function AddItemDialogContent({
  folderName,
  onOpenChange,
  onSubmit,
  onUploadFiles,
}: {
  folderName?: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: { url: string; title?: string }) => Promise<unknown>;
  onUploadFiles: (files: File[]) => void;
}) {
  const [url, setUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const destination = folderName?.trim();

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

  // Upload reuses the board's queue (toast + progress), so we hand files off and
  // close the dialog instead of tracking progress in here.
  const handleFiles = (files: FileList | null) => {
    const list = files ? [...files] : [];
    if (list.length === 0) return;
    onUploadFiles(list);
    onOpenChange(false);
  };

  const { isDragOver, dropzoneProps } = useFileDropzone(handleFiles);

  return (
    <DialogContent className="gap-5 sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{destination ? `Add item to ${destination}` : "Add item"}</DialogTitle>
        <DialogDescription>
          At the moment you can add research as .PDFs or webpages. Links from
          popular research sharing sites are automatically downloaded as PDFs.
        </DialogDescription>
      </DialogHeader>

      <form className="flex items-start gap-2" onSubmit={handleSubmit}>
        <div className="flex-1">
          <Input
            autoFocus
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://arxiv.org/abs/1304.0445"
            type="url"
            inputMode="url"
          />
          {error ? (
            <p className="mt-1.5 text-[12px] font-medium text-destructive">{error}</p>
          ) : null}
        </div>
        <Button type="submit" disabled={!url.trim() || isSubmitting}>
          {isSubmitting ? "Adding…" : "Add link"}
        </Button>
      </form>

      <div className="flex items-center gap-3 text-[12px] font-medium text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        <span className="shrink-0">or import a .pdf file from your computer</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <div
        {...dropzoneProps}
        className={cn(
          "grid place-items-center gap-4 rounded-xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center transition-colors",
          isDragOver && "border-primary/50 bg-primary/5",
        )}
      >
        <p className="text-[13px] font-medium text-muted-foreground">
          Drag &amp; drop .pdf files to add
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={WORKSPACE_UPLOAD_ACCEPT}
          className="sr-only"
          aria-label="Pilih file untuk diunggah"
          onChange={(event) => {
            handleFiles(event.currentTarget.files);
            event.currentTarget.value = "";
          }}
        />
        <Button type="button" onClick={() => fileInputRef.current?.click()}>
          <UploadIcon className="size-4" />
          Click to select
        </Button>
      </div>
    </DialogContent>
  );
}

function errorMessage(error: unknown) {
  return readableApiErrorMessage(error, "Aksi gagal.");
}
