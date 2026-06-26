"use client";

import { CheckIcon, ChevronRightIcon } from "@aqsha/ui/icons";
import Link from "next/link";
import { type FormEvent, type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { readableApiErrorMessage } from "@/lib/api-error";

export function ArtifactDetailHeader({
  artifactTitle,
  onRenameArtifact,
  workspaceId,
  workspaceName,
  trailing,
}: {
  artifactTitle: string;
  onRenameArtifact: (name: string) => Promise<unknown>;
  workspaceId: string;
  workspaceName?: string;
  trailing?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-11 items-center justify-between gap-2 bg-background/70 px-5 backdrop-blur-xl sm:gap-4 sm:px-7">
      <nav
        aria-label="Breadcrumb"
        className="flex min-w-0 items-center gap-1.5 text-[13px]"
      >
        <Link
          href={`/app/workspaces/${workspaceId}`}
          className="hidden max-w-[12rem] shrink-0 truncate font-medium text-muted-foreground transition-colors hover:text-foreground sm:block"
        >
          {workspaceName ?? "Workspace"}
        </Link>
        <ChevronRightIcon className="hidden size-3.5 shrink-0 text-muted-foreground/60 sm:block" />
        <ArtifactTitleBreadcrumb title={artifactTitle} onRename={onRenameArtifact} />
      </nav>
      {trailing ? (
        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">{trailing}</div>
      ) : null}
    </header>
  );
}

export function ArtifactTitleBreadcrumb({
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
      setError(readableApiErrorMessage(submitError, "We couldn't save the name."));
    }
    setIsSubmitting(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-current="page"
          title={title}
          className="block min-w-0 max-w-[55ch] truncate rounded-[4px] text-left font-medium text-foreground outline-none transition-colors hover:text-foreground/70 focus-visible:ring-2 focus-visible:ring-ring/40"
          aria-label="Edit artifact name"
        >
          {title}
        </button>
      </PopoverTrigger>
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
