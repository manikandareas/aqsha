"use client";

import { useState } from "react";
import { Button } from "@aqsha/ui/components/button";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { WORKSPACE_EMOJI_CHOICES } from "../emoji-choices";

/** Emoji picker grid (set kurasi). API tetap memvalidasi emoji yang dipilih. */
export function EmojiPicker({
  value,
  onSelect,
  disabled = false,
}: {
  value: string | null;
  onSelect: (emoji: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={disabled}
          aria-label="Ganti emoji workspace"
          className="text-xl"
        >
          {value ?? "📁"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64">
        <div className="grid grid-cols-6 gap-1">
          {WORKSPACE_EMOJI_CHOICES.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                onSelect(emoji);
                setOpen(false);
              }}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-md text-xl hover:bg-accent",
                value === emoji && "bg-accent ring-1 ring-foreground/15",
              )}
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
