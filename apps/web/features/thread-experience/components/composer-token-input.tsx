"use client";

import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useRef, useState } from "react";
import { type PromptCommand } from "@aqsha/convex/prompt-commands";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { filterPromptCommandsBySlashQuery } from "../utils/composer-model";
import { SlashCommandPalette } from "./slash-command-palette";
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
    const serialized = serializeComposerEditor(editor);
    if (serialized === value) {
      return;
    }
    // Skip syncing the DOM from `value` while the user is actively editing, so
    // we don't stomp their caret. But always honor a programmatic clear (e.g.
    // after submitting a message), since that happens while the editor is still
    // focused and must visibly reset the input.
    if (document.activeElement === editor && value !== "") {
      return;
    }
    renderComposerEditorFromVisibleContent(editor, value);
    onCommandsChange(extractCommandsFromEditor(editor));
    if (onHeightChange) {
      onHeightChange(
        value.length === 0 && !editorHasCommandChips(editor)
          ? COLLAPSED_EDITOR_HEIGHT
          : editor.scrollHeight,
      );
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
