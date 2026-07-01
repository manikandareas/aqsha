"use client";

import Image from "next/image";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { ArrowRightIcon, Loader2Icon, PlusIcon } from "@aqsha/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { readableApiErrorMessage } from "@/lib/api-error";

// How long the pointer can dwell in the gap between the trigger and the
// portaled card before a hover-preview collapses. Long enough to cross the
// sideOffset, short enough that leaving feels immediate.
const CLOSE_DELAY_MS = 120;

/**
 * Sidebar "new workspace" affordance. Hovering the plus button reveals a
 * SidebarProCard-style card as a non-focusing preview that closes again on
 * pointer-leave; clicking locks it open so the name input can be focused and
 * typed into. Submitting hands the trimmed name to `onSubmit`.
 */
export function CreateWorkspacePopover({
  onSubmit,
}: {
  onSubmit: (value: { name: string }) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [locked, setLocked] = useState(false);
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCloseTimer = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  // Drop any pending hover-close timer on unmount so it can't fire setState
  // against a gone component.
  useEffect(() => clearCloseTimer, []);

  const close = () => {
    clearCloseTimer();
    setOpen(false);
    setLocked(false);
    setName("");
    setError(null);
    setIsSubmitting(false);
  };

  // Hover reveals the card without stealing focus (see onOpenAutoFocus below).
  const openPreview = () => {
    clearCloseTimer();
    setOpen(true);
  };

  const scheduleClose = () => {
    if (locked) return;
    clearCloseTimer();
    closeTimer.current = setTimeout(close, CLOSE_DELAY_MS);
  };

  // Clicking the trigger promotes the preview to a locked card and moves focus
  // into the field; the pointer-leave timer no longer applies while locked.
  const lockAndFocus = () => {
    clearCloseTimer();
    setOpen(true);
    setLocked(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  // A pointer press anywhere inside the card (the field, the submit button)
  // also locks it, so a preview the user reaches for stays put.
  const lockInPlace = () => {
    clearCloseTimer();
    setLocked(true);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit({ name: trimmed });
      close();
    } catch (submitError) {
      setError(
        readableApiErrorMessage(submitError, "Gagal membuat workspace."),
      );
      setIsSubmitting(false);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => (next ? setOpen(true) : close())}
    >
      <PopoverAnchor asChild>
        <button
          type="button"
          onMouseEnter={openPreview}
          onMouseLeave={scheduleClose}
          onClick={lockAndFocus}
          className="flex size-5 shrink-0 items-center justify-center rounded-[5px] text-muted-foreground transition-[background-color,color] duration-150 ease-out hover:bg-primary/10 hover:text-primary"
          aria-label="Workspace baru"
        >
          <PlusIcon className="size-3" />
        </button>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-72 overflow-hidden p-0"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onMouseEnter={clearCloseTimer}
        onMouseLeave={scheduleClose}
        onPointerDown={lockInPlace}
      >
        <div className="relative aspect-[5/2] w-full overflow-hidden bg-white">
          <Image
            src="/whimsical-floating-paper.png"
            alt=""
            fill
            sizes="288px"
            className="object-cover"
          />
        </div>

        <div className="grid gap-3 p-3.5">
          <div className="grid gap-1">
            <p className="font-heading text-sm font-semibold leading-tight text-card-foreground">
              Workspace baru
            </p>
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              Buat area riset personal.
            </p>
          </div>

          <form className="grid gap-2" onSubmit={handleSubmit}>
            <div className="flex items-center gap-1.5">
              <Input
                ref={inputRef}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Nama workspace"
                aria-label="Nama workspace"
                disabled={isSubmitting}
                className="h-8 flex-1"
              />
              <Button
                type="submit"
                size="icon"
                className="size-8"
                disabled={!name.trim() || isSubmitting}
                aria-label="Buat workspace"
              >
                {isSubmitting ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <ArrowRightIcon className="size-4" />
                )}
              </Button>
            </div>
            {error ? (
              <p className="text-[12px] font-medium text-destructive">
                {error}
              </p>
            ) : null}
          </form>
        </div>
      </PopoverContent>
    </Popover>
  );
}
