"use client";

import { type KeyboardEvent as ReactKeyboardEvent, type ComponentType, useEffect, useRef, useState } from "react";
import { type PromptCommand, type PromptCommandId } from "@aqsha/convex/prompt-commands";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
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
import { filterPromptCommandsBySlashQuery } from "../utils/composer-model";
import {
  createCommandChipElement,
  editorHasCommandChips,
  extractCommandsFromEditor,
  getSlashFilterQueryBeforeCursor,
  getTextBeforeCursor,
  insertNodeAtSelection,
  moveCaretToEnd,
  removeCommandChipBeforeCursor,
  removeSlashTokenBeforeCursor,
  renderComposerEditorFromVisibleContent,
  serializeComposerEditor,
} from "../utils/composer-inline-editor";

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

const COLLAPSED_EDITOR_HEIGHT = 32;

export function TokenizedPromptInput({
  value,
  onValueChange,
  onCommandsChange,
  onSubmit,
  disabled,
  maxLength,
  placeholder,
  onHeightChange,
  className,
  isCollapsed = false,
}: {
  value: string;
  onValueChange: (value: string) => void;
  onCommandsChange: (commands: PromptCommand[]) => void;
  onSubmit: () => void;
  disabled?: boolean;
  maxLength: number;
  placeholder: string;
  onHeightChange?: (height: number) => void;
  className?: string;
  isCollapsed?: boolean;
}) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const paletteDismissalRef = useRef({
    value,
    dismissed: false,
  });
  const isPaletteDismissed = () =>
    paletteDismissalRef.current.value === value &&
    paletteDismissalRef.current.dismissed;
  const setPaletteDismissed = (dismissed: boolean) => {
    paletteDismissalRef.current = { value, dismissed };
  };
  const [slashFilterQuery, setSlashFilterQuery] = useState<string | null>(null);
  const [isEditorEmpty, setIsEditorEmpty] = useState(true);

  const commandOpen = slashFilterQuery !== null;
  const filteredCommands = (slashFilterQuery === null ? [] : filterPromptCommandsBySlashQuery(slashFilterQuery));
  const highlightKey = `${slashFilterQuery ?? ""}:${filteredCommands.length}`;
  const [highlightedState, setHighlightedState] = useState({
    key: highlightKey,
    index: 0,
  });
  const highlightedIndex =
    highlightedState.key === highlightKey
      ? Math.min(highlightedState.index, Math.max(filteredCommands.length - 1, 0))
      : 0;
  const setHighlightedIndex = (nextIndex: number | ((currentIndex: number) => number)) => {
    setHighlightedState((current) => {
      const baseIndex = current.key === highlightKey ? current.index : 0;
      const index = typeof nextIndex === "function" ? nextIndex(baseIndex) : nextIndex;
      return { key: highlightKey, index };
    });
  };

  const syncEditorState = () => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    const serialized = serializeComposerEditor(editor).replace(/\u00a0/g, " ");
    const commands = extractCommandsFromEditor(editor);
    onCommandsChange(commands);
    if (serialized !== value) {
      onValueChange(serialized);
    }
    if (onHeightChange) {
      onHeightChange(
        serialized.length === 0 && !editorHasCommandChips(editor)
          ? COLLAPSED_EDITOR_HEIGHT
          : editor.scrollHeight,
      );
    }
    setIsEditorEmpty(serialized.trim().length === 0 && !editorHasCommandChips(editor));
    if (!isPaletteDismissed()) {
      setSlashFilterQuery(getSlashFilterQueryBeforeCursor(getTextBeforeCursor(editor)));
    } else {
      setSlashFilterQuery(null);
    }
  };

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    if (document.activeElement === editor) {
      return;
    }
    const serialized = serializeComposerEditor(editor);
    if (serialized !== value) {
      renderComposerEditorFromVisibleContent(editor, value);
      onCommandsChange(extractCommandsFromEditor(editor));
      if (onHeightChange) {
        onHeightChange(
          value.length === 0 && !editorHasCommandChips(editor)
            ? COLLAPSED_EDITOR_HEIGHT
            : editor.scrollHeight,
        );
      }
    }
  }, [onCommandsChange, onHeightChange, value]);

  useEffect(() => {
    if (!commandOpen) {
      return;
    }
    const editor = editorRef.current;
    if (!editor || document.activeElement === editor) {
      return;
    }
    editor.focus();
  }, [commandOpen]);

  const focusEditor = () => {
    window.requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();
      moveCaretToEnd(editor);
    });
  };

  const handleSelectCommand = (selected: PromptCommand) => {
      const editor = editorRef.current;
      if (!editor) {
        return;
      }
      removeSlashTokenBeforeCursor(editor);
      insertNodeAtSelection(createCommandChipElement(selected));
      setPaletteDismissed(false);
      syncEditorState();
      focusEditor();
    };

  const updateEditorFromInput = () => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    const serialized = serializeComposerEditor(editor);
    if (serialized.length > maxLength) {
      renderComposerEditorFromVisibleContent(editor, serialized.slice(0, maxLength));
      moveCaretToEnd(editor);
    }
    syncEditorState();
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.nativeEvent.isComposing) {
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        onSubmit();
        return;
      }

      if (commandOpen && filteredCommands.length > 0) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setHighlightedIndex((index) => (index + 1) % filteredCommands.length);
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setHighlightedIndex(
            (index) => (index - 1 + filteredCommands.length) % filteredCommands.length,
          );
          return;
        }
        if (event.key === "Tab" && !event.shiftKey) {
          event.preventDefault();
          handleSelectCommand(filteredCommands[highlightedIndex]!);
          return;
        }
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          handleSelectCommand(filteredCommands[highlightedIndex]!);
          return;
        }
      }

      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        onSubmit();
        return;
      }

      if (event.key === "Backspace") {
        const editor = editorRef.current;
        if (editor && removeCommandChipBeforeCursor(editor)) {
          event.preventDefault();
          syncEditorState();
          return;
        }
      }

      if (event.key === "Escape" && commandOpen) {
        event.preventDefault();
        setPaletteDismissed(true);
        setSlashFilterQuery(null);
        focusEditor();
      }
    };

  const handleChipClick = (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const chip = target.closest<HTMLElement>('[data-chip="command"]');
      if (!chip || !editorRef.current?.contains(chip)) {
        return;
      }
      event.preventDefault();
      chip.remove();
      syncEditorState();
      focusEditor();
    };

  const showPlaceholder = isEditorEmpty;

  return (
    <Popover open={commandOpen} modal={false}>
      <PopoverAnchor asChild>
        <div
          className={cn(
            "relative min-w-0 w-full text-[12.5px] leading-[18px] text-foreground",
            isCollapsed && "flex min-h-8 items-center",
            disabled && "opacity-100",
            className,
          )}
        >
          {showPlaceholder ? (
            <span
              className={cn(
                "pointer-events-none absolute left-0 text-[12.5px] font-normal text-muted-foreground",
                isCollapsed ? "inset-y-0 flex items-center" : "top-[3px]",
              )}
            >
              {placeholder}
            </span>
          ) : null}
          <div
            ref={editorRef}
            contentEditable={!disabled}
            role="textbox"
            aria-label="Pesan"
            aria-multiline="true"
            aria-controls={commandOpen ? "composer-slash-commands" : undefined}
            data-slot="input-group-control"
            className={cn(
              "max-h-36 w-full overflow-y-auto whitespace-pre-wrap break-words text-foreground caret-primary outline-none disabled:opacity-100",
              isCollapsed ? "min-h-8 py-[7px] leading-[18px]" : "min-h-6 py-1",
            )}
            onInput={updateEditorFromInput}
            onBlur={syncEditorState}
            onKeyDown={handleKeyDown}
            onClick={handleChipClick}
            tabIndex={0}
            suppressContentEditableWarning
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        side="bottom"
        className="w-[min(22.5rem,calc(100vw-2rem))] overflow-hidden rounded-xl p-0"
        onMouseDown={(event) => {
          event.preventDefault();
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          focusEditor();
        }}
      >
        <SlashCommandPalette
          commands={filteredCommands}
          highlightedIndex={highlightedIndex}
          onHighlight={setHighlightedIndex}
          onSelect={handleSelectCommand}
        />
      </PopoverContent>
    </Popover>
  );
}

function SlashCommandPalette({
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
      <CommandList
        id="composer-slash-commands"
        className="max-h-[19rem] px-1.5 py-1.5"
      >
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
      <p className="text-[12.5px] font-medium text-foreground">
        Tidak ada perintah yang cocok
      </p>
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
      <div
        className={cn(
          "flex items-center gap-1.5 px-1.5 pt-1.5 pb-1 text-[11.5px] font-semibold",
        )}
      >
        <span
          className={cn(
            "inline-flex size-4 items-center justify-center rounded",
            color.bg,
            color.fg,
          )}
        >
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
        const ItemIcon =
          promptCommandIconMap[item.id as PromptCommandId] ?? GroupIcon;
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
            <span
              className={cn(
                "mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md",
                color.bg,
                color.fg,
              )}
            >
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
              <span
                className={cn(
                  "mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                  color.bg,
                  color.fg,
                )}
              >
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
