"use client";

import { CheckIcon } from "@aqsha/ui/icons";
import { type FormEvent, type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { readableConvexErrorMessage } from "@/lib/convex-error";

export function ArtifactDetailHeader({
  artifactTitle,
  onRenameArtifact,
  trailing,
}: {
  artifactTitle: string;
  onRenameArtifact: (name: string) => Promise<unknown>;
  trailing?: ReactNode;
}) {
  return (
    <header className="shrink-0 bg-background px-5 pb-6 pt-4 sm:px-7 sm:pb-7 sm:pt-5">
      <div className="flex min-w-0 items-center justify-between gap-4">
        <ArtifactTitlePopover title={artifactTitle} onRename={onRenameArtifact} />
        {trailing ? <div className="flex shrink-0 items-center gap-1">{trailing}</div> : null}
      </div>
    </header>
  );
}

function ArtifactTitlePopover({
  title,
  onRename,
}: {
  title: string;
  onRename: (name: string) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    setError(null);
    if (nextOpen) {
      setName(title);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextName = name.trim();
    if (!nextName || nextName === title.trim()) {
      setOpen(false);
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await onRename(nextName);
      setOpen(false);
    } catch (submitError) {
      setError(readableConvexErrorMessage(submitError, "We couldn't save the name."));
    }
    setIsSubmitting(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <h1 className="min-w-0 self-center font-heading text-xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
        <PopoverTrigger asChild>
          <button
            type="button"
            className="block max-w-full truncate rounded-[4px] text-left outline-none transition-colors hover:text-foreground/80 focus-visible:ring-2 focus-visible:ring-ring/40"
            aria-label="Edit artifact name"
          >
            {title}
          </button>
        </PopoverTrigger>
      </h1>
      <PopoverContent align="start" className="w-72 p-3">
        <form className="grid gap-2.5" onSubmit={handleSubmit}>
          <Input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Artifact name"
          />
          {error ? (
            <p className="text-[12px] font-medium text-destructive">{error}</p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isSubmitting}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!name.trim() || isSubmitting}>
              <CheckIcon className="size-3.5" />
              Save
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
