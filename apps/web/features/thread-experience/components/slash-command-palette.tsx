"use client";

import type { ComponentType } from "react";
import type { PromptCommand, PromptCommandId } from "@aqsha/convex/prompt-commands";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  CompassIcon,
  ExpandParagraphIcon,
  FileTextIcon,
  FolderIcon,
  HelpCircleIcon,
  LayersIcon,
  LayoutGridIcon,
  Library,
  NotebookIcon,
  PenLineIcon,
  Quote,
  SearchIcon,
  Sparkles,
} from "@aqsha/ui/icons";
import { cn } from "@/lib/utils";

const promptCommandGroups = [
  "Tulis Akademik",
  "Rancang Riset",
  "Riset Mendalam",
  "Workspace",
] as const;

type GroupColor = "coral" | "sky" | "lavender" | "mint";

const promptCommandGroupMeta: Record<
  (typeof promptCommandGroups)[number],
  { icon: ComponentType<{ className?: string }>; color: GroupColor }
> = {
  "Tulis Akademik": { icon: PenLineIcon, color: "coral" },
  "Rancang Riset": { icon: CompassIcon, color: "sky" },
  "Riset Mendalam": { icon: Sparkles, color: "lavender" },
  "Workspace": { icon: LayoutGridIcon, color: "mint" },
};

const promptCommandIconMap: Record<PromptCommandId, ComponentType<{ className?: string }>> = {
  paraphrase: Quote,
  expand: ExpandParagraphIcon,
  summarize: FileTextIcon,
  outline: LayoutGridIcon,
  "research-question": HelpCircleIcon,
  methodology: LayersIcon,
  "literature-review": Library,
  "deep-research": Sparkles,
  artifact: NotebookIcon,
  workspace: FolderIcon,
};

function groupColorClasses(color: GroupColor) {
  switch (color) {
    case "coral":
      return {
        bg: "bg-coral-soft",
        fg: "text-coral-foreground",
      };
    case "sky":
      return {
        bg: "bg-sky-soft",
        fg: "text-sky-foreground",
      };
    case "lavender":
      return {
        bg: "bg-lavender-soft",
        fg: "text-lavender-foreground",
      };
    case "mint":
      return {
        bg: "bg-mint-soft",
        fg: "text-mint-foreground",
      };
  }
}

export function SlashCommandPalette({
  commands,
  highlightedIndex,
  onHighlight,
  onSelect,
}: {
  commands: PromptCommand[];
  highlightedIndex: number;
  onHighlight: (index: number) => void;
  onSelect: (command: PromptCommand) => void;
}) {
  const totalCount = commands.length;
  let flatIndex = 0;

  return (
    <Command shouldFilter={false} className="rounded-xl bg-popover p-0">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 pt-2.5 pb-2">
        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
          <span className="inline-flex size-5 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <SearchIcon className="size-3" />
          </span>
          Perintah
          {totalCount > 0 ? (
            <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-muted px-1 text-[10px] font-semibold text-muted-foreground">
              {totalCount}
            </span>
          ) : null}
        </div>
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded border border-border/70 bg-background px-1 font-mono text-[9.5px] font-medium leading-none text-foreground/80 shadow-[0_1px_0_0_var(--border)]">
            esc
          </span>
          tutup
        </span>
      </div>
      <CommandList id="composer-slash-commands" className="max-h-[19rem] px-1.5 py-1.5">
        {commands.length === 0 ? (
          <SlashCommandEmpty />
        ) : (
          promptCommandGroups.map((group) => {
            const groupCommands = commands.filter((item) => item.group === group);
            if (groupCommands.length === 0) {
              return null;
            }
            const startIndex = flatIndex;
            flatIndex += groupCommands.length;
            return (
              <SlashCommandGroupSection
                key={group}
                group={group}
                commands={groupCommands}
                startIndex={startIndex}
                highlightedIndex={highlightedIndex}
                onHighlight={onHighlight}
                onSelect={onSelect}
              />
            );
          })
        )}
      </CommandList>
    </Command>
  );
}

function SlashCommandEmpty() {
  return (
    <div className="flex flex-col items-center gap-1.5 px-3 py-6 text-center">
      <span className="inline-flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <SearchIcon className="size-4" />
      </span>
      <p className="text-[12.5px] font-medium text-foreground">Tidak ada perintah yang cocok</p>
      <p className="text-[11px] text-muted-foreground">
        Coba kata kunci lain, mis. <span className="font-mono">outline</span> atau{" "}
        <span className="font-mono">riset</span>.
      </p>
    </div>
  );
}

function SlashCommandGroupSection({
  group,
  commands,
  startIndex,
  highlightedIndex,
  onHighlight,
  onSelect,
}: {
  group: (typeof promptCommandGroups)[number];
  commands: PromptCommand[];
  startIndex: number;
  highlightedIndex: number;
  onHighlight: (index: number) => void;
  onSelect: (command: PromptCommand) => void;
}) {
  const meta = promptCommandGroupMeta[group];
  const color = groupColorClasses(meta.color);
  const GroupIcon = meta.icon;

  return (
    <CommandGroup
      className={cn(
        "p-0 pb-1 [&_[cmdk-group-heading]]:hidden",
        "border-b border-border/50 last:border-b-0 last:pb-0",
      )}
    >
      <div className="flex items-center gap-1.5 px-1.5 pt-1.5 pb-1 text-[11.5px] font-semibold">
        <span className={cn("inline-flex size-4 items-center justify-center rounded", color.bg, color.fg)}>
          <GroupIcon className="size-2.5" />
        </span>
        <span className="text-muted-foreground">{group}</span>
        <span className="ml-auto text-[10.5px] font-medium text-muted-foreground/70">
          {commands.length}
        </span>
      </div>
      {commands.map((item, index) => {
        const itemIndex = startIndex + index;
        const isHighlighted = itemIndex === highlightedIndex;
        const ItemIcon = promptCommandIconMap[item.id as PromptCommandId] ?? GroupIcon;
        return (
          <CommandItem
            key={item.id}
            value={item.id}
            onSelect={() => onSelect(item)}
            onMouseEnter={() => onHighlight(itemIndex)}
            className={cn(
              "group/cmd relative flex items-start gap-2.5 rounded-lg px-2 py-2 text-[13px]",
              "data-[selected=true]:bg-transparent hover:bg-muted/60",
              isHighlighted && "bg-muted/60",
            )}
          >
            <span className={cn("mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md", color.bg, color.fg)}>
              <ItemIcon className="size-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate font-mono text-[12.5px] font-semibold leading-4 text-foreground">
                  {item.slug}
                </span>
                {item.aliases.length > 0 ? (
                  <span className="truncate font-mono text-[10.5px] text-muted-foreground">
                    · {item.aliases.join(" · ")}
                  </span>
                ) : null}
              </span>
              <span className="mt-0.5 block whitespace-normal text-[11.5px] leading-4 text-muted-foreground">
                {item.description}
              </span>
            </span>
            {item.mode === "deep" ? (
              <span className={cn("mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold", color.bg, color.fg)}>
                <Sparkles className="size-2.5" />
                Deep
              </span>
            ) : null}
          </CommandItem>
        );
      })}
    </CommandGroup>
  );
}
