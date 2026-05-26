"use client";

import { type KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const COLLAPSED_EDITOR_HEIGHT = 24;

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
  const [paletteDismissed, setPaletteDismissed] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [slashFilterQuery, setSlashFilterQuery] = useState<string | null>(null);
  const [isEditorEmpty, setIsEditorEmpty] = useState(true);

  const commandOpen = slashFilterQuery !== null;
  const filteredCommands = useMemo(
    () => (slashFilterQuery === null ? [] : filterPromptCommandsBySlashQuery(slashFilterQuery)),
    [slashFilterQuery],
  );

  useEffect(() => {
    setPaletteDismissed(false);
  }, [value]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [slashFilterQuery, filteredCommands.length]);

  const syncEditorState = useCallback(() => {
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
    if (!paletteDismissed) {
      setSlashFilterQuery(getSlashFilterQueryBeforeCursor(getTextBeforeCursor(editor)));
    } else {
      setSlashFilterQuery(null);
    }
  }, [onCommandsChange, onHeightChange, onValueChange, paletteDismissed, value]);

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

  const focusEditor = useCallback(() => {
    window.requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();
      moveCaretToEnd(editor);
    });
  }, []);

  const handleSelectCommand = useCallback(
    (selected: PromptCommand) => {
      const editor = editorRef.current;
      if (!editor) {
        return;
      }
      removeSlashTokenBeforeCursor(editor);
      insertNodeAtSelection(createCommandChipElement(selected));
      setPaletteDismissed(false);
      syncEditorState();
      focusEditor();
    },
    [focusEditor, syncEditorState],
  );

  const handleInput = useCallback(() => {
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
  }, [maxLength, syncEditorState]);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
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
    },
    [
      commandOpen,
      filteredCommands,
      focusEditor,
      handleSelectCommand,
      highlightedIndex,
      onSubmit,
      syncEditorState,
    ],
  );

  const handleChipClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
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
    },
    [focusEditor, syncEditorState],
  );

  const showPlaceholder = isEditorEmpty;

  let flatIndex = 0;

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
            aria-expanded={commandOpen}
            aria-controls={commandOpen ? "composer-slash-commands" : undefined}
            data-slot="input-group-control"
            className={cn(
              "min-h-6 max-h-36 w-full overflow-y-auto whitespace-pre-wrap break-words text-foreground caret-primary outline-none disabled:opacity-100",
              isCollapsed ? "py-0 leading-[18px]" : "py-1",
            )}
            onInput={handleInput}
            onBlur={syncEditorState}
            onKeyDown={handleKeyDown}
            onClick={handleChipClick}
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
        <Command shouldFilter={false} className="rounded-lg p-0">
          <CommandList id="composer-slash-commands" className="max-h-[17rem] py-1">
            {filteredCommands.length === 0 ? (
              <p className="px-3 py-2 text-[11px] text-muted-foreground">
                Tidak ada perintah yang cocok.
              </p>
            ) : (
              promptCommandGroups.map((group) => {
                const groupCommands = filteredCommands.filter((item) => item.group === group);
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
                          onSelect={() => handleSelectCommand(item)}
                          onMouseEnter={() => setHighlightedIndex(itemIndex)}
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
      </PopoverContent>
    </Popover>
  );
}
