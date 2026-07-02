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
// portaled card before the hover-open popover collapses. Long enough to cross
// the sideOffset, short enough that leaving feels immediate.
const CLOSE_DELAY_MS = 120;

/**
 * Sidebar "new workspace" affordance. Hovering the plus button opens a
 * SidebarProCard-style card that stays interactive for as long as the pointer
 * remains over the trigger or the card; leaving both closes it while the card
 * is still pristine (see scheduleClose). Submitting hands the trimmed name to
 * `onSubmit`.
 */
export function CreateWorkspacePopover({
  onSubmit,
}: {
  onSubmit: (value: { name: string }) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
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
    setName("");
    setError(null);
    setIsSubmitting(false);
  };

  // Opens without stealing focus (see onOpenAutoFocus below); the card is
  // fully interactive while the pointer stays inside it.
  const openNow = () => {
    clearCloseTimer();
    setOpen(true);
  };

  // Once the card is dirty (typed name, in-flight submit, or an error worth
  // reading) pointer-leave no longer closes it — an accidental mouse move must
  // not wipe a draft. A dirty card only closes via Escape or click-outside.
  const scheduleClose = () => {
    if (isSubmitting || name.length > 0 || error) return;
    clearCloseTimer();
    closeTimer.current = setTimeout(close, CLOSE_DELAY_MS);
  };

  // Clicking the trigger (touch / keyboard users without hover) opens the
  // card and moves focus straight into the field.
  const openAndFocus = () => {
    openNow();
    requestAnimationFrame(() => inputRef.current?.focus());
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
          onMouseEnter={openNow}
          onMouseLeave={scheduleClose}
          onClick={openAndFocus}
          className="flex size-5 shrink-0 items-center justify-center rounded-[5px] text-muted-foreground transition-[background-color,color] duration-150 ease-out hover:bg-primary/10 hover:text-primary"
          aria-label="Workspace baru"
        >
          <PlusIcon className="size-3" />
        </button>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-60 p-2"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onMouseEnter={clearCloseTimer}
        onMouseLeave={scheduleClose}
      >
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md bg-white">
          <Image
            src="/whimsical-floating-paper.png"
            alt=""
            fill
            sizes="224px"
            className="object-cover"
          />
        </div>

        <div className="grid gap-3 p-1.5 pt-3">
          <div className="grid gap-1">
            <p className="font-heading text-[15px] font-semibold leading-tight text-card-foreground">
              Workspace baru
            </p>
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              Buat area riset personal untuk mengumpulkan paper, catatan, dan
              artifact dalam satu tempat.
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
