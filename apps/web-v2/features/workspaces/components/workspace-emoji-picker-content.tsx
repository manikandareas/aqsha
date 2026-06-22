"use client";

import { EmojiPicker } from "frimousse";
import { cn } from "@/lib/utils";

export function WorkspaceEmojiPickerContent({
  onSelect,
}: {
  onSelect: (emoji: string) => void;
}) {
  return (
    <EmojiPicker.Root
      className="isolate flex h-[21rem] flex-col bg-popover"
      onEmojiSelect={({ emoji: selectedEmoji }) => {
        onSelect(selectedEmoji);
      }}
    >
      <EmojiPicker.Search
        className="mx-2 mt-2 h-9 rounded-md border border-border/70 bg-background px-2.5 text-[13px] outline-none placeholder:text-muted-foreground focus:border-ring"
        placeholder="Cari emoji"
      />
      <EmojiPicker.Viewport className="relative min-h-0 flex-1 outline-none">
        <EmojiPicker.Loading className="absolute inset-0 flex items-center justify-center text-[12px] font-medium text-muted-foreground">
          Memuat…
        </EmojiPicker.Loading>
        <EmojiPicker.Empty className="absolute inset-0 flex items-center justify-center text-[12px] font-medium text-muted-foreground">
          Tidak ada emoji.
        </EmojiPicker.Empty>
        <EmojiPicker.List
          className="select-none pb-2"
          components={{
            CategoryHeader: ({ category, className, ...props }) => (
              <div
                {...props}
                className={cn(
                  "sticky top-0 z-10 bg-popover px-3 py-1.5 text-[11px] font-semibold text-muted-foreground",
                  className,
                )}
              >
                {category.label}
              </div>
            ),
            Row: ({ children, className, ...props }) => (
              <div {...props} className={cn("scroll-my-1 px-2", className)}>
                {children}
              </div>
            ),
            Emoji: ({ emoji: item, className, ...props }) => (
              <button
                {...props}
                type="button"
                className={cn(
                  "inline-flex size-8 items-center justify-center rounded-md text-[19px] leading-none transition-colors hover:bg-muted data-[active]:bg-muted",
                  className,
                )}
              >
                {item.emoji}
              </button>
            ),
          }}
        />
      </EmojiPicker.Viewport>
    </EmojiPicker.Root>
  );
}
