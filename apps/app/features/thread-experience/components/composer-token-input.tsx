"use client";

import { type KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import { promptCommands, type PromptCommand } from "@aqsha/convex/prompt-commands";
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

const promptCommandGroups = [
  "Tulis Akademik",
  "Rancang Riset",
  "Riset Mendalam",
] as const;

const COLLAPSED_EDITOR_HEIGHT = 24;

function normalizeEditorText(source: HTMLDivElement | string): string {
  const raw = (typeof source === "string" ? source : source.innerText).replace(/\u00a0/g, " ");
  return raw.trim().length === 0 ? "" : raw;
}

function reportEditorHeight(
  editor: HTMLDivElement,
  text: string,
  onHeightChange?: (height: number) => void,
) {
  if (!onHeightChange) {
    return;
  }
  onHeightChange(text.length === 0 ? COLLAPSED_EDITOR_HEIGHT : editor.scrollHeight);
}

export function TokenizedPromptInput({
  value,
  command,
  onValueChange,
  onCommandChange,
  onSubmit,
  disabled,
  maxLength,
  placeholder,
  onHeightChange,
  className,
}: {
  value: string;
  command: PromptCommand | null;
  onValueChange: (value: string) => void;
  onCommandChange: (command: PromptCommand | null) => void;
  onSubmit: () => void;
  disabled?: boolean;
  maxLength: number;
  placeholder: string;
  onHeightChange?: (height: number) => void;
  className?: string;
}) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const isArgumentEmpty = value.length === 0;

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const domText = normalizeEditorText(editor);

    // DOM was cleared (select-all delete, cut, etc.) but React value is stale.
    if (domText === "" && value.length > 0) {
      onValueChange("");
      reportEditorHeight(editor, "", onHeightChange);
      editor.innerText = "";
      return;
    }

    const shouldSyncWhileFocused = value.length === 0;
    if (
      editor.innerText !== value &&
      (document.activeElement !== editor || shouldSyncWhileFocused)
    ) {
      editor.innerText = value;
    }

    reportEditorHeight(editor, normalizeEditorText(value), onHeightChange);
  }, [value, onValueChange, onHeightChange]);

  const syncFromEditor = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    const text = normalizeEditorText(editor);
    if (text !== value) {
      onValueChange(text);
    }
    reportEditorHeight(editor, text, onHeightChange);
  }, [onHeightChange, onValueChange, value]);

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
      onCommandChange(selected);
      setCommandOpen(false);
      focusEditor();
    },
    [focusEditor, onCommandChange],
  );

  const clearCommand = useCallback(() => {
    onCommandChange(null);
    focusEditor();
  }, [focusEditor, onCommandChange]);

  const handleInput = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const text = normalizeEditorText(editor);

    reportEditorHeight(editor, text, onHeightChange);

    if (text.length <= maxLength) {
      onValueChange(text);
      return;
    }
    const trimmed = text.slice(0, maxLength);
    editor.innerText = trimmed;
    moveCaretToEnd(editor);
    onValueChange(trimmed);
  }, [maxLength, onValueChange, onHeightChange]);

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
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        onSubmit();
        return;
      }
      if (event.key === "/" && !command && isSlashCommandPosition(editorRef.current)) {
        event.preventDefault();
        setCommandOpen(true);
        return;
      }
      if (
        (event.key === "Backspace" || event.key === "Delete") &&
        command &&
        isArgumentEmpty
      ) {
        event.preventDefault();
        clearCommand();
        return;
      }
      if (event.key === "Escape" && commandOpen) {
        event.preventDefault();
        setCommandOpen(false);
        focusEditor();
      }
    },
    [clearCommand, command, commandOpen, focusEditor, isArgumentEmpty, onSubmit],
  );

  return (
    <Popover open={commandOpen} onOpenChange={setCommandOpen}>
      <PopoverAnchor asChild>
        <div
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1.5 text-[12.5px] leading-[18px] text-foreground",
            disabled && "opacity-100",
            className,
          )}
          onKeyDownCapture={(event) => {
            if (
              (event.key === "Backspace" || event.key === "Delete") &&
              command &&
              isArgumentEmpty
            ) {
              event.preventDefault();
              event.stopPropagation();
              clearCommand();
            }
          }}
        >
          {command ? (
            <button
              type="button"
              disabled={disabled}
              onClick={clearCommand}
              className={cn(
                "aqsha-composer-toolbar-btn shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none",
                command.mode === "deep"
                  ? "border-lavender-soft-border bg-lavender-soft text-lavender-foreground"
                  : "border-sky-soft-border bg-sky-soft text-sky-foreground",
              )}
            >
              {command.slug}
            </button>
          ) : null}
          <div className="relative min-w-0 flex-1 flex items-center h-full">
            {value.length === 0 ? (
              <span className="pointer-events-none absolute left-0 top-[3px] text-[12.5px] font-normal text-muted-foreground truncate w-full">
                {command?.placeholder ?? placeholder}
              </span>
            ) : null}
            <div
              ref={editorRef}
              contentEditable={!disabled}
              role="textbox"
              aria-label="Pesan"
              aria-multiline="true"
              data-slot="input-group-control"
              className="max-h-36 min-h-6 w-full overflow-y-auto whitespace-pre-wrap break-words text-foreground caret-primary outline-none disabled:opacity-100 py-1"
              onInput={handleInput}
              onBlur={syncFromEditor}
              onKeyDown={handleKeyDown}
              suppressContentEditableWarning
            />
          </div>
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        side="top"
        className="w-[min(21rem,calc(100vw-2rem))] overflow-hidden p-0"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          focusEditor();
        }}
      >
        <Command
          key={commandOpen ? "open" : "closed"}
          shouldFilter={false}
          className="rounded-lg p-0"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setCommandOpen(false);
              focusEditor();
            }
          }}
        >
          <CommandList className="max-h-[17rem] py-1">
            {promptCommandGroups.map((group) => (
              <CommandGroup
                key={group}
                heading={group}
                className="border-b border-border/70 p-1 last:border-b-0 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-0.5 [&_[cmdk-group-heading]]:pt-0 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:leading-3"
              >
                {promptCommands
                  .filter((item) => item.group === group)
                  .map((item) => (
                    <CommandItem
                      key={item.id}
                      value={item.id}
                      onSelect={() => handleSelectCommand(item)}
                      className="min-h-9 items-start gap-2 rounded-md px-2 py-1.5 text-[13px]"
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
                  ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function isSlashCommandPosition(editor: HTMLDivElement | null) {
  if (!editor) {
    return false;
  }
  const beforeCursor = getTextBeforeCursor(editor);
  return beforeCursor.length === 0 || /\s$/.test(beforeCursor);
}

function getTextBeforeCursor(editor: HTMLDivElement) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return editor.innerText;
  }
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.startContainer)) {
    return editor.innerText;
  }
  const beforeRange = range.cloneRange();
  beforeRange.selectNodeContents(editor);
  beforeRange.setEnd(range.startContainer, range.startOffset);
  return beforeRange.toString();
}

function moveCaretToEnd(element: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}
