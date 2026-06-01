"use client";

import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useRef, useState } from "react";
import { type PromptCommand } from "@aqsha/convex/prompt-commands";
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
        const index =
          typeof nextIndex === "function" ? nextIndex(baseIndex) : nextIndex;
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
        side="top"
        className="w-[min(21rem,calc(100vw-2rem))] overflow-hidden p-0"
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
  let flatIndex = 0;

  return (
    <Command shouldFilter={false} className="rounded-lg p-0">
      <CommandList id="composer-slash-commands" className="max-h-[17rem] py-1">
        {commands.length === 0 ? (
          <p className="px-3 py-2 text-[11px] text-muted-foreground">
            Tidak ada perintah yang cocok.
          </p>
        ) : (
          promptCommandGroups.map((group) => {
            const groupCommands = commands.filter((item) => item.group === group);
            if (groupCommands.length === 0) {
              return null;
            }
            return (
              <CommandGroup
                key={group}
                heading={group}
                className="border-b border-border/70 p-1 last:border-b-0 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-0.5 [&_[cmdk-group-heading]]:pt-0 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:leading-3"
              >
                {groupCommands.map((item) => {
                  const itemIndex = flatIndex;
                  flatIndex += 1;
                  const isHighlighted = itemIndex === highlightedIndex;
                  return (
                    <CommandItem
                      key={item.id}
                      value={item.id}
                      onSelect={() => onSelect(item)}
                      onMouseEnter={() => onHighlight(itemIndex)}
                      className={cn(
                        "min-h-9 items-start gap-2 rounded-md px-2 py-1.5 text-[13px]",
                        isHighlighted && "bg-accent text-accent-foreground",
                      )}
                    >
                      <span className="min-w-0 flex-1 space-y-1">
                        <span className="block truncate font-medium leading-4">
                          {item.slug}
                        </span>
                        <span className="block whitespace-normal text-[10px] leading-3 text-muted-foreground">
                          {item.description}
                        </span>
                      </span>
                      {item.mode === "deep" ? (
                        <span className="shrink-0 rounded-full bg-lavender-soft px-1.5 py-0.5 text-[10px] font-semibold text-lavender-foreground">
                          Deep
                        </span>
                      ) : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            );
          })
        )}
      </CommandList>
    </Command>
  );
}
